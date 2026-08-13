// Copyright The Prometheus Authors
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0

// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

'use strict';

/**
 * Extends the Registry class with a `clusterMetrics` method that returns
 * aggregated metrics for all workers.
 *
 * In cluster workers, listens for and responds to requests for metrics by the
 * cluster master.
 */

const { debuglog } = require('node:util');
const Registry = require('./registry');
// We need to lazy-load the 'cluster' module as some application servers -
// namely Passenger - crash when it is imported.
let cluster = () => {
	const data = require('cluster');
	cluster = () => data;
	return data;
};

const debug = debuglog('prom:metrics:cluster');
const ANNOUNCEMENT = '@prometheus-io/client:announcement';
const GET_METRICS_REQ = '@prometheus-io/client:getMetricsReq';
const GET_METRICS_RES = '@prometheus-io/client:getMetricsRes';

let registries = [Registry.globalRegistry];
let requestCtr = 0; // Concurrency control
let listenersAdded = false;
const requests = new Map(); // Pending requests for workers' local metrics.
const workers = new Map();

class AggregatorRegistry extends Registry {
	/**
	 * Create a Registry.
	 * @param regContentType
	 */
	constructor(regContentType = Registry.PROMETHEUS_CONTENT_TYPE) {
		super(regContentType);

		addListeners();
	}

	/**
	 * Gets aggregated metrics for all workers. The optional callback and
	 * returned Promise resolve with the same value; either may be used.
	 * @returns {Promise<string>} Promise that resolves with the aggregated
	 *   metrics.
	 */
	clusterMetrics() {
		const requestId = requestCtr++;
		const orderedWorkers = [...workers.values()]
			.filter(worker => worker.isConnected())
			.sort((left, right) => left.id - right.id);

		return new Promise((resolve, reject) => {
			let settled = false;
			function done(err, result) {
				if (settled) return;
				settled = true;

				clearTimeout(request.errorTimeout);
				requests.delete(requestId);

				if (err !== undefined) {
					reject(err);
				} else {
					resolve(result);
				}
			}

			const responseHandlers = new Map();
			const request = {
				responseHandlers,
				done,
				errorTimeout: setTimeout(() => {
					const err = new Error(
						`Operation timed out. ${request.responseHandlers.size} outstanding responses.`,
					);
					request.done(err);
				}, 5_000),
			};
			requests.set(requestId, request);
			const workerMetrics = orderedWorkers.map(
				worker =>
					new Promise((resolveResponse, rejectResponse) => {
						responseHandlers.set(worker.id, {
							resolve: resolveResponse,
							reject: rejectResponse,
						});

						worker.send({
							type: GET_METRICS_REQ,
							requestId,
						});
					}),
			);

			const myMetrics = Promise.all(
				registries.map(r => r.getMetricsAsJSON()),
			).then(metrics => {
				return { metrics };
			});

			if (workerMetrics.length === 0) {
				debug('No workers found for requestId', requestId);
			}

			const allMetrics = [myMetrics, ...workerMetrics];

			Promise.all(allMetrics)
				.then(responses => responses.flatMap(response => response.metrics))
				.then(metrics => Registry.aggregate(metrics).metrics())
				.then(result => done(undefined, result), done);
		});
	}

	get contentType() {
		return super.contentType;
	}

	/**
	 * Creates a new Registry instance from an array of metrics that were
	 * created by `registry.getMetricsAsJSON()`. Metrics are aggregated using
	 * the method specified by their `aggregator` property, or by summation if
	 * `aggregator` is undefined.
	 * @param {Array} metricsArr Array of metrics, each of which created by
	 *   `registry.getMetricsAsJSON()`.
	 * @param {string} registryType content type of the new registry. Defaults
	 * to PROMETHEUS_CONTENT_TYPE.
	 * @returns {Registry} aggregated registry.
	 */
	static aggregate(
		metricsArr,
		registryType = Registry.PROMETHEUS_CONTENT_TYPE,
	) {
		return Registry.aggregate(metricsArr, registryType);
	}

	/**
	 * Sets the registry or registries to be aggregated. Call from workers to
	 * use a registry/registries other than the default global registry.
	 * @param {Array<Registry>|Registry} regs Registry or registries to be
	 *   aggregated.
	 * @returns {void}
	 */
	static setRegistries(regs) {
		if (!Array.isArray(regs)) regs = [regs];
		regs.forEach(reg => {
			if (!(reg instanceof Registry)) {
				throw new TypeError(`Expected Registry, got ${typeof reg}`);
			}
		});
		registries = regs;
	}
}

/**
 * Adds event listeners for cluster aggregation. Idempotent (safe to call more
 * than once).
 * @returns {void}
 */
function addListeners() {
	if (listenersAdded) {
		return;
	}

	listenersAdded = true;

	if (cluster().isPrimary) {
		replaceListener('message', cluster(), primaryListener);
		replaceListener('disconnect', cluster(), disconnect);

		announce();
	} else {
		replaceListener('message', process, workerListener);

		if (typeof process.send !== 'function') {
			debug('worker has no process.send()');
		} else if (!process.connected) {
			debug('worker is not connected to parent process');
		} else {
			process.send({ type: ANNOUNCEMENT });
		}
	}
}

/**
 * Watch for metrics events and aggregator announcements
 *
 * Whereas clusters are a top-level activity, multiple modules may start their
 * own workers and require telemetry collection.
 * @param	message {MessageEvent}
 */
async function workerListener(message) {
	if (message.type === ANNOUNCEMENT) {
		process.send({ type: ANNOUNCEMENT });
	} else if (message.type === GET_METRICS_REQ) {
		try {
			const metrics = await Promise.all(
				registries.map(r => r.getMetricsAsJSON()),
			);

			if (!process.connected) {
				debug('Connection to primary lost.');
			} else {
				process.send({
					type: GET_METRICS_RES,
					requestId: message.requestId,
					metrics,
				});
			}
		} catch (error) {
			debug('Error sending to primary', error);
			if (!process.connected) {
				debug('Connection to primary lost.');
			} else {
				process.send({
					type: GET_METRICS_RES,
					requestId: message.requestId,
					error: error.message,
				});
			}
		}
	}
}

/**
 * Add workers to the aggregation list when they are announced.
 *
 * Whereas clusters are a top-level activity, multiple modules may start their
 * own workers and require telemetry collection.
 * @param	event {MessageEvent}
 */

async function primaryListener(worker, event) {
	if (event.type === ANNOUNCEMENT) {
		if (workers.has(worker.id)) {
			debug('duplicate worker announcement', worker.id);
			return;
		}

		workers.set(worker.id, worker);
	} else if (event.type === GET_METRICS_RES) {
		const request = requests.get(event.requestId);

		if (request === undefined) {
			debug('unexpected results from worker', worker.id);
			return;
		}

		const response = request.responseHandlers.get(worker.id);
		if (response === undefined) {
			return;
		}
		request.responseHandlers.delete(worker.id);

		if (event.error) {
			response.reject(new Error(event.error));
		} else {
			response.resolve({
				threadId: worker.id,
				metrics: event.metrics,
			});
		}
	}
}

function disconnect(event) {
	debug('worker disconnected', event.id);
	workers.delete(event.id);
}

function announce() {
	for (const worker of Object.values(cluster().workers)) {
		if (worker.isConnected()) {
			worker.send({ type: ANNOUNCEMENT });
		}
	}
}

/**
 * Replace any listeners with new ones.
 *
 * @param messageType
 * @param emitter {EventEmitter}
 * @param fn
 */
function replaceListener(messageType, emitter, fn) {
	// Reloading a module creates a unique instance of each function, so the
	// identity checks is cluster.off() will fail.
	const functionString = fn.toString();

	for (const listener of emitter.listeners(messageType)) {
		// eslint-disable-next-line eqeqeq
		if (functionString == listener) {
			debug('removing duplicate listener', messageType);
			emitter.off(messageType, listener);
		}
	}

	emitter.on(messageType, fn);
}

module.exports = AggregatorRegistry;

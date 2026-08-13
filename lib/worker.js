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
 * Extends the Registry class with a `workerMetrics` method that returns
 * aggregated metrics for all workers.
 *
 * In workers, listens for and responds to requests for metrics by the
 * main thread.
 */

const { debuglog } = require('node:util');
const Registry = require('./registry');
const worker = require('node:worker_threads');
const { isMainThread, threadId, BroadcastChannel } = worker;

const debug = debuglog('prom:metrics:worker');
const ANNOUNCEMENT = '@prometheus-io/client:announcement';
const GET_METRICS_REQ = '@prometheus-io/client:getMetricsReq';
const GET_METRICS_RES = '@prometheus-io/client:getMetricsRes';
const ANNOUNCEMENT_CHANNEL = new BroadcastChannel(
	'@prometheus-io/client:announce',
).unref();

let registries = [Registry.globalRegistry];
let listenersAdded = false;
let requestCtr = 0; // Concurrency control
const requests = new Map(); // Pending requests for workers' local metrics.
const workers = new Map();

class WorkerRegistry extends Registry {
	/**
	 * Create a Registry.
	 * If set to primary, this thread will handle coordination of all of the
	 * other workers.
	 * @param regContentType
	 * @param primary {boolean} whether this is the coordinating process
	 */
	constructor(
		regContentType = Registry.PROMETHEUS_CONTENT_TYPE,
		primary = isMainThread,
	) {
		super(regContentType);
		this.primary = primary;

		addListeners(primary);
	}

	/**
	 * Gets aggregated metrics for all workers. The optional callback and
	 * returned Promise resolve with the same value; either may be used.
	 * @returns {Promise<string>} Promise that resolves with the aggregated
	 *   metrics.
	 */
	workerMetrics() {
		//TODO: We should be able to collect metrics for the collector thread.
		const requestId = requestCtr++;

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

			const orderedWorkers = [...workers.values()].sort(
				(left, right) => left.threadId - right.threadId,
			);

			const responsePromises = orderedWorkers.map(
				entry =>
					new Promise((resolveResponse, rejectResponse) => {
						responseHandlers.set(entry.name, {
							resolve: resolveResponse,
							reject: rejectResponse,
						});
					}),
			);

			ANNOUNCEMENT_CHANNEL.postMessage({
				type: GET_METRICS_REQ,
				threadId,
				requestId,
			});

			if (responsePromises.length === 0) {
				debug('No workers found for requestId', requestId);
				process.nextTick(() => done(undefined, ''));
			} else {
				Promise.all(responsePromises)
					.then(responses => responses.flatMap(response => response.metrics))
					.then(metrics => Registry.aggregate(metrics).metrics())
					.then(result => done(undefined, result), done);
			}
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
 * Watch for metrics collection events.
 */
function addListeners(primary) {
	if (listenersAdded) {
		return;
	}

	listenersAdded = true;

	if (primary) {
		ANNOUNCEMENT_CHANNEL.addEventListener('message', primaryListener);
	}

	const name = `@prometheus-io/client:worker:${threadId}`;
	const channel = new BroadcastChannel(name).unref();

	ANNOUNCEMENT_CHANNEL.addEventListener('message', async event => {
		const message = event.data;

		if (message.type === ANNOUNCEMENT) {
			if (message.primary) {
				announce(name, false);
			}
		} else if (message.type === GET_METRICS_REQ) {
			const metrics = await Promise.all(
				registries.map(r => r.getMetricsAsJSON()),
			);

			try {
				channel.postMessage({
					type: GET_METRICS_RES,
					requestId: message.requestId,
					threadId,
					metrics,
				});
			} catch (error) {
				channel.postMessage({
					type: GET_METRICS_RES,
					requestId: message.requestId,
					error: error.message,
				});
			}
		}
	});

	announce(name, primary);
}

/**
 * Add workers to the aggregation list when they are announced.
 *
 * Whereas clusters are a top-level activity, multiple modules may start their
 * own workers and require telemetry collection.
 * @param	event {MessageEvent}
 */

async function primaryListener(event) {
	const message = event.data;

	if (message.type === ANNOUNCEMENT) {
		const workerName = message.name;

		if (workers.has(workerName)) {
			debug('duplicate worker announcement', workerName);
			return;
		}

		const workerChannel = new BroadcastChannel(workerName, {}).unref();
		workers.set(workerName, {
			name: workerName,
			channel: workerChannel,
			threadId: message.threadId,
		});

		workerChannel.addEventListener('close', () => {
			workers.delete(workerName);
		});

		workerChannel.addEventListener('message', workerEvent => {
			const workerMessage = workerEvent.data;

			if (workerMessage.type === GET_METRICS_RES) {
				const request = requests.get(workerMessage.requestId);

				if (request === undefined) {
					debug('unexpected results from worker', workerName);
					return;
				}

				const response = request.responseHandlers.get(workerName);
				if (response === undefined) {
					return;
				}
				request.responseHandlers.delete(workerName);

				if (workerMessage.error) {
					response.reject(new Error(workerMessage.error));
				} else {
					response.resolve({
						threadId: workerMessage.threadId,
						metrics: workerMessage.metrics,
					});
				}
			}
		});
	}
}

function announce(name, primary) {
	ANNOUNCEMENT_CHANNEL.postMessage({
		type: ANNOUNCEMENT,
		name,
		threadId,
		primary,
	});
}

module.exports = WorkerRegistry;

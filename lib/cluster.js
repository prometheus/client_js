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
const Histogram = require('./histogram');
const Registry = require('./registry');
const { waitFor } = require('./util');

// We need to lazy-load the 'cluster' module as some application servers -
// namely Passenger - crash when it is imported.
let cluster = () => {
	const data = require('cluster');
	cluster = () => data;
	return data;
};
const debug = debuglog('prom:metrics:cluster');

const ACK = '@prometheus-io/client:ack';
const ANNOUNCEMENT = '@prometheus-io/client:announcement';
const GET_METRICS_REQ = '@prometheus-io/client:getMetricsReq';
const GET_METRICS_RES = '@prometheus-io/client:getMetricsRes';
const GOODBYE = '@prometheus-io/client:goodbye';

const clusterWorkerScrapeFailures = new Histogram({
	name: 'prom_client_cluster_worker_scrape_failures',
	help: 'Number of workers that failed to return metrics during a failed cluster scrape.',
	buckets: [1, 2, 4, 8, 16, 32],
	registers: [],
});

let registries = [Registry.globalRegistry];
let listenersAdded = false;
let requestCtr = 0; // Concurrency control
const requests = new Map(); // Pending requests for workers' local metrics.
const workers = new Map();
let historicMetrics = []; // Metrics from dead workers

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
	async clusterMetrics() {
		const requestId = requestCtr++;
		const orderedWorkers = [...workers.values()]
			.filter(worker => worker.isConnected())
			.sort((left, right) => left.id - right.id);

		if (orderedWorkers.length === 0) {
			debug('No workers found for requestId', requestId);
		}

		const metricSnapshot = historicMetrics;
		const responseHandlers = new Map();
		const workerMetrics = orderedWorkers.map(
			worker =>
				new Promise((resolveResponse, rejectResponse) => {
					responseHandlers.set(worker.id, {
						resolve: resolveResponse,
						reject: rejectResponse,
					});
				}),
		);

		const responsePromises = [this.#selfMetrics(), ...workerMetrics];
		const request = {
			responseHandlers,
			workerFailures: 0,
			promise: waitFor(
				this.#gather(requestId, metricSnapshot, responsePromises),
				5_000,
			),
		};

		requests.set(requestId, request);

		try {
			orderedWorkers.forEach(worker =>
				worker.send({ type: GET_METRICS_REQ, requestId }),
			);

			return await request.promise;
		} catch (err) {
			let failedWorkers = request.workerFailures;

			if (err.message === 'Timeout') {
				failedWorkers += request.responseHandlers.size;
			}

			if (failedWorkers > 0) {
				clusterWorkerScrapeFailures.observe(failedWorkers);
			}

			if (err.message === 'Timeout') {
				throw new Error(
					`Operation timed out. ${request.responseHandlers.size} outstanding responses.`,
				);
			}

			throw err;
		} finally {
			requests.delete(requestId);
		}
	}

	async #selfMetrics() {
		const metrics = await Promise.all(
			registries.map(r => r.getMetricsAsJSON()),
		);
		metrics.push([await clusterWorkerScrapeFailures.get()]);

		return {
			metrics,
		};
	}

	/**
	 * Collect the data for a metrics request.
	 * @param requestId {number}
	 * @param {any[]} historical - Previously collected values
	 * @param promises {Promise[]}
	 * @returns {Promise<string>}
	 */
	async #gather(requestId, historical, promises) {
		const responses = await Promise.all(promises);
		const metrics = responses.flatMap(response => response.metrics);
		return Registry.aggregate(
			[historical, ...metrics],
			this.contentType,
		).metrics();
	}

	get contentType() {
		return super.contentType;
	}

	/**
	 * Orderly shutdown of the registry.
	 *
	 * This is meant to be called prior to `process.exit()` to facilitate accurate metrics.
	 *
	 * If this instance is the primary, then it will wait for any in-flight
	 * metrics to finish collecting or time out prior to returning.
	 * If this instance is a worker, then it will flush all sum stats to the
	 * primary to prevent data loss on subsequent scrapes.
	 * If this function is called twice, it will only wait for the outstanding
	 * shutdown request to complete or timeout.
	 *
	 * @param {number} [timeout] - how long to wait for an orderly shutdown
	 * @returns {Promise<void>}
	 */
	async shutdown(timeout = 5_000) {
		const outstanding = [...requests.values().map(entry => entry.promise)];

		if (outstanding.length > 0) {
			await Promise.allSettled(outstanding);
		} else if (!cluster().isPrimary) {
			const responseHandlers = new Map();
			const acknowledgement = new Promise((resolveResponse, rejectResponse) => {
				responseHandlers.set('ack', {
					resolve: resolveResponse,
					reject: rejectResponse,
				});
			});

			const requestId = requestCtr++;
			const request = {
				responseHandlers,
				promise: acknowledgement,
			};

			requests.set(requestId, request);

			try {
				const metrics = await Promise.all(
					registries.map(r => r.getMetricsAsJSON('sum')),
				);

				debug('sending goodbye message from', process.pid);

				processSend({
					type: GOODBYE,
					requestId,
					metrics,
				});

				return await waitFor(acknowledgement, timeout);
			} finally {
				/* empty */
			}
		}
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
		scanListeners('message', cluster(), primaryListener);
		cluster().on('message', primaryListener);
		scanListeners('disconnect', cluster(), disconnect);
		cluster().on('disconnect', disconnect);

		announce();
	} else {
		scanListeners('message', process, workerListener);
		process.on('message', workerListener);
		processSend({ type: ANNOUNCEMENT });
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
	} else if (message.type === ACK) {
		const request = requests.get(message.requestId);

		if (request === undefined) {
			debug('unexpected goodbye message for', process.pid);
		} else {
			const resolve = request.responseHandlers.get('ack').resolve;

			debug('received acknowledgement for goodbye message from parent');

			resolve(message);
		}
	}
}

/**
 * Add workers to the aggregation list when they are announced.
 *
 * Whereas clusters are a top-level activity, multiple modules may start their
 * own workers and require telemetry collection.
 * @param worker {Worker}
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
		const requestId = event.requestId;
		const request = requests.get(requestId);

		if (request === undefined) {
			debug('unexpected results for', requestId, 'from worker', worker.id);
			return;
		}

		const response = request.responseHandlers.get(worker.id);
		if (response === undefined) {
			debug('unexpected results from worker', worker.id);
			return;
		}
		request.responseHandlers.delete(worker.id);

		if (event.error) {
			request.workerFailures++;
			response.reject(new Error(event.error));
		} else {
			response.resolve({
				threadId: worker.id,
				metrics: event.metrics,
			});
		}
	} else if (event.type === GOODBYE) {
		if (!workers.has(worker.id)) {
			debug('goodbye message from unknown worker', worker.id);
		} else {
			debug('received goodbye message from', worker.id);

			worker.send({
				type: ACK,
				requestId: event.requestId,
			});

			try {
				const metrics = [historicMetrics, ...event.metrics];

				historicMetrics = Registry.aggregate(metrics).getMetricsAsArray();
				debug('collected metrics data from', worker.id);
			} catch (error) {
				console.error('error collecting shutdown metrics', worker.id, error);
			} finally {
				workers.delete(worker.id);
			}
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
 * Look for and complain about duplicate listeners.
 *
 * In test and development mode, this function will remove duplicate listeners.
 * In any other mode (eg, production) it issues a warning about undefined behavior.
 *
 * @param messageType
 * @param emitter {EventEmitter}
 * @param fn
 */
function scanListeners(messageType, emitter, fn) {
	// Reloading a module creates a unique instance of each function, so the
	// identity checks in cluster.off() will fail.
	const functionString = fn.toString();

	for (const listener of emitter.listeners(messageType)) {
		// eslint-disable-next-line eqeqeq
		if (functionString == listener) {
			if (['test', 'development'].includes(process.env.NODE_ENV)) {
				debug('removing duplicate listener', messageType);
				emitter.off(messageType, listener);
			} else {
				console.warn(
					'Loading multiple instances of @prometheus-io/client_js will result in data loss.',
				);
				console.warn(
					'Please review your architecture to ensure that a single copy is loaded at startup and retained throughout the application lifecycle.',
				);
			}
		}
	}
}

/**
 * Wrap process.send() to deal with odd runtimes and lifecycle teardown issues.
 * @param {object} message - message payload
 */
function processSend(message) {
	if (typeof process.send !== 'function') {
		debug('worker has no process.send()');
	} else if (!process.connected) {
		debug('worker is not connected to parent process');
	} else {
		process.send(message);
	}
}

module.exports = AggregatorRegistry;

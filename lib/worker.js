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
const worker = require('node:worker_threads');
const Registry = require('./registry');
const { waitFor } = require('./util');

const { isMainThread, threadId, BroadcastChannel } = worker;
const debug = debuglog('prom:metrics:worker');

const ACK = '@prometheus-io/client:ack';
const ANNOUNCEMENT = '@prometheus-io/client:announcement';
const GET_METRICS_REQ = '@prometheus-io/client:getMetricsReq';
const GET_METRICS_RES = '@prometheus-io/client:getMetricsRes';
const GOODBYE = '@prometheus-io/client:goodbye';

const ANNOUNCEMENT_CHANNEL = new BroadcastChannel(
	'@prometheus-io/client:announce',
).unref();

let registries = [Registry.globalRegistry];
let listenersAdded = false;
let requestCtr = 0; // Concurrency control
const requests = new Map(); // Pending requests for workers' local metrics.
const workers = new Map();
let historicMetrics = []; // Metrics from dead workers
let ownChannel; // This thread's own broadcast channel, set once listeners are added.

class WorkerRegistry extends Registry {
	/**
	 * Create a Registry.
	 * If set to primary, this thread will handle coordination of all the other
	 * workers.
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
	async workerMetrics() {
		const requestId = requestCtr++;
		const orderedWorkers = [...workers.values()].sort(
			(left, right) => left.threadId - right.threadId,
		);

		if (orderedWorkers.length === 0) {
			if (historicMetrics.length === 0) {
				debug('No data found for requestId', requestId);
				return '';
			} else {
				debug('No workers found for requestId', requestId);
			}
		}

		const metricSnapshot = historicMetrics;
		const responseHandlers = new Map();
		const responsePromises = orderedWorkers.map(
			entry =>
				new Promise((resolveResponse, rejectResponse) => {
					responseHandlers.set(entry.name, {
						resolve: resolveResponse,
						reject: rejectResponse,
					});
				}),
		);

		const request = {
			responseHandlers,
			promise: waitFor(
				this.#gather(requestId, metricSnapshot, responsePromises),
				5_000,
			),
		};

		requests.set(requestId, request);

		try {
			ANNOUNCEMENT_CHANNEL.postMessage({
				type: GET_METRICS_REQ,
				threadId,
				requestId,
			});

			return await request.promise;
		} catch (err) {
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

	/**
	 * Collect the data for a metrics request.
	 * @param requestId {number}
	 * @param {any[]} historical - Previously collected values
	 * @param promises {Promise[]}
	 * @returns {Promise<string>}
	 */
	async #gather(requestId, historical, promises) {
		debug('Gathering data...', requestId);
		const responses = await Promise.all(promises);
		debug('Aggregating data...', requestId);
		const metrics = responses.flatMap(response => response.metrics);
		return Registry.aggregate([historical, ...metrics]).metrics();
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
		} else if (!this.primary) {
			const name = `@prometheus-io/client:worker:${threadId}`;
			const channel = new BroadcastChannel(name).unref();

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

				debug('sending goodbye message from', threadId);

				channel.postMessage({
					type: GOODBYE,
					requestId,
					threadId,
					metrics,
				});

				return await waitFor(acknowledgement, timeout);
			} finally {
				channel.close();
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

	static workerCount() {
		return workers.size;
	}

	/**
	 * Close every channel and listener opened by this module instance.
	 *
	 * `BroadcastChannel`s created here keep receiving messages until closed,
	 * even once nothing in JS still references them. Test suites that call
	 * `jest.resetModules()` between cases therefore need this to release the
	 * previous instance's channels; otherwise its listeners keep reacting to
	 * later tests' messages on the same channel names. Not for production use.
	 * @returns {void}
	 */
	static resetForTesting() {
		if (!['test', 'development'].includes(process.env.NODE_ENV)) {
			throw new Error(
				'WorkerRegistry.resetForTesting() is only available in test or development mode.',
			);
		}

		ANNOUNCEMENT_CHANNEL.close();
		ownChannel?.close();

		for (const entry of workers.values()) {
			entry.channel.close();
		}

		workers.clear();
		requests.clear();
		historicMetrics = [];
		listenersAdded = false;
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
	ownChannel = new BroadcastChannel(name).unref();

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
				ownChannel.postMessage({
					type: GET_METRICS_RES,
					requestId: message.requestId,
					threadId,
					metrics,
				});
			} catch (error) {
				debug(error);
				ownChannel.postMessage({
					type: GET_METRICS_RES,
					requestId: message.requestId,
					error: error.message,
				});
			}
		} else {
			debug('unexpected message for', threadId, message);
		}
	});

	ownChannel.addEventListener('message', async event => {
		const message = event.data;

		if (message.type === ACK) {
			const request = requests.get(message.requestId);

			if (request === undefined) {
				debug('unexpected ACK message for', threadId);
			} else {
				const resolve = request.responseHandlers.get('ack').resolve;

				debug(
					'received acknowledgement for goodbye message from',
					message.threadId,
				);

				resolve(message);
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

		debug('Registering worker', message.threadId);

		const workerChannel = new BroadcastChannel(workerName, {}).unref();
		workers.set(workerName, {
			name: workerName,
			channel: workerChannel,
			threadId: message.threadId,
		});

		workerChannel.addEventListener('close', () => {
			debug('channel closed for worker', workerName);
		});

		workerChannel.addEventListener('message', async workerEvent => {
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
			} else if (workerMessage.type === GOODBYE) {
				if (!workers.has(workerName)) {
					debug('goodbye message from unknown worker', workerMessage.threadId);
				} else {
					debug('received goodbye message from', workerMessage.threadId);

					workerChannel.postMessage({
						type: ACK,
						requestId: workerMessage.requestId,
						threadId,
					});

					try {
						const metrics = [historicMetrics, ...workerMessage.metrics];

						historicMetrics = Registry.aggregate(metrics).getMetricsAsArray();
						debug('collected metrics data from', workerMessage.threadId);
					} catch (error) {
						console.error(
							'error collecting shutdown metrics',
							workerMessage.threadId,
							error,
						);
					} finally {
						workers.delete(workerName);
						workerChannel.close();
					}
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

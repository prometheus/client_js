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

const cluster = require('cluster');
const process = require('process');
const Registry = require('../lib/cluster');
const { setTimeout: delay } = require('timers/promises');

const ACK = '@prometheus-io/client:ack';
const ANNOUNCEMENT = '@prometheus-io/client:announcement';
const GET_METRICS_REQ = '@prometheus-io/client:getMetricsReq';
const GET_METRICS_RES = '@prometheus-io/client:getMetricsRes';
const GOODBYE = '@prometheus-io/client:goodbye';
const CLUSTER_WORKER_SCRAPE_FAILURES =
	'prom_client_cluster_worker_scrape_failures';

function metric(value) {
	return {
		help: 'test metric',
		name: 'test_metric',
		type: 'gauge',
		values: [{ labels: {}, value }],
		aggregator: 'sum',
	};
}

describe.each([
	['Prometheus', Registry.PROMETHEUS_CONTENT_TYPE],
	['OpenMetrics', Registry.OPENMETRICS_CONTENT_TYPE],
])('%s AggregatorRegistry', (tag, regType) => {
	beforeEach(() => {
		Registry.globalRegistry.setContentType(regType);
	});

	it('requiring the cluster should not add any listeners on the cluster module', () => {
		const originalListenerCount = cluster.listenerCount('message');

		require('../lib/cluster');

		expect(cluster.listenerCount('message')).toBe(originalListenerCount);

		jest.resetModules();

		require('../lib/cluster');

		expect(cluster.listenerCount('message')).toBe(originalListenerCount);
	});

	it('requiring the cluster should not add any listeners on the process module', () => {
		const originalListenerCount = process.listenerCount('message');

		require('../lib/cluster');

		expect(process.listenerCount('message')).toBe(originalListenerCount);

		jest.resetModules();

		require('../lib/cluster');

		expect(process.listenerCount('message')).toBe(originalListenerCount);
	});

	describe('aggregatorRegistry.clusterMetrics()', () => {
		let AggregatorRegistry;
		let listener;
		let discovery;

		beforeEach(() => {
			jest.resetModules();
			AggregatorRegistry = require('../lib/cluster');

			discovery = new Promise(resolve => {
				listener = message => {
					resolve(message);
				};

				cluster.on('message', listener);
			});
		});

		afterEach(() => {
			cluster.off('message', listener);
			jest.useRealTimers();
			jest.restoreAllMocks();
		});

		it('works properly if there are no cluster workers', async () => {
			const ar = new AggregatorRegistry(regType);
			const metrics = await ar.clusterMetrics();

			expect(metrics).toContain(`${CLUSTER_WORKER_SCRAPE_FAILURES}_count 0`);
		});

		it('formats in the correct content type', async () => {
			const ar = new AggregatorRegistry(regType);
			const metrics = await ar.clusterMetrics();

			if (regType === Registry.OPENMETRICS_CONTENT_TYPE) {
				expect(metrics).toContain('# EOF\n');
			} else {
				expect(metrics).not.toContain('# EOF\n');
			}
		});

		it("listeners don't accumulate", () => {
			for (let i = 0; i < 30; i++) {
				jest.resetModules();

				const AggregatorRegistry = require('../lib/cluster');
				const ar = new AggregatorRegistry(regType);
			}
		});

		it('aggregates worker responses in worker id order', async () => {
			const originalWorkers = cluster.workers;
			const registry = new AggregatorRegistry(regType);
			const workers = Object.fromEntries(
				[1, 2, 3].map(id => [
					id,
					{
						id,
						isConnected: () => true,
						send: jest.fn(),
					},
				]),
			);
			cluster.workers = workers;

			Object.values(workers).forEach(worker => {
				cluster.emit('message', worker, { type: ANNOUNCEMENT });
			});

			try {
				await discovery;

				const result = registry.clusterMetrics();
				for (const [id, value] of [
					[3, 0.3437699],
					[1, 0.5848208],
					[2, 0.5479198],
				]) {
					cluster.emit('message', workers[id], {
						type: GET_METRICS_RES,
						requestId: 0,
						metrics: [[metric(value)]],
					});
				}

				await expect(result).resolves.toContain('test_metric 1.4765105');
			} finally {
				Object.values(workers).forEach(worker => {
					cluster.emit('disconnect', worker);
				});
				cluster.workers = originalWorkers;
			}
		});

		it('aggregates telemetry from primary thread', async () => {
			require('../lib/cluster');
			const { Gauge } = require('../index');

			const gauge = new Gauge({ name: 'primary_gauge_test', help: 'help' });

			try {
				const AggregatorRegistry = require('../lib/cluster');
				const ar = new AggregatorRegistry(regType);

				gauge.set(10);

				const result = ar.clusterMetrics();
				await expect(result).resolves.toContain('primary_gauge_test 10\n');
			} finally {
				gauge.remove();
			}
		});

		it('records the number of workers that time out', async () => {
			jest.useFakeTimers();

			const originalWorkers = cluster.workers;
			const registry = new AggregatorRegistry(regType);
			const workers = Object.fromEntries(
				[1, 2, 3].map(id => [
					id,
					{
						id,
						isConnected: () => true,
						send: jest.fn(),
					},
				]),
			);
			cluster.workers = workers;

			Object.values(workers).forEach(worker => {
				cluster.emit('message', worker, { type: ANNOUNCEMENT });
			});

			try {
				await discovery;

				const failedResult = registry.clusterMetrics();
				const rejection = expect(failedResult).rejects.toThrow(
					'Operation timed out. 2 outstanding responses.',
				);

				cluster.emit('message', workers[1], {
					type: GET_METRICS_RES,
					requestId: 0,
					metrics: [[]],
				});

				await jest.advanceTimersByTimeAsync(5_000);
				await rejection;

				const recoveredResult = registry.clusterMetrics();
				Object.values(workers).forEach(worker => {
					cluster.emit('message', worker, {
						type: GET_METRICS_RES,
						requestId: 1,
						metrics: [[]],
					});
				});

				await expect(recoveredResult).resolves.toContain(
					`${CLUSTER_WORKER_SCRAPE_FAILURES}_sum 2`,
				);
				await expect(recoveredResult).resolves.toContain(
					`${CLUSTER_WORKER_SCRAPE_FAILURES}_count 1`,
				);
			} finally {
				Object.values(workers).forEach(worker => {
					cluster.emit('disconnect', worker);
				});
				cluster.workers = originalWorkers;
			}
		});

		it('records worker-reported scrape errors', async () => {
			const originalWorkers = cluster.workers;
			const registry = new AggregatorRegistry(regType);
			const worker = {
				id: 1,
				isConnected: () => true,
				send: jest.fn(),
			};
			cluster.workers = [worker];
			cluster.emit('message', worker, { type: ANNOUNCEMENT });

			try {
				await discovery;

				const failedResult = registry.clusterMetrics();
				const rejection = expect(failedResult).rejects.toThrow(
					'worker collection failed',
				);

				cluster.emit('message', worker, {
					type: GET_METRICS_RES,
					requestId: 0,
					error: 'worker collection failed',
				});
				await rejection;

				const recoveredResult = registry.clusterMetrics();
				cluster.emit('message', worker, {
					type: GET_METRICS_RES,
					requestId: 1,
					metrics: [[]],
				});

				await expect(recoveredResult).resolves.toContain(
					`${CLUSTER_WORKER_SCRAPE_FAILURES}_sum 1`,
				);
				await expect(recoveredResult).resolves.toContain(
					`${CLUSTER_WORKER_SCRAPE_FAILURES}_count 1`,
				);
			} finally {
				cluster.emit('disconnect', worker);
				cluster.workers = originalWorkers;
			}
		});

		it('accumulate stats from terminated workers', async () => {
			const originalWorkers = cluster.workers;
			const registry = new AggregatorRegistry(regType);
			const worker = {
				id: 37,
				isConnected: () => true,
				send: jest.fn(),
			};

			cluster.workers = [worker];

			const metrics = new Promise(resolve => {
				worker.send.mockImplementationOnce(message => {
					resolve(message.metrics);
				});
			});

			try {
				cluster.emit('message', worker, { type: ANNOUNCEMENT });

				await discovery;

				cluster.emit('message', worker, {
					type: GOODBYE,
					requestId: 0,
					metrics: [[metric(0.654321)]],
				});

				await metrics;

				const result = registry.clusterMetrics();
				await expect(result).resolves.toContain('test_metric 0.654321');
			} finally {
				cluster.workers = originalWorkers;
			}
		});
	});

	describe('shutdown()', () => {
		let AggregatorRegistry;
		let listener;
		let discovery;

		beforeEach(() => {
			jest.resetModules();
			AggregatorRegistry = require('../lib/cluster');

			discovery = new Promise(resolve => {
				listener = message => {
					resolve(message);
				};

				cluster.on('message', listener);
			});
		});

		afterEach(() => {
			cluster.off('message', listener);
			jest.restoreAllMocks();
		});

		it('returns immediately on no outstanding requests', async () => {
			const ar = new AggregatorRegistry(regType);

			await expect(ar.shutdown()).resolves.not.toThrow();
		});

		it('waits for pending requests', async () => {
			const originalWorkers = cluster.workers;
			jest.resetModules();
			const AggregatorRegistry = require('../lib/cluster');
			const registry = new AggregatorRegistry(regType);
			const worker = {
				id: 53,
				isConnected: () => true,
				send: jest.fn(),
			};

			cluster.workers = [worker];

			cluster.emit('message', worker, { type: ANNOUNCEMENT });

			try {
				await discovery;

				const results = [];
				const promise = registry.clusterMetrics().then(() => results.push(1));
				const shutdown = registry.shutdown().then(() => results.push(2));

				cluster.emit('message', worker, {
					type: GET_METRICS_RES,
					requestId: 0,
					metrics: [[metric(7)]],
				});

				await Promise.all([promise, shutdown]);

				expect(results).toEqual([1, 2]);
			} finally {
				cluster.emit('disconnect', worker);
				cluster.workers = originalWorkers;
			}
		});

		it('sends data back to main', async () => {
			jest.resetModules();

			// Fake a worker thread
			jest.doMock('cluster', () => {
				return { isPrimary: false };
			});

			const connectedDescriptor = Object.getOwnPropertyDescriptor(
				process,
				'connected',
			);

			process.connected = true;

			const send = jest.spyOn(process, 'send');
			const AggregatorRegistry = require('../lib/cluster');
			const workerRegistry = new AggregatorRegistry(regType);

			const { Gauge } = require('../index');
			const gauge = new Gauge({ name: 'primary_gauge_test', help: 'test' });

			gauge.set(0.8675309);

			try {
				const metrics = new Promise(resolve => {
					send.mockImplementationOnce(message => {
						process.emit('message', { type: ACK, requestId: 0 });
						resolve(message.metrics);
					});
				});

				await workerRegistry.shutdown();
				const expected = {
					aggregator: 'sum',
					help: 'test',
					name: 'primary_gauge_test',
					type: 'gauge',
					values: [
						{
							labels: {},
							value: 0.8675309,
						},
					],
				};

				await expect(metrics).resolves.toEqual([[expected]]);
			} finally {
				jest.dontMock('cluster');
				gauge.remove();
				if (connectedDescriptor) {
					Object.defineProperty(process, 'connected', connectedDescriptor);
				} else {
					delete process.connected;
				}
			}
		});
	});

	describe('message handling', () => {
		it('does not error out on unexpected (or late) responses', () => {
			jest.resetModules();

			require('../lib/cluster');

			//Emulate a response that has been deleted from requests
			const unexpected = {
				type: '@prometheus-io/client:getMetricsRes',
				metrics: ['{}'],
				requestId: -3,
			};

			expect(() => cluster.emit('message', {}, unexpected)).not.toThrow();
		});
	});
});

describe('worker message handling', () => {
	beforeEach(() => {
		jest.resetModules();
	});

	it('does not send metrics after the IPC channel disconnects', async () => {
		jest.doMock('cluster', () => {
			return { isPrimary: false };
		});

		const connectedDescriptor = Object.getOwnPropertyDescriptor(
			process,
			'connected',
		);

		const send = jest.spyOn(process, 'send');

		const AggregatorRegistry = require('../lib/cluster');
		new AggregatorRegistry();

		send.mockReset();

		let listener;

		try {
			Object.defineProperty(process, 'connected', {
				configurable: true,
				value: true,
				writable: true,
			});

			listener = process.listeners('message').at(-1);
			expect(listener).toBeDefined();

			send.mockImplementationOnce(() => {
				throw new Error('disconnected');
			});

			process.connected = false;

			listener({ type: GET_METRICS_REQ, requestId: 1 });

			await delay(0);

			expect(send).toHaveBeenCalledTimes(0); // Announcement
		} finally {
			jest.resetModules();
			jest.dontMock('cluster');
			process.removeListener('message', listener);
			if (connectedDescriptor) {
				Object.defineProperty(process, 'connected', connectedDescriptor);
			} else {
				delete process.connected;
			}
		}
	});
});

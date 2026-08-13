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

const ANNOUNCEMENT = '@prometheus-io/client:announcement';
const GET_METRICS_REQ = '@prometheus-io/client:getMetricsReq';
const GET_METRICS_RES = '@prometheus-io/client:getMetricsRes';

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
		it('works properly if there are no cluster workers', async () => {
			const AggregatorRegistry = require('../lib/cluster');
			const ar = new AggregatorRegistry(regType);
			const metrics = await ar.clusterMetrics();
			expect(metrics.trim()).toEqual('');
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
			jest.resetModules();
			const AggregatorRegistry = require('../lib/cluster');
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
		}, 6_000);

		it('aggregates telemetry from primary thread', async () => {
			jest.resetModules();

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

		const AggregatorRegistry = require('../lib/cluster');
		new AggregatorRegistry();

		const send = jest.spyOn(process, 'send');
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
			await new Promise(resolve => setImmediate(resolve));

			expect(send).not.toHaveBeenCalled();
		} finally {
			process.removeListener('message', listener);
			if (connectedDescriptor) {
				Object.defineProperty(process, 'connected', connectedDescriptor);
			} else {
				delete process.connected;
			}
			jest.resetModules();
			jest.clearAllMocks();
		}
	});
});

'use strict';

const cluster = require('cluster');
const process = require('process');
const Registry = require('../lib/cluster');

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
			expect(metrics).toEqual('');
		});
	});

	describe('message handling', () => {
		it('does not error out on unexpected (or late) responses', () => {
			jest.resetModules();

			require('../lib/cluster');

			//Emulate a response that has been deleted from requests
			const unexpected = {
				type: 'prom-client:getMetricsRes',
				metrics: ['{}'],
				requestId: -3,
			};

			expect(() => cluster.emit('message', {}, unexpected)).not.toThrow();
		});
	});
});

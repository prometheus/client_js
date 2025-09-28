'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const { describeEach } = require('./helpers');
const cluster = require('cluster');
const process = require('process');
const Registry = require('../lib/cluster');

describeEach([
	['Prometheus', Registry.PROMETHEUS_CONTENT_TYPE],
	['OpenMetrics', Registry.OPENMETRICS_CONTENT_TYPE],
])('%s AggregatorRegistry', (tag, regType) => {
	beforeEach(() => {
		Registry.globalRegistry.setContentType(regType);
	});

	it('requiring the cluster should not add any listeners on the cluster module', () => {
		const originalListenerCount = cluster.listenerCount('message');

		require('../lib/cluster');

		assert.strictEqual(cluster.listenerCount('message'), originalListenerCount);

		// Note: jest.resetModules() not directly available in node:test

		require('../lib/cluster');

		assert.strictEqual(cluster.listenerCount('message'), originalListenerCount);
	});

	it('requiring the cluster should not add any listeners on the process module', () => {
		const originalListenerCount = process.listenerCount('message');

		require('../lib/cluster');

		assert.strictEqual(process.listenerCount('message'), originalListenerCount);

		// Note: jest.resetModules() not directly available in node:test

		require('../lib/cluster');

		assert.strictEqual(process.listenerCount('message'), originalListenerCount);
	});

	describe('aggregatorRegistry.clusterMetrics()', () => {
		it('works properly if there are no cluster workers', async () => {
			const AggregatorRegistry = require('../lib/cluster');
			const ar = new AggregatorRegistry(regType);
			const metrics = await ar.clusterMetrics();
			assert.strictEqual(metrics, '');
		});
	});

	describe('message handling', () => {
		it('does not error out on unexpected (or late) responses', () => {
			// Note: jest.resetModules() not directly available in node:test

			require('../lib/cluster');

			//Emulate a response that has been deleted from requests
			const unexpected = {
				type: 'prom-client:getMetricsRes',
				metrics: ['{}'],
				requestId: -3,
			};

			// Should not throw
			cluster.emit('message', {}, unexpected);
		});
	});
});

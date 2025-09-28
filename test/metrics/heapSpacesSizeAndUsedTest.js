'use strict';

const {
	describe,
	it,
	beforeEach,
	afterEach,
	before,
	after,
} = require('node:test');
const assert = require('node:assert');
const { describeEach } = require('../helpers');

const Registry = require('../../index').Registry;

describeEach([
	['Prometheus', Registry.PROMETHEUS_CONTENT_TYPE],
	['OpenMetrics', Registry.OPENMETRICS_CONTENT_TYPE],
])('heapSpacesSizeAndUsed with %s registry', (tag, regType) => {
	let heapSpacesSizeAndUsed;
	const globalRegistry = require('../../lib/registry').globalRegistry;

	beforeEach(() => {
		heapSpacesSizeAndUsed = require('../../lib/metrics/heapSpacesSizeAndUsed');
		globalRegistry.setContentType(regType);
	});

	afterEach(() => {
		globalRegistry.clear();
	});

	it(`should set total heap spaces size gauges with values from v8 with ${tag} registry`, async () => {
		assert.strictEqual((await globalRegistry.getMetricsAsJSON()).length, 0);

		heapSpacesSizeAndUsed();

		const metrics = await globalRegistry.getMetricsAsJSON();

		// Check that we have the expected metrics
		assert.strictEqual(metrics.length, 3);
		assert.strictEqual(metrics[0].name, 'nodejs_heap_space_size_total_bytes');
		assert.strictEqual(metrics[1].name, 'nodejs_heap_space_size_used_bytes');
		assert.strictEqual(
			metrics[2].name,
			'nodejs_heap_space_size_available_bytes',
		);

		// Verify the structure - actual values may vary based on real v8 heap spaces
		assert.strictEqual(Array.isArray(metrics[0].values), true);
		assert.strictEqual(Array.isArray(metrics[1].values), true);
		assert.strictEqual(Array.isArray(metrics[2].values), true);

		// Check that each metric has values with space labels
		for (const metric of metrics) {
			assert.strictEqual(metric.values.length > 0, true);
			for (const value of metric.values) {
				assert.strictEqual(typeof value.labels.space, 'string');
				assert.strictEqual(typeof value.value, 'number');
			}
		}
	});
});

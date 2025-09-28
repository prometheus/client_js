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
])('processHandles with %s registry', (tag, regType) => {
	const register = require('../../index').register;
	const processHandles = require('../../lib/metrics/processHandles');

	before(() => {
		register.clear();
	});

	beforeEach(() => {
		register.setContentType(regType);
	});

	afterEach(() => {
		register.clear();
	});

	it(`should add metric to the ${tag} registry`, async () => {
		assert.strictEqual((await register.getMetricsAsJSON()).length, 0);

		processHandles();

		const metrics = await register.getMetricsAsJSON();

		assert.strictEqual(metrics.length, 2);

		assert.strictEqual(
			metrics[0].help,
			'Number of active libuv handles grouped by handle type. Every handle type is C++ class name.',
		);
		assert.strictEqual(metrics[0].type, 'gauge');
		assert.strictEqual(metrics[0].name, 'nodejs_active_handles');

		assert.strictEqual(metrics[1].help, 'Total number of active handles.');
		assert.strictEqual(metrics[1].type, 'gauge');
		assert.strictEqual(metrics[1].name, 'nodejs_active_handles_total');
	});
});

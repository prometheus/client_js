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
])('processStartTime with %s registry', (tag, regType) => {
	const register = require('../../index').register;
	const op = require('../../lib/metrics/processStartTime');

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

		op();

		const metrics = await register.getMetricsAsJSON();
		const startTime = Math.ceil(Date.now() / 1000 - process.uptime());

		assert.strictEqual(metrics.length, 1);
		assert.strictEqual(
			metrics[0].help,
			'Start time of the process since unix epoch in seconds.',
		);
		assert.strictEqual(metrics[0].type, 'gauge');
		assert.strictEqual(metrics[0].name, 'process_start_time_seconds');
		assert.strictEqual(metrics[0].values.length, 1);
		assert.strictEqual(metrics[0].values[0].value <= startTime, true);
	});
});

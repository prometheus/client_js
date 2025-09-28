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
const { describeEach, wait } = require('../helpers');

const Registry = require('../../index').Registry;

describeEach([
	['Prometheus', Registry.PROMETHEUS_CONTENT_TYPE],
	['OpenMetrics', Registry.OPENMETRICS_CONTENT_TYPE],
])('eventLoopLag with %s registry', (tag, regType) => {
	const register = require('../../index').register;
	const eventLoopLag = require('../../lib/metrics/eventLoopLag');

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
		eventLoopLag();

		await wait(5);

		const metrics = await register.getMetricsAsJSON();
		assert.strictEqual(metrics.length, 8);

		assert.strictEqual(metrics[0].help, 'Lag of event loop in seconds.');
		assert.strictEqual(metrics[0].type, 'gauge');
		assert.strictEqual(metrics[0].name, 'nodejs_eventloop_lag_seconds');

		assert.strictEqual(
			metrics[1].help,
			'The minimum recorded event loop delay.',
		);
		assert.strictEqual(metrics[1].type, 'gauge');
		assert.strictEqual(metrics[1].name, 'nodejs_eventloop_lag_min_seconds');

		assert.strictEqual(
			metrics[2].help,
			'The maximum recorded event loop delay.',
		);
		assert.strictEqual(metrics[2].type, 'gauge');
		assert.strictEqual(metrics[2].name, 'nodejs_eventloop_lag_max_seconds');

		assert.strictEqual(
			metrics[3].help,
			'The mean of the recorded event loop delays.',
		);
		assert.strictEqual(metrics[3].type, 'gauge');
		assert.strictEqual(metrics[3].name, 'nodejs_eventloop_lag_mean_seconds');

		assert.strictEqual(
			metrics[4].help,
			'The standard deviation of the recorded event loop delays.',
		);
		assert.strictEqual(metrics[4].type, 'gauge');
		assert.strictEqual(metrics[4].name, 'nodejs_eventloop_lag_stddev_seconds');

		assert.strictEqual(
			metrics[5].help,
			'The 50th percentile of the recorded event loop delays.',
		);
		assert.strictEqual(metrics[5].type, 'gauge');
		assert.strictEqual(metrics[5].name, 'nodejs_eventloop_lag_p50_seconds');

		assert.strictEqual(
			metrics[6].help,
			'The 90th percentile of the recorded event loop delays.',
		);
		assert.strictEqual(metrics[6].type, 'gauge');
		assert.strictEqual(metrics[6].name, 'nodejs_eventloop_lag_p90_seconds');

		assert.strictEqual(
			metrics[7].help,
			'The 99th percentile of the recorded event loop delays.',
		);
		assert.strictEqual(metrics[7].type, 'gauge');
		assert.strictEqual(metrics[7].name, 'nodejs_eventloop_lag_p99_seconds');
	});
});

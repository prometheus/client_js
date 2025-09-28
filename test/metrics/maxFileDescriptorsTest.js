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

const exec = require('child_process').execSync;
const Registry = require('../../index').Registry;

describeEach([
	['Prometheus', Registry.PROMETHEUS_CONTENT_TYPE],
	['OpenMetrics', Registry.OPENMETRICS_CONTENT_TYPE],
])('processMaxFileDescriptors with %s registry', (tag, regType) => {
	const register = require('../../index').register;
	const processMaxFileDescriptors = require('../../lib/metrics/processMaxFileDescriptors');

	before(() => {
		register.clear();
	});

	beforeEach(() => {
		register.setContentType(regType);
	});

	afterEach(() => {
		register.clear();
	});

	if (process.platform !== 'linux') {
		it(`should not add metric to the ${tag} registry`, async () => {
			assert.strictEqual((await register.getMetricsAsJSON()).length, 0);

			processMaxFileDescriptors();

			assert.strictEqual((await register.getMetricsAsJSON()).length, 0);
		});
	} else {
		it(`should add metric to the ${tag} registry`, async () => {
			assert.strictEqual((await register.getMetricsAsJSON()).length, 0);

			processMaxFileDescriptors();

			const metrics = await register.getMetricsAsJSON();

			assert.strictEqual(metrics.length, 1);
			assert.strictEqual(
				metrics[0].help,
				'Maximum number of open file descriptors.',
			);
			assert.strictEqual(metrics[0].type, 'gauge');
			assert.strictEqual(metrics[0].name, 'process_max_fds');
			assert.strictEqual(metrics[0].values.length, 1);
		});

		it(`should have a reasonable metric value with ${tag} registry`, async () => {
			const maxFiles = Number(exec('ulimit -Hn', { encoding: 'utf8' }));

			assert.strictEqual((await register.getMetricsAsJSON()).length, 0);
			processMaxFileDescriptors(register, {});

			const metrics = await register.getMetricsAsJSON();

			assert.strictEqual(metrics.length, 1);
			assert.strictEqual(metrics[0].values.length, 1);

			assert.strictEqual(metrics[0].values[0].value <= maxFiles, true);
			assert.strictEqual(metrics[0].values[0].value > 0, true);
		});
	}
});

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

// Note: This metric only works on Linux - skip tests on other platforms
const isLinux = process.platform === 'linux';

describeEach([
	['Prometheus', Registry.PROMETHEUS_CONTENT_TYPE],
	['OpenMetrics', Registry.OPENMETRICS_CONTENT_TYPE],
])('processOpenFileDescriptors with %s registry', (tag, regType) => {
	const register = require('../../index').register;
	const processOpenFileDescriptors = require('../../lib/metrics/processOpenFileDescriptors');

	before(() => {
		register.clear();
	});

	beforeEach(() => {
		register.setContentType(regType);
	});

	afterEach(() => {
		register.clear();
	});

	it(
		`should add metric to the ${tag} registry`,
		{ skip: !isLinux },
		async () => {
			assert.strictEqual((await register.getMetricsAsJSON()).length, 0);

			processOpenFileDescriptors();

			const metrics = await register.getMetricsAsJSON();

			assert.strictEqual(metrics.length, 1);
			assert.strictEqual(metrics[0].help, 'Number of open file descriptors.');
			assert.strictEqual(metrics[0].type, 'gauge');
			assert.strictEqual(metrics[0].name, 'process_open_fds');
		},
	);
});

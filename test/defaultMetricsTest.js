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
const { describeEach } = require('./helpers');
const Registry = require('../index').Registry;

describeEach([
	['Prometheus', Registry.PROMETHEUS_CONTENT_TYPE],
	['OpenMetrics', Registry.OPENMETRICS_CONTENT_TYPE],
])('collectDefaultMetrics with %s registry', (tag, regType) => {
	const register = require('../index').register;
	const collectDefaultMetrics = require('../index').collectDefaultMetrics;
	let cpuUsage;

	before(() => {
		cpuUsage = process.cpuUsage;

		if (cpuUsage) {
			Object.defineProperty(process, 'cpuUsage', {
				value() {
					return { user: 1000, system: 10 };
				},
			});
		} else {
			process.cpuUsage = function () {
				return { user: 1000, system: 10 };
			};
		}

		register.clear();
	});

	after(() => {
		if (cpuUsage) {
			Object.defineProperty(process, 'cpuUsage', {
				value: cpuUsage,
			});
		} else {
			delete process.cpuUsage;
		}
	});

	beforeEach(() => {
		register.setContentType(regType);
	});

	afterEach(() => {
		register.clear();
	});

	it('should add metrics to the registry', async () => {
		assert.strictEqual((await register.getMetricsAsJSON()).length, 0);
		collectDefaultMetrics();
		assert.strictEqual((await register.getMetricsAsJSON()).length !== 0, true);
	});

	it('should allow blacklisting all metrics', async () => {
		assert.strictEqual((await register.getMetricsAsJSON()).length, 0);
		clearInterval(collectDefaultMetrics());
		register.clear();
		assert.strictEqual((await register.getMetricsAsJSON()).length, 0);
	});

	it('should prefix metric names when configured', async () => {
		collectDefaultMetrics({ prefix: 'some_prefix_' });
		assert.strictEqual((await register.getMetricsAsJSON()).length !== 0, true);
		for (const metric of await register.getMetricsAsJSON()) {
			assert.strictEqual(metric.name.substring(0, 12), 'some_prefix_');
		}
	});

	it('should apply labels to metrics when configured', async () => {
		assert.strictEqual((await register.getMetricsAsJSON()).length, 0);

		const labels = { NODE_APP_INSTANCE: 0 };
		collectDefaultMetrics({ labels });

		const metrics = await register.getMetricsAsJSON();

		// flatten metric values into a single array
		const allMetricValues = metrics.reduce(
			(previous, metric) => previous.concat(metric.values),
			[],
		);

		// this varies between 45 and 47 depending on node handles - we just wanna
		// assert there's at least one so we know the assertions in the loop below
		// are executed
		assert.strictEqual(allMetricValues.length > 0, true);

		allMetricValues.forEach(metricValue => {
			// Check that metricValue.labels contains all labels from the labels object
			for (const [key, value] of Object.entries(labels)) {
				assert.strictEqual(metricValue.labels[key], value);
			}
		});
	});

	describe('disabling', () => {
		it('should not throw error', () => {
			const fn = function () {
				register.clear();
			};

			// Should not throw
			fn();
		});
	});

	describe('custom registry', () => {
		it('should allow to register metrics to custom registry', async () => {
			const registry = new Registry(regType);

			assert.strictEqual((await register.getMetricsAsJSON()).length, 0);
			assert.strictEqual((await registry.getMetricsAsJSON()).length, 0);

			collectDefaultMetrics();

			assert.strictEqual(
				(await register.getMetricsAsJSON()).length !== 0,
				true,
			);
			assert.strictEqual((await registry.getMetricsAsJSON()).length, 0);

			collectDefaultMetrics({ register: registry });

			assert.strictEqual(
				(await register.getMetricsAsJSON()).length !== 0,
				true,
			);
			assert.strictEqual(
				(await registry.getMetricsAsJSON()).length !== 0,
				true,
			);
		});
	});
});

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const { describeEach, timers } = require('./helpers');
const errorMessages = require('./error-messages');
const Registry = require('../index').Registry;

describeEach([
	['Prometheus', Registry.PROMETHEUS_CONTENT_TYPE],
	['OpenMetrics', Registry.OPENMETRICS_CONTENT_TYPE],
])('summary with %s registry', (tag, regType) => {
	const Summary = require('../index').Summary;
	const globalRegistry = require('../index').register;
	let instance;

	beforeEach(() => {
		globalRegistry.setContentType(regType);
	});

	afterEach(() => {
		globalRegistry.clear();
	});

	describe('global registry', () => {
		afterEach(() => {
			globalRegistry.clear();
		});

		describe('with param as object', () => {
			beforeEach(() => {
				instance = new Summary({ name: 'summary_test', help: 'test' });
			});

			it('should add a value to the summary', async () => {
				instance.observe(100);
				const { values } = await instance.get();
				assert.strictEqual(values[0].labels.quantile, 0.01);
				assert.strictEqual(values[0].value, 100);
				assert.strictEqual(values[7].metricName, 'summary_test_sum');
				assert.strictEqual(values[7].value, 100);
				assert.strictEqual(values[8].metricName, 'summary_test_count');
				assert.strictEqual(values[8].value, 1);
			});

			it('should be able to observe 0s', async () => {
				instance.observe(0);
				assert.strictEqual((await instance.get()).values[8].value, 1);
			});

			it('should validate labels when observing', async () => {
				const summary = new Summary({
					name: 'foobar',
					help: 'Foo Bar',
					labelNames: ['foo'],
				});

				assert.throws(
					() => {
						summary.observe({ foo: 'bar', baz: 'qaz' }, 10);
					},
					error => {
						assert.strictEqual(
							error.message,
							errorMessages.INVALID_LABEL_SET('baz'),
						);
						return true;
					},
				);
			});

			it('should correctly calculate percentiles when more values are added to the summary', async () => {
				instance.observe(100);
				instance.observe(100);
				instance.observe(100);
				instance.observe(50);
				instance.observe(50);

				const { values } = await instance.get();

				assert.strictEqual(values.length, 9);

				assert.strictEqual(values[0].labels.quantile, 0.01);
				assert.strictEqual(values[0].value, 50);

				assert.strictEqual(values[1].labels.quantile, 0.05);
				assert.strictEqual(values[1].value, 50);

				assert.strictEqual(values[2].labels.quantile, 0.5);
				assert.strictEqual(values[2].value, 80);

				assert.strictEqual(values[3].labels.quantile, 0.9);
				assert.strictEqual(values[3].value, 100);

				assert.strictEqual(values[4].labels.quantile, 0.95);
				assert.strictEqual(values[4].value, 100);

				assert.strictEqual(values[5].labels.quantile, 0.99);
				assert.strictEqual(values[5].value, 100);

				assert.strictEqual(values[6].labels.quantile, 0.999);
				assert.strictEqual(values[6].value, 100);

				assert.strictEqual(values[7].metricName, 'summary_test_sum');
				assert.strictEqual(values[7].value, 400);

				assert.strictEqual(values[8].metricName, 'summary_test_count');
				assert.strictEqual(values[8].value, 5);
			});

			it('should correctly use calculate other percentiles when configured', async () => {
				globalRegistry.clear();
				instance = new Summary({
					name: 'summary_test',
					help: 'test',
					percentiles: [0.5, 0.9],
				});
				instance.observe(100);
				instance.observe(100);
				instance.observe(100);
				instance.observe(50);
				instance.observe(50);

				const { values } = await instance.get();

				assert.strictEqual(values.length, 4);

				assert.strictEqual(values[0].labels.quantile, 0.5);
				assert.strictEqual(values[0].value, 80);

				assert.strictEqual(values[1].labels.quantile, 0.9);
				assert.strictEqual(values[1].value, 100);

				assert.strictEqual(values[2].metricName, 'summary_test_sum');
				assert.strictEqual(values[2].value, 400);

				assert.strictEqual(values[3].metricName, 'summary_test_count');
				assert.strictEqual(values[3].value, 5);
			});

			it('should allow to reset itself', async () => {
				globalRegistry.clear();
				instance = new Summary({
					name: 'summary_test',
					help: 'test',
					percentiles: [0.5],
				});
				instance.observe(100);

				const { values } = await instance.get();

				assert.strictEqual(values[0].labels.quantile, 0.5);
				assert.strictEqual(values[0].value, 100);

				assert.strictEqual(values[1].metricName, 'summary_test_sum');
				assert.strictEqual(values[1].value, 100);

				assert.strictEqual(values[2].metricName, 'summary_test_count');
				assert.strictEqual(values[2].value, 1);

				instance.reset();

				const { values: valuesPost } = await instance.get();

				assert.strictEqual(valuesPost[0].labels.quantile, 0.5);
				assert.strictEqual(valuesPost[0].value, 0);

				assert.strictEqual(valuesPost[1].metricName, 'summary_test_sum');
				assert.strictEqual(valuesPost[1].value, 0);

				assert.strictEqual(valuesPost[2].metricName, 'summary_test_count');
				assert.strictEqual(valuesPost[2].value, 0);
			});

			describe('labels', () => {
				beforeEach(() => {
					globalRegistry.clear();
					instance = new Summary({
						name: 'summary_test',
						help: 'help',
						labelNames: ['method', 'endpoint'],
						percentiles: [0.9],
					});
				});

				it('should record and calculate the correct values per label', async () => {
					instance.labels('GET', '/test').observe(50);
					instance.labels('POST', '/test').observe(100);

					const { values } = await instance.get();
					assert.strictEqual(values.length, 6);
					assert.strictEqual(values[0].labels.method, 'GET');
					assert.strictEqual(values[0].labels.endpoint, '/test');
					assert.strictEqual(values[0].labels.quantile, 0.9);
					assert.strictEqual(values[0].value, 50);

					assert.strictEqual(values[1].metricName, 'summary_test_sum');
					assert.strictEqual(values[1].labels.method, 'GET');
					assert.strictEqual(values[1].labels.endpoint, '/test');
					assert.strictEqual(values[1].value, 50);

					assert.strictEqual(values[2].metricName, 'summary_test_count');
					assert.strictEqual(values[2].labels.method, 'GET');
					assert.strictEqual(values[2].labels.endpoint, '/test');
					assert.strictEqual(values[2].value, 1);

					assert.strictEqual(values[3].labels.quantile, 0.9);
					assert.strictEqual(values[3].labels.method, 'POST');
					assert.strictEqual(values[3].labels.endpoint, '/test');
					assert.strictEqual(values[3].value, 100);

					assert.strictEqual(values[4].metricName, 'summary_test_sum');
					assert.strictEqual(values[4].labels.method, 'POST');
					assert.strictEqual(values[4].labels.endpoint, '/test');
					assert.strictEqual(values[4].value, 100);

					assert.strictEqual(values[5].metricName, 'summary_test_count');
					assert.strictEqual(values[5].labels.method, 'POST');
					assert.strictEqual(values[5].labels.endpoint, '/test');
					assert.strictEqual(values[5].value, 1);
				});

				it('should throw error if label lengths does not match', () => {
					const fn = function () {
						instance.labels('GET').observe();
					};
					assert.throws(fn, error => {
						assert.strictEqual(
							error.message,
							errorMessages.INVALID_LABEL_ARGUMENTS(
								1,
								'GET',
								2,
								'method, endpoint',
							),
						);
						return true;
					});
				});

				it('should start a timer', async () => {
					timers.useFakeTimers();
					timers.setSystemTime(0);
					const end = instance.labels('GET', '/test').startTimer();
					timers.advanceTimersByTime(1000);
					const duration = end();
					assert.strictEqual(duration, 1);
					const { values } = await instance.get();
					assert.strictEqual(values.length, 3);
					assert.strictEqual(values[0].labels.method, 'GET');
					assert.strictEqual(values[0].labels.endpoint, '/test');
					assert.strictEqual(values[0].labels.quantile, 0.9);
					assert.strictEqual(values[0].value, 1);

					assert.strictEqual(values[1].metricName, 'summary_test_sum');
					assert.strictEqual(values[1].labels.method, 'GET');
					assert.strictEqual(values[1].labels.endpoint, '/test');
					assert.strictEqual(values[1].value, 1);

					assert.strictEqual(values[2].metricName, 'summary_test_count');
					assert.strictEqual(values[2].labels.method, 'GET');
					assert.strictEqual(values[2].labels.endpoint, '/test');
					assert.strictEqual(values[2].value, 1);

					timers.useRealTimers();
				});

				it('should start a timer and set labels afterwards', async () => {
					timers.useFakeTimers();
					timers.setSystemTime(0);
					const end = instance.startTimer();
					timers.advanceTimersByTime(1000);
					end({ method: 'GET', endpoint: '/test' });
					const { values } = await instance.get();
					assert.strictEqual(values.length, 3);
					assert.strictEqual(values[0].labels.method, 'GET');
					assert.strictEqual(values[0].labels.endpoint, '/test');
					assert.strictEqual(values[0].labels.quantile, 0.9);
					assert.strictEqual(values[0].value, 1);

					assert.strictEqual(values[1].metricName, 'summary_test_sum');
					assert.strictEqual(values[1].labels.method, 'GET');
					assert.strictEqual(values[1].labels.endpoint, '/test');
					assert.strictEqual(values[1].value, 1);

					assert.strictEqual(values[2].metricName, 'summary_test_count');
					assert.strictEqual(values[2].labels.method, 'GET');
					assert.strictEqual(values[2].labels.endpoint, '/test');
					assert.strictEqual(values[2].value, 1);

					timers.useRealTimers();
				});

				it('should allow labels before and after timers', async () => {
					timers.useFakeTimers();
					timers.setSystemTime(0);
					const end = instance.startTimer({ method: 'GET' });
					timers.advanceTimersByTime(1000);
					end({ endpoint: '/test' });
					const { values } = await instance.get();
					assert.strictEqual(values.length, 3);
					assert.strictEqual(values[0].labels.method, 'GET');
					assert.strictEqual(values[0].labels.endpoint, '/test');
					assert.strictEqual(values[0].labels.quantile, 0.9);
					assert.strictEqual(values[0].value, 1);

					assert.strictEqual(values[1].metricName, 'summary_test_sum');
					assert.strictEqual(values[1].labels.method, 'GET');
					assert.strictEqual(values[1].labels.endpoint, '/test');
					assert.strictEqual(values[1].value, 1);

					assert.strictEqual(values[2].metricName, 'summary_test_count');
					assert.strictEqual(values[2].labels.method, 'GET');
					assert.strictEqual(values[2].labels.endpoint, '/test');
					assert.strictEqual(values[2].value, 1);

					timers.useRealTimers();
				});

				it('should not mutate passed startLabels', () => {
					const startLabels = { method: 'GET' };
					const end = instance.startTimer(startLabels);
					end({ endpoint: '/test' });
					assert.deepStrictEqual(startLabels, { method: 'GET' });
				});

				it('should handle labels provided as an object', async () => {
					instance.labels({ method: 'GET' }).startTimer()();
					const values = (await instance.get()).values;
					values.forEach(value => {
						assert.strictEqual(value.labels.method, 'GET');
					});
				});
			});

			describe('remove', () => {
				beforeEach(() => {
					globalRegistry.clear();
					instance = new Summary({
						name: 'summary_test',
						help: 'help',
						labelNames: ['method', 'endpoint'],
						percentiles: [0.9],
					});

					instance.labels('GET', '/test').observe(50);
					instance.labels('POST', '/test').observe(100);
				});

				it('should remove matching label', async () => {
					instance.remove('GET', '/test');

					const { values } = await instance.get();
					assert.strictEqual(values.length, 3);
					assert.strictEqual(values[0].labels.quantile, 0.9);
					assert.strictEqual(values[0].labels.method, 'POST');
					assert.strictEqual(values[0].labels.endpoint, '/test');
					assert.strictEqual(values[0].value, 100);

					assert.strictEqual(values[1].metricName, 'summary_test_sum');
					assert.strictEqual(values[1].labels.method, 'POST');
					assert.strictEqual(values[1].labels.endpoint, '/test');
					assert.strictEqual(values[1].value, 100);

					assert.strictEqual(values[2].metricName, 'summary_test_count');
					assert.strictEqual(values[2].labels.method, 'POST');
					assert.strictEqual(values[2].labels.endpoint, '/test');
					assert.strictEqual(values[2].value, 1);
				});

				it('should remove all labels', async () => {
					instance.remove('GET', '/test');
					instance.remove('POST', '/test');

					assert.strictEqual((await instance.get()).values.length, 0);
				});

				it('should throw error if label lengths does not match', () => {
					const fn = function () {
						instance.remove('GET');
					};
					assert.throws(fn, error => {
						assert.strictEqual(
							error.message,
							errorMessages.INVALID_LABEL_ARGUMENTS(
								1,
								'GET',
								2,
								'method, endpoint',
							),
						);
						return true;
					});
				});

				it('should remove timer values', async () => {
					timers.useFakeTimers();
					timers.setSystemTime(0);
					const end = instance.labels('GET', '/test').startTimer();
					timers.advanceTimersByTime(1000);
					end();
					instance.remove('GET', '/test');

					const { values } = await instance.get();
					assert.strictEqual(values.length, 3);
					assert.strictEqual(values[0].labels.quantile, 0.9);
					assert.strictEqual(values[0].labels.method, 'POST');
					assert.strictEqual(values[0].labels.endpoint, '/test');
					assert.strictEqual(values[0].value, 100);

					assert.strictEqual(values[1].metricName, 'summary_test_sum');
					assert.strictEqual(values[1].labels.method, 'POST');
					assert.strictEqual(values[1].labels.endpoint, '/test');
					assert.strictEqual(values[1].value, 100);

					assert.strictEqual(values[2].metricName, 'summary_test_count');
					assert.strictEqual(values[2].labels.method, 'POST');
					assert.strictEqual(values[2].labels.endpoint, '/test');
					assert.strictEqual(values[2].value, 1);

					timers.useRealTimers();
				});

				it('should remove timer values when labels are set afterwards', async () => {
					timers.useFakeTimers();
					timers.setSystemTime(0);
					const end = instance.startTimer();
					timers.advanceTimersByTime(1000);
					end({ method: 'GET', endpoint: '/test' });
					instance.remove('GET', '/test');

					const { values } = await instance.get();
					assert.strictEqual(values.length, 3);
					assert.strictEqual(values[0].labels.quantile, 0.9);
					assert.strictEqual(values[0].labels.method, 'POST');
					assert.strictEqual(values[0].labels.endpoint, '/test');
					assert.strictEqual(values[0].value, 100);

					assert.strictEqual(values[1].metricName, 'summary_test_sum');
					assert.strictEqual(values[1].labels.method, 'POST');
					assert.strictEqual(values[1].labels.endpoint, '/test');
					assert.strictEqual(values[1].value, 100);

					assert.strictEqual(values[2].metricName, 'summary_test_count');
					assert.strictEqual(values[2].labels.method, 'POST');
					assert.strictEqual(values[2].labels.endpoint, '/test');
					assert.strictEqual(values[2].value, 1);

					timers.useRealTimers();
				});

				it('should remove timer values with before and after labels', async () => {
					timers.useFakeTimers();
					timers.setSystemTime(0);
					const end = instance.startTimer({ method: 'GET' });
					timers.advanceTimersByTime(1000);
					end({ endpoint: '/test' });
					instance.remove('GET', '/test');

					const { values } = await instance.get();
					assert.strictEqual(values.length, 3);
					assert.strictEqual(values[0].labels.quantile, 0.9);
					assert.strictEqual(values[0].labels.method, 'POST');
					assert.strictEqual(values[0].labels.endpoint, '/test');
					assert.strictEqual(values[0].value, 100);

					assert.strictEqual(values[1].metricName, 'summary_test_sum');
					assert.strictEqual(values[1].labels.method, 'POST');
					assert.strictEqual(values[1].labels.endpoint, '/test');
					assert.strictEqual(values[1].value, 100);

					assert.strictEqual(values[2].metricName, 'summary_test_count');
					assert.strictEqual(values[2].labels.method, 'POST');
					assert.strictEqual(values[2].labels.endpoint, '/test');
					assert.strictEqual(values[2].value, 1);

					timers.useRealTimers();
				});

				it('should remove by labels object', async () => {
					instance.observe({ endpoint: '/test' }, 1);
					instance.remove({ endpoint: '/test' });
					const values = (await instance.get()).values;
					values.forEach(value => {
						assert.notDeepStrictEqual(value.labels, { endpoint: '/test' });
					});
				});
			});
		});
	});
	describe('without registry', () => {
		beforeEach(() => {
			instance = new Summary({
				name: 'summary_test',
				help: 'test',
				registers: [],
			});
		});
		it('should increase count', async () => {
			instance.observe(100);
			const { values } = await instance.get();
			assert.strictEqual(values[0].labels.quantile, 0.01);
			assert.strictEqual(values[0].value, 100);
			assert.strictEqual(values[7].metricName, 'summary_test_sum');
			assert.strictEqual(values[7].value, 100);
			assert.strictEqual(values[8].metricName, 'summary_test_count');
			assert.strictEqual(values[8].value, 1);
			assert.strictEqual((await globalRegistry.getMetricsAsJSON()).length, 0);
		});
	});
	describe('registry instance', () => {
		let registryInstance;
		beforeEach(() => {
			registryInstance = new Registry(regType);
			instance = new Summary({
				name: 'summary_test',
				help: 'test',
				registers: [registryInstance],
			});
		});
		it('should increment counter', async () => {
			instance.observe(100);
			const { values } = await instance.get();
			assert.strictEqual(values[0].labels.quantile, 0.01);
			assert.strictEqual(values[0].value, 100);
			assert.strictEqual(values[7].metricName, 'summary_test_sum');
			assert.strictEqual(values[7].value, 100);
			assert.strictEqual(values[8].metricName, 'summary_test_count');
			assert.strictEqual(values[8].value, 1);
			assert.strictEqual((await globalRegistry.getMetricsAsJSON()).length, 0);
			assert.strictEqual((await registryInstance.getMetricsAsJSON()).length, 1);
		});
	});
	describe('sliding window', () => {
		let clock;
		beforeEach(() => {
			globalRegistry.clear();
			timers.useFakeTimers();
			timers.setSystemTime(0);
		});

		it('should present percentiles as zero when maxAgeSeconds and ageBuckets are set but not pruneAgedBuckets', async () => {
			const localInstance = new Summary({
				name: 'summary_test',
				help: 'test',
				maxAgeSeconds: 5,
				ageBuckets: 5,
			});

			localInstance.observe(100);

			for (let i = 0; i < 5; i++) {
				const { values } = await localInstance.get();
				assert.strictEqual(values[0].labels.quantile, 0.01);
				assert.strictEqual(values[0].value, 100);
				assert.strictEqual(values[7].metricName, 'summary_test_sum');
				assert.strictEqual(values[7].value, 100);
				assert.strictEqual(values[8].metricName, 'summary_test_count');
				assert.strictEqual(values[8].value, 1);
				timers.advanceTimersByTime(1001);
			}

			const { values } = await localInstance.get();
			assert.strictEqual(values[0].labels.quantile, 0.01);
			assert.strictEqual(values[0].value, 0);
			assert.strictEqual(values[7].value, 100);
			assert.strictEqual(values[8].value, 1);
		});

		it('should prune expired buckets when pruneAgedBuckets are set with maxAgeSeconds and ageBuckets', async () => {
			const localInstance = new Summary({
				name: 'summary_test',
				help: 'test',
				maxAgeSeconds: 5,
				ageBuckets: 5,
				pruneAgedBuckets: true,
			});

			localInstance.observe(100);

			for (let i = 0; i < 5; i++) {
				const { values } = await localInstance.get();
				assert.strictEqual(values[0].labels.quantile, 0.01);
				assert.strictEqual(values[0].value, 100);
				assert.strictEqual(values[7].metricName, 'summary_test_sum');
				assert.strictEqual(values[7].value, 100);
				assert.strictEqual(values[8].metricName, 'summary_test_count');
				assert.strictEqual(values[8].value, 1);
				timers.advanceTimersByTime(1001);
			}

			const { values } = await localInstance.get();
			assert.strictEqual(values.length, 0);
		});

		it('should not slide when maxAgeSeconds and ageBuckets are not configured', async () => {
			const localInstance = new Summary({
				name: 'summary_test',
				help: 'test',
			});
			localInstance.observe(100);

			for (let i = 0; i < 5; i++) {
				const { values } = await localInstance.get();
				assert.strictEqual(values[0].labels.quantile, 0.01);
				assert.strictEqual(values[0].value, 100);
				assert.strictEqual(values[7].metricName, 'summary_test_sum');
				assert.strictEqual(values[7].value, 100);
				assert.strictEqual(values[8].metricName, 'summary_test_count');
				assert.strictEqual(values[8].value, 1);
				timers.advanceTimersByTime(1001);
			}

			const { values } = await localInstance.get();
			assert.strictEqual(values[0].labels.quantile, 0.01);
			assert.strictEqual(values[0].value, 100);
		});
	});
});

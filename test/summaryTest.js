'use strict';

const Registry = require('../index').Registry;

describe.each([
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
				expect(values[0].labels.quantile).toEqual(0.01);
				expect(values[0].value).toEqual(100);
				expect(values[7].metricName).toEqual('summary_test_sum');
				expect(values[7].value).toEqual(100);
				expect(values[8].metricName).toEqual('summary_test_count');
				expect(values[8].value).toEqual(1);
			});

			it('should be able to observe 0s', async () => {
				instance.observe(0);
				expect((await instance.get()).values[8].value).toEqual(1);
			});

			it('should validate labels when observing', async () => {
				const summary = new Summary({
					name: 'foobar',
					help: 'Foo Bar',
					labelNames: ['foo'],
				});

				expect(() => {
					summary.observe({ foo: 'bar', baz: 'qaz' }, 10);
				}).toThrowErrorMatchingSnapshot();
			});

			it('should correctly calculate percentiles when more values are added to the summary', async () => {
				instance.observe(100);
				instance.observe(100);
				instance.observe(100);
				instance.observe(50);
				instance.observe(50);

				const { values } = await instance.get();

				expect(values.length).toEqual(9);

				expect(values[0].labels.quantile).toEqual(0.01);
				expect(values[0].value).toEqual(50);

				expect(values[1].labels.quantile).toEqual(0.05);
				expect(values[1].value).toEqual(50);

				expect(values[2].labels.quantile).toEqual(0.5);
				expect(values[2].value).toEqual(80);

				expect(values[3].labels.quantile).toEqual(0.9);
				expect(values[3].value).toEqual(100);

				expect(values[4].labels.quantile).toEqual(0.95);
				expect(values[4].value).toEqual(100);

				expect(values[5].labels.quantile).toEqual(0.99);
				expect(values[5].value).toEqual(100);

				expect(values[6].labels.quantile).toEqual(0.999);
				expect(values[6].value).toEqual(100);

				expect(values[7].metricName).toEqual('summary_test_sum');
				expect(values[7].value).toEqual(400);

				expect(values[8].metricName).toEqual('summary_test_count');
				expect(values[8].value).toEqual(5);
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

				expect(values.length).toEqual(4);

				expect(values[0].labels.quantile).toEqual(0.5);
				expect(values[0].value).toEqual(80);

				expect(values[1].labels.quantile).toEqual(0.9);
				expect(values[1].value).toEqual(100);

				expect(values[2].metricName).toEqual('summary_test_sum');
				expect(values[2].value).toEqual(400);

				expect(values[3].metricName).toEqual('summary_test_count');
				expect(values[3].value).toEqual(5);
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

				expect(values[0].labels.quantile).toEqual(0.5);
				expect(values[0].value).toEqual(100);

				expect(values[1].metricName).toEqual('summary_test_sum');
				expect(values[1].value).toEqual(100);

				expect(values[2].metricName).toEqual('summary_test_count');
				expect(values[2].value).toEqual(1);

				instance.reset();

				const { values: valuesPost } = await instance.get();

				expect(valuesPost[0].labels.quantile).toEqual(0.5);
				expect(valuesPost[0].value).toEqual(0);

				expect(valuesPost[1].metricName).toEqual('summary_test_sum');
				expect(valuesPost[1].value).toEqual(0);

				expect(valuesPost[2].metricName).toEqual('summary_test_count');
				expect(valuesPost[2].value).toEqual(0);
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
					expect(values).toHaveLength(6);
					expect(values[0].labels.method).toEqual('GET');
					expect(values[0].labels.endpoint).toEqual('/test');
					expect(values[0].labels.quantile).toEqual(0.9);
					expect(values[0].value).toEqual(50);

					expect(values[1].metricName).toEqual('summary_test_sum');
					expect(values[1].labels.method).toEqual('GET');
					expect(values[1].labels.endpoint).toEqual('/test');
					expect(values[1].value).toEqual(50);

					expect(values[2].metricName).toEqual('summary_test_count');
					expect(values[2].labels.method).toEqual('GET');
					expect(values[2].labels.endpoint).toEqual('/test');
					expect(values[2].value).toEqual(1);

					expect(values[3].labels.quantile).toEqual(0.9);
					expect(values[3].labels.method).toEqual('POST');
					expect(values[3].labels.endpoint).toEqual('/test');
					expect(values[3].value).toEqual(100);

					expect(values[4].metricName).toEqual('summary_test_sum');
					expect(values[4].labels.method).toEqual('POST');
					expect(values[4].labels.endpoint).toEqual('/test');
					expect(values[4].value).toEqual(100);

					expect(values[5].metricName).toEqual('summary_test_count');
					expect(values[5].labels.method).toEqual('POST');
					expect(values[5].labels.endpoint).toEqual('/test');
					expect(values[5].value).toEqual(1);
				});

				it('should throw error if label lengths does not match', () => {
					const fn = function () {
						instance.labels('GET').observe();
					};
					expect(fn).toThrowErrorMatchingSnapshot();
				});

				it('should start a timer', async () => {
					jest.useFakeTimers('modern');
					jest.setSystemTime(0);
					const end = instance.labels('GET', '/test').startTimer();
					jest.advanceTimersByTime(1000);
					const duration = end();
					expect(duration).toEqual(1);
					const { values } = await instance.get();
					expect(values).toHaveLength(3);
					expect(values[0].labels.method).toEqual('GET');
					expect(values[0].labels.endpoint).toEqual('/test');
					expect(values[0].labels.quantile).toEqual(0.9);
					expect(values[0].value).toEqual(1);

					expect(values[1].metricName).toEqual('summary_test_sum');
					expect(values[1].labels.method).toEqual('GET');
					expect(values[1].labels.endpoint).toEqual('/test');
					expect(values[1].value).toEqual(1);

					expect(values[2].metricName).toEqual('summary_test_count');
					expect(values[2].labels.method).toEqual('GET');
					expect(values[2].labels.endpoint).toEqual('/test');
					expect(values[2].value).toEqual(1);

					jest.useRealTimers();
				});

				it('should start a timer and set labels afterwards', async () => {
					jest.useFakeTimers('modern');
					jest.setSystemTime(0);
					const end = instance.startTimer();
					jest.advanceTimersByTime(1000);
					end({ method: 'GET', endpoint: '/test' });
					const { values } = await instance.get();
					expect(values).toHaveLength(3);
					expect(values[0].labels.method).toEqual('GET');
					expect(values[0].labels.endpoint).toEqual('/test');
					expect(values[0].labels.quantile).toEqual(0.9);
					expect(values[0].value).toEqual(1);

					expect(values[1].metricName).toEqual('summary_test_sum');
					expect(values[1].labels.method).toEqual('GET');
					expect(values[1].labels.endpoint).toEqual('/test');
					expect(values[1].value).toEqual(1);

					expect(values[2].metricName).toEqual('summary_test_count');
					expect(values[2].labels.method).toEqual('GET');
					expect(values[2].labels.endpoint).toEqual('/test');
					expect(values[2].value).toEqual(1);

					jest.useRealTimers();
				});

				it('should allow labels before and after timers', async () => {
					jest.useFakeTimers('modern');
					jest.setSystemTime(0);
					const end = instance.startTimer({ method: 'GET' });
					jest.advanceTimersByTime(1000);
					end({ endpoint: '/test' });
					const { values } = await instance.get();
					expect(values).toHaveLength(3);
					expect(values[0].labels.method).toEqual('GET');
					expect(values[0].labels.endpoint).toEqual('/test');
					expect(values[0].labels.quantile).toEqual(0.9);
					expect(values[0].value).toEqual(1);

					expect(values[1].metricName).toEqual('summary_test_sum');
					expect(values[1].labels.method).toEqual('GET');
					expect(values[1].labels.endpoint).toEqual('/test');
					expect(values[1].value).toEqual(1);

					expect(values[2].metricName).toEqual('summary_test_count');
					expect(values[2].labels.method).toEqual('GET');
					expect(values[2].labels.endpoint).toEqual('/test');
					expect(values[2].value).toEqual(1);

					jest.useRealTimers();
				});

				it('should not mutate passed startLabels', () => {
					const startLabels = { method: 'GET' };
					const end = instance.startTimer(startLabels);
					end({ endpoint: '/test' });
					expect(startLabels).toEqual({ method: 'GET' });
				});

				it('should handle labels provided as an object', async () => {
					instance.labels({ method: 'GET' }).startTimer()();
					const values = (await instance.get()).values;
					values.forEach(value => {
						expect(value.labels.method).toBe('GET');
					});
				});

				it.only('can init labels to 0', async () => {
					instance.initLabels('GET', '/test');

					const { values } = await instance.get();
					expect(values).toHaveLength(3);
					expect(values[0].labels.method).toEqual('GET');
					expect(values[0].labels.endpoint).toEqual('/test');
					expect(values[0].labels.quantile).toEqual(0.9);
					expect(values[0].value).toEqual(0);

					expect(values[1].metricName).toEqual('summary_test_sum');
					expect(values[1].labels.method).toEqual('GET');
					expect(values[1].labels.endpoint).toEqual('/test');
					expect(values[1].value).toEqual(0);

					expect(values[2].metricName).toEqual('summary_test_count');
					expect(values[2].labels.method).toEqual('GET');
					expect(values[2].labels.endpoint).toEqual('/test');
					expect(values[2].value).toEqual(0);
				});

				it.only('can init labels passed as an object', async () => {
					instance.initLabels({ method: 'GET' });

					const { values } = await instance.get();
					expect(values).toHaveLength(3);
					expect(values[0].labels.method).toEqual('GET');
					expect(values[0].labels.quantile).toEqual(0.9);
					expect(values[0].value).toEqual(0);

					expect(values[1].metricName).toEqual('summary_test_sum');
					expect(values[1].labels.method).toEqual('GET');
					expect(values[1].value).toEqual(0);

					expect(values[2].metricName).toEqual('summary_test_count');
					expect(values[2].labels.method).toEqual('GET');
					expect(values[2].value).toEqual(0);
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
					expect(values).toHaveLength(3);
					expect(values[0].labels.quantile).toEqual(0.9);
					expect(values[0].labels.method).toEqual('POST');
					expect(values[0].labels.endpoint).toEqual('/test');
					expect(values[0].value).toEqual(100);

					expect(values[1].metricName).toEqual('summary_test_sum');
					expect(values[1].labels.method).toEqual('POST');
					expect(values[1].labels.endpoint).toEqual('/test');
					expect(values[1].value).toEqual(100);

					expect(values[2].metricName).toEqual('summary_test_count');
					expect(values[2].labels.method).toEqual('POST');
					expect(values[2].labels.endpoint).toEqual('/test');
					expect(values[2].value).toEqual(1);
				});

				it('should remove all labels', async () => {
					instance.remove('GET', '/test');
					instance.remove('POST', '/test');

					expect((await instance.get()).values).toHaveLength(0);
				});

				it('should throw error if label lengths does not match', () => {
					const fn = function () {
						instance.remove('GET');
					};
					expect(fn).toThrowErrorMatchingSnapshot();
				});

				it('should remove timer values', async () => {
					jest.useFakeTimers('modern');
					jest.setSystemTime(0);
					const end = instance.labels('GET', '/test').startTimer();
					jest.advanceTimersByTime(1000);
					end();
					instance.remove('GET', '/test');

					const { values } = await instance.get();
					expect(values).toHaveLength(3);
					expect(values[0].labels.quantile).toEqual(0.9);
					expect(values[0].labels.method).toEqual('POST');
					expect(values[0].labels.endpoint).toEqual('/test');
					expect(values[0].value).toEqual(100);

					expect(values[1].metricName).toEqual('summary_test_sum');
					expect(values[1].labels.method).toEqual('POST');
					expect(values[1].labels.endpoint).toEqual('/test');
					expect(values[1].value).toEqual(100);

					expect(values[2].metricName).toEqual('summary_test_count');
					expect(values[2].labels.method).toEqual('POST');
					expect(values[2].labels.endpoint).toEqual('/test');
					expect(values[2].value).toEqual(1);

					jest.useRealTimers();
				});

				it('should remove timer values when labels are set afterwards', async () => {
					jest.useFakeTimers('modern');
					jest.setSystemTime(0);
					const end = instance.startTimer();
					jest.advanceTimersByTime(1000);
					end({ method: 'GET', endpoint: '/test' });
					instance.remove('GET', '/test');

					const { values } = await instance.get();
					expect(values).toHaveLength(3);
					expect(values[0].labels.quantile).toEqual(0.9);
					expect(values[0].labels.method).toEqual('POST');
					expect(values[0].labels.endpoint).toEqual('/test');
					expect(values[0].value).toEqual(100);

					expect(values[1].metricName).toEqual('summary_test_sum');
					expect(values[1].labels.method).toEqual('POST');
					expect(values[1].labels.endpoint).toEqual('/test');
					expect(values[1].value).toEqual(100);

					expect(values[2].metricName).toEqual('summary_test_count');
					expect(values[2].labels.method).toEqual('POST');
					expect(values[2].labels.endpoint).toEqual('/test');
					expect(values[2].value).toEqual(1);

					jest.useRealTimers();
				});

				it('should remove timer values with before and after labels', async () => {
					jest.useFakeTimers('modern');
					jest.setSystemTime(0);
					const end = instance.startTimer({ method: 'GET' });
					jest.advanceTimersByTime(1000);
					end({ endpoint: '/test' });
					instance.remove('GET', '/test');

					const { values } = await instance.get();
					expect(values).toHaveLength(3);
					expect(values[0].labels.quantile).toEqual(0.9);
					expect(values[0].labels.method).toEqual('POST');
					expect(values[0].labels.endpoint).toEqual('/test');
					expect(values[0].value).toEqual(100);

					expect(values[1].metricName).toEqual('summary_test_sum');
					expect(values[1].labels.method).toEqual('POST');
					expect(values[1].labels.endpoint).toEqual('/test');
					expect(values[1].value).toEqual(100);

					expect(values[2].metricName).toEqual('summary_test_count');
					expect(values[2].labels.method).toEqual('POST');
					expect(values[2].labels.endpoint).toEqual('/test');
					expect(values[2].value).toEqual(1);

					jest.useRealTimers();
				});

				it('should remove by labels object', async () => {
					instance.observe({ endpoint: '/test' }, 1);
					instance.remove({ endpoint: '/test' });
					const values = (await instance.get()).values;
					values.forEach(value => {
						expect(value.labels).not.toEqual({ endpoint: '/test' });
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
			expect(values[0].labels.quantile).toEqual(0.01);
			expect(values[0].value).toEqual(100);
			expect(values[7].metricName).toEqual('summary_test_sum');
			expect(values[7].value).toEqual(100);
			expect(values[8].metricName).toEqual('summary_test_count');
			expect(values[8].value).toEqual(1);
			expect((await globalRegistry.getMetricsAsJSON()).length).toEqual(0);
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
			expect(values[0].labels.quantile).toEqual(0.01);
			expect(values[0].value).toEqual(100);
			expect(values[7].metricName).toEqual('summary_test_sum');
			expect(values[7].value).toEqual(100);
			expect(values[8].metricName).toEqual('summary_test_count');
			expect(values[8].value).toEqual(1);
			expect((await globalRegistry.getMetricsAsJSON()).length).toEqual(0);
			expect((await registryInstance.getMetricsAsJSON()).length).toEqual(1);
		});
	});
	describe('sliding window', () => {
		let clock;
		beforeEach(() => {
			globalRegistry.clear();
			jest.useFakeTimers('modern');
			jest.setSystemTime(0);
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
				expect(values[0].labels.quantile).toEqual(0.01);
				expect(values[0].value).toEqual(100);
				expect(values[7].metricName).toEqual('summary_test_sum');
				expect(values[7].value).toEqual(100);
				expect(values[8].metricName).toEqual('summary_test_count');
				expect(values[8].value).toEqual(1);
				jest.advanceTimersByTime(1001);
			}

			const { values } = await localInstance.get();
			expect(values[0].labels.quantile).toEqual(0.01);
			expect(values[0].value).toEqual(0);
			expect(values[7].value).toEqual(100);
			expect(values[8].value).toEqual(1);
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
				expect(values[0].labels.quantile).toEqual(0.01);
				expect(values[0].value).toEqual(100);
				expect(values[7].metricName).toEqual('summary_test_sum');
				expect(values[7].value).toEqual(100);
				expect(values[8].metricName).toEqual('summary_test_count');
				expect(values[8].value).toEqual(1);
				jest.advanceTimersByTime(1001);
			}

			const { values } = await localInstance.get();
			expect(values.length).toEqual(0);
		});

		it('should not slide when maxAgeSeconds and ageBuckets are not configured', async () => {
			const localInstance = new Summary({
				name: 'summary_test',
				help: 'test',
			});
			localInstance.observe(100);

			for (let i = 0; i < 5; i++) {
				const { values } = await localInstance.get();
				expect(values[0].labels.quantile).toEqual(0.01);
				expect(values[0].value).toEqual(100);
				expect(values[7].metricName).toEqual('summary_test_sum');
				expect(values[7].value).toEqual(100);
				expect(values[8].metricName).toEqual('summary_test_count');
				expect(values[8].value).toEqual(1);
				jest.advanceTimersByTime(1001);
			}

			const { values } = await localInstance.get();
			expect(values[0].labels.quantile).toEqual(0.01);
			expect(values[0].value).toEqual(100);
		});
	});
});

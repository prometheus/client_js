'use strict';

const Registry = require('../index').Registry;
const register = require('../index').register;

describe('Register', () => {
	const contentTypeTestStr =
		'application/openmetrics-text; version=42.0.0; charset=utf-8';
	const expectedContentTypeErrStr = `Content type ${contentTypeTestStr} is unsupported`;
	it('should throw if set to an unsupported type', () => {
		expect(() => {
			register.setContentType(contentTypeTestStr);
		}).toThrow(expectedContentTypeErrStr);
	});

	it('should throw if created with an unsupported type', () => {
		expect(() => {
			new Registry(contentTypeTestStr);
		}).toThrow(expectedContentTypeErrStr);
	});

	describe.each([
		['Prometheus', Registry.PROMETHEUS_CONTENT_TYPE],
		['OpenMetrics', Registry.OPENMETRICS_CONTENT_TYPE],
	])('with %s type', (tag, regType) => {
		const Counter = require('../index').Counter;
		const Gauge = require('../index').Gauge;
		const Histogram = require('../index').Histogram;
		const Summary = require('../index').Summary;

		beforeEach(() => {
			register.setContentType(regType);
			register.clear();
		});

		describe('should output a counter metric', () => {
			let output;
			beforeEach(async () => {
				register.registerMetric(getMetric());
				output = (await register.metrics()).split('\n');
			});

			it('with help as first item', () => {
				expect(output[0]).toEqual('# HELP test_metric A test metric');
			});
			it('with type as second item', () => {
				expect(output[1]).toEqual('# TYPE test_metric counter');
			});
			it('with first value of the metric as third item', () => {
				if (register.contentType === Registry.OPENMETRICS_CONTENT_TYPE) {
					expect(output[2]).toEqual(
						'test_metric_total{label="hello",code="303"} 12',
					);
				} else {
					expect(output[2]).toEqual('test_metric{label="hello",code="303"} 12');
				}
			});
			it('with second value of the metric as fourth item', () => {
				if (register.contentType === Registry.OPENMETRICS_CONTENT_TYPE) {
					expect(output[3]).toEqual(
						'test_metric_total{label="bye",code="404"} 34',
					);
				} else {
					expect(output[3]).toEqual('test_metric{label="bye",code="404"} 34');
				}
			});
		});

		it('should throw on more than one metric', () => {
			register.registerMetric(getMetric());

			expect(() => {
				register.registerMetric(getMetric());
			}).toThrow(
				'A metric with the name test_metric has already been registered.',
			);
		});

		it('should handle and output a metric with a NaN value', async () => {
			register.registerMetric({
				async get() {
					return {
						name: 'test_metric',
						type: 'gauge',
						help: 'A test metric',
						values: [
							{
								value: NaN,
							},
						],
					};
				},
			});
			const lines = (await register.metrics()).split('\n');
			if (regType === Registry.OPENMETRICS_CONTENT_TYPE) {
				expect(lines).toHaveLength(5);
			} else {
				expect(lines).toHaveLength(4);
			}
			expect(lines[2]).toEqual('test_metric Nan');
		});

		it('should handle and output a metric with an +Infinity value', async () => {
			register.registerMetric({
				async get() {
					return {
						name: 'test_metric',
						type: 'gauge',
						help: 'A test metric',
						values: [
							{
								value: Infinity,
							},
						],
					};
				},
			});
			const lines = (await register.metrics()).split('\n');
			if (regType === Registry.OPENMETRICS_CONTENT_TYPE) {
				expect(lines).toHaveLength(5);
			} else {
				expect(lines).toHaveLength(4);
			}
			expect(lines[2]).toEqual('test_metric +Inf');
		});

		it('should handle and output a metric with an -Infinity value', async () => {
			register.registerMetric({
				async get() {
					return {
						name: 'test_metric',
						type: 'gauge',
						help: 'A test metric',
						values: [
							{
								value: -Infinity,
							},
						],
					};
				},
			});
			const lines = (await register.metrics()).split('\n');
			if (regType === Registry.OPENMETRICS_CONTENT_TYPE) {
				expect(lines).toHaveLength(5);
			} else {
				expect(lines).toHaveLength(4);
			}
			expect(lines[2]).toEqual('test_metric -Inf');
		});

		it('should handle a metric without labels', async () => {
			register.registerMetric({
				async get() {
					return {
						name: 'test_metric',
						type: 'counter',
						help: 'A test metric',
						values: [
							{
								value: 1,
							},
						],
					};
				},
			});
			if (regType === Registry.OPENMETRICS_CONTENT_TYPE) {
				expect((await register.metrics()).split('\n')).toHaveLength(5);
			} else {
				expect((await register.metrics()).split('\n')).toHaveLength(4);
			}
		});

		it('should handle a metric with default labels', async () => {
			register.setDefaultLabels({ testLabel: 'testValue' });
			register.registerMetric({
				async get() {
					return {
						name: 'test_metric',
						type: 'counter',
						help: 'A test metric',
						values: [{ value: 1 }],
					};
				},
			});

			const output = (await register.metrics()).split('\n')[2];
			if (regType === Registry.OPENMETRICS_CONTENT_TYPE) {
				expect(output).toEqual('test_metric_total{testLabel="testValue"} 1');
			} else {
				expect(output).toEqual('test_metric{testLabel="testValue"} 1');
			}
		});

		it('labeled metrics should take precidence over defaulted', async () => {
			register.setDefaultLabels({ testLabel: 'testValue' });
			register.registerMetric({
				async get() {
					return {
						name: 'test_metric',
						type: 'counter',
						help: 'A test metric',
						values: [
							{
								value: 1,
								labels: {
									testLabel: 'overlapped',
									anotherLabel: 'value123',
								},
							},
						],
					};
				},
			});

			if (regType === Registry.OPENMETRICS_CONTENT_TYPE) {
				expect((await register.metrics()).split('\n')[2]).toEqual(
					'test_metric_total{testLabel="overlapped",anotherLabel="value123"} 1',
				);
			} else {
				expect((await register.metrics()).split('\n')[2]).toEqual(
					'test_metric{testLabel="overlapped",anotherLabel="value123"} 1',
				);
			}
		});

		if (regType === Registry.OPENMETRICS_CONTENT_TYPE) {
			it('should output all initialized metrics at value 0', async () => {
				new Counter({ name: 'counter', help: 'help', enableExemplars: true });
				new Gauge({ name: 'gauge', help: 'help' });
				new Histogram({
					name: 'histogram',
					help: 'help',
					enableExemplars: true,
				});
				new Summary({ name: 'summary', help: 'help' });

				expect(await register.metrics()).toMatchSnapshot();
			});
		} else {
			it('should output all initialized metrics at value 0', async () => {
				new Counter({ name: 'counter', help: 'help' });
				new Gauge({ name: 'gauge', help: 'help' });
				new Histogram({ name: 'histogram', help: 'help' });
				new Summary({ name: 'summary', help: 'help' });

				expect(await register.metrics()).toMatchSnapshot();
			});
		}

		it('should not output all initialized metrics at value 0 if labels', async () => {
			new Counter({ name: 'counter', help: 'help', labelNames: ['label'] });
			new Gauge({ name: 'gauge', help: 'help', labelNames: ['label'] });
			new Histogram({
				name: 'histogram',
				help: 'help',
				labelNames: ['label'],
			});
			new Summary({ name: 'summary', help: 'help', labelNames: ['label'] });

			expect(await register.metrics()).toMatchSnapshot();
		});

		if (regType === Registry.OPENMETRICS_CONTENT_TYPE) {
			it('should not output all initialized metrics at value 0 if labels and exemplars enabled', async () => {
				new Counter({
					name: 'counter',
					help: 'help',
					labelNames: ['label'],
					enableExemplars: true,
				});
				new Gauge({ name: 'gauge', help: 'help', labelNames: ['label'] });
				new Histogram({
					name: 'histogram',
					help: 'help',
					labelNames: ['label'],
					enableExemplars: true,
				});
				new Summary({ name: 'summary', help: 'help', labelNames: ['label'] });

				expect(await register.metrics()).toMatchSnapshot();
			});
		}

		describe('should escape', () => {
			let escapedResult;
			beforeEach(async () => {
				register.registerMetric({
					async get() {
						return {
							name: 'test_"_\\_\n_metric',
							help: 'help_help',
							type: 'counter',
						};
					},
				});
				escapedResult = await register.metrics();
			});
			it('backslash to \\\\', () => {
				expect(escapedResult).toMatch(/\\\\/);
			});
			it('newline to \\\\n', () => {
				expect(escapedResult).toMatch(/\n/);
			});
		});

		it('should escape " in label values', async () => {
			register.registerMetric({
				async get() {
					return {
						name: 'test_metric',
						type: 'counter',
						help: 'A test metric',
						values: [
							{
								value: 12,
								labels: {
									label: 'hello',
									code: '3"03',
								},
							},
						],
					};
				},
			});
			const escapedResult = await register.metrics();
			expect(escapedResult).toMatch(/\\"/);
		});

		describe('should output metrics as JSON', () => {
			it('should output metrics as JSON', async () => {
				register.registerMetric(getMetric());
				const output = await register.getMetricsAsJSON();

				expect(output.length).toEqual(1);
				expect(output[0].name).toEqual('test_metric');
				expect(output[0].type).toEqual('counter');
				expect(output[0].help).toEqual('A test metric');
				expect(output[0].values.length).toEqual(2);
			});

			it('should add default labels to JSON', async () => {
				register.registerMetric(getMetric());
				register.setDefaultLabels({
					defaultRegistryLabel: 'testValue',
				});
				const output = await register.getMetricsAsJSON();

				expect(output.length).toEqual(1);
				expect(output[0].name).toEqual('test_metric');
				expect(output[0].type).toEqual('counter');
				expect(output[0].help).toEqual('A test metric');
				expect(output[0].values.length).toEqual(2);
				expect(output[0].values[0].labels).toEqual({
					code: '303',
					label: 'hello',
					defaultRegistryLabel: 'testValue',
				});
			});
		});

		it('should allow removing single metrics', async () => {
			register.registerMetric(getMetric());
			register.registerMetric(getMetric('some other name'));

			let output = await register.getMetricsAsJSON();
			expect(output.length).toEqual(2);

			register.removeSingleMetric('test_metric');

			output = await register.getMetricsAsJSON();

			expect(output.length).toEqual(1);
			expect(output[0].name).toEqual('some other name');
		});

		it('should allow getting single metrics', () => {
			const metric = getMetric();
			register.registerMetric(metric);

			const output = register.getSingleMetric('test_metric');
			expect(output).toEqual(metric);
		});

		it('should allow getting metrics', async () => {
			const metric = getMetric();
			register.registerMetric(metric);
			const metrics = await register.metrics();

			if (regType === Registry.OPENMETRICS_CONTENT_TYPE) {
				expect(metrics.split('\n')[3]).toEqual(
					'test_metric_total{label="bye",code="404"} 34',
				);
			} else {
				expect(metrics.split('\n')[3]).toEqual(
					'test_metric{label="bye",code="404"} 34',
				);
			}
		});

		describe('resetting', () => {
			it('should allow resetting all metrics', async () => {
				const counter = new Counter({
					name: 'test_counter',
					help: 'test metric',
					labelNames: ['serial', 'active'],
				});
				const gauge = new Gauge({
					name: 'test_gauge',
					help: 'Another test metric',
					labelNames: ['level'],
				});
				const histo = new Histogram({
					name: 'test_histo',
					help: 'test',
				});
				const summ = new Summary({
					name: 'test_summ',
					help: 'test',
					percentiles: [0.5],
				});
				register.registerMetric(counter);
				register.registerMetric(gauge);
				register.registerMetric(histo);
				register.registerMetric(summ);

				counter.inc({ serial: '12345', active: 'yes' }, 12);
				gauge.set({ level: 'low' }, -12);
				histo.observe(1);
				summ.observe(100);

				register.resetMetrics();

				const same_counter = register.getSingleMetric('test_counter');
				expect((await same_counter.get()).values).toEqual([]);

				const same_gauge = register.getSingleMetric('test_gauge');
				expect((await same_gauge.get()).values).toEqual([]);

				const same_histo = register.getSingleMetric('test_histo');
				expect((await same_histo.get()).values).toEqual([]);

				const same_summ = register.getSingleMetric('test_summ');
				expect((await same_summ.get()).values[0].value).toEqual(0);
			});
		});

		describe('Registry with default labels', () => {
			const Registry = require('../lib/registry');

			describe('mutation tests', () => {
				describe('registry.metrics()', () => {
					it('should not throw with default labels (counter)', async () => {
						const r = new Registry(regType);
						r.setDefaultLabels({
							env: 'development',
						});

						const counter = new Counter({
							name: 'my_counter',
							help: 'my counter',
							registers: [r],
							labelNames: ['type'],
						});

						const myCounter = counter.labels('myType');

						myCounter.inc();

						const metrics = await r.metrics();
						const lines = metrics.split('\n');
						if (regType === Registry.OPENMETRICS_CONTENT_TYPE) {
							expect(lines).toContain(
								'my_counter_total{type="myType",env="development"} 1',
							);
						} else {
							expect(lines).toContain(
								'my_counter{type="myType",env="development"} 1',
							);
						}

						myCounter.inc();

						const metrics2 = await r.metrics();
						const lines2 = metrics2.split('\n');
						if (regType === Registry.OPENMETRICS_CONTENT_TYPE) {
							expect(lines2).toContain(
								'my_counter_total{type="myType",env="development"} 2',
							);
						} else {
							expect(lines2).toContain(
								'my_counter{type="myType",env="development"} 2',
							);
						}
					});

					it('should not throw with default labels (gauge)', async () => {
						const r = new Registry(regType);
						r.setDefaultLabels({
							env: 'development',
						});

						const gauge = new Gauge({
							name: 'my_gauge',
							help: 'my gauge',
							registers: [r],
							labelNames: ['type'],
						});

						const myGauge = gauge.labels('myType');

						myGauge.inc(1);

						const metrics = await r.metrics();
						const lines = metrics.split('\n');
						expect(lines).toContain(
							'my_gauge{type="myType",env="development"} 1',
						);

						myGauge.inc(2);

						const metrics2 = await r.metrics();
						const lines2 = metrics2.split('\n');
						expect(lines2).toContain(
							'my_gauge{type="myType",env="development"} 3',
						);
					});

					it('should not throw with default labels (histogram)', async () => {
						const r = new Registry(regType);
						r.setDefaultLabels({
							env: 'development',
						});

						const hist = new Histogram({
							name: 'my_histogram',
							help: 'my histogram',
							registers: [r],
							labelNames: ['type'],
						});

						const myHist = hist.labels('myType');

						myHist.observe(1);

						const metrics = await r.metrics();
						const lines = metrics.split('\n');
						expect(lines).toContain(
							'my_histogram_bucket{le="1",env="development",type="myType"} 1',
						);

						myHist.observe(1);

						const metrics2 = await r.metrics();
						const lines2 = metrics2.split('\n');
						expect(lines2).toContain(
							'my_histogram_bucket{le="1",env="development",type="myType"} 2',
						);
					});
				});

				describe('registry.getMetricsAsJSON()', () => {
					it('should not throw with default labels (counter)', async () => {
						const r = new Registry(regType);
						r.setDefaultLabels({
							env: 'development',
						});

						const counter = new Counter({
							name: 'my_counter',
							help: 'my counter',
							registers: [r],
							labelNames: ['type'],
						});

						const myCounter = counter.labels('myType');

						myCounter.inc();

						const metrics = await r.getMetricsAsJSON();
						expect(metrics).toContainEqual({
							aggregator: 'sum',
							help: 'my counter',
							name: 'my_counter',
							type: 'counter',
							values: [
								{
									labels: { env: 'development', type: 'myType' },
									value: 1,
								},
							],
						});

						myCounter.inc();

						const metrics2 = await r.getMetricsAsJSON();
						expect(metrics2).toContainEqual({
							aggregator: 'sum',
							help: 'my counter',
							name: 'my_counter',
							type: 'counter',
							values: [
								{
									labels: { env: 'development', type: 'myType' },
									value: 2,
								},
							],
						});
					});

					it('should not throw with default labels (gauge)', async () => {
						const r = new Registry(regType);
						r.setDefaultLabels({
							env: 'development',
						});

						const gauge = new Gauge({
							name: 'my_gauge',
							help: 'my gauge',
							registers: [r],
							labelNames: ['type'],
						});

						const myGauge = gauge.labels('myType');

						myGauge.inc(1);

						const metrics = await r.getMetricsAsJSON();
						expect(metrics).toContainEqual({
							aggregator: 'sum',
							help: 'my gauge',
							name: 'my_gauge',
							type: 'gauge',
							values: [
								{
									labels: { env: 'development', type: 'myType' },
									value: 1,
								},
							],
						});

						myGauge.inc(2);

						const metrics2 = await r.getMetricsAsJSON();
						expect(metrics2).toContainEqual({
							aggregator: 'sum',
							help: 'my gauge',
							name: 'my_gauge',
							type: 'gauge',
							values: [
								{
									labels: { env: 'development', type: 'myType' },
									value: 3,
								},
							],
						});
					});

					it('should not throw with default labels (histogram)', async () => {
						const r = new Registry(regType);
						r.setDefaultLabels({
							env: 'development',
						});

						const hist = new Histogram({
							name: 'my_histogram',
							help: 'my histogram',
							registers: [r],
							labelNames: ['type'],
						});

						const myHist = hist.labels('myType');

						myHist.observe(1);

						const metrics = await r.getMetricsAsJSON();
						// NOTE: at this test we don't need to check exact JSON schema
						expect(metrics[0].values).toContainEqual({
							exemplar: null,
							labels: { env: 'development', le: 1, type: 'myType' },
							metricName: 'my_histogram_bucket',
							value: 1,
						});

						myHist.observe(1);

						const metrics2 = await r.getMetricsAsJSON();
						// NOTE: at this test we don't need to check exact JSON schema
						expect(metrics2[0].values).toContainEqual({
							exemplar: null,
							labels: { env: 'development', le: 1, type: 'myType' },
							metricName: 'my_histogram_bucket',
							value: 2,
						});
					});
				});
			});
		});

		describe('merging', () => {
			const Registry = require('../lib/registry');
			let registryOne;
			let registryTwo;

			beforeEach(() => {
				registryOne = new Registry(regType);
				registryTwo = new Registry(regType);
			});

			it('should merge all provided registers', async () => {
				registryOne.registerMetric(getMetric('one'));
				registryTwo.registerMetric(getMetric('two'));

				const merged = await Registry.merge([
					registryOne,
					registryTwo,
				]).getMetricsAsJSON();
				expect(merged).toHaveLength(2);
			});

			it('should throw if same name exists on both registers', () => {
				registryOne.registerMetric(getMetric());
				registryTwo.registerMetric(getMetric());

				const fn = function () {
					Registry.merge([registryOne, registryTwo]);
				};

				expect(fn).toThrow(Error);
			});

			it('should throw if merging different types of registers', () => {
				registryOne.setContentType(Registry.PROMETHEUS_CONTENT_TYPE);
				registryTwo.setContentType(Registry.OPENMETRICS_CONTENT_TYPE);

				const fn = function () {
					Registry.merge([registryOne, registryTwo]);
				};

				expect(fn).toThrow(
					'Registers can only be merged if they have the same content type',
				);
			});
		});

		describe('AggregatorRegistry.aggregate()', () => {
			// These mimic the output of `getMetricsAsJSON`.
			const metrics1 = [
				{
					name: 'test_histogram',
					help: 'Example of a histogram',
					type: 'histogram',
					values: [
						{
							labels: { le: 0.1, code: '300' },
							value: 0,
							metricName: 'test_histogram_bucket',
						},
						{
							labels: { le: 10, code: '300' },
							value: 1.6486727018068046,
							metricName: 'test_histogram_bucket',
						},
					],
					aggregator: 'sum',
				},
				{
					help: 'Example of a gauge',
					name: 'test_gauge',
					type: 'gauge',
					values: [
						{ value: 0.47, labels: { method: 'get', code: 200 } },
						{ value: 0.64, labels: {} },
						{ value: 23, labels: { method: 'post', code: '300' } },
					],
					aggregator: 'sum',
				},
				{
					help: 'Start time of the process since unix epoch in seconds.',
					name: 'process_start_time_seconds',
					type: 'gauge',
					values: [{ value: 1502075832, labels: {} }],
					aggregator: 'omit',
				},
				{
					help: 'Lag of event loop in seconds.',
					name: 'nodejs_eventloop_lag_seconds',
					type: 'gauge',
					values: [{ value: 0.009, labels: {} }],
					aggregator: 'average',
				},
				{
					help: 'Node.js version info.',
					name: 'nodejs_version_info',
					type: 'gauge',
					values: [
						{
							value: 1,
							labels: { version: 'v6.11.1', major: 6, minor: 11, patch: 1 },
						},
					],
					aggregator: 'first',
				},
			];
			const metrics2 = [
				{
					name: 'test_histogram',
					help: 'Example of a histogram',
					type: 'histogram',
					values: [
						{
							labels: { le: 0.1, code: '300' },
							value: 0.235151,
							metricName: 'test_histogram_bucket',
						},
						{
							labels: { le: 10, code: '300' },
							value: 1.192591,
							metricName: 'test_histogram_bucket',
						},
					],
					aggregator: 'sum',
				},
				{
					help: 'Example of a gauge',
					name: 'test_gauge',
					type: 'gauge',
					values: [
						{ value: 0.02, labels: { method: 'get', code: 200 } },
						{ value: 0.24, labels: {} },
						{ value: 51, labels: { method: 'post', code: '300' } },
					],
					aggregator: 'sum',
				},
				{
					help: 'Start time of the process since unix epoch in seconds.',
					name: 'process_start_time_seconds',
					type: 'gauge',
					values: [{ value: 1502075849, labels: {} }],
					aggregator: 'omit',
				},
				{
					help: 'Lag of event loop in seconds.',
					name: 'nodejs_eventloop_lag_seconds',
					type: 'gauge',
					values: [{ value: 0.008, labels: {} }],
					aggregator: 'average',
				},
				{
					help: 'Node.js version info.',
					name: 'nodejs_version_info',
					type: 'gauge',
					values: [
						{
							value: 1,
							labels: { version: 'v6.11.1', major: 6, minor: 11, patch: 1 },
						},
					],
					aggregator: 'first',
				},
			];

			const aggregated = Registry.aggregate([metrics1, metrics2], regType);

			it('defaults to summation, preserves histogram bins', async () => {
				const histogram = aggregated.getSingleMetric('test_histogram').get();
				expect(histogram).toEqual({
					name: 'test_histogram',
					help: 'Example of a histogram',
					type: 'histogram',
					values: [
						{
							labels: { le: 0.1, code: '300' },
							value: 0.235151,
							metricName: 'test_histogram_bucket',
						},
						{
							labels: { le: 10, code: '300' },
							value: 2.8412637018068043,
							metricName: 'test_histogram_bucket',
						},
					],
					aggregator: 'sum',
				});
			});

			it('defaults to summation, works for gauges', () => {
				const gauge = aggregated.getSingleMetric('test_gauge').get();
				expect(gauge).toEqual({
					help: 'Example of a gauge',
					name: 'test_gauge',
					type: 'gauge',
					values: [
						{ value: 0.49, labels: { method: 'get', code: 200 } },
						{ value: 0.88, labels: {} },
						{ value: 74, labels: { method: 'post', code: '300' } },
					],
					aggregator: 'sum',
				});
			});

			it('uses `aggregate` method defined for process_start_time', () => {
				const procStartTime = aggregated.getSingleMetric(
					'process_start_time_seconds',
				);
				expect(procStartTime).toBeUndefined();
			});

			it('uses `aggregate` method defined for nodejs_eventloop_lag_seconds', () => {
				const ell = aggregated
					.getSingleMetric('nodejs_eventloop_lag_seconds')
					.get();
				expect(ell).toEqual({
					help: 'Lag of event loop in seconds.',
					name: 'nodejs_eventloop_lag_seconds',
					type: 'gauge',
					values: [{ value: 0.0085, labels: {} }],
					aggregator: 'average',
				});
			});

			it('uses `aggregate` method defined for nodejs_evnetloop_lag_seconds', () => {
				const ell = aggregated
					.getSingleMetric('nodejs_eventloop_lag_seconds')
					.get();
				expect(ell).toEqual({
					help: 'Lag of event loop in seconds.',
					name: 'nodejs_eventloop_lag_seconds',
					type: 'gauge',
					values: [{ value: 0.0085, labels: {} }],
					aggregator: 'average',
				});
			});

			it('uses `aggregate` method defined for nodejs_version_info', () => {
				const version = aggregated.getSingleMetric('nodejs_version_info').get();
				expect(version).toEqual({
					help: 'Node.js version info.',
					name: 'nodejs_version_info',
					type: 'gauge',
					values: [
						{
							value: 1,
							labels: { version: 'v6.11.1', major: 6, minor: 11, patch: 1 },
						},
					],
					aggregator: 'first',
				});
			});
		});

		function getMetric(name) {
			name = name || 'test_metric';
			return {
				name,
				async get() {
					return {
						name,
						type: 'counter',
						help: 'A test metric',
						values: [
							{
								value: 12,
								labels: {
									label: 'hello',
									code: '303',
								},
							},
							{
								value: 34,
								labels: {
									label: 'bye',
									code: '404',
								},
							},
						],
					};
				},
			};
		}
	});
});

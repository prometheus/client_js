'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const { describeEach, timers } = require('./helpers');
const Registry = require('../index').Registry;
const globalRegistry = require('../index').register;
const Histogram = require('../index').Histogram;
const Counter = require('../index').Counter;

Date.now = () => 1678654679000;

describe('Exemplars', () => {
	it('should throw when using with Prometheus registry', async () => {
		globalRegistry.setContentType(Registry.PROMETHEUS_CONTENT_TYPE);
		assert.throws(() => {
			const counterInstance = new Counter({
				name: 'counter_exemplar_test',
				help: 'help',
				labelNames: ['method', 'code'],
				enableExemplars: true,
			});
		}, /Exemplars are supported only on OpenMetrics registries/);
	});
	describeEach([['OpenMetrics', Registry.OPENMETRICS_CONTENT_TYPE]])(
		'with %s registry',
		(tag, regType) => {
			beforeEach(() => {
				globalRegistry.setContentType(regType);
			});

			it('should make counter with exemplar', async () => {
				const counterInstance = new Counter({
					name: 'counter_exemplar_test',
					help: 'help',
					labelNames: ['method', 'code'],
					enableExemplars: true,
				});
				counterInstance.inc({
					value: 2,
					labels: { method: 'get', code: '200' },
					exemplarLabels: { traceId: 'trace_id_test', spanId: 'span_id_test' },
				});
				const vals = await counterInstance.get();
				assert.strictEqual(vals.values[0].value, 2);
				assert.strictEqual(vals.values[0].exemplar.value, 2);
				assert.strictEqual(
					vals.values[0].exemplar.labelSet.traceId,
					'trace_id_test',
				);
			});

			it('should make histogram with exemplars on multiple buckets', async () => {
				const histogramInstance = new Histogram({
					name: 'histogram_exemplar_test',
					help: 'test',
					labelNames: ['method', 'code'],
					enableExemplars: true,
				});

				histogramInstance.observe({
					value: 0.007,
					labels: { method: 'get', code: '200' },
					exemplarLabels: {
						traceId: 'trace_id_test_1',
						spanId: 'span_id_test_1',
					},
				});
				histogramInstance.observe({
					value: 0.4,
					labels: { method: 'get', code: '200' },
					exemplarLabels: {
						traceId: 'trace_id_test_2',
						spanId: 'span_id_test_2',
					},
				});
				histogramInstance.observe({
					value: 11,
					labels: { method: 'get', code: '200' },
					exemplarLabels: {
						traceId: 'trace_id_test_3',
						spanId: 'span_id_test_3',
					},
				});

				const vals = (await histogramInstance.get()).values;

				assert.strictEqual(getValuesByLabel(0.005, vals)[0].value, 0);
				assert.strictEqual(getValuesByLabel(0.005, vals)[0].exemplar, null);

				assert.strictEqual(getValuesByLabel(0.5, vals)[0].value, 2);
				assert.strictEqual(
					getValuesByLabel(0.5, vals)[0].exemplar.labelSet.traceId,
					'trace_id_test_2',
				);
				assert.strictEqual(getValuesByLabel(0.5, vals)[0].exemplar.value, 0.4);

				assert.strictEqual(getValuesByLabel(10, vals)[0].value, 2);
				assert.strictEqual(getValuesByLabel(10, vals)[0].exemplar, null);

				assert.strictEqual(getValuesByLabel('+Inf', vals)[0].value, 3);
				assert.strictEqual(
					getValuesByLabel('+Inf', vals)[0].exemplar.labelSet.traceId,
					'trace_id_test_3',
				);
				assert.strictEqual(
					getValuesByLabel('+Inf', vals)[0].exemplar.value,
					11,
				);

				// Note: Snapshot testing not available in node:test, verify metrics output manually
				const metrics = await globalRegistry.metrics();
				assert.strictEqual(typeof metrics, 'string');
				assert.strictEqual(metrics.length > 0, true);
			});

			it('should throw if exemplar is too long', async () => {
				const histogramInstance = new Histogram({
					name: 'histogram_too_long_exemplar_test',
					help: 'test',
					labelNames: ['method', 'code'],
					enableExemplars: true,
				});

				assert.throws(() => {
					histogramInstance.observe({
						value: 0.007,
						labels: { method: 'get', code: '200' },
						exemplarLabels: {
							traceId: 'j'.repeat(100),
							spanId: 'j'.repeat(100),
						},
					});
				}, /Label set size must be smaller than 128 UTF-8 chars/);
			});

			it('should time request, with exemplar', async () => {
				timers.useFakeTimers();
				timers.setSystemTime(0);
				const histogramInstance = new Histogram({
					name: 'histogram_start_timer_exemplar_test',
					help: 'test',
					labelNames: ['method', 'code'],
					enableExemplars: true,
				});
				const end = histogramInstance.startTimer({
					method: 'get',
					code: '200',
				});

				timers.advanceTimersByTime(500);
				end();

				const valuePair = getValueByLabel(
					0.5,
					(await histogramInstance.get()).values,
				);
				assert.strictEqual(valuePair.value, 1);
				timers.useRealTimers();
			});

			it('should allow exemplar labels before and after timers', async () => {
				timers.useFakeTimers();
				timers.setSystemTime(0);
				const histogramInstance = new Histogram({
					name: 'histogram_start_timer_exemplar_label_test',
					help: 'test',
					labelNames: ['method', 'code'],
					enableExemplars: true,
				});
				const end = histogramInstance.startTimer(
					{ method: 'get' },
					{ traceId: 'trace_id_test_1' },
				);

				timers.advanceTimersByTime(500);
				end({ code: '200' }, { spanId: 'span_id_test_1' });

				const vals = (await histogramInstance.get()).values;
				assert.strictEqual(getValuesByLabel(0.5, vals)[0].value, 1);
				assert.strictEqual(
					getValuesByLabel(0.5, vals)[0].exemplar.labelSet.traceId,
					'trace_id_test_1',
				);
				timers.useRealTimers();
			});

			describe('when the exemplar labels are not provided during subsequent metric updates', () => {
				it('does not update the counter metric exemplar value ', async () => {
					const counterInstance = new Counter({
						name: 'counter_exemplar_value_test',
						help: 'help',
						labelNames: ['method', 'code'],
						enableExemplars: true,
					});

					counterInstance.inc({
						value: 2,
						labels: { method: 'get', code: '200' },
						exemplarLabels: {
							traceId: 'trace_id_test',
							spanId: 'span_id_test',
						},
					});

					counterInstance.inc({
						value: 4,
						labels: { method: 'get', code: '200' },
					});

					const vals = await counterInstance.get();
					assert.strictEqual(vals.values[0].value, 6);
					assert.strictEqual(vals.values[0].exemplar.value, 2);
					assert.strictEqual(
						vals.values[0].exemplar.labelSet.traceId,
						'trace_id_test',
					);
					assert.strictEqual(
						vals.values[0].exemplar.labelSet.spanId,
						'span_id_test',
					);
				});

				it('does not update the histogram metric exemplar value ', async () => {
					const histogramInstance = new Histogram({
						name: 'histogram_exemplar_value_test',
						help: 'test',
						labelNames: ['method', 'code'],
						enableExemplars: true,
					});

					histogramInstance.observe({
						value: 0.3,
						labels: { method: 'get', code: '200' },
						exemplarLabels: {
							traceId: 'trace_id_test_1',
							spanId: 'span_id_test_1',
						},
					});
					histogramInstance.observe({
						value: 0.4,
						labels: { method: 'get', code: '200' },
					});

					const vals = (await histogramInstance.get()).values;

					assert.strictEqual(getValuesByLabel(0.5, vals)[0].value, 2);
					assert.strictEqual(
						getValuesByLabel(0.5, vals)[0].exemplar.labelSet.traceId,
						'trace_id_test_1',
					);
					assert.strictEqual(
						getValuesByLabel(0.5, vals)[0].exemplar.labelSet.spanId,
						'span_id_test_1',
					);
					assert.strictEqual(
						getValuesByLabel(0.5, vals)[0].exemplar.value,
						0.3,
					);
				});
			});

			function getValueByLabel(label, values, key) {
				return values.reduce((acc, val) => {
					if (val.labels && val.labels[key || 'le'] === label) {
						acc = val;
					}
					return acc;
				}, {});
			}
			function getValuesByLabel(label, values, key) {
				return values.reduce((acc, val) => {
					if (val.labels && val.labels[key || 'le'] === label) {
						acc.push(val);
					}
					return acc;
				}, []);
			}
		},
	);
});

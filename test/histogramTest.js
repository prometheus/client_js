'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const { describeEach, timers } = require('./helpers');
const errorMessages = require('./error-messages');
const Registry = require('../index').Registry;

describeEach([
	['Prometheus', Registry.PROMETHEUS_CONTENT_TYPE],
	['OpenMetrics', Registry.OPENMETRICS_CONTENT_TYPE],
])('histogram with %s registry', (tag, regType) => {
	const Histogram = require('../index').Histogram;
	const globalRegistry = require('../index').register;
	let instance;

	beforeEach(() => {
		globalRegistry.setContentType(regType);
	});

	afterEach(() => {
		instance = null;
		globalRegistry.clear();
	});

	describe('with object as params', () => {
		describe('with global registry', () => {
			beforeEach(() => {
				instance = new Histogram({ name: 'test_histogram', help: 'test' });
			});

			it('should increase count', async () => {
				instance.observe(0.5);
				const valuePair = getValueByName(
					'test_histogram_count',
					(await instance.get()).values,
				);
				assert.strictEqual(valuePair.value, 1);
			});
			it('should be able to observe 0s', async () => {
				instance.observe(0);
				const valuePair = getValueByLabel(0.005, (await instance.get()).values);
				assert.strictEqual(valuePair.value, 1);
			});
			it('should increase sum', async () => {
				instance.observe(0.5);
				const valuePair = getValueByName(
					'test_histogram_sum',
					(await instance.get()).values,
				);
				assert.strictEqual(valuePair.value, 0.5);
			});
			it('should add item in upper bound bucket', async () => {
				instance.observe(1);
				const valuePair = getValueByLabel(1, (await instance.get()).values);
				assert.strictEqual(valuePair.value, 1);
			});

			it('should be able to monitor more than one item', async () => {
				instance.observe(0.05);
				instance.observe(5);
				const firstValuePair = getValueByLabel(
					0.05,
					(await instance.get()).values,
				);
				const secondValuePair = getValueByLabel(
					5,
					(await instance.get()).values,
				);
				assert.strictEqual(firstValuePair.value, 1);
				assert.strictEqual(secondValuePair.value, 2);
			});

			it('should add a +Inf bucket with the same value as count', async () => {
				instance.observe(10);
				const countValuePair = getValueByName(
					'test_histogram_count',
					(await instance.get()).values,
				);
				const infValuePair = getValueByLabel(
					'+Inf',
					(await instance.get()).values,
				);
				assert.strictEqual(infValuePair.value, countValuePair.value);
			});

			it('should add buckets in increasing numerical order', async () => {
				const histogram = new Histogram({
					name: 'test_histogram_2',
					help: 'test',
					buckets: [1, 5],
				});
				histogram.observe(1.5);
				const values = (await histogram.get()).values;
				assert.strictEqual(values[0].labels.le, 1);
				assert.strictEqual(values[1].labels.le, 5);
				assert.strictEqual(values[2].labels.le, '+Inf');
			});
			it('should group counts on each label set', async () => {
				const histogram = new Histogram({
					name: 'test_histogram_2',
					help: 'test',
					labelNames: ['code'],
				});
				histogram.observe({ code: '200' }, 1);
				histogram.observe({ code: '300' }, 1);
				const values = getValuesByLabel(1, (await histogram.get()).values);
				assert.strictEqual(values[0].value, 1);
				assert.strictEqual(values[1].value, 1);
			});

			it('should time requests', async () => {
				timers.useFakeTimers();
				timers.setSystemTime(0);
				const doneFn = instance.startTimer();
				timers.advanceTimersByTime(500);
				doneFn();
				const valuePair = getValueByLabel(0.5, (await instance.get()).values);
				assert.strictEqual(valuePair.value, 1);
				timers.useRealTimers();
			});

			it('should time requests, end function should return time spent value', () => {
				timers.useFakeTimers();
				timers.setSystemTime(0);
				const doneFn = instance.startTimer();
				timers.advanceTimersByTime(500);
				const value = doneFn();
				assert.strictEqual(value, 0.5);
				timers.useRealTimers();
			});

			it('should not allow non numbers', () => {
				const fn = function () {
					instance.observe('asd');
				};
				assert.throws(fn, error => {
					assert.strictEqual(
						error.message,
						errorMessages.INVALID_NUMBER('asd'),
					);
					return true;
				});
			});

			it('should allow custom labels', async () => {
				const i = new Histogram({
					name: 'histo',
					help: 'help',
					labelNames: ['code'],
				});
				i.observe({ code: 'test' }, 1);
				const pair = getValueByLeAndLabel(
					1,
					'code',
					'test',
					(await i.get()).values,
				);
				assert.strictEqual(pair.value, 1);
			});

			it('should not allow le as a custom label', () => {
				const fn = function () {
					new Histogram({ name: 'name', help: 'help', labelNames: ['le'] });
				};
				assert.throws(fn, error => {
					assert.strictEqual(error.message, errorMessages.RESERVED_LABEL_LE);
					return true;
				});
			});

			it('should observe value if outside most upper bound', async () => {
				instance.observe(100000);
				const values = (await instance.get()).values;
				const count = getValueByLabel('+Inf', values, 'le');
				assert.strictEqual(count.value, 1);
			});

			it('should allow to be reset itself', async () => {
				instance.observe(0.5);
				let valuePair = getValueByName(
					'test_histogram_count',
					(await instance.get()).values,
				);
				assert.strictEqual(valuePair.value, 1);
				instance.reset();
				valuePair = getValueByName(
					'test_histogram_count',
					(await instance.get()).values,
				);
				assert.strictEqual(valuePair.value, undefined);
			});

			it('should init to 0', async () => {
				(await instance.get()).values.forEach(bucket => {
					assert.strictEqual(bucket.value, 0);
				});
			});

			describe('labels', () => {
				beforeEach(() => {
					instance = new Histogram({
						name: 'histogram_labels',
						help: 'Histogram with labels fn',
						labelNames: ['method'],
					});
				});

				it('should observe', async () => {
					instance.labels('get').observe(4);
					const res = getValueByLeAndLabel(
						5,
						'method',
						'get',
						(await instance.get()).values,
					);
					assert.strictEqual(res.value, 1);
				});

				it('should not allow different number of labels', () => {
					const fn = function () {
						instance.labels('get', '500').observe(4);
					};
					assert.throws(fn, error => {
						assert.strictEqual(
							error.message,
							errorMessages.INVALID_LABEL_ARGUMENTS(2, 'get, 500', 1, 'method'),
						);
						return true;
					});
				});

				it('should start a timer', async () => {
					timers.useFakeTimers();
					timers.setSystemTime(0);
					const end = instance.labels('get').startTimer();
					timers.advanceTimersByTime(500);
					end();
					const res = getValueByLeAndLabel(
						0.5,
						'method',
						'get',
						(await instance.get()).values,
					);
					assert.strictEqual(res.value, 1);
					timers.useRealTimers();
				});

				it('should start a timer and set labels afterwards', async () => {
					timers.useFakeTimers();
					timers.setSystemTime(0);
					const end = instance.startTimer();
					timers.advanceTimersByTime(500);
					end({ method: 'get' });
					const res = getValueByLeAndLabel(
						0.5,
						'method',
						'get',
						(await instance.get()).values,
					);
					assert.strictEqual(res.value, 1);
					timers.useRealTimers();
				});

				it('should allow labels before and after timers', async () => {
					instance = new Histogram({
						name: 'histogram_labels_2',
						help: 'Histogram with labels fn',
						labelNames: ['method', 'success'],
					});
					timers.useFakeTimers();
					timers.setSystemTime(0);
					const end = instance.startTimer({ method: 'get' });
					timers.advanceTimersByTime(500);
					end({ success: 'SUCCESS' });
					const res1 = getValueByLeAndLabel(
						0.5,
						'method',
						'get',
						(await instance.get()).values,
					);
					const res2 = getValueByLeAndLabel(
						0.5,
						'success',
						'SUCCESS',
						(await instance.get()).values,
					);
					assert.strictEqual(res1.value, 1);
					assert.strictEqual(res2.value, 1);
					timers.useRealTimers();
				});

				it('should not mutate passed startLabels', () => {
					const startLabels = { method: 'GET' };
					const end = instance.startTimer(startLabels);
					end({ method: 'POST' });
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

			describe('zero', () => {
				beforeEach(() => {
					instance = new Histogram({
						name: 'histogram_labels',
						help: 'Histogram with labels fn',
						labelNames: ['method'],
					});
				});

				it('should zero the given label', async () => {
					instance.zero({ method: 'POST' });
					const values = getValuesByLabel(
						'POST',
						(await instance.get()).values,
						'method',
					);
					values.forEach(bucket => {
						assert.strictEqual(bucket.value, 0);
					});
				});

				it('should export the metric after zeroing', async () => {
					instance.zero({ method: 'POST' });
					const values = getValuesByLabel(
						'POST',
						(await instance.get()).values,
						'method',
					);
					assert.notEqual(values.length, 0);
				});

				it('should not duplicate the metric', async () => {
					instance.zero({ method: 'POST' });
					instance.observe({ method: 'POST' }, 1);
					const values = getValuesByName(
						'histogram_labels_count',
						(await instance.get()).values,
					);
					assert.strictEqual(values.length, 1);
				});
			});

			describe('remove', () => {
				beforeEach(() => {
					instance = new Histogram({
						name: 'histogram_labels',
						help: 'Histogram with labels fn',
						labelNames: ['method'],
					});
				});

				it('should remove matching label', async () => {
					instance.labels('POST').observe(3);
					instance.labels('GET').observe(4);
					instance.remove('POST');

					const res = getValueByLeAndLabel(
						5,
						'method',
						'GET',
						(await instance.get()).values,
					);
					assert.strictEqual(res.value, 1);
				});

				it('should remove all labels', async () => {
					instance.labels('POST').observe(3);
					instance.labels('GET').observe(4);
					instance.remove('POST');
					instance.remove('GET');

					assert.strictEqual((await instance.get()).values.length, 0);
				});

				it('should throw error if label lengths does not match', () => {
					const fn = function () {
						instance.remove('GET', '/foo');
					};
					assert.throws(fn, error => {
						assert.strictEqual(
							error.message,
							errorMessages.INVALID_LABEL_ARGUMENTS(
								2,
								'GET, /foo',
								1,
								'method',
							),
						);
						return true;
					});
				});

				it('should remove timer labels', async () => {
					timers.useFakeTimers();
					timers.setSystemTime(0);
					const getEnd = instance.labels('GET').startTimer();
					const postEnd = instance.labels('POST').startTimer();
					timers.advanceTimersByTime(500);
					postEnd();
					getEnd();
					instance.remove('POST');
					const res = getValueByLeAndLabel(
						0.5,
						'method',
						'GET',
						(await instance.get()).values,
					);
					assert.strictEqual(res.value, 1);
					timers.useRealTimers();
				});

				it('should remove timer labels when labels are set afterwards', async () => {
					timers.useFakeTimers();
					timers.setSystemTime(0);
					const end = instance.startTimer();
					timers.advanceTimersByTime(500);
					end({ method: 'GET' });
					instance.remove('GET');
					assert.strictEqual((await instance.get()).values.length, 0);
					timers.useRealTimers();
				});

				it('should remove labels before and after timers', async () => {
					instance = new Histogram({
						name: 'histogram_labels_2',
						help: 'Histogram with labels fn',
						labelNames: ['method', 'success'],
					});
					timers.useFakeTimers();
					timers.setSystemTime(0);
					const end = instance.startTimer({ method: 'GET' });
					timers.advanceTimersByTime(500);
					end({ success: 'SUCCESS' });
					instance.remove('GET', 'SUCCESS');
					assert.strictEqual((await instance.get()).values.length, 0);
					timers.useRealTimers();
				});

				it('should remove by labels object', async () => {
					instance.observe({ method: 'GET' }, 1);
					instance.remove({ method: 'GET' });
					assert.strictEqual((await instance.get()).values.length, 0);
				});
			});
		});

		describe('without registry', () => {
			beforeEach(() => {
				instance = new Histogram({
					name: 'test_histogram',
					help: 'test',
					registers: [],
				});
			});
			it('should increase count', async () => {
				instance.observe(0.5);
				const valuePair = getValueByName(
					'test_histogram_count',
					(await instance.get()).values,
				);
				assert.strictEqual(valuePair.value, 1);
				assert.strictEqual((await globalRegistry.getMetricsAsJSON()).length, 0);
			});
		});
		describe('registry instance', () => {
			let registryInstance;
			beforeEach(() => {
				registryInstance = new Registry(regType);
				instance = new Histogram({
					name: 'test_histogram',
					help: 'test',
					registers: [registryInstance],
				});
			});
			it('should increment counter', async () => {
				instance.observe(0.5);
				const valuePair = getValueByName(
					'test_histogram_count',
					(await instance.get()).values,
				);
				assert.strictEqual(valuePair.value, 1);
				assert.strictEqual((await globalRegistry.getMetricsAsJSON()).length, 0);
				assert.strictEqual(
					(await registryInstance.getMetricsAsJSON()).length,
					1,
				);
			});
		});
	});
	function getValueByName(name, values) {
		return (
			values.length > 0 &&
			values.reduce((acc, val) => {
				if (val.metricName === name) {
					acc = val;
				}
				return acc;
			})
		);
	}
	function getValuesByName(name, values) {
		return values.reduce((acc, val) => {
			if (val.metricName === name) {
				acc.push(val);
			}
			return acc;
		}, []);
	}
	function getValueByLeAndLabel(le, key, label, values) {
		return values.reduce((acc, val) => {
			if (val.labels && val.labels.le === le && val.labels[key] === label) {
				acc = val;
			}
			return acc;
		}, {});
	}
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
});

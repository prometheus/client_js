'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const { describeEach, timers } = require('./helpers');
const errorMessages = require('./error-messages');

const { Metric } = require('../lib/metric');
const Registry = require('../index').Registry;

describeEach([
	['Prometheus', Registry.PROMETHEUS_CONTENT_TYPE],
	['OpenMetrics', Registry.OPENMETRICS_CONTENT_TYPE],
])('gauge with %s registry', (tag, regType) => {
	const Gauge = require('../index').Gauge;
	const globalRegistry = require('../index').register;
	let instance;

	beforeEach(() => {
		globalRegistry.setContentType(regType);
	});

	describe('global registry', () => {
		afterEach(() => {
			globalRegistry.clear();
		});

		describe('Metric instantiation', () => {
			const defaultParams = { name: 'gauge_test', help: 'help' };

			describe('happy path', () => {
				it('should create a instance', async () => {
					const instance = new Gauge(defaultParams);
					const instanceValues = await instance.get();
					assert.ok(instance instanceof Metric);
					assert.ok(instance instanceof Gauge);
					assert.deepStrictEqual(instance.labelNames, []);
					assert.strictEqual(instanceValues.name, defaultParams.name);
					assert.strictEqual(instanceValues.help, defaultParams.help);
				});
			});

			describe('un-happy path', () => {
				const noValidName = 'no valid name';
				it('should thrown an error due invalid metric name', () => {
					try {
						new Gauge({ ...defaultParams, name: noValidName });
						assert.fail('Expected function to throw');
					} catch (error) {
						assert.strictEqual(
							error.message,
							`Invalid metric name: ${noValidName}`,
						);
					}
				});

				it('should thrown an error due some invalid label name', () => {
					const noValidLabelNames = [noValidName, defaultParams.name];
					try {
						new Gauge({
							...defaultParams,
							labelNames: noValidLabelNames,
						});
						assert.fail('Expected function to throw');
					} catch (error) {
						assert.strictEqual(
							error.message,
							`At least one label name is invalid: ${noValidName}`,
						);
					}
				});
			});
		});

		describe('with parameters as object', () => {
			beforeEach(() => {
				instance = new Gauge({ name: 'gauge_test', help: 'help' });
				instance.set(10);
			});

			it('should set a gauge to provided value', async () => {
				await expectValue(10);
			});

			it('should increase with 1 if no param provided', async () => {
				instance.inc();
				await expectValue(11);
			});

			it('should increase with param value if provided', async () => {
				instance.inc(5);
				await expectValue(15);
			});

			it('should decrease with 1 if no param provided', async () => {
				instance.dec();
				await expectValue(9);
			});

			it('should decrease with param if provided', async () => {
				instance.dec(5);
				await expectValue(5);
			});

			it('should set to exactly zero without defaulting to 1', async () => {
				instance.set(0);
				await expectValue(0);
			});

			it('should inc by zero without defaulting to 1', async () => {
				instance.inc(0);
				await expectValue(10);
			});

			it('should start a timer and set a gauge to elapsed in seconds', async () => {
				timers.useFakeTimers();
				timers.setSystemTime(0);

				const doneFn = instance.startTimer();
				timers.advanceTimersByTime(500);
				const dur = doneFn();
				await expectValue(0.5);
				assert.strictEqual(dur, 0.5);

				timers.useRealTimers();
			});

			it('should set to current time', async () => {
				timers.useFakeTimers();
				timers.setSystemTime(0);

				instance.setToCurrentTime();
				await expectValue(Date.now() / 1000);

				timers.useRealTimers();
			});

			it('should not allow non numbers', () => {
				const fn = function () {
					instance.set('asd');
				};
				try {
					fn();
					assert.fail('Expected function to throw');
				} catch (error) {
					assert.strictEqual(
						error.message,
						errorMessages.INVALID_NUMBER('asd'),
					);
				}
			});

			it('should init to 0', async () => {
				instance = new Gauge({
					name: 'init_gauge',
					help: 'somehelp',
				});
				await expectValue(0);
			});

			describe('with labels', () => {
				beforeEach(() => {
					instance = new Gauge({
						name: 'name',
						help: 'help',
						labelNames: ['code'],
					});
					instance.set({ code: '200' }, 20);
				});
				it('should be able to increment', async () => {
					instance.labels('200').inc();
					await expectValue(21);
				});
				it('should be able to decrement', async () => {
					instance.labels('200').dec();
					await expectValue(19);
				});
				it('should be able to set value', async () => {
					instance.labels('200').set(500);
					await expectValue(500);
				});
				it('should be able to set value to current time', async () => {
					timers.useFakeTimers();
					timers.setSystemTime(0);

					instance.labels('200').setToCurrentTime();
					await expectValue(Date.now() / 1000);

					timers.useRealTimers();
				});
				it('should be able to start a timer', async () => {
					timers.useFakeTimers();
					timers.setSystemTime(0);

					const end = instance.labels('200').startTimer();
					timers.advanceTimersByTime(1000);
					end();
					await expectValue(1);

					timers.useRealTimers();
				});
				it('should be able to start a timer and set labels afterwards', async () => {
					timers.useFakeTimers();
					timers.setSystemTime(0);

					const end = instance.startTimer();
					timers.advanceTimersByTime(1000);
					end({ code: 200 });
					await expectValue(1);

					timers.useRealTimers();
				});
				it('should allow labels before and after timers', async () => {
					instance = new Gauge({
						name: 'name_2',
						help: 'help',
						labelNames: ['code', 'success'],
					});
					timers.useFakeTimers();
					timers.setSystemTime(0);

					const end = instance.startTimer({ code: 200 });
					timers.advanceTimersByTime(1000);
					end({ success: 'SUCCESS' });
					await expectValue(1);

					timers.useRealTimers();
				});
				it('should not mutate passed startLabels', () => {
					const startLabels = { code: '200' };
					const end = instance.startTimer(startLabels);
					end({ code: '400' });
					assert.deepStrictEqual(startLabels, { code: '200' });
				});
				it('should handle labels provided as an object', async () => {
					instance.labels({ code: '200' }).inc();

					const values = (await instance.get()).values;
					assert.strictEqual(values.length, 1);
					assert.deepStrictEqual(values[0].labels, { code: '200' });
				});
			});

			describe('with remove', () => {
				beforeEach(() => {
					instance = new Gauge({
						name: 'name',
						help: 'help',
						labelNames: ['code'],
					});
					instance.set({ code: '200' }, 20);
					instance.set({ code: '400' }, 0);
				});
				it('should be able to remove matching label', async () => {
					instance.remove('200');
					const values = (await instance.get()).values;
					assert.strictEqual(values.length, 1);
					assert.strictEqual(values[0].labels.code, '400');
					assert.strictEqual(values[0].value, 0);
				});
				it('should remove by labels object', async () => {
					instance.remove({ code: '200' });
					const values = (await instance.get()).values;
					assert.strictEqual(values.length, 1);
					assert.deepStrictEqual(values[0].labels, { code: '400' });
					assert.strictEqual(values[0].value, 0);
				});
				it('should be able to remove all labels', async () => {
					instance.remove('200');
					instance.remove('400');
					assert.strictEqual((await instance.get()).values.length, 0);
				});
			});
		});
	});
	describe('without registry', () => {
		afterEach(() => {
			globalRegistry.clear();
		});
		beforeEach(() => {
			instance = new Gauge({ name: 'gauge_test', help: 'help', registers: [] });
			instance.set(10);
		});
		it('should set a gauge to provided value', async () => {
			await expectValue(10);
			assert.strictEqual((await globalRegistry.getMetricsAsJSON()).length, 0);
		});
	});
	describe('registry instance', () => {
		let registryInstance;
		beforeEach(() => {
			registryInstance = new Registry(regType);
			instance = new Gauge({
				name: 'gauge_test',
				help: 'help',
				registers: [registryInstance],
			});
			instance.set(10);
		});
		it('should set a gauge to provided value', async () => {
			assert.strictEqual((await globalRegistry.getMetricsAsJSON()).length, 0);
			assert.strictEqual((await registryInstance.getMetricsAsJSON()).length, 1);
			await expectValue(10);
		});
	});
	describe('gauge reset', () => {
		afterEach(() => {
			globalRegistry.clear();
		});
		it('should reset labelless gauge', async () => {
			const instance = new Gauge({
				name: 'test_metric',
				help: 'Another test metric',
			});

			instance.set(12);
			assert.strictEqual((await instance.get()).values[0].value, 12);

			instance.reset();
			assert.strictEqual((await instance.get()).values[0].value, 0);

			instance.set(10);
			assert.strictEqual((await instance.get()).values[0].value, 10);
		});
		it('should reset the gauge, incl labels', async () => {
			const instance = new Gauge({
				name: 'test_metric',
				help: 'Another test metric',
				labelNames: ['serial', 'active'],
			});

			instance.set({ serial: '12345', active: 'yes' }, 12);
			assert.strictEqual((await instance.get()).values[0].value, 12);
			assert.strictEqual(
				(await instance.get()).values[0].labels.serial,
				'12345',
			);
			assert.strictEqual((await instance.get()).values[0].labels.active, 'yes');

			instance.reset();

			assert.deepStrictEqual((await instance.get()).values, []);

			instance.set({ serial: '12345', active: 'no' }, 10);
			assert.strictEqual((await instance.get()).values[0].value, 10);
			assert.strictEqual(
				(await instance.get()).values[0].labels.serial,
				'12345',
			);
			assert.strictEqual((await instance.get()).values[0].labels.active, 'no');
		});
	});

	async function expectValue(val) {
		const result = await instance.get();
		assert.strictEqual(result.values[0].value, val);
	}
});

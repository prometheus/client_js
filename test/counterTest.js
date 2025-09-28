'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const { describeEach } = require('./helpers');
const errorMessages = require('./error-messages');

const Registry = require('../index').Registry;

describeEach([
	['Prometheus', Registry.PROMETHEUS_CONTENT_TYPE],
	['OpenMetrics', Registry.OPENMETRICS_CONTENT_TYPE],
])('counter with %s registry', (tag, regType) => {
	const Counter = require('../index').Counter;
	const globalRegistry = require('../index').register;
	let instance;

	beforeEach(() => {
		globalRegistry.setContentType(regType);
	});

	describe('with params as object', () => {
		beforeEach(() => {
			instance = new Counter({ name: 'gauge_test', help: 'test' });
		});
		afterEach(() => {
			globalRegistry.clear();
		});

		it('should increment counter', async () => {
			instance.inc();
			assert.strictEqual((await instance.get()).values[0].value, 1);
			instance.inc();
			assert.strictEqual((await instance.get()).values[0].value, 2);
			instance.inc(0);
			assert.strictEqual((await instance.get()).values[0].value, 2);
		});
		it('should increment with a provided value', async () => {
			instance.inc(100);
			assert.strictEqual((await instance.get()).values[0].value, 100);
		});
		it('should not be possible to decrease a counter', () => {
			const fn = function () {
				instance.inc(-100);
			};
			try {
				fn();
				assert.fail('Expected function to throw');
			} catch (error) {
				assert.strictEqual(error.message, errorMessages.COUNTER_DECREASE_ERROR);
			}
		});
		it('should throw an error when the value is not a number', () => {
			const fn = () => {
				instance.inc('3ms');
			};
			try {
				fn();
				assert.fail('Expected function to throw');
			} catch (error) {
				assert.strictEqual(error.message, errorMessages.INVALID_NUMBER('3ms'));
			}
		});
		it('should handle incrementing with 0', async () => {
			instance.inc(0);
			assert.strictEqual((await instance.get()).values[0].value, 0);
		});
		it('should init counter to 0', async () => {
			const values = (await instance.get()).values;
			assert.strictEqual(values.length, 1);
			assert.strictEqual(values[0].value, 0);
		});

		describe('labels', () => {
			beforeEach(() => {
				instance = new Counter({
					name: 'gauge_test_2',
					help: 'help',
					labelNames: ['method', 'endpoint'],
				});
			});

			it('should handle 1 value per label', async () => {
				instance.labels('GET', '/test').inc();
				instance.labels('POST', '/test').inc();

				const values = (await instance.get()).values;
				assert.strictEqual(values.length, 2);
			});

			it('should handle labels provided as an object', async () => {
				instance.labels({ method: 'POST', endpoint: '/test' }).inc();
				const values = (await instance.get()).values;
				assert.strictEqual(values.length, 1);
				assert.deepStrictEqual(values[0].labels, {
					method: 'POST',
					endpoint: '/test',
				});
			});

			it('should handle labels which are provided as arguments to inc()', async () => {
				instance.inc({ method: 'GET', endpoint: '/test' });
				instance.inc({ method: 'POST', endpoint: '/test' });

				const values = (await instance.get()).values;
				assert.strictEqual(values.length, 2);
			});

			it('should throw error if label lengths does not match', () => {
				const fn = function () {
					instance.labels('GET').inc();
				};
				try {
					fn();
					assert.fail('Expected function to throw');
				} catch (error) {
					assert.strictEqual(
						error.message,
						errorMessages.INVALID_LABEL_ARGUMENTS(
							1,
							'GET',
							2,
							'method, endpoint',
						),
					);
				}
			});

			it('should increment label value with provided value', async () => {
				instance.labels('GET', '/test').inc(100);
				const values = (await instance.get()).values;
				assert.strictEqual(values[0].value, 100);
			});
		});
	});

	describe('remove', () => {
		beforeEach(() => {
			instance = new Counter({
				name: 'gauge_test_3',
				help: 'help',
				labelNames: ['method', 'endpoint'],
			});
			instance.inc({ method: 'GET', endpoint: '/test' });
			instance.inc({ method: 'POST', endpoint: '/test' });
		});

		afterEach(() => {
			globalRegistry.clear();
		});

		it('should remove matching label', async () => {
			instance.remove('POST', '/test');

			const values = (await instance.get()).values;
			assert.strictEqual(values.length, 1);
			assert.strictEqual(values[0].value, 1);
			assert.strictEqual(values[0].labels.method, 'GET');
			assert.strictEqual(values[0].labels.endpoint, '/test');
			assert.strictEqual(values[0].timestamp, undefined);
		});

		it('should remove by labels object', async () => {
			instance.remove({ method: 'POST', endpoint: '/test' });

			const values = (await instance.get()).values;
			assert.strictEqual(values.length, 1);
			assert.deepStrictEqual(values[0].labels, {
				method: 'GET',
				endpoint: '/test',
			});
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
			try {
				fn();
				assert.fail('Expected function to throw');
			} catch (error) {
				assert.strictEqual(
					error.message,
					errorMessages.INVALID_LABEL_ARGUMENTS(
						1,
						'GET',
						2,
						'method, endpoint',
					),
				);
			}
		});
	});

	describe('without registry', () => {
		beforeEach(() => {
			instance = new Counter({
				name: 'gauge_test',
				help: 'test',
				registers: [],
			});
		});
		it('should increment counter', async () => {
			instance.inc();
			assert.strictEqual((await globalRegistry.getMetricsAsJSON()).length, 0);
			assert.strictEqual((await instance.get()).values[0].value, 1);
			assert.strictEqual((await instance.get()).values[0].timestamp, undefined);
		});
	});
	describe('registry instance', () => {
		let registryInstance;
		beforeEach(() => {
			registryInstance = new Registry(regType);
			instance = new Counter({
				name: 'gauge_test',
				help: 'test',
				registers: [registryInstance],
			});
		});
		it('should increment counter', async () => {
			instance.inc();
			assert.strictEqual((await globalRegistry.getMetricsAsJSON()).length, 0);
			assert.strictEqual((await registryInstance.getMetricsAsJSON()).length, 1);
			assert.strictEqual((await instance.get()).values[0].value, 1);
			assert.strictEqual((await instance.get()).values[0].timestamp, undefined);
		});
	});
	describe('counter reset', () => {
		afterEach(() => {
			globalRegistry.clear();
		});
		it('should reset labelless counter', async () => {
			const instance = new Counter({
				name: 'test_metric',
				help: 'Another test metric',
			});

			instance.inc(12);
			assert.strictEqual((await instance.get()).values[0].value, 12);

			instance.reset();
			assert.strictEqual((await instance.get()).values[0].value, 0);

			instance.inc(10);
			assert.strictEqual((await instance.get()).values[0].value, 10);
		});
		it('should reset the counter, incl labels', async () => {
			const instance = new Counter({
				name: 'test_metric',
				help: 'Another test metric',
				labelNames: ['serial', 'active'],
			});

			instance.inc({ serial: '12345', active: 'yes' }, 12);
			assert.strictEqual((await instance.get()).values[0].value, 12);
			assert.strictEqual(
				(await instance.get()).values[0].labels.serial,
				'12345',
			);
			assert.strictEqual((await instance.get()).values[0].labels.active, 'yes');

			instance.reset();

			assert.deepStrictEqual((await instance.get()).values, []);

			instance.inc({ serial: '12345', active: 'no' }, 10);
			assert.strictEqual((await instance.get()).values[0].value, 10);
			assert.strictEqual(
				(await instance.get()).values[0].labels.serial,
				'12345',
			);
			assert.strictEqual((await instance.get()).values[0].labels.active, 'no');
		});
	});
});

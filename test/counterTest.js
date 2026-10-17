// Copyright The Prometheus Authors
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0

// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

'use strict';

const Registry = require('../index').Registry;

describe.each([
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
			expect((await instance.get()).values[0].value).toEqual(1);
			instance.inc();
			expect((await instance.get()).values[0].value).toEqual(2);
			instance.inc(0);
			expect((await instance.get()).values[0].value).toEqual(2);
		});
		it('should increment with a provided value', async () => {
			instance.inc(100);
			expect((await instance.get()).values[0].value).toEqual(100);
		});
		it('should not be possible to decrease a counter', () => {
			const fn = function () {
				instance.inc(-100);
			};
			expect(fn).toThrowErrorMatchingSnapshot();
		});
		it('should throw an error when the value is not a number', () => {
			const fn = () => {
				instance.inc('3ms');
			};
			expect(fn).toThrowErrorMatchingSnapshot();
		});
		it('should handle incrementing with 0', async () => {
			instance.inc(0);
			expect((await instance.get()).values[0].value).toEqual(0);
		});
		it('should init counter to 0', async () => {
			const values = (await instance.get()).values;
			expect(values).toHaveLength(1);
			expect(values[0].value).toEqual(0);
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
				expect(values).toHaveLength(2);
			});

			it('should handle labels provided as an object', async () => {
				instance.labels({ method: 'POST', endpoint: '/test' }).inc();
				const values = (await instance.get()).values;
				expect(values).toHaveLength(1);
				expect(values[0].labels).toEqual({
					method: 'POST',
					endpoint: '/test',
				});
			});

			it('should handle labels which are provided as arguments to inc()', async () => {
				instance.inc({ method: 'GET', endpoint: '/test' });
				instance.inc({ method: 'POST', endpoint: '/test' });

				const values = (await instance.get()).values;
				expect(values).toHaveLength(2);
			});

			it('should throw error if label lengths does not match', () => {
				const fn = function () {
					instance.labels('GET').inc();
				};
				expect(fn).toThrowErrorMatchingSnapshot();
			});

			it('should increment label value with provided value', async () => {
				instance.labels('GET', '/test').inc(100);
				const values = (await instance.get()).values;
				expect(values[0].value).toEqual(100);
			});

			it('should share a series between saved children and direct increments', async () => {
				const first = instance.labels('GET', '/test');
				const second = instance.labels('GET', '/test');
				expect((await instance.get()).values).toEqual([]);
				first.inc();
				second.inc(2);
				instance.inc({ method: 'GET', endpoint: '/test' }, 3);
				first.inc(0);
				second.inc(0.5);
				first.inc();
				expect((await instance.get()).values).toEqual([
					{ labels: { method: 'GET', endpoint: '/test' }, value: 7.5 },
				]);
			});

			it.each(['reset', 'remove'])(
				'should reuse a saved child after %s',
				async operation => {
					const child = instance.labels('GET', '/test');
					child.inc(10);
					child.inc();
					if (operation === 'reset') {
						instance.reset();
					} else {
						instance.remove('GET', '/test');
					}
					expect((await instance.get()).values).toEqual([]);
					child.inc(2);
					child.inc(3);
					expect((await instance.get()).values).toEqual([
						{ labels: { method: 'GET', endpoint: '/test' }, value: 5 },
					]);
				},
			);

			it('should use a recreated series after removal', async () => {
				const child = instance.labels('GET', '/test');
				child.inc(10);
				instance.remove({ method: 'GET', endpoint: '/test' });
				instance.inc({ method: 'GET', endpoint: '/test' }, 4);
				child.inc(2);
				child.inc(3);
				expect((await instance.get()).values[0].value).toEqual(9);
			});

			it('should keep observing changes to object-form labels', async () => {
				const labels = { method: 'GET', endpoint: '/test' };
				const child = instance.labels(labels);
				child.inc();
				labels.method = 'POST';
				child.inc(2);
				labels.unexpected = 'label';
				expect(() => child.inc()).toThrow();
				expect((await instance.get()).values).toEqual([
					{ labels: { method: 'GET', endpoint: '/test' }, value: 1 },
					{ labels: { method: 'POST', endpoint: '/test' }, value: 2 },
				]);
			});

			it.each([-1, Infinity, -Infinity, 'invalid'])(
				'should reject %p before and after warming a saved child',
				value => {
					const child = instance.labels('GET', '/test');
					expect(() => child.inc(value)).toThrow();
					child.inc();
					expect(() => child.inc(value)).toThrow();
				},
			);
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
			expect(values).toHaveLength(1);
			expect(values[0].value).toEqual(1);
			expect(values[0].labels.method).toEqual('GET');
			expect(values[0].labels.endpoint).toEqual('/test');
			expect(values[0].timestamp).toEqual(undefined);
		});

		it('should remove by labels object', async () => {
			instance.remove({ method: 'POST', endpoint: '/test' });

			const values = (await instance.get()).values;
			expect(values).toHaveLength(1);
			expect(values[0].labels).toEqual({
				method: 'GET',
				endpoint: '/test',
			});
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
			expect((await globalRegistry.getMetricsAsJSON()).length).toEqual(0);
			expect((await instance.get()).values[0].value).toEqual(1);
			expect((await instance.get()).values[0].timestamp).toEqual(undefined);
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
			expect((await globalRegistry.getMetricsAsJSON()).length).toEqual(0);
			expect((await registryInstance.getMetricsAsJSON()).length).toEqual(1);
			expect((await instance.get()).values[0].value).toEqual(1);
			expect((await instance.get()).values[0].timestamp).toEqual(undefined);
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
			expect((await instance.get()).values[0].value).toEqual(12);

			instance.reset();
			expect((await instance.get()).values[0].value).toEqual(0);

			instance.inc(10);
			expect((await instance.get()).values[0].value).toEqual(10);
		});
		it('should reuse a saved labelless child after reset', async () => {
			const counter = new Counter({ name: 'test_metric', help: 'test' });
			const child = counter.labels();
			child.inc(12);
			counter.reset();
			expect((await counter.get()).values[0].value).toEqual(0);
			child.inc(2);
			child.inc(3);
			expect((await counter.get()).values[0].value).toEqual(5);
		});
		it('should reset the counter, incl labels', async () => {
			const instance = new Counter({
				name: 'test_metric',
				help: 'Another test metric',
				labelNames: ['serial', 'active'],
			});

			instance.inc({ serial: '12345', active: 'yes' }, 12);
			expect((await instance.get()).values[0].value).toEqual(12);
			expect((await instance.get()).values[0].labels.serial).toEqual('12345');
			expect((await instance.get()).values[0].labels.active).toEqual('yes');

			instance.reset();

			expect((await instance.get()).values).toEqual([]);

			instance.inc({ serial: '12345', active: 'no' }, 10);
			expect((await instance.get()).values[0].value).toEqual(10);
			expect((await instance.get()).values[0].labels.serial).toEqual('12345');
			expect((await instance.get()).values[0].labels.active).toEqual('no');
		});
	});
});

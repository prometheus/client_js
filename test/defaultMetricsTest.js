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
])('collectDefaultMetrics with %s registry', (tag, regType) => {
	const register = require('../index').register;
	const collectDefaultMetrics = require('../index').collectDefaultMetrics;
	let cpuUsage;

	beforeAll(() => {
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

	afterAll(() => {
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
		expect(await register.getMetricsAsJSON()).toHaveLength(0);
		collectDefaultMetrics();
		expect(await register.getMetricsAsJSON()).not.toHaveLength(0);
	});

	it('should allow blacklisting all metrics', async () => {
		expect(await register.getMetricsAsJSON()).toHaveLength(0);
		clearInterval(collectDefaultMetrics());
		register.clear();
		expect(await register.getMetricsAsJSON()).toHaveLength(0);
	});

	it('should prefix metric names when configured', async () => {
		collectDefaultMetrics({ prefix: 'some_prefix_' });
		expect(await register.getMetricsAsJSON()).not.toHaveLength(0);
		for (const metric of await register.getMetricsAsJSON()) {
			expect(metric.name.substring(0, 12)).toEqual('some_prefix_');
		}
	});

	it('should apply labels to metrics when configured', async () => {
		expect(await register.getMetricsAsJSON()).toHaveLength(0);

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
		expect(allMetricValues.length).toBeGreaterThan(0);

		allMetricValues.forEach(metricValue => {
			expect(metricValue.labels).toMatchObject(labels);
		});
	});

	describe('disabling', () => {
		it('should not throw error', () => {
			const fn = function () {
				register.clear();
			};

			expect(fn).not.toThrow(Error);
		});
	});

	describe('custom registry', () => {
		it('should allow to register metrics to custom registry', async () => {
			const registry = new Registry(regType);

			expect(await register.getMetricsAsJSON()).toHaveLength(0);
			expect(await registry.getMetricsAsJSON()).toHaveLength(0);

			collectDefaultMetrics();

			expect(await register.getMetricsAsJSON()).not.toHaveLength(0);
			expect(await registry.getMetricsAsJSON()).toHaveLength(0);

			collectDefaultMetrics({ register: registry });

			expect(await register.getMetricsAsJSON()).not.toHaveLength(0);
			expect(await registry.getMetricsAsJSON()).not.toHaveLength(0);
		});
	});
});

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

const Registry = require('../../index').Registry;

describe.each([
	['Prometheus', Registry.PROMETHEUS_CONTENT_TYPE],
	['OpenMetrics', Registry.OPENMETRICS_CONTENT_TYPE],
])('heapSizeAndUsed with %s registry', (tag, regType) => {
	const heapSizeAndUsed = require('../../lib/metrics/heapSizeAndUsed');
	const globalRegistry = require('../../lib/registry').globalRegistry;
	const memoryUsedFn = process.memoryUsage;

	beforeEach(() => {
		globalRegistry.setContentType(regType);
	});

	afterEach(() => {
		process.memoryUsage = memoryUsedFn;
		globalRegistry.clear();
	});

	it('should set gauge values from memoryUsage', async () => {
		process.memoryUsage = function () {
			return { heapTotal: 1000, heapUsed: 500, external: 100 };
		};

		heapSizeAndUsed();
		// Note: these three gauges' values are set by the _total gauge's
		// "collect" function.

		const totalGauge = globalRegistry.getSingleMetric(
			'nodejs_heap_size_total_bytes',
		);
		expect((await totalGauge.get()).values[0].value).toEqual(1000);

		const usedGauge = globalRegistry.getSingleMetric(
			'nodejs_heap_size_used_bytes',
		);
		expect((await usedGauge.get()).values[0].value).toEqual(500);

		const externalGauge = globalRegistry.getSingleMetric(
			'nodejs_external_memory_bytes',
		);
		expect((await externalGauge.get()).values[0].value).toEqual(100);
	});
});

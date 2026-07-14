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
])('gc with %s registry', (tag, regType) => {
	const register = require('../../index').register;
	const processHandles = require('../../lib/metrics/gc');

	beforeAll(() => {
		register.clear();
	});

	beforeEach(() => {
		register.setContentType(regType);
	});

	afterEach(() => {
		register.clear();
	});

	it(`should add metric to the ${tag} registry`, async () => {
		expect(await register.getMetricsAsJSON()).toHaveLength(0);

		processHandles();

		const metrics = await register.getMetricsAsJSON();

		// Check if perf_hooks module is available
		let perf_hooks;
		try {
			perf_hooks = require('perf_hooks');
		} catch {
			// node version is too old
		}

		if (perf_hooks) {
			expect(metrics).toHaveLength(1);

			expect(metrics[0].help).toEqual(
				'Garbage collection duration by kind, one of major, minor, incremental or weakcb.',
			);
			expect(metrics[0].type).toEqual('histogram');
			expect(metrics[0].name).toEqual('nodejs_gc_duration_seconds');
		} else {
			expect(metrics).toHaveLength(0);
		}
	});
});

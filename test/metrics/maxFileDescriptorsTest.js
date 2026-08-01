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

const exec = require('child_process').execSync;
const Registry = require('../../index').Registry;

describe.each([
	['Prometheus', Registry.PROMETHEUS_CONTENT_TYPE],
	['OpenMetrics', Registry.OPENMETRICS_CONTENT_TYPE],
])('processMaxFileDescriptors with %s registry', (tag, regType) => {
	const register = require('../../index').register;
	const processMaxFileDescriptors = require('../../lib/metrics/processMaxFileDescriptors');

	beforeAll(() => {
		register.clear();
	});

	beforeEach(() => {
		register.setContentType(regType);
	});

	afterEach(() => {
		register.clear();
	});

	if (process.platform !== 'linux') {
		it(`should not add metric to the ${tag} registry`, async () => {
			expect(await register.getMetricsAsJSON()).toHaveLength(0);

			processMaxFileDescriptors();

			expect(await register.getMetricsAsJSON()).toHaveLength(0);
		});
	} else {
		it(`should add metric to the ${tag} registry`, async () => {
			expect(await register.getMetricsAsJSON()).toHaveLength(0);

			processMaxFileDescriptors();

			const metrics = await register.getMetricsAsJSON();

			expect(metrics).toHaveLength(1);
			expect(metrics[0].help).toEqual(
				'Maximum number of open file descriptors.',
			);
			expect(metrics[0].type).toEqual('gauge');
			expect(metrics[0].name).toEqual('process_max_fds');
			expect(metrics[0].values).toHaveLength(1);
		});

		it(`should have a reasonable metric value with ${tag} registry`, async () => {
			const maxFiles = Number(exec('ulimit -Hn', { encoding: 'utf8' }));

			expect(await register.getMetricsAsJSON()).toHaveLength(0);
			processMaxFileDescriptors(register, {});

			const metrics = await register.getMetricsAsJSON();

			expect(metrics).toHaveLength(1);
			expect(metrics[0].values).toHaveLength(1);

			expect(metrics[0].values[0].value).toBeLessThanOrEqual(maxFiles);
			expect(metrics[0].values[0].value).toBeGreaterThan(0);
		});
	}
});

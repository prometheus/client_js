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

jest.mock(
	'process',
	() => Object.assign({}, jest.requireActual('process'), { platform: 'linux' }), // This metric only works on Linux
);

describe.each([
	['Prometheus', Registry.PROMETHEUS_CONTENT_TYPE],
	['OpenMetrics', Registry.OPENMETRICS_CONTENT_TYPE],
])('processOpenFileDescriptors with %s registry', (tag, regType) => {
	const register = require('../../index').register;
	const processOpenFileDescriptors = require('../../lib/metrics/processOpenFileDescriptors');

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

		processOpenFileDescriptors();

		const metrics = await register.getMetricsAsJSON();

		expect(metrics).toHaveLength(1);
		expect(metrics[0].help).toEqual('Number of open file descriptors.');
		expect(metrics[0].type).toEqual('gauge');
		expect(metrics[0].name).toEqual('process_open_fds');
	});
});

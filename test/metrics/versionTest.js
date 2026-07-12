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
const nodeVersion = process.version;
const versionSegments = nodeVersion.slice(1).split('.').map(Number);

function expectVersionMetrics(metrics) {
	expect(metrics).toHaveLength(1);

	expect(metrics[0].help).toEqual('Node.js version info.');
	expect(metrics[0].type).toEqual('gauge');
	expect(metrics[0].name).toEqual('nodejs_version_info');
	expect(metrics[0].values[0].labels.version).toEqual(nodeVersion);
	expect(metrics[0].values[0].labels.major).toEqual(versionSegments[0]);
	expect(metrics[0].values[0].labels.minor).toEqual(versionSegments[1]);
	expect(metrics[0].values[0].labels.patch).toEqual(versionSegments[2]);
}

describe.each([
	['Prometheus', Registry.PROMETHEUS_CONTENT_TYPE],
	['OpenMetrics', Registry.OPENMETRICS_CONTENT_TYPE],
])('version with %s registry', (tag, regType) => {
	const register = require('../../index').register;
	const version = require('../../lib/metrics/version');

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
		expect(typeof versionSegments[0]).toEqual('number');
		expect(typeof versionSegments[1]).toEqual('number');
		expect(typeof versionSegments[2]).toEqual('number');

		version();

		const metrics = await register.getMetricsAsJSON();
		expectVersionMetrics(metrics);
	});

	it(`should still be present after resetting the ${tag} registry #238`, async () => {
		const collector = version();
		expectVersionMetrics(await register.getMetricsAsJSON());
		register.resetMetrics();
		expectVersionMetrics(await register.getMetricsAsJSON());
	});
});

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

jest.mock('v8', () => {
	return {
		getHeapSpaceStatistics() {
			return [
				{
					space_name: 'new_space',
					space_size: 100,
					space_used_size: 50,
					space_available_size: 500,
					physical_space_size: 100,
				},
				{
					space_name: 'old_space',
					space_size: 100,
					space_used_size: 50,
					space_available_size: 500,
					physical_space_size: 100,
				},
				{
					space_name: 'code_space',
					space_size: 100,
					space_used_size: 50,
					space_available_size: 500,
					physical_space_size: 100,
				},
				{
					space_name: 'map_space',
					space_size: 100,
					space_used_size: 50,
					space_available_size: 500,
					physical_space_size: 100,
				},
				{
					space_name: 'large_object_space',
					space_size: 100,
					space_used_size: 50,
					space_available_size: 500,
					physical_space_size: 100,
				},
			];
		},
	};
});

describe.each([
	['Prometheus', Registry.PROMETHEUS_CONTENT_TYPE],
	['OpenMetrics', Registry.OPENMETRICS_CONTENT_TYPE],
])('heapSpacesSizeAndUsed with %s registry', (tag, regType) => {
	let heapSpacesSizeAndUsed;
	const globalRegistry = require('../../lib/registry').globalRegistry;

	beforeEach(() => {
		heapSpacesSizeAndUsed = require('../../lib/metrics/heapSpacesSizeAndUsed');
		globalRegistry.setContentType(regType);
	});

	afterEach(() => {
		globalRegistry.clear();
	});

	it(`should set total heap spaces size gauges with values from v8 with ${tag} registry`, async () => {
		expect(await globalRegistry.getMetricsAsJSON()).toHaveLength(0);

		heapSpacesSizeAndUsed();

		const metrics = await globalRegistry.getMetricsAsJSON();

		expect(metrics[0].name).toEqual('nodejs_heap_space_size_total_bytes');
		expect(metrics[0].values).toEqual([
			{ labels: { space: 'new' }, value: 100 },
			{ labels: { space: 'old' }, value: 100 },
			{ labels: { space: 'code' }, value: 100 },
			{ labels: { space: 'map' }, value: 100 },
			{ labels: { space: 'large_object' }, value: 100 },
		]);

		expect(metrics[1].name).toEqual('nodejs_heap_space_size_used_bytes');
		expect(metrics[1].values).toEqual([
			{ labels: { space: 'new' }, value: 50 },
			{ labels: { space: 'old' }, value: 50 },
			{ labels: { space: 'code' }, value: 50 },
			{ labels: { space: 'map' }, value: 50 },
			{ labels: { space: 'large_object' }, value: 50 },
		]);

		expect(metrics[2].name).toEqual('nodejs_heap_space_size_available_bytes');
		expect(metrics[2].values).toEqual([
			{ labels: { space: 'new' }, value: 500 },
			{ labels: { space: 'old' }, value: 500 },
			{ labels: { space: 'code' }, value: 500 },
			{ labels: { space: 'map' }, value: 500 },
			{ labels: { space: 'large_object' }, value: 500 },
		]);
	});
});

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

describe('Browser compatibility', () => {
	const globalRegistry = require('../index').register;
	let originalProcess;

	beforeEach(() => {
		originalProcess = global.process;
	});

	afterEach(() => {
		global.process = originalProcess;
		globalRegistry.clear();
	});

	it('should be able to import Counter, Gauge, and Histogram without process global', () => {
		// Simulate browser environment by removing process global
		delete global.process;

		expect(() => {
			const { Counter, Gauge, Histogram } = require('../index');

			// Verify that the classes are available
			expect(Counter).toBeDefined();
			expect(Gauge).toBeDefined();
			expect(Histogram).toBeDefined();

			// Verify that we can create instances
			const counter = new Counter({
				name: 'test_counter',
				help: 'Test counter',
			});

			const gauge = new Gauge({
				name: 'test_gauge',
				help: 'Test gauge',
			});

			const histogram = new Histogram({
				name: 'test_histogram',
				help: 'Test histogram',
			});

			expect(counter).toBeInstanceOf(Counter);
			expect(gauge).toBeInstanceOf(Gauge);
			expect(histogram).toBeInstanceOf(Histogram);
		}).not.toThrow();
	});
});

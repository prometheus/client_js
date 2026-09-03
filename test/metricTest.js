// Copyright The Prometheus Authors
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

'use strict';

const { Metric } = require('../lib/metric');

class TestMetric extends Metric {
	reset() {
		this.resetCalls = (this.resetCalls ?? 0) + 1;
	}
}

describe('Metric', () => {
	it('requires a configuration object', () => {
		expect(() => new TestMetric(null)).toThrow(
			new TypeError('constructor expected a config object'),
		);
	});

	it('requires help text', () => {
		expect(
			() => new TestMetric({ name: 'test_metric', registers: [] }),
		).toThrow(new Error('Missing mandatory help parameter'));
	});

	it('requires a name', () => {
		expect(
			() => new TestMetric({ help: 'Test metric', registers: [] }),
		).toThrow(new Error('Missing mandatory name parameter'));
	});

	it('rejects a non-function collect option', () => {
		expect(
			() =>
				new TestMetric({
					name: 'test_metric',
					help: 'Test metric',
					collect: true,
					registers: [],
				}),
		).toThrow(new Error('Optional "collect" parameter must be a function'));
	});

	it('applies defaults, sorts labels on construction', () => {
		const collect = jest.fn();
		const metric = new TestMetric({
			name: 'test_metric',
			help: 'Test metric',
			labelNames: ['status', 'method'],
			collect,
			registers: [],
		});

		expect(metric).toMatchObject({
			aggregator: 'sum',
			collect,
			enableExemplars: false,
			labelNames: ['status', 'method'],
			sortedLabelNames: ['method', 'status'],
		});
	});
});

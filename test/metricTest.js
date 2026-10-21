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
const { Counter, Gauge, Histogram, Summary, Registry } = require('../index');

class TestMetric extends Metric {
	reset() {
		this.resetCalls = (this.resetCalls ?? 0) + 1;
	}
}

describe('Metric', () => {
	it.each([Counter, Gauge, Histogram, Summary])(
		'ignores unknown configuration fields for %p',
		MetricType => {
			const config = JSON.parse('{"__proto__":{"polluted":true}}');
			Object.assign(config, {
				name: 'test_metric',
				help: 'Test metric',
				registers: [],
				reset: 'not a function',
				get: 'not a function',
				labels: 'not a function',
				constructor: 'not a constructor',
				unexpected: 'value',
			});
			Object.defineProperty(config, 'unusedGetter', {
				enumerable: true,
				get() {
					throw new Error('Unknown options must not be evaluated');
				},
			});

			const metric = new MetricType(config);
			expect(Object.getPrototypeOf(metric)).toBe(MetricType.prototype);
			expect(metric.constructor).toBe(MetricType);
			expect(metric.polluted).toBeUndefined();
			expect(metric.unexpected).toBeUndefined();
			expect(typeof metric.get).toBe('function');
			expect(typeof metric.labels).toBe('function');
			expect(() => metric.reset()).not.toThrow();
		},
	);

	it.each([Counter, Gauge, Histogram, Summary])(
		'preserves common configuration and collection for %p',
		async MetricType => {
			const registry = new Registry();
			const collect = jest.fn();
			const metric = new MetricType({
				name: 'test_metric',
				help: 'Test metric',
				labelNames: ['method'],
				registers: [registry],
				aggregator: 'max',
				collect,
			});
			expect(registry.getSingleMetric('test_metric')).toBe(metric);
			expect(metric.labelNames).toEqual(['method']);
			expect(metric.aggregator).toBe('max');
			await metric.get();
			expect(collect).toHaveBeenCalledTimes(1);
			expect(collect.mock.instances[0]).toBe(metric);
		},
	);

	it('preserves histogram bucket configuration', async () => {
		const histogram = new Histogram({
			name: 'test_histogram',
			help: 'Test histogram',
			registers: [],
			buckets: [1, 5],
		});
		histogram.observe(2);
		const { values } = await histogram.get();
		expect(values.find(sample => sample.labels.le === 1).value).toBe(0);
		expect(values.find(sample => sample.labels.le === 5).value).toBe(1);
	});

	it('preserves summary-specific configuration', async () => {
		const summary = new Summary({
			name: 'test_summary',
			help: 'Test summary',
			registers: [],
			percentiles: [0.5],
			compressCount: 2,
			maxAgeSeconds: 60,
			ageBuckets: 5,
			pruneAgedBuckets: true,
		});
		expect(summary).toMatchObject({
			percentiles: [0.5],
			compressCount: 2,
			maxAgeSeconds: 60,
			ageBuckets: 5,
			pruneAgedBuckets: true,
		});
		summary.observe(2);
		summary.observe(4);
		const { values } = await summary.get();
		expect(values.find(sample => sample.labels.quantile === 0.5).value).toBe(3);
	});

	it('only accepts subclass options on the metric that declares them', () => {
		const counter = new Counter({
			name: 'test_counter',
			help: 'Test counter',
			registers: [],
			buckets: [1],
			percentiles: [0.5],
			maxAgeSeconds: 60,
		});
		expect(counter.buckets).toBeUndefined();
		expect(counter.percentiles).toBeUndefined();
		expect(counter.maxAgeSeconds).toBeUndefined();
	});

	it('preserves the precedence of subclass defaults and explicit options', () => {
		const metric = new TestMetric(
			{
				name: 'test_metric',
				help: 'Configured help',
				registers: [],
				aggregator: undefined,
			},
			{ help: 'Default help', aggregator: 'max' },
		);
		expect(metric.help).toBe('Configured help');
		expect(metric.aggregator).toBeUndefined();
	});

	it('does not read inherited or non-enumerable configuration options', () => {
		const config = Object.create({ aggregator: 'max' });
		Object.assign(config, {
			name: 'test_metric',
			help: 'Test metric',
			registers: [],
		});
		Object.defineProperty(config, 'collect', {
			get() {
				throw new Error('Non-enumerable options must not be evaluated');
			},
		});
		const metric = new TestMetric(config);
		expect(metric.aggregator).toBe('sum');
		expect(metric.collect).toBeUndefined();
	});

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

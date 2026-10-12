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

const client = require('../index');
const { Registry, Counter, Gauge, Histogram, Summary, Pushgateway } = client;
const { decodeMetricFamilies } = require('./helpers/protobuf');
const nock = require('nock');

const contentType = Registry.PROMETHEUS_PROTOBUF_CONTENT_TYPE;

afterEach(() => {
	jest.useRealTimers();
	nock.cleanAll();
});

describe('Prometheus protobuf exposition', () => {
	test('exposes the content type and returns an empty Buffer for an empty registry', async () => {
		const register = new Registry(contentType);
		expect(register.contentType).toBe(client.prometheusProtobufContentType);
		expect(contentType).toBe(
			'application/vnd.google.protobuf; proto=io.prometheus.client.MetricFamily; encoding=delimited',
		);
		expect(await register.metrics()).toEqual(Buffer.alloc(0));
	});

	test('encodes counters, gauges, classic histograms and summaries', async () => {
		const register = new Registry(contentType);
		new Counter({
			name: 'requests_total',
			help: 'Requests',
			registers: [register],
		}).inc(4.5);
		new Gauge({
			name: 'temperature',
			help: 'Temperature',
			registers: [register],
		}).set(-7.5);
		new Histogram({
			name: 'classic',
			help: 'Classic histogram',
			buckets: [1, 2],
			registers: [register],
		}).observe(1.5);
		const summary = new Summary({
			name: 'summary',
			help: 'Summary',
			percentiles: [0.5],
			registers: [register],
		});
		summary.observe(1);
		summary.observe(3);
		const families = decodeMetricFamilies(await register.metrics());
		expect(families).toHaveLength(4);
		expect(families[0]).toEqual({
			name: 'requests_total',
			help: 'Requests',
			type: 'COUNTER',
			metric: [{ counter: { value: 4.5 } }],
		});
		expect(families[1].metric).toEqual([{ gauge: { value: -7.5 } }]);
		expect(families[2].metric).toEqual([
			{
				histogram: {
					sampleCount: 1,
					sampleSum: 1.5,
					bucket: [
						{ upperBound: 1, cumulativeCount: 0 },
						{ upperBound: 2, cumulativeCount: 1 },
						{ upperBound: Infinity, cumulativeCount: 1 },
					],
				},
			},
		]);
		expect(families[3].metric).toEqual([
			{
				summary: {
					sampleCount: 2,
					sampleSum: 4,
					quantile: [{ quantile: 0.5, value: 2 }],
				},
			},
		]);
	});

	test('preserves labels and keeps AsString methods text-only', async () => {
		const register = new Registry(contentType);
		register.setDefaultLabels({ service: 'frontend', route: 'default' });
		const histogram = new Histogram({
			name: 'duration',
			help: 'Unicode: café "help"\nwith newline',
			labelNames: ['route'],
			buckets: [1],
			registers: [register],
		});
		const route = '/api/π\n"quoted"\\path';
		histogram.observe({ route }, 0.5);
		const [family] = decodeMetricFamilies(await register.metrics());
		expect(family.help).toBe(histogram.help);
		expect(family.metric[0].label).toEqual([
			{ name: 'route', value: route },
			{ name: 'service', value: 'frontend' },
		]);
		const text = await register.getMetricsAsString(histogram);
		expect(typeof text).toBe('string');
		expect(text).toContain('duration_count');
		expect(await register.getSingleMetricAsString(histogram.name)).toBe(text);
	});

	test.each([
		[[0.5], [1.5], 1, [0.5, 1, 1]],
		[[0.5], [0.5, 1.5], 1.5, [1, 1.5, 1.5]],
	])(
		'preserves fractional classic histogram counts after averaging %p and %p',
		async (firstValues, secondValues, expectedCount, expectedBuckets) => {
			const snapshots = await Promise.all(
				[firstValues, secondValues].map(async values => {
					const histogram = new Histogram({
						name: 'averaged',
						help: 'Averaged histogram',
						buckets: [1, 2],
						aggregator: 'average',
						registers: [],
					});
					values.forEach(value => histogram.observe(value));
					return [await histogram.get()];
				}),
			);
			const register = Registry.aggregate(snapshots, contentType);
			const data = decodeMetricFamilies(await register.metrics())[0].metric[0]
				.histogram;
			expect(data.sampleCountFloat ?? data.sampleCount).toBe(expectedCount);
			expect(
				data.bucket.map(
					bucket => bucket.cumulativeCountFloat ?? bucket.cumulativeCount,
				),
			).toEqual(expectedBuckets);
		},
	);

	test('rejects fractional summary counts that protobuf cannot represent', async () => {
		const snapshots = await Promise.all(
			[[1], [1, 2]].map(async values => {
				const summary = new Summary({
					name: 'averaged_summary',
					help: 'Summary',
					aggregator: 'average',
					registers: [],
				});
				values.forEach(value => summary.observe(value));
				return [await summary.get()];
			}),
		);
		await expect(
			Registry.aggregate(snapshots, contentType).metrics(),
		).rejects.toThrow('Prometheus protobuf requires an integer sample count');
	});

	test.each([undefined, null])(
		'uses defaults for nullish labels: %p',
		async value => {
			const register = new Registry(contentType);
			register.setDefaultLabels({ service: 'frontend' });
			const histogram = new Histogram({
				name: 'defaults',
				help: 'Defaults',
				labelNames: ['service'],
				registers: [register],
			});
			histogram.observe({ service: value }, 1);
			const [family] = decodeMetricFamilies(await register.metrics());
			expect(family.metric).toHaveLength(1);
			expect(family.metric[0].label).toEqual([
				{ name: 'service', value: 'frontend' },
			]);
		},
	);

	test('awaits the collector exactly once per protobuf scrape', async () => {
		const register = new Registry(contentType);
		const collect = jest.fn(async function () {
			await Promise.resolve();
			this.observe(2);
		});
		new Histogram({
			name: 'collected',
			help: 'Collected',
			registers: [register],
			collect,
		});
		const [family] = decodeMetricFamilies(await register.metrics());
		expect(collect).toHaveBeenCalledTimes(1);
		expect(family.metric[0].histogram.sampleCount).toBe(1);
	});

	test('keeps each pending scrape in its original format', async () => {
		const register = new Registry();
		let finishCollecting;
		const collected = new Promise(resolve => {
			finishCollecting = resolve;
		});
		new Counter({
			name: 'async_requests_total',
			help: 'Requests',
			registers: [register],
			async collect() {
				await collected;
			},
		}).inc(1);
		const text = register.metrics();
		register.setContentType(contentType);
		const binary = register.metrics();
		finishCollecting();
		expect(await text).toContain('async_requests_total 1');
		expect(decodeMetricFamilies(await binary)[0].metric[0].counter.value).toBe(
			1,
		);
	});

	test('merges protobuf registries', async () => {
		const one = new Registry(contentType);
		const two = new Registry(contentType);
		new Counter({ name: 'requests', help: 'Requests', registers: [one] }).inc();
		new Gauge({
			name: 'temperature',
			help: 'Temperature',
			registers: [two],
		}).set(5);
		expect(
			decodeMetricFamilies(await Registry.merge([one, two]).metrics()).map(
				metric => metric.name,
			),
		).toEqual(['requests', 'temperature']);
		expect(() => Registry.merge([one, new Registry()])).toThrow(
			'same content type',
		);
	});

	test('encodes exemplars for counters and classic histogram buckets', async () => {
		jest.useFakeTimers();
		jest.setSystemTime(1234);
		const register = new Registry(contentType);
		new Counter({
			name: 'requests_total',
			help: 'Requests',
			enableExemplars: true,
			registers: [register],
		}).inc({ value: 2, exemplarLabels: { trace_id: 'counter' } });
		new Histogram({
			name: 'duration',
			help: 'Duration',
			enableExemplars: true,
			buckets: [1],
			registers: [register],
		}).observe({ value: 0.5, exemplarLabels: { trace_id: 'histogram' } });
		const [counter, histogram] = decodeMetricFamilies(await register.metrics());
		const timestamp = { seconds: 1, nanos: 234000000 };
		expect(counter.metric[0].counter.exemplar).toEqual({
			label: [{ name: 'trace_id', value: 'counter' }],
			value: 2,
			timestamp,
		});
		expect(histogram.metric[0].histogram.bucket[0].exemplar).toEqual({
			label: [{ name: 'trace_id', value: 'histogram' }],
			value: 0.5,
			timestamp,
		});
	});

	test('sends protobuf to Pushgateway with the matching content type', async () => {
		const register = new Registry(contentType);
		new Gauge({
			name: 'temperature',
			help: 'Temperature',
			registers: [register],
		}).set(1);
		const body = await register.metrics();
		const gateway = nock('http://localhost:9091')
			.matchHeader('Content-Type', contentType)
			.put('/metrics/job/protobuf', body)
			.reply(202);
		await new Pushgateway('http://localhost:9091', register).push({
			jobName: 'protobuf',
		});
		expect(gateway.isDone()).toBe(true);
	});
});

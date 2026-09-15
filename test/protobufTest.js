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

const client = require('../index');
const { Registry, Counter, Gauge, Histogram, Summary, Pushgateway } = client;
const { decodeMetricFamilies } = require('./helpers/nativeHistogram');
const nock = require('nock');

const contentType = Registry.PROMETHEUS_PROTOBUF_CONTENT_TYPE;

function createHistogram(register, config = {}) {
	return new Histogram({
		name: 'native_duration_seconds',
		help: 'Duration of a request',
		registers: [register],
		nativeHistogramBucketFactor: 1.1,
		...config,
	});
}

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
		const body = await register.metrics();
		expect(Buffer.isBuffer(body)).toBe(true);
		expect(body.length).toBe(0);
		expect(new Registry().setContentType(contentType).contentType).toBe(
			contentType,
		);
	});

	test('encodes every existing metric type as length-delimited MetricFamily messages', async () => {
		const register = new Registry(contentType);
		const counter = new Counter({
			name: 'requests_total',
			help: 'Requests',
			registers: [register],
		});
		const gauge = new Gauge({
			name: 'temperature',
			help: 'Temperature',
			registers: [register],
		});
		const histogram = new Histogram({
			name: 'classic',
			help: 'Classic histogram',
			buckets: [1, 2],
			registers: [register],
		});
		const summary = new Summary({
			name: 'summary',
			help: 'Summary',
			percentiles: [0.5],
			registers: [register],
		});
		counter.inc(4.5);
		gauge.set(-7.5);
		histogram.observe(1.5);
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
		expect(families[2]).toMatchObject({
			type: 'HISTOGRAM',
			metric: [
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
			],
		});
		expect(families[3]).toMatchObject({
			type: 'SUMMARY',
			metric: [
				{
					summary: {
						sampleCount: 2,
						sampleSum: 4,
						quantile: [{ quantile: 0.5, value: 2 }],
					},
				},
			],
		});
	});

	test('encodes native and classic buckets together, with labels and a creation timestamp', async () => {
		jest.useFakeTimers();
		jest.setSystemTime(1234);
		const register = new Registry(contentType);
		register.setDefaultLabels({ service: 'frontend', route: 'default' });
		const histogram = createHistogram(register, {
			buckets: [1, 5],
			labelNames: ['route'],
			help: 'Unicode: café "help"\nwith newline',
		});
		const labels = { route: '/api/π\n"quoted"\\path' };
		[1, -2, 0].forEach(value => histogram.observe(labels, value));

		const [family] = decodeMetricFamilies(await register.metrics());
		expect(family.name).toBe('native_duration_seconds');
		expect(family.help).toBe('Unicode: café "help"\nwith newline');
		expect(family.metric).toEqual([
			{
				label: [
					{ name: 'route', value: labels.route },
					{ name: 'service', value: 'frontend' },
				],
				histogram: {
					sampleCount: 3,
					sampleSum: -1,
					bucket: [
						{ upperBound: 1, cumulativeCount: 3 },
						{ upperBound: 5, cumulativeCount: 3 },
						{ upperBound: Infinity, cumulativeCount: 3 },
					],
					schema: 3,
					zeroThreshold: 2 ** -128,
					zeroCount: 1,
					positiveSpan: [{ offset: 0, length: 1 }],
					positiveDelta: [1],
					negativeSpan: [{ offset: 8, length: 1 }],
					negativeDelta: [1],
					createdTimestamp: { seconds: 1, nanos: 234000000 },
				},
			},
		]);

		const text = await register.getMetricsAsString(histogram);
		expect(typeof text).toBe('string');
		const textRegistry = new Registry();
		textRegistry.setDefaultLabels({ service: 'frontend', route: 'default' });
		expect(text).toEqual(await textRegistry.getMetricsAsString(histogram));
		expect(text).toContain(`${histogram.name}_count`);
		expect(await register.getSingleMetricAsString(histogram.name)).toBe(text);
		expect(await register.metrics()).toBeInstanceOf(Buffer);
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
						name: 'averaged_classic',
						help: 'Averaged classic histogram',
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
					help: 'Averaged summary',
					aggregator: 'average',
					registers: [],
				});
				values.forEach(value => summary.observe(value));
				return [await summary.get()];
			}),
		);
		const register = Registry.aggregate(snapshots, contentType);
		await expect(register.metrics()).rejects.toThrow(
			'Prometheus protobuf requires an integer sample count for summary averaged_summary',
		);
	});

	test('can expose native buckets without classic buckets', async () => {
		const register = new Registry(contentType);
		const histogram = createHistogram(register, { buckets: [] });
		histogram.observe(2);
		const data = decodeMetricFamilies(await register.metrics())[0].metric[0]
			.histogram;
		expect(data).not.toHaveProperty('bucket');
		expect(data).toMatchObject({
			sampleCount: 1,
			sampleSum: 2,
			positiveDelta: [1],
			schema: 3,
		});
	});

	test('preserves zero-valued fields and the empty no-op span on the wire', async () => {
		jest.useFakeTimers();
		jest.setSystemTime(0);
		const register = new Registry(contentType);
		createHistogram(register, {
			buckets: [],
			nativeHistogramBucketFactor: 2,
			nativeHistogramZeroThreshold: 0,
		});
		expect(
			decodeMetricFamilies(await register.metrics())[0].metric[0].histogram,
		).toEqual({
			sampleCount: 0,
			sampleSum: 0,
			schema: 0,
			zeroThreshold: 0,
			zeroCount: 0,
			positiveSpan: [{ offset: 0, length: 0 }],
			// Timestamp is proto3: an empty message represents the Unix epoch.
			createdTimestamp: {},
		});
	});

	test('encodes negative schemas, large counts, offsets, and negative deltas', async () => {
		const register = new Registry(contentType);
		const histogram = createHistogram(register, {
			buckets: [],
			nativeHistogramBucketFactor: 4,
			nativeHistogramZeroThreshold: 0,
		});
		for (let i = 0; i < 300; i++) histogram.observe(0.25);
		histogram.observe(2 ** 200);
		histogram.observe(-(2 ** -1000));
		const data = decodeMetricFamilies(await register.metrics())[0].metric[0]
			.histogram;
		expect(data).toMatchObject({
			sampleCount: 302,
			schema: -1,
			positiveSpan: [
				{ offset: -1, length: 1 },
				{ offset: 100, length: 1 },
			],
			positiveDelta: [300, -299],
			negativeSpan: [{ offset: -500, length: 1 }],
			negativeDelta: [1],
		});
	});

	test('encodes uint64 counts and sint64 deltas beyond 32 bits without truncating them', async () => {
		const register = new Registry(contentType);
		const histogram = createHistogram(new Registry(contentType), {
			buckets: [],
		});
		histogram.observe(1);
		const data = await histogram.get();
		const count = 2 ** 40;
		data.nativeHistograms[0].count = count;
		data.nativeHistograms[0].sum = count;
		data.nativeHistograms[0].positiveDeltas[0] = count;
		data.values.forEach(value => {
			value.value = count;
		});
		register.registerMetric({ name: data.name, get: () => data });
		const decoded = decodeMetricFamilies(await register.metrics())[0].metric[0]
			.histogram;
		expect(decoded.sampleCount).toBe(count);
		expect(decoded.positiveDelta).toEqual([count]);
	});

	test('uses default labels consistently in JSON and protobuf without changing the metric', async () => {
		const register = new Registry(contentType);
		register.setDefaultLabels({ service: 'frontend', code: 'default' });
		const histogram = createHistogram(register, { labelNames: ['code'] });
		histogram.observe({ code: 200 }, 0.5);
		const [json] = await register.getMetricsAsJSON();
		expect(json.nativeHistograms[0].labels).toEqual({
			code: '200',
			service: 'frontend',
		});
		expect((await histogram.get()).nativeHistograms[0].labels).toEqual({
			code: '200',
		});
		json.nativeHistograms[0].labels.service = 'changed';
		expect(
			decodeMetricFamilies(await register.metrics())[0].metric,
		).toHaveLength(1);
		expect(
			(await register.getMetricsAsJSON())[0].nativeHistograms[0].labels.service,
		).toBe('frontend');
	});

	test.each(
		[
			[Counter, 'inc'],
			[Gauge, 'set'],
			[Summary, 'observe'],
			[Histogram, 'observe'],
		].flatMap(([Metric, method]) =>
			[undefined, null].map(value => [Metric, method, value]),
		),
	)(
		'uses default labels for %p.%s with a nullish label value %p',
		async (Metric, method, value) => {
			const register = new Registry();
			register.setDefaultLabels({ service: 'frontend', team: 'platform' });
			const metric = new Metric({
				name: 'default_labels',
				help: 'Default labels',
				labelNames: ['service'],
				registers: [register],
				nativeHistogramBucketFactor: 1.1,
			});
			metric[method]({ service: value }, 0.5);
			expect(await register.metrics()).toContain('service="frontend"');
			register.setContentType(contentType);
			const [family] = decodeMetricFamilies(await register.metrics());
			expect(family.metric).toHaveLength(1);
			expect(family.metric[0].label).toEqual([
				{ name: 'service', value: 'frontend' },
				{ name: 'team', value: 'platform' },
			]);
			const [json] = await register.getMetricsAsJSON();
			expect(
				json.values.every(sample => sample.labels.service === 'frontend'),
			).toBe(true);
		},
	);

	test('keeps distinct label sets from different workers when they contain separators', async () => {
		const register = new Registry(contentType);
		const other = new Registry(contentType);
		const histogram = createHistogram(register, { labelNames: ['a', 'b'] });
		const otherHistogram = createHistogram(other, { labelNames: ['a', 'b'] });
		histogram.observe({ a: 'a|b', b: 'c' }, 1);
		otherHistogram.observe({ a: 'a', b: 'b|c' }, 2);
		const aggregated = Registry.aggregate(
			[await register.getMetricsAsJSON(), await other.getMetricsAsJSON()],
			contentType,
		);
		expect(
			decodeMetricFamilies(await aggregated.metrics())[0].metric,
		).toHaveLength(2);
	});

	test.each([
		Registry.PROMETHEUS_CONTENT_TYPE,
		Registry.OPENMETRICS_CONTENT_TYPE,
	])('retains classic text output for %s registries', async type => {
		const register = new Registry(type);
		const histogram = createHistogram(register, { buckets: [1, 2] });
		histogram.observe(1.5);
		const text = await register.metrics();
		expect(typeof text).toBe('string');
		expect(text).toContain('native_duration_seconds_bucket{le="2"} 1');
		expect(text).toContain('native_duration_seconds_sum 1.5');
		expect(text).not.toContain('schema');
		expect(text).not.toContain('NaN');
	});

	test('awaits the collector exactly once per protobuf scrape', async () => {
		const register = new Registry(contentType);
		const collect = jest.fn(async function () {
			await Promise.resolve();
			this.observe(2);
		});
		createHistogram(register, { collect });
		const [family] = decodeMetricFamilies(await register.metrics());
		expect(collect).toHaveBeenCalledTimes(1);
		expect(family.metric[0].histogram.sampleCount).toBe(1);
	});

	test('keeps counter names intact when a metric is shared with an OpenMetrics registry', async () => {
		const register = new Registry(contentType);
		const openMetrics = new Registry(Registry.OPENMETRICS_CONTENT_TYPE);
		const counter = new Counter({
			name: 'shared_requests_total',
			help: 'Requests',
			registers: [register, openMetrics],
		});
		counter.inc();
		expect(await openMetrics.metrics()).toContain('shared_requests_total 1');
		expect(decodeMetricFamilies(await register.metrics())[0].name).toBe(
			'shared_requests_total',
		);
		expect(counter.name).toBe('shared_requests_total');
		expect(await openMetrics.metrics()).toContain('shared_requests_total 1');
	});

	test('keeps each pending scrape in the format selected when it started', async () => {
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

	test('merges protobuf registries and retains native data', async () => {
		const one = new Registry(contentType);
		const two = new Registry(contentType);
		createHistogram(one).observe(1);
		new Gauge({ name: 'gauge', help: 'gauge', registers: [two] }).set(5);
		const merged = Registry.merge([one, two]);
		expect(merged.contentType).toBe(contentType);
		expect(
			decodeMetricFamilies(await merged.metrics()).map(metric => metric.name),
		).toEqual(['native_duration_seconds', 'gauge']);
		expect(() => Registry.merge([one, new Registry()])).toThrow(
			'same content type',
		);
	});

	test('exports exemplars for counters, classic buckets, and native histograms', async () => {
		jest.useFakeTimers();
		jest.setSystemTime(1234);
		const register = new Registry(contentType);
		new Counter({
			name: 'requests_total',
			help: 'Requests',
			enableExemplars: true,
			registers: [register],
		}).inc({ value: 2, exemplarLabels: { trace_id: 'counter' } });
		createHistogram(register, { enableExemplars: true, buckets: [1] }).observe({
			value: 0.5,
			exemplarLabels: { trace_id: 'histogram' },
		});
		const [counter, histogram] = decodeMetricFamilies(await register.metrics());
		const timestamp = { seconds: 1, nanos: 234000000 };
		expect(counter.metric[0].counter.exemplar).toEqual({
			label: [{ name: 'trace_id', value: 'counter' }],
			value: 2,
			timestamp,
		});
		const exemplar = {
			label: [{ name: 'trace_id', value: 'histogram' }],
			value: 0.5,
			timestamp,
		};
		expect(histogram.metric[0].histogram.exemplars).toEqual([exemplar]);
		expect(histogram.metric[0].histogram.bucket[0].exemplar).toEqual(exemplar);
	});

	test('rejects inconsistent classic/native sample counts', async () => {
		const register = new Registry(contentType);
		const histogram = createHistogram(new Registry(contentType));
		histogram.observe(1);
		const data = await histogram.get();
		data.nativeHistograms[0].count++;
		register.registerMetric({ name: data.name, get: () => data });
		await expect(register.metrics()).rejects.toThrow(
			'Classic and native histogram counts or sums differ',
		);
	});

	test('sends protobuf to Pushgateway with the matching content type', async () => {
		const register = new Registry(contentType);
		createHistogram(register).observe(1);
		const body = await register.metrics();
		const gateway = nock('http://localhost:9091')
			.matchHeader('Content-Type', contentType)
			.put('/metrics/job/native', body)
			.reply(202);
		await new Pushgateway('http://localhost:9091', register).push({
			jobName: 'native',
		});
		expect(gateway.isDone()).toBe(true);
	});
});

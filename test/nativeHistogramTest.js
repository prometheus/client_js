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

const { Histogram, Registry } = require('../index');
const { bucketCounts, nextUp } = require('./helpers/nativeHistogram');

function create(config = {}) {
	return new Histogram({
		name: 'native_histogram',
		help: 'Native histogram test',
		registers: [],
		nativeHistogramBucketFactor: 2,
		...config,
	});
}

async function snapshot(histogram) {
	return (await histogram.get()).nativeHistograms[0];
}

afterEach(() => {
	jest.useRealTimers();
});

describe('native histogram configuration', () => {
	test.each([
		[65536, -4],
		[256, -3],
		[16, -2],
		[4, -1],
		[2, 0],
		[1.5, 1],
		[1.2, 2],
		[1.1, 3],
		[1.05, 4],
		[1.03, 5],
		[1.02, 6],
		[1.01, 7],
		[1.005, 8],
		[Number.MAX_VALUE, -4],
		[1 + Number.EPSILON, 8],
	])('factor %s selects schema %s', async (factor, schema) => {
		expect(
			await snapshot(create({ nativeHistogramBucketFactor: factor })),
		).toMatchObject({ schema, count: 0, sum: 0, zeroThreshold: 2 ** -128 });
	});

	test.each([undefined, 0, 0.5, 1])(
		'factor %s leaves native buckets disabled',
		async factor => {
			expect(
				(await create({ nativeHistogramBucketFactor: factor }).get())
					.nativeHistograms,
			).toBeUndefined();
		},
	);

	test.each([
		...[-1, NaN, Infinity, '1.1', null, true].map(value => [
			'nativeHistogramBucketFactor',
			value,
		]),
		...[-1, NaN, Infinity, '0', null, false].map(value => [
			'nativeHistogramZeroThreshold',
			value,
		]),
		...[-1, 1.5, Infinity, NaN, '160', null, Number.MAX_SAFE_INTEGER + 1].map(
			value => ['nativeHistogramMaxBucketNumber', value],
		),
	])('rejects invalid %s: %s before registration', (option, value) => {
		const register = new Registry();
		expect(() => create({ registers: [register], [option]: value })).toThrow(
			option,
		);
		expect(register.getMetricsAsArray()).toEqual([]);
	});

	test.each(['min', 'max', 'average'])('rejects %s aggregation', aggregator => {
		expect(() => create({ aggregator })).toThrow('sum, first, or omit');
	});
});

describe('native observations', () => {
	test('exports signed bucket spans, deltas, sum, and zero count', async () => {
		const histogram = create();
		[0, 0.5, 1, 1, 2, 8, -0.5, -2, -2].forEach(value =>
			histogram.observe(value),
		);
		const data = await snapshot(histogram);
		expect(data).toMatchObject({
			count: 9,
			sum: 8,
			zeroCount: 1,
			positiveSpans: [{ offset: -1, length: 5 }],
			positiveDeltas: [1, 1, -1, -1, 1],
			negativeSpans: [{ offset: -1, length: 3 }],
			negativeDeltas: [1, -1, 2],
		});
	});

	test('keeps delta counts across gaps between spans', async () => {
		const histogram = create();
		[1, 1, 1, 1024, 1024, 2 ** 20].forEach(value => histogram.observe(value));
		expect(await snapshot(histogram)).toMatchObject({
			positiveSpans: [
				{ offset: 0, length: 1 },
				{ offset: 9, length: 1 },
				{ offset: 9, length: 1 },
			],
			positiveDeltas: [3, -1, -1],
		});
	});

	test.each(Array.from({ length: 13 }, (_, i) => i - 4))(
		'uses inclusive boundaries at schema %s',
		async schema => {
			const histogram = create({
				nativeHistogramBucketFactor: 2 ** (2 ** -schema),
				nativeHistogramZeroThreshold: 0,
			});
			const boundary = schema < 0 ? 2 ** (2 ** -schema) : 1;
			const index = schema < 0 ? 1 : 0;
			histogram.observe(boundary);
			histogram.observe(nextUp(boundary));
			histogram.observe(-boundary);
			histogram.observe(-nextUp(boundary));
			const data = await snapshot(histogram);
			for (const side of ['positive', 'negative']) {
				expect(bucketCounts(data, side)).toEqual(
					new Map([
						[index, 1],
						[index + 1, 1],
					]),
				);
			}
		},
	);

	test.each([-1074, -1022, -256, -1, 0, 1, 128, 1023])(
		'does not round observations above 2^%s into the preceding bucket',
		async exponent => {
			const histogram = create({ nativeHistogramZeroThreshold: 0 });
			const boundary = 2 ** exponent;
			histogram.observe(boundary);
			histogram.observe(nextUp(boundary));
			expect(bucketCounts(await snapshot(histogram), 'positive')).toEqual(
				new Map([
					[exponent, 1],
					[exponent + 1, 1],
				]),
			);
		},
	);

	test('matches the Prometheus fractional boundary and its adjacent float', async () => {
		const histogram = create({ nativeHistogramBucketFactor: 1.5 });
		// The canonical Prometheus boundary differs by one ULP from Math.SQRT2.
		const boundary = 2 * 0.7071067811865475;
		histogram.observe(boundary);
		histogram.observe(nextUp(boundary));
		expect(bucketCounts(await snapshot(histogram), 'positive')).toEqual(
			new Map([
				[1, 1],
				[2, 1],
			]),
		);
	});

	test('covers the full finite double range on both sides of zero', async () => {
		const histogram = create({
			nativeHistogramBucketFactor: 1.1,
			nativeHistogramZeroThreshold: 0,
		});
		[
			Number.MIN_VALUE,
			-Number.MIN_VALUE,
			Number.MAX_VALUE,
			-Number.MAX_VALUE,
		].forEach(value => histogram.observe(value));
		const data = await snapshot(histogram);
		expect(data).toMatchObject({ count: 4, sum: 0, zeroCount: 0 });
		for (const side of ['positive', 'negative']) {
			expect(bucketCounts(data, side)).toEqual(
				new Map([
					[-8592, 1],
					[8192, 1],
				]),
			);
		}
	});

	test('includes both endpoints of the zero bucket', async () => {
		const histogram = create({ nativeHistogramZeroThreshold: 1 });
		[0, -0, 1, -1, nextUp(1), -nextUp(1)].forEach(value =>
			histogram.observe(value),
		);
		const data = await snapshot(histogram);
		expect(data.zeroCount).toBe(4);
		expect(bucketCounts(data, 'positive')).toEqual(new Map([[1, 1]]));
		expect(bucketCounts(data, 'negative')).toEqual(new Map([[1, 1]]));
	});

	test('defaults to a zero threshold of 2^-128 and allows exactly zero', async () => {
		const regular = create();
		const zeroOnly = create({ nativeHistogramZeroThreshold: 0 });
		[0, 2 ** -128, -(2 ** -128)].forEach(value => {
			regular.observe(value);
			zeroOnly.observe(value);
		});
		expect((await snapshot(regular)).zeroCount).toBe(3);
		expect((await snapshot(zeroOnly)).zeroCount).toBe(1);
	});

	test('marks an empty native histogram with zero threshold zero', async () => {
		expect(
			await snapshot(create({ nativeHistogramZeroThreshold: 0 })),
		).toMatchObject({
			positiveSpans: [{ offset: 0, length: 0 }],
			positiveDeltas: [],
			negativeSpans: [],
			count: 0,
		});
	});

	test.each([NaN, Infinity, -Infinity, '1', undefined, null])(
		'rejects invalid observation %s without changing the histogram',
		async value => {
			const histogram = create();
			const before = await histogram.get();
			expect(() => histogram.observe(value)).toThrow(
				'Value is not a valid number',
			);
			expect(await histogram.get()).toEqual(before);
		},
	);

	test('preserves classic histogram values when native buckets are enabled', async () => {
		const classic = create({ nativeHistogramBucketFactor: 0 });
		const native = create();
		[-3, 0, 0.1, 1, 100].forEach(value => {
			classic.observe(value);
			native.observe(value);
		});
		expect((await native.get()).values).toEqual((await classic.get()).values);
	});
});

describe('native bucket limits', () => {
	test.each([
		[
			[1, 2, 4],
			[
				[0, 1],
				[1, 2],
			],
		],
		[
			[0.125, 0.25, 0.5],
			[
				[-1, 2],
				[0, 1],
			],
		],
	])('coarsens %s while preserving all counts', async (values, counts) => {
		const histogram = create({ nativeHistogramMaxBucketNumber: 2 });
		values.forEach(value => histogram.observe(value));
		const data = await snapshot(histogram);
		expect(data.schema).toBe(-1);
		expect(data.count).toBe(3);
		expect(data.sum).toBe(values.reduce((sum, value) => sum + value, 0));
		expect(bucketCounts(data, 'positive')).toEqual(new Map(counts));
	});

	test('applies the limit to positive and negative buckets together', async () => {
		const histogram = create({ nativeHistogramMaxBucketNumber: 2 });
		[1, 2, -1].forEach(value => histogram.observe(value));
		const data = await snapshot(histogram);
		expect(data.schema).toBe(-4);
		expect(data.count).toBe(3);
		expect(bucketCounts(data, 'positive')).toEqual(
			new Map([
				[0, 1],
				[1, 1],
			]),
		);
		expect(bucketCounts(data, 'negative')).toEqual(new Map([[0, 1]]));
	});

	test('uses a default budget of 160 populated buckets', async () => {
		const histogram = create({ nativeHistogramBucketFactor: 1.1 });
		for (let i = 0; i < 400; i++) histogram.observe(2 ** i);
		const data = await snapshot(histogram);
		const positive = bucketCounts(data, 'positive');
		expect(positive.size).toBeLessThanOrEqual(160);
		expect([...positive.values()].reduce((sum, count) => sum + count, 0)).toBe(
			400,
		);
	});

	test('can disable the bucket limit', async () => {
		const histogram = create({
			nativeHistogramBucketFactor: 1.005,
			nativeHistogramMaxBucketNumber: 0,
		});
		for (let i = 0; i < 200; i++) histogram.observe(2 ** i);
		const data = await snapshot(histogram);
		expect(data.schema).toBe(8);
		expect(bucketCounts(data, 'positive').size).toBe(200);
	});

	test('limits and resets each label set independently', async () => {
		const histogram = create({
			labelNames: ['route'],
			nativeHistogramMaxBucketNumber: 2,
		});
		[1, 2, 4].forEach(value => histogram.labels('/a').observe(value));
		histogram.labels('/b').observe(1);
		expect(
			(await histogram.get()).nativeHistograms.map(data => data.schema),
		).toEqual([-1, 0]);
		histogram.zero({ route: '/a' });
		const reset = (await histogram.get()).nativeHistograms[0];
		expect(reset).toMatchObject({ schema: 0, count: 0, sum: 0 });
	});
});

describe('native histogram lifecycle', () => {
	test('supports labels, timers, zero, remove, and reset', async () => {
		jest.useFakeTimers();
		jest.setSystemTime(1000);
		const histogram = create({ labelNames: ['method', 'code'] });
		histogram.zero({ method: 'GET', code: 200 });
		expect((await snapshot(histogram)).labels).toEqual({
			method: 'GET',
			code: '200',
		});
		const end = histogram.labels('GET', '200').startTimer();
		jest.advanceTimersByTime(500);
		expect(end()).toBe(0.5);
		expect(await snapshot(histogram)).toMatchObject({
			count: 1,
			sum: 0.5,
			createdTimestamp: 1,
		});
		histogram.remove({ method: 'GET', code: '200' });
		expect((await histogram.get()).nativeHistograms).toEqual([]);
		histogram.observe({ method: 'POST', code: '201' }, 1);
		histogram.reset();
		expect((await histogram.get()).nativeHistograms).toEqual([]);
		histogram.observe({ method: 'POST', code: '201' }, 2);
		expect(await snapshot(histogram)).toMatchObject({
			count: 1,
			sum: 2,
			createdTimestamp: 1.5,
		});
	});

	test('collects asynchronous observations before taking a snapshot', async () => {
		const histogram = create({
			async collect() {
				await Promise.resolve();
				this.observe(3);
			},
		});
		expect(await snapshot(histogram)).toMatchObject({ count: 1, sum: 3 });
	});

	test('returns independent JSON snapshots', async () => {
		const histogram = create({ labelNames: ['route'] });
		const labels = { route: '/a' };
		histogram.observe(labels, 2);
		labels.route = '/changed';
		const data = await snapshot(histogram);
		data.labels.route = '/also_changed';
		data.positiveSpans[0].offset = 100;
		data.positiveDeltas[0] = 100;
		expect(await snapshot(histogram)).toMatchObject({
			labels: { route: '/a' },
			positiveSpans: [{ offset: 1, length: 1 }],
			positiveDeltas: [1],
		});
	});

	test('retains at most ten independent timestamped exemplars', async () => {
		jest.useFakeTimers();
		jest.setSystemTime(1234);
		const register = new Registry(Registry.PROMETHEUS_PROTOBUF_CONTENT_TYPE);
		const histogram = create({ enableExemplars: true, registers: [register] });
		const exemplarLabels = { trace_id: 'trace' };
		for (let i = 0; i < 12; i++) {
			histogram.observe({ value: i, exemplarLabels });
		}
		exemplarLabels.trace_id = 'changed';
		const data = await snapshot(histogram);
		expect(data.exemplars).toEqual(
			Array.from({ length: 10 }, (_, i) => {
				return {
					labelSet: { trace_id: 'trace' },
					value: i + 2,
					timestamp: 1.234,
				};
			}),
		);
		data.exemplars[0].labelSet.trace_id = 'mutated';
		expect((await snapshot(histogram)).exemplars[0].labelSet.trace_id).toBe(
			'trace',
		);
	});

	test('supports exemplars on label-bound timers', async () => {
		jest.useFakeTimers();
		const register = new Registry(Registry.PROMETHEUS_PROTOBUF_CONTENT_TYPE);
		const histogram = create({
			registers: [register],
			labelNames: ['method'],
			enableExemplars: true,
		});
		const end = histogram.labels('GET').startTimer();
		jest.advanceTimersByTime(200);
		expect(end(undefined, { trace_id: 'timer' })).toBe(0.2);
		expect((await snapshot(histogram)).exemplars[0]).toMatchObject({
			value: 0.2,
			labelSet: { trace_id: 'timer' },
		});
	});
});

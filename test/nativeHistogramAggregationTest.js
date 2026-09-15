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

const {
	Registry,
	Histogram,
	ClusterRegistry,
	WorkerRegistry,
	aggregators,
} = require('../index');
const {
	bucketCounts,
	decodeMetricFamilies,
} = require('./helpers/nativeHistogram');

const contentType = Registry.PROMETHEUS_PROTOBUF_CONTENT_TYPE;

function create(config = {}) {
	return new Histogram({
		name: 'worker_duration_seconds',
		help: 'Worker duration',
		registers: [],
		buckets: [0.5, 1, 2, 8],
		nativeHistogramBucketFactor: 1.1,
		nativeHistogramZeroThreshold: 0,
		...config,
	});
}

function comparable(data) {
	return {
		count: data.count,
		sum: data.sum,
		schema: data.schema,
		zeroCount: data.zeroCount,
		zeroThreshold: data.zeroThreshold,
		positive: bucketCounts(data, 'positive'),
		negative: bucketCounts(data, 'negative'),
	};
}

describe('native histogram aggregation', () => {
	test.each([Registry, ClusterRegistry, WorkerRegistry])(
		'%p aggregates JSON snapshots at the lowest common resolution',
		async RegistryClass => {
			const first = create();
			const second = create({ nativeHistogramBucketFactor: 2 });
			const firstValues = [0, 0.125, 0.5, 1, 1.5, 2, -0.25, -2];
			const secondValues = [0, 0.25, 0.5, 1, 4, -1, -4];
			firstValues.forEach(value => first.observe(value));
			secondValues.forEach(value => second.observe(value));
			const expected = create({ nativeHistogramBucketFactor: 2 });
			[...firstValues, ...secondValues].forEach(value =>
				expected.observe(value),
			);

			// Cluster IPC serializes JSON, while worker threads use structured clone.
			// Neither Maps nor private collector state should be required here.
			const snapshots = JSON.parse(
				JSON.stringify([[await first.get()], [await second.get()]]),
			);
			const before = JSON.stringify(snapshots);
			const aggregated = RegistryClass.aggregate(snapshots, contentType);
			const [data] = await aggregated.getMetricsAsJSON();
			expect(comparable(data.nativeHistograms[0])).toEqual(
				comparable((await expected.get()).nativeHistograms[0]),
			);
			expect(JSON.stringify(snapshots)).toBe(before);
			expect(
				decodeMetricFamilies(await aggregated.metrics())[0].metric[0].histogram
					.sampleCount,
			).toBe(firstValues.length + secondValues.length);
		},
	);

	test.each([
		[0.5, 0.75, [0.6, -0.6], [0.8, -0.8], 1],
		[0.5, 0.75, [2, -2], [0.8, -0.8], 0.75],
		[0.75, 0.75, [0.8, -0.8], [0.9, -0.9], 0.75],
		[0, 0.5, [0.25, -0.25, 1], [0.5, -0.5, 2], 0.5],
	])(
		'reconciles zero thresholds %s and %s without splitting populated buckets',
		async (thresholdA, thresholdB, valuesA, valuesB, expectedThreshold) => {
			const first = create({ nativeHistogramZeroThreshold: thresholdA });
			const second = create({
				nativeHistogramBucketFactor: 2,
				nativeHistogramZeroThreshold: thresholdB,
			});
			valuesA.forEach(value => first.observe(value));
			valuesB.forEach(value => second.observe(value));
			const expected = create({
				nativeHistogramBucketFactor: 2,
				nativeHistogramZeroThreshold: expectedThreshold,
			});
			[...valuesA, ...valuesB].forEach(value => expected.observe(value));
			const aggregated = Registry.aggregate(
				[[await first.get()], [await second.get()]],
				contentType,
			);
			const [data] = await aggregated.getMetricsAsJSON();
			expect(comparable(data.nativeHistograms[0])).toEqual(
				comparable((await expected.get()).nativeHistograms[0]),
			);
			await expect(aggregated.metrics()).resolves.toBeInstanceOf(Buffer);
		},
	);

	test('handles a zero threshold at the largest finite double', async () => {
		const first = create();
		const second = create({ nativeHistogramZeroThreshold: Number.MAX_VALUE });
		first.observe(Number.MAX_VALUE);
		second.observe(-Number.MAX_VALUE);
		const result = aggregators.sum([await first.get(), await second.get()]);
		expect(result.nativeHistograms[0]).toMatchObject({
			count: 2,
			sum: 0,
			zeroCount: 2,
			zeroThreshold: Number.MAX_VALUE,
		});
		expect(bucketCounts(result.nativeHistograms[0], 'positive').size).toBe(0);
	});

	test('keeps the earliest creation time and a bounded set of exemplars', async () => {
		jest.useFakeTimers();
		try {
			jest.setSystemTime(1000);
			const first = create({ enableExemplars: true });
			first.observe({ value: 1, exemplarLabels: { trace_id: 'first' } });
			jest.setSystemTime(2000);
			const second = create({ enableExemplars: true });
			for (let i = 0; i < 12; i++) {
				second.observe({ value: i, exemplarLabels: { trace_id: 'second' } });
			}
			const result = aggregators.sum([await first.get(), await second.get()]);
			expect(result.nativeHistograms[0].createdTimestamp).toBe(1);
			expect(result.nativeHistograms[0].exemplars).toHaveLength(10);
			expect(result.nativeHistograms[0].exemplars[0].labelSet).toEqual({
				trace_id: 'second',
			});
		} finally {
			jest.useRealTimers();
		}
	});

	test('supports first and omit aggregation without mutating source snapshots', async () => {
		const first = create({ aggregator: 'first' });
		const second = create({ aggregator: 'first' });
		first.observe(1);
		second.observe(2);
		const snapshots = [await first.get(), await second.get()];
		const result = aggregators.first(snapshots);
		expect(result.nativeHistograms).toEqual(snapshots[0].nativeHistograms);
		result.nativeHistograms[0].positiveDeltas[0] = 100;
		expect(snapshots[0].nativeHistograms[0].positiveDeltas).toEqual([1]);
		expect(aggregators.omit(snapshots)).toBeUndefined();
	});

	test.each(['average', 'min', 'max'])(
		'rejects %s aggregation of native snapshots',
		async method => {
			const data = await create().get();
			expect(() => aggregators[method]([data])).toThrow('sum, first, or omit');
		},
	);

	test('preserves native metadata through repeated aggregation of historic worker snapshots', async () => {
		const first = create();
		const second = create({ nativeHistogramBucketFactor: 2 });
		first.observe(1);
		second.observe(2);
		const historical = Registry.aggregate([
			[await first.get()],
		]).getMetricsAsArray();
		const combined = Registry.aggregate(
			[historical, [await second.get()]],
			contentType,
		);
		const [family] = decodeMetricFamilies(await combined.metrics());
		expect(family.metric[0].histogram).toMatchObject({
			sampleCount: 2,
			sampleSum: 3,
			schema: 0,
			positiveSpan: [{ offset: 0, length: 2 }],
			positiveDelta: [1, 0],
		});
	});

	test('returns a Buffer when a protobuf worker registry has no workers', async () => {
		const register = new WorkerRegistry(contentType);
		const result = await register.workerMetrics();
		expect(Buffer.isBuffer(result)).toBe(true);
		expect(result.length).toBe(0);
	});
});

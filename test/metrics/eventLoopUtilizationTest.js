'use strict';

const { setTimeout: sleep } = require('timers/promises');
const register = require('../../index').register;
const elu = require('../../lib/metrics/eventLoopUtilization');
const { eventLoopUtilization } = require('perf_hooks').performance;

describe('eventLoopUtilization', () => {
	beforeAll(() => {
		register.clear();
	});

	afterEach(() => {
		register.clear();
	});

	it('should add metric to the registry', async () => {
		expect(await register.getMetricsAsJSON()).toHaveLength(0);

		elu(register, { eventLoopUtilizationTimeout: 50 });

		const expectedELU = Math.random();
		await blockEventLoop(expectedELU, 3000);

		const metrics = await register.getMetricsAsJSON();
		expect(metrics).toHaveLength(2);

		{
			const percentilesCount = 7;

			const eluSummaryMetric = metrics[0];
			expect(eluSummaryMetric.type).toEqual('summary');
			expect(eluSummaryMetric.name).toEqual(
				'nodejs_eventloop_utilization_summary',
			);
			expect(eluSummaryMetric.help).toEqual(
				'Ratio of time the event loop is not idling in the event provider to the total time the event loop is running.',
			);
			expect(eluSummaryMetric.values).toHaveLength(percentilesCount + 2);

			const sum = eluSummaryMetric.values[percentilesCount];
			const count = eluSummaryMetric.values[percentilesCount + 1];

			expect(sum.metricName).toEqual(
				'nodejs_eventloop_utilization_summary_sum',
			);
			expect(count.metricName).toEqual(
				'nodejs_eventloop_utilization_summary_count',
			);
			const calculatedELU = sum.value / count.value;
			const delta = Math.abs(calculatedELU - expectedELU);
			expect(delta).toBeLessThanOrEqual(0.05);
		}

		{
			const bucketsCount = 14;

			const eluHistogramMetric = metrics[1];
			expect(eluHistogramMetric.type).toEqual('histogram');
			expect(eluHistogramMetric.name).toEqual(
				'nodejs_eventloop_utilization_histogram',
			);
			expect(eluHistogramMetric.help).toEqual(
				'Ratio of time the event loop is not idling in the event provider to the total time the event loop is running.',
			);
			expect(eluHistogramMetric.values).toHaveLength(bucketsCount + 2);

			const sum = eluHistogramMetric.values[bucketsCount];
			const count = eluHistogramMetric.values[bucketsCount + 1];

			expect(sum.metricName).toEqual(
				'nodejs_eventloop_utilization_histogram_sum',
			);
			expect(count.metricName).toEqual(
				'nodejs_eventloop_utilization_histogram_count',
			);
			const calculatedELU = sum.value / count.value;
			const delta = Math.abs(calculatedELU - expectedELU);
			expect(delta).toBeLessThanOrEqual(0.05);

			const infBucket = eluHistogramMetric.values[bucketsCount - 1];
			expect(infBucket.labels.le).toEqual('+Inf');
			expect(infBucket.value).toEqual(count.value);

			const le1Bucket = eluHistogramMetric.values[bucketsCount - 2];
			expect(le1Bucket.labels.le).toEqual(1);
			expect(le1Bucket.value).toEqual(count.value);
		}
	});
});

async function blockEventLoop(ratio, ms) {
	const frameMs = 1000;
	const framesNumber = Math.round(ms / frameMs);

	const blockedFrameTime = ratio * frameMs;
	const freeFrameTime = frameMs - blockedFrameTime;

	for (let i = 0; i < framesNumber; i++) {
		const endBlockedTime = Date.now() + blockedFrameTime;
		while (Date.now() < endBlockedTime) {
			// heavy operations
		}
		await sleep(freeFrameTime);
	}
}

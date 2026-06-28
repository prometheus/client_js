'use strict';

const Registry = require('../../index').Registry;

describe.each([
	['Prometheus', Registry.PROMETHEUS_CONTENT_TYPE],
	['OpenMetrics', Registry.OPENMETRICS_CONTENT_TYPE],
])('heapSizeAndUsed with %s registry', (tag, regType) => {
	const memoryUsedFn = process.memoryUsage;

	afterEach(() => {
		process.memoryUsage = memoryUsedFn;
	});

	it('should set gauge values from memoryUsage and heap statistics', async () => {
		await jest.isolateModulesAsync(async () => {
			jest.doMock('v8', () => {
				return {
					getHeapStatistics() {
						return { heap_size_limit: 2147483648 };
					},
				};
			});

			const heapSizeAndUsed = require('../../lib/metrics/heapSizeAndUsed');
			const globalRegistry = require('../../lib/registry').globalRegistry;

			globalRegistry.setContentType(regType);
			process.memoryUsage = function () {
				return { heapTotal: 1000, heapUsed: 500, external: 100 };
			};

			try {
				heapSizeAndUsed();
				// Note: these gauges' values are set by the _total gauge's
				// "collect" function.

				const totalGauge = globalRegistry.getSingleMetric(
					'nodejs_heap_size_total_bytes',
				);
				expect((await totalGauge.get()).values[0].value).toEqual(1000);

				const usedGauge = globalRegistry.getSingleMetric(
					'nodejs_heap_size_used_bytes',
				);
				expect((await usedGauge.get()).values[0].value).toEqual(500);

				const externalGauge = globalRegistry.getSingleMetric(
					'nodejs_external_memory_bytes',
				);
				expect((await externalGauge.get()).values[0].value).toEqual(100);

				const limitGauge = globalRegistry.getSingleMetric(
					'nodejs_heap_size_limit_bytes',
				);
				expect((await limitGauge.get()).values[0].value).toEqual(2147483648);
			} finally {
				globalRegistry.clear();
			}
		});
	});
});

describe('heapSizeAndUsed isolated v8 behaviour', () => {
	it('should read heap_size_limit from getHeapStatistics on each collect', async () => {
		await jest.isolateModulesAsync(async () => {
			let n = 0;
			jest.doMock('v8', () => {
				return {
					getHeapStatistics() {
						n++;
						return { heap_size_limit: n * 1000 };
					},
				};
			});

			const { Registry } = require('../../index');
			const heapSizeAndUsed = require('../../lib/metrics/heapSizeAndUsed');
			const reg = new Registry();
			const savedMem = process.memoryUsage;
			process.memoryUsage = () => {
				return {
					heapTotal: 1,
					heapUsed: 1,
					external: 0,
				};
			};
			try {
				heapSizeAndUsed(reg);
				const totalGauge = reg.getSingleMetric('nodejs_heap_size_total_bytes');
				await totalGauge.get();
				const limitGauge = reg.getSingleMetric('nodejs_heap_size_limit_bytes');
				const data = await limitGauge.get();
				// 1st call: isHeapStatisticsSupported(); 2nd: collect()
				expect(n).toBe(2);
				expect(data.values[0].value).toBe(2000);
			} finally {
				process.memoryUsage = savedMem;
			}
		});
	});

	it('should omit limit metric when getHeapStatistics is unsupported', async () => {
		await jest.isolateModulesAsync(async () => {
			jest.doMock('v8', () => {
				return {
					getHeapStatistics() {
						const err = new Error('not implemented');
						err.code = 'ERR_NOT_IMPLEMENTED';
						throw err;
					},
				};
			});

			const { Registry } = require('../../index');
			const heapSizeAndUsed = require('../../lib/metrics/heapSizeAndUsed');

			expect(heapSizeAndUsed.metricNames).toEqual([
				'nodejs_heap_size_total_bytes',
				'nodejs_heap_size_used_bytes',
				'nodejs_external_memory_bytes',
			]);

			const reg = new Registry();
			heapSizeAndUsed(reg);
			expect(
				reg.getSingleMetric('nodejs_heap_size_limit_bytes'),
			).toBeUndefined();
		});
	});
});

'use strict';

const { EventEmitter } = require('events');
const Registry = require('../lib/worker');

describe.each([
	['Prometheus', Registry.PROMETHEUS_CONTENT_TYPE],
	['OpenMetrics', Registry.OPENMETRICS_CONTENT_TYPE],
])('%s AggregatorRegistry', (tag, regType) => {
	beforeEach(() => {
		Registry.globalRegistry.setContentType(regType);
	});

	describe('WorkerRegistry.workerMetrics()', () => {
		it('works properly if there are no workers', async () => {
			const WorkerRegistry = require('../lib/worker');
			const registry = new WorkerRegistry(regType);
			const metrics = await registry.workerMetrics();
			expect(metrics).toEqual('');
		});
	});

	describe('message handling', () => {
		it('does not error out on unexpected (or late) responses', () => {
			jest.resetModules();

			const WorkerRegistry = require('../lib/worker');

			const registry = new WorkerRegistry(regType);
			const emitter = new EventEmitter();

			registry.addWorker(emitter);

			//Emulate a response that has been deleted from requests
			const unexpected = {
				type: 'prom-client:getMetricsRes',
				metrics: ['{}'],
				requestId: -3,
			};

			expect(() => emitter.emit('message', unexpected)).not.toThrow();
		});
	});
});

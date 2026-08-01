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

const { EventEmitter } = require('events');
const { setTimeout: delay } = require('timers/promises');
const { BroadcastChannel } = require('worker_threads');
const Registry = require('../lib/worker');

const GET_METRICS_REQ = '@prometheus/client:getMetricsReq';
const GET_METRICS_RES = '@prometheus/client:getMetricsRes';

function metric(value) {
	return {
		help: 'test metric',
		name: 'test_metric',
		type: 'gauge',
		values: [{ labels: {}, value }],
		aggregator: 'sum',
	};
}

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

		if (tag === 'Prometheus')
			it('aggregates worker responses in thread id order', async () => {
				const registry = new Registry(regType);
				const announcementChannel = new BroadcastChannel(
					'@prometheus/client:announce',
				);
				const responders = [1, 2, 3].map(threadId => {
					const name = `@prometheus/client:test-worker:${threadId}`;
					registry.addWorker(name);
					return {
						threadId,
						channel: new BroadcastChannel(name),
					};
				});

				let finishSendingResponses;
				const responsesSent = new Promise(resolve => {
					finishSendingResponses = resolve;
				});
				announcementChannel.addEventListener('message', async event => {
					if (event.data.type !== GET_METRICS_REQ) return;

					for (const [threadId, value] of [
						[3, 0.3437699],
						[1, 0.5848208],
						[2, 0.5479198],
					]) {
						responders[threadId - 1].channel.postMessage({
							type: GET_METRICS_RES,
							requestId: event.data.requestId,
							threadId,
							metrics: [[metric(value)]],
						});
						await delay(5);
					}
					finishSendingResponses();
				});

				try {
					const result = await registry.workerMetrics();
					await responsesSent;
					expect(result).toContain('test_metric 1.4765105');
				} finally {
					announcementChannel.close();
					for (const responder of responders) responder.channel.close();
					for (const channel of registry.channels.values()) channel.close();
				}
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
				type: '@prometheus/client:getMetricsRes',
				metrics: ['{}'],
				requestId: -3,
			};

			try {
				expect(() => emitter.emit('message', unexpected)).not.toThrow();
			} finally {
				for (const channel of registry.channels.values()) channel.close();
			}
		});
	});
});

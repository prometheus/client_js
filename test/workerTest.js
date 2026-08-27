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

const { setTimeout: delay } = require('timers/promises');
const { BroadcastChannel } = require('worker_threads');
const Registry = require('../lib/worker');

const ACK = '@prometheus-io/client:ack';
const ANNOUNCEMENT = '@prometheus-io/client:announcement';
const GET_METRICS_REQ = '@prometheus-io/client:getMetricsReq';
const GET_METRICS_RES = '@prometheus-io/client:getMetricsRes';
const GOODBYE = '@prometheus-io/client:goodbye';

function metric(value) {
	return {
		help: 'test metric',
		name: 'test_metric',
		type: 'gauge',
		values: [{ labels: {}, value }],
		aggregator: 'sum',
	};
}

function counter(value) {
	return {
		help: 'test metric two',
		name: 'test_metric_two_counter',
		type: 'counter',
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
		let AggregatorRegistry;
		let announcementChannel;
		let registry;
		let discovery;

		beforeEach(async () => {
			jest.resetModules();
			AggregatorRegistry = require('../lib/worker');
			registry = new AggregatorRegistry(regType);
			announcementChannel = new BroadcastChannel(
				'@prometheus-io/client:announce',
			).unref();

			discovery = new Promise(resolve => {
				announcementChannel.addEventListener('message', async event => {
					if (event.data.type === ANNOUNCEMENT && !event.data.primary) {
						resolve(event);
					}
				});
			});
		});

		afterEach(async () => {
			announcementChannel.close();
		});

		it('works properly if there are no workers', async () => {
			const metrics = await registry.workerMetrics();
			expect(metrics).toEqual('');
		});

		it('formats in the correct content type', async () => {
			const threadId = 211;
			const name = `@prometheus-io/client:worker:${threadId}`;
			const channel = new BroadcastChannel(name).unref();

			announcementChannel.postMessage({
				type: ANNOUNCEMENT,
				name,
				threadId,
			});

			await discovery; // Let announcements arrive

			announcementChannel.addEventListener('message', async event => {
				if (event.data.type !== GET_METRICS_REQ) return;

				channel.postMessage({
					type: GET_METRICS_RES,
					requestId: event.data.requestId,
					threadId,
					metrics: [[counter(1.2345)]],
				});
			});

			try {
				const result = await registry.workerMetrics();
				if (regType === Registry.PROMETHEUS_CONTENT_TYPE) {
					expect(result).toContain('test_metric_two_counter 1.2345');
				} else {
					expect(result).toContain('test_metric_two_counter_total 1.2345');
				}
			} finally {
				channel.close();
			}
		});

		it('aggregates worker responses in thread id order', async () => {
			const responders = [1, 2, 3].map(threadId => {
				const name = `@prometheus-io/client:worker:${threadId}`;
				const channel = new BroadcastChannel(name).unref();

				announcementChannel.postMessage({
					type: ANNOUNCEMENT,
					name,
					threadId,
				});

				return { threadId, channel };
			});

			await discovery; // Let announcements arrive

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
				for (const responder of responders) responder.channel.close();
			}
		});

		it('accumulate stats from terminated workers', async () => {
			jest.resetModules();
			const AggregatorRegistry = require('../lib/worker');
			const registry = new AggregatorRegistry(regType);
			const announcementChannel = new BroadcastChannel(
				'@prometheus-io/client:announce',
			).unref();

			const threadId = 134;
			const name = `@prometheus-io/client:worker:${threadId}`;
			const channel = new BroadcastChannel(name).unref();

			announcementChannel.postMessage({
				type: ANNOUNCEMENT,
				name,
				threadId,
			});

			await delay(5); // Let announcements arrive

			const ack = new Promise(resolve => {
				channel.addEventListener('message', async event => {
					if (event.data.type === ACK) {
						resolve(event);
					}
				});
			});

			channel.postMessage({
				type: GOODBYE,
				threadId,
				metrics: [[metric(0.123456)]],
			});

			await ack;

			try {
				const result = await registry.workerMetrics();
				expect(result).toContain('test_metric 0.123456');
			} finally {
				announcementChannel.close();
				channel.close();
			}
		});
	});

	describe('shutdown()', () => {
		let AggregatorRegistry;
		let announcementChannel;
		let registry;
		let discovery;

		beforeEach(async () => {
			jest.resetModules();
			AggregatorRegistry = require('../lib/worker');

			announcementChannel = new BroadcastChannel(
				'@prometheus-io/client:announce',
			).unref();

			registry = new AggregatorRegistry(regType);

			discovery = new Promise(resolve => {
				announcementChannel.addEventListener('message', async event => {
					if (event.data.type === ANNOUNCEMENT && !event.data.primary) {
						resolve(event);
					}
				});
			});
		});

		afterEach(() => {
			announcementChannel.close();
		});

		it('returns immediately on no outstanding requests', async () => {
			await expect(registry.shutdown()).resolves.not.toThrow();
		});

		it('sends data back to the primary', async () => {
			jest.resetModules();
			AggregatorRegistry = require('../lib/worker');

			const workerRegistry = new AggregatorRegistry(regType, false);
			const name = `@prometheus-io/client:worker:0`;
			const channel = new BroadcastChannel(name).unref();

			const { Gauge } = require('../index');
			const gauge = new Gauge({ name: 'primary_gauge_test', help: 'test' });

			gauge.set(0.8675309);

			// wait until worker has processed the ACk before continuing
			const metrics = new Promise(resolve => {
				channel.addEventListener('message', async event => {
					if (event.data.type === GOODBYE) {
						channel.postMessage({ type: ACK, requestId: 0, threadId: 0 });
						resolve(event.data.metrics);
					}
				});
			});

			try {
				await workerRegistry.shutdown();
				const expected = {
					aggregator: 'sum',
					help: 'test',
					name: 'primary_gauge_test',
					type: 'gauge',
					values: [
						{
							labels: {},
							value: 0.8675309,
						},
					],
				};

				await expect(metrics).resolves.toEqual([[expected]]);
			} finally {
				channel.close();
			}
		});

		describe('with workers', () => {
			let channel;

			beforeEach(async () => {
				const threadId = 22;
				const name = `@prometheus-io/client:test-worker:${threadId}`;
				channel = new BroadcastChannel(name).unref();

				announcementChannel.postMessage({
					type: ANNOUNCEMENT,
					name,
					threadId,
				});

				announcementChannel.addEventListener('message', async event => {
					if (event.data.type === GET_METRICS_REQ) {
						channel.postMessage({
							type: GET_METRICS_RES,
							requestId: event.data.requestId,
							threadId: 22,
							metrics: [[metric(2)]],
						});
					}
				});

				await discovery;
			});

			afterEach(() => {
				channel.close();
			});

			it('waits for pending requests', async () => {
				const results = [];
				const promise = registry.workerMetrics().then(() => results.push(1));
				const shutdown = registry.shutdown().then(() => results.push(2));
				await Promise.all([promise, shutdown]);

				expect(results).toEqual([1, 2]);
			});
		});
	});

	describe('message handling', () => {
		it("listeners don't accumulate", () => {
			for (let i = 0; i < 30; i++) {
				jest.resetModules();

				const AggregatorRegistry = require('../lib/worker');
				const ar = new AggregatorRegistry(regType);
			}
		});

		it('does not error out on unexpected (or late) responses', () => {
			jest.resetModules();

			const WorkerRegistry = require('../lib/worker');
			const registry = new WorkerRegistry(regType);
			const announcementChannel = new BroadcastChannel(
				'@prometheus-io/client:announce',
			).unref();
			const threadId = 20;
			const name = `@prometheus-io/client:test-worker:${threadId}`;
			const channel = new BroadcastChannel(name).unref();

			announcementChannel.postMessage({
				type: ANNOUNCEMENT,
				name,
				threadId,
			});

			//Emulate a response that has been deleted from requests
			const unexpected = {
				type: '@prometheus-io/client:getMetricsRes',
				metrics: ['{}'],
				requestId: -3,
			};

			try {
				expect(() => channel.postMessage(unexpected)).not.toThrow();
			} finally {
				channel.close();
			}
		});
	});
});

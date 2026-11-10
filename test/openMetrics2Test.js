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

const http = require('node:http');
const client = require('../index');
const {
	Registry,
	Counter,
	Gauge,
	openMetrics001ContentType,
	openMetricsContentType,
	openMetrics20ContentType,
	openMetrics20RcContentType,
	prometheusContentType,
	negotiateAccept,
} = client;

describe('OpenMetrics 2.0 (2.0.0-rc.1) Exposition and Content Negotiation', () => {
	let realDateNow;

	beforeEach(() => {
		realDateNow = Date.now;
		Date.now = jest.fn(() => 1700000000123);
	});

	afterEach(() => {
		Date.now = realDateNow;
		client.register.clear();
		client.register.setContentType(Registry.PROMETHEUS_CONTENT_TYPE);
	});

	describe('Content-Type constants and Registry setup', () => {
		it('exports all OpenMetrics and Prometheus content types', () => {
			expect(prometheusContentType).toBe(
				'text/plain; version=0.0.4; charset=utf-8',
			);
			expect(openMetrics001ContentType).toBe(
				'application/openmetrics-text; version=0.0.1; charset=utf-8',
			);
			expect(openMetricsContentType).toBe(
				'application/openmetrics-text; version=1.0.0; charset=utf-8',
			);
			expect(openMetrics20ContentType).toBe(
				'application/openmetrics-text; version=2.0.0; charset=utf-8',
			);
			expect(openMetrics20RcContentType).toBe(
				'application/openmetrics-text; version=2.0.0-rc; charset=utf-8',
			);
		});

		it('allows constructing and configuring registries with OpenMetrics 2.0 content types and escaping params', () => {
			const reg20 = new Registry(Registry.OPENMETRICS_2_0_CONTENT_TYPE);
			expect(reg20.contentType).toBe(Registry.OPENMETRICS_2_0_CONTENT_TYPE);

			const reg20Rc = new Registry(Registry.OPENMETRICS_2_0_RC_CONTENT_TYPE);
			expect(reg20Rc.contentType).toBe(
				Registry.OPENMETRICS_2_0_RC_CONTENT_TYPE,
			);

			reg20.setContentType(
				`${Registry.OPENMETRICS_2_0_CONTENT_TYPE}; escaping=underscores`,
			);
			expect(reg20.contentType).toBe(
				'application/openmetrics-text; version=2.0.0; charset=utf-8; escaping=underscores',
			);
		});
	});

	describe('HTTP Accept Content Negotiation', () => {
		it('negotiates OpenMetrics 2.0, 2.0-rc, 1.0, 0.0.1, and Prometheus 0.0.4 with RFC 9110 q-values and escaping', () => {
			expect(
				negotiateAccept('application/openmetrics-text;version=2.0.0-rc'),
			).toBe(
				'application/openmetrics-text; version=2.0.0-rc; charset=utf-8; escaping=allow-utf-8',
			);

			expect(
				negotiateAccept(
					'application/openmetrics-text;version=2.0.0-rc;escaping=underscores',
				),
			).toBe(
				'application/openmetrics-text; version=2.0.0-rc; charset=utf-8; escaping=underscores',
			);

			expect(
				negotiateAccept('application/openmetrics-text;version=2.0.0'),
			).toBe(
				'application/openmetrics-text; version=2.0.0; charset=utf-8; escaping=allow-utf-8',
			);

			expect(
				negotiateAccept(
					'application/openmetrics-text;version=2.0.0;escaping=foo',
				),
			).toBe(
				'application/openmetrics-text; version=2.0.0; charset=utf-8; escaping=allow-utf-8',
			);

			expect(
				negotiateAccept('application/openmetrics-text;version=1.0.0'),
			).toBe(
				'application/openmetrics-text; version=1.0.0; charset=utf-8; escaping=underscores',
			);

			expect(negotiateAccept('application/openmetrics-text')).toBe(
				'application/openmetrics-text; version=0.0.1; charset=utf-8; escaping=underscores',
			);

			expect(
				negotiateAccept(
					'application/json;escaping=allow-utf-8, text/plain;version=0.0.4',
				),
			).toBe('text/plain; version=0.0.4; charset=utf-8; escaping=underscores');

			// Prometheus server scrape Accept header when OpenMetrics 2.0 is enabled:
			const promScrapeAccept =
				'application/openmetrics-text;version=2.0.0;escaping=allow-utf-8,application/openmetrics-text;version=2.0.0-rc;escaping=allow-utf-8;q=0.9,application/openmetrics-text;version=1.0.0;escaping=allow-utf-8;q=0.8,application/openmetrics-text;version=0.0.1;q=0.7,text/plain;version=0.0.4;escaping=allow-utf-8;q=0.6,*/*;q=0.1';
			expect(negotiateAccept(promScrapeAccept)).toBe(
				'application/openmetrics-text; version=2.0.0; charset=utf-8; escaping=allow-utf-8',
			);

			expect(
				negotiateAccept(
					'application/openmetrics-text;version=1.0.0;q=0.8, application/openmetrics-text;version=2.0.0;q=0.9',
				),
			).toBe(
				'application/openmetrics-text; version=2.0.0; charset=utf-8; escaping=allow-utf-8',
			);

			expect(negotiateAccept('*/*')).toBe(
				'text/plain; version=0.0.4; charset=utf-8; escaping=underscores',
			);

			expect(negotiateAccept('')).toBe(
				'text/plain; version=0.0.4; charset=utf-8; escaping=underscores',
			);

			// Respects custom acceptedFormats
			expect(
				negotiateAccept('application/openmetrics-text;version=2.0.0', [
					Registry.OPENMETRICS_CONTENT_TYPE,
					Registry.PROMETHEUS_CONTENT_TYPE,
				]),
			).toBe('text/plain; version=0.0.4; charset=utf-8; escaping=underscores');

			expect(
				negotiateAccept('*/*', [Registry.OPENMETRICS_2_0_CONTENT_TYPE]),
			).toBe(
				'application/openmetrics-text; version=2.0.0; charset=utf-8; escaping=underscores',
			);

			expect(
				negotiateAccept('application/openmetrics-text', [
					Registry.OPENMETRICS_2_0_CONTENT_TYPE,
				]),
			).toBe(
				'application/openmetrics-text; version=2.0.0; charset=utf-8; escaping=allow-utf-8',
			);
		});
	});

	describe('Counter in OpenMetrics 2.0 vs OpenMetrics 1.0', () => {
		it('does not mandate _total suffix in OpenMetrics 2.0 and preserves metric.name across scrapes', async () => {
			const reg = new Registry(Registry.OPENMETRICS_2_0_CONTENT_TYPE);
			const cNoSuffix = new Counter({
				name: 'events_processed',
				help: 'Events processed',
				unit: 'events',
				registers: [reg],
			});
			const cWithSuffix = new Counter({
				name: 'http_requests_total',
				help: 'HTTP requests',
				labelNames: ['method'],
				enableExemplars: true,
				registers: [reg],
			});

			Date.now = jest.fn(() => 1700000005500);
			cNoSuffix.inc(3);
			cWithSuffix.inc({
				labels: { method: 'GET' },
				value: 5,
				exemplarLabels: { trace_id: 'abc123' },
			});

			const om20Out = await reg.metrics();
			expect(om20Out).toBe(
				[
					'# HELP events_processed Events processed',
					'# TYPE events_processed counter',
					'# UNIT events_processed events',
					'events_processed 3',
					'# HELP http_requests_total HTTP requests',
					'# TYPE http_requests_total counter',
					'http_requests_total{method="GET"} 5 # {trace_id="abc123"} 5 1700000005.5',
					'# EOF',
					'',
				].join('\n'),
			);

			// Verify OpenMetrics 1.0 behavior on the same registry without mutating metric.name
			const om10Out = await reg.metrics({
				contentType: Registry.OPENMETRICS_CONTENT_TYPE,
			});
			expect(om10Out).toBe(
				[
					'# HELP events_processed Events processed',
					'# TYPE events_processed counter',
					'# UNIT events_processed events',
					'events_processed_total 3',
					'# HELP http_requests HTTP requests',
					'# TYPE http_requests counter',
					'http_requests_total{method="GET"} 5 # {trace_id="abc123"} 5 1700000005.5',
					'# EOF',
					'',
				].join('\n'),
			);

			expect(cWithSuffix.name).toBe('http_requests_total');
		});
	});

	describe('Gauge and Unit validation in OpenMetrics 2.0', () => {
		it('validates units and formats NaN as NaN in OpenMetrics 2.0', async () => {
			expect(
				() =>
					new Gauge({
						name: 'bad_unit_gauge',
						help: 'help',
						unit: 'bad\nunit',
					}),
			).toThrow('Invalid unit: bad\nunit');
			expect(
				() =>
					new Gauge({
						name: 'bad_unit_slash_gauge',
						help: 'help',
						unit: 'requests/sec',
					}),
			).toThrow('Invalid unit: requests/sec');
			expect(
				() =>
					new Gauge({
						name: 'bad_unit_space_gauge',
						help: 'help',
						unit: 'ms - latency',
					}),
			).toThrow('Invalid unit: ms - latency');

			const reg = new Registry(Registry.OPENMETRICS_2_0_CONTENT_TYPE);
			const g = new Gauge({
				name: 'memory_usage_bytes',
				help: 'Memory "usage"\r\nin bytes',
				unit: 'bytes',
				registers: [reg],
			});
			g.set(NaN);

			const om20Out = await reg.metrics();
			expect(om20Out).toBe(
				[
					'# HELP memory_usage_bytes Memory \\"usage\\"\\nin bytes',
					'# TYPE memory_usage_bytes gauge',
					'# UNIT memory_usage_bytes bytes',
					'memory_usage_bytes NaN',
					'# EOF',
					'',
				].join('\n'),
			);

			const promOut = await reg.metrics({
				contentType: Registry.PROMETHEUS_CONTENT_TYPE,
			});
			expect(promOut).toBe(
				[
					'# HELP memory_usage_bytes Memory "usage"\r\\nin bytes',
					'# TYPE memory_usage_bytes gauge',
					'memory_usage_bytes Nan',
					'',
				].join('\n'),
			);

			// Passing { accept: undefined } (e.g. req.headers.accept when header is omitted)
			// negotiates consistently with reg.negotiate(undefined)
			const noAcceptOut = await reg.metrics({ accept: undefined });
			expect(noAcceptOut).toBe(promOut);
		});
	});

	describe('Registry.aggregate with OpenMetrics 2.0', () => {
		it('preserves unit across aggregated registries', async () => {
			const reg1 = new Registry(Registry.OPENMETRICS_2_0_CONTENT_TYPE);
			const reg2 = new Registry(Registry.OPENMETRICS_2_0_CONTENT_TYPE);

			const c1 = new Counter({
				name: 'agg_counter_total',
				help: 'Aggregated counter',
				unit: 'requests',
				registers: [reg1],
			});
			c1.inc(2);

			const c2 = new Counter({
				name: 'agg_counter_total',
				help: 'Aggregated counter',
				unit: 'requests',
				registers: [reg2],
			});
			c2.inc(5);

			const json1 = await reg1.getMetricsAsJSON();
			const json2 = await reg2.getMetricsAsJSON();

			const aggregated = Registry.aggregate(
				[json1, json2],
				Registry.OPENMETRICS_2_0_CONTENT_TYPE,
			);
			const out = await aggregated.metrics();
			expect(out).toBe(
				[
					'# HELP agg_counter_total Aggregated counter',
					'# TYPE agg_counter_total counter',
					'# UNIT agg_counter_total requests',
					'agg_counter_total 7',
					'# EOF',
					'',
				].join('\n'),
			);
		});
	});

	describe('HTTP Server Content Negotiation Integration', () => {
		it('serves negotiated OpenMetrics 2.0, 2.0-rc, 1.0, and Prometheus 0.0.4 over HTTP based on Accept header', async () => {
			const reg = new Registry();
			const c = new Counter({
				name: 'http_requests_total',
				help: 'Total HTTP requests',
				unit: 'requests',
				registers: [reg],
			});
			c.inc(3);

			const server = http.createServer(async (req, res) => {
				const contentType = reg.negotiate(req.headers.accept);
				res.setHeader('Content-Type', contentType);
				res.end(await reg.metrics({ contentType }));
			});

			await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
			const { port } = server.address();

			try {
				const res20 = await fetch(`http://127.0.0.1:${port}/metrics`, {
					headers: {
						Accept:
							'application/openmetrics-text;version=2.0.0;escaping=allow-utf-8;q=0.8,application/openmetrics-text;version=1.0.0;q=0.6,text/plain;version=0.0.4;q=0.5',
					},
				});
				expect(res20.headers.get('content-type')).toBe(
					'application/openmetrics-text; version=2.0.0; charset=utf-8; escaping=allow-utf-8',
				);
				const body20 = await res20.text();
				expect(body20).toContain('# UNIT http_requests_total requests');
				expect(body20).toContain('http_requests_total 3');
				expect(body20.endsWith('# EOF\n')).toBe(true);

				const resProm = await fetch(`http://127.0.0.1:${port}/metrics`, {
					headers: {
						Accept: 'text/plain;version=0.0.4',
					},
				});
				expect(resProm.headers.get('content-type')).toBe(
					'text/plain; version=0.0.4; charset=utf-8; escaping=underscores',
				);
				const bodyProm = await resProm.text();
				expect(bodyProm).toContain('http_requests_total 3');
			} finally {
				await new Promise(resolve => server.close(resolve));
			}
		});
	});
});

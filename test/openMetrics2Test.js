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

const http = require('node:http');
const client = require('../index');
const {
	Registry,
	Counter,
	Gauge,
	Histogram,
	Summary,
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
			expect(client.validateLegacyMetricName('valid_name:1')).toBe(true);
			expect(client.validateLegacyMetricName('utf8.name')).toBe(false);
			expect(
				client.validateLegacyLabelName(['valid_label', 'utf8.label']),
			).toEqual(['utf8.label']);
			expect(client.escapeName('utf8.name', 'dots')).toBe('utf8_dot_name');
			expect(client.escapeLabelName('utf8.label', 'underscores')).toBe(
				'utf8_label',
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
		});
	});

	describe('Counter in OpenMetrics 2.0 vs OpenMetrics 1.0', () => {
		it('does not mandate _total suffix in OpenMetrics 2.0 and emits st@ startTimestamp and exemplars', async () => {
			const reg = new Registry(Registry.OPENMETRICS_2_0_CONTENT_TYPE);
			const cNoSuffix = new Counter({
				name: 'events_processed',
				help: 'Events processed',
				unit: 'events',
				enableExemplars: true,
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
			cNoSuffix.inc({
				value: 3,
				exemplarLabels: {},
			});
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
					'events_processed 3 st@1700000000.123 # {} 3 1700000005.5',
					'# HELP http_requests_total HTTP requests',
					'# TYPE http_requests_total counter',
					'http_requests_total{method="GET"} 5 st@1700000005.5 # {trace_id="abc123"} 5 1700000005.5',
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

		it('allows exemplars up to 2048 runes on OpenMetrics 2.0 registries and truncates to 128 runes when scraped as OpenMetrics 1.0', async () => {
			const reg = new Registry(Registry.OPENMETRICS_2_0_CONTENT_TYPE);
			const c = new Counter({
				name: 'counter_truncated_exemplar_test_total',
				help: 'help',
				enableExemplars: true,
				registers: [reg],
			});

			c.inc({
				value: 1,
				exemplarLabels: {
					extra_long_label: 'x'.repeat(120),
					span_id: 'span1234',
					trace_id: 'trace1234',
				},
			});

			const om2Output = await reg.metrics();
			expect(om2Output).toContain('extra_long_label=');
			expect(om2Output).toContain('trace_id="trace1234"');
			expect(om2Output).toContain('span_id="span1234"');

			const om1Output = await reg.metrics({
				contentType: Registry.OPENMETRICS_CONTENT_TYPE,
			});
			expect(om1Output).toContain(
				'# {trace_id="trace1234",span_id="span1234"} 1',
			);
			expect(om1Output).not.toContain('extra_long_label');

			const promOutput = await reg.metrics({
				contentType: Registry.PROMETHEUS_CONTENT_TYPE,
			});
			expect(promOutput).not.toContain('trace1234');

			expect(() => {
				c.inc({
					value: 1,
					exemplarLabels: {
						trace_id: 'j'.repeat(1100),
						span_id: 'j'.repeat(1100),
					},
				});
			}).toThrow('Label set size must be smaller than 2048 UTF-8 chars');
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

			const reg = new Registry(Registry.OPENMETRICS_2_0_CONTENT_TYPE);
			const g = new Gauge({
				name: 'memory_usage_bytes',
				help: 'Memory usage',
				unit: 'bytes',
				registers: [reg],
			});
			g.set(NaN);

			const om20Out = await reg.metrics();
			expect(om20Out).toBe(
				[
					'# HELP memory_usage_bytes Memory usage',
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
					'# HELP memory_usage_bytes Memory usage',
					'# TYPE memory_usage_bytes gauge',
					'memory_usage_bytes Nan',
					'',
				].join('\n'),
			);
		});
	});

	describe('Composite Histogram in OpenMetrics 2.0', () => {
		it('emits composite histogram values with st@ and multiple bucket exemplars', async () => {
			const reg = new Registry(Registry.OPENMETRICS_2_0_CONTENT_TYPE);
			const h = new Histogram({
				name: 'request_duration_seconds',
				help: 'Request duration',
				unit: 'seconds',
				buckets: [0.1, 0.5, 1],
				labelNames: ['route'],
				enableExemplars: true,
				registers: [reg],
			});

			h.observe({
				labels: { route: '/api' },
				value: 0.05,
				exemplarLabels: { trace_id: 't1' },
			});
			Date.now = jest.fn(() => 1700000001000);
			h.observe({
				labels: { route: '/api' },
				value: 0.4,
				exemplarLabels: { trace_id: 't2' },
			});
			h.observe({
				labels: { route: '/api' },
				value: 2.5,
				exemplarLabels: { trace_id: 't3' },
			});

			const om20Out = await reg.metrics();
			expect(om20Out).toBe(
				[
					'# HELP request_duration_seconds Request duration',
					'# TYPE request_duration_seconds histogram',
					'# UNIT request_duration_seconds seconds',
					'request_duration_seconds{route="/api"} {count:3,sum:2.95,bucket:[0.1:1,0.5:2,1:2,+Inf:3]} st@1700000000.123 # {trace_id="t1"} 0.05 1700000000.123 # {trace_id="t2"} 0.4 1700000001 # {trace_id="t3"} 2.5 1700000001',
					'# EOF',
					'',
				].join('\n'),
			);
		});
	});

	describe('Composite Summary in OpenMetrics 2.0', () => {
		it('emits composite summary values with NaN quantiles when count is 0 and observed quantiles when count > 0', async () => {
			const reg = new Registry(Registry.OPENMETRICS_2_0_CONTENT_TYPE);
			const s = new Summary({
				name: 'payload_size_bytes',
				help: 'Payload size',
				unit: 'bytes',
				percentiles: [0.5, 0.99],
				registers: [reg],
			});

			const emptyOut = await reg.metrics();
			expect(emptyOut).toBe(
				[
					'# HELP payload_size_bytes Payload size',
					'# TYPE payload_size_bytes summary',
					'# UNIT payload_size_bytes bytes',
					'payload_size_bytes {count:0,sum:0,quantile:[0.5:NaN,0.99:NaN]} st@1700000000.123',
					'# EOF',
					'',
				].join('\n'),
			);

			s.observe(-20);
			s.observe(-10);

			const observedOut = await reg.metrics();
			expect(observedOut).toBe(
				[
					'# HELP payload_size_bytes Payload size',
					'# TYPE payload_size_bytes summary',
					'# UNIT payload_size_bytes bytes',
					'payload_size_bytes {count:2,sum:-30,quantile:[0.5:-15,0.99:-10]} st@1700000000.123',
					'# EOF',
					'',
				].join('\n'),
			);
		});
	});

	describe('UTF-8 Names and Escaping Schemes', () => {
		it('quotes non-legacy UTF-8 names under allow-utf-8 and escapes them under underscores, dots, and values', async () => {
			const reg = new Registry(Registry.OPENMETRICS_2_0_RC_CONTENT_TYPE);
			const g = new Gauge({
				name: 'http.server.duration',
				help: 'Server duration',
				unit: 'seconds',
				labelNames: ['http.method', 'legacy_label'],
				registers: [reg],
			});
			g.set({ 'http.method': 'GET', legacy_label: 'ok' }, 1.5);

			const utf8Out = await reg.metrics();
			expect(utf8Out).toBe(
				[
					'# HELP "http.server.duration" Server duration',
					'# TYPE "http.server.duration" gauge',
					'# UNIT "http.server.duration" seconds',
					'{"http.server.duration","http.method"="GET",legacy_label="ok"} 1.5',
					'# EOF',
					'',
				].join('\n'),
			);

			const underscoresOut = await reg.metrics({
				accept:
					'application/openmetrics-text;version=2.0.0-rc;escaping=underscores',
			});
			expect(underscoresOut).toBe(
				[
					'# HELP http_server_duration Server duration',
					'# TYPE http_server_duration gauge',
					'# UNIT http_server_duration seconds',
					'http_server_duration{http_method="GET",legacy_label="ok"} 1.5',
					'# EOF',
					'',
				].join('\n'),
			);

			const dotsOut = await reg.metrics({
				escaping: 'dots',
			});
			expect(dotsOut).toBe(
				[
					'# HELP http_dot_server_dot_duration Server duration',
					'# TYPE http_dot_server_dot_duration gauge',
					'# UNIT http_dot_server_dot_duration seconds',
					'http_dot_server_dot_duration{http_dot_method="GET",legacy_label="ok"} 1.5',
					'# EOF',
					'',
				].join('\n'),
			);

			const valuesOut = await reg.metrics({
				escaping: 'values',
			});
			expect(valuesOut).toBe(
				[
					'# HELP U__http_2e_server_2e_duration Server duration',
					'# TYPE U__http_2e_server_2e_duration gauge',
					'# UNIT U__http_2e_server_2e_duration seconds',
					'U__http_2e_server_2e_duration{U__http_2e_method="GET",legacy_label="ok"} 1.5',
					'# EOF',
					'',
				].join('\n'),
			);
		});

		it('preserves literal _bucket, _sum, and _count suffixes on histograms and summaries under dots and values escaping in Prometheus 0.0.4 and OpenMetrics 1.0', async () => {
			const reg = new Registry(Registry.PROMETHEUS_CONTENT_TYPE);
			const h = new Histogram({
				name: 'http.request_duration',
				help: 'Request duration',
				buckets: [1],
				registers: [reg],
			});
			h.observe(0.5);

			const dotsProm = await reg.metrics({ escaping: 'dots' });
			expect(dotsProm).toBe(
				[
					'# HELP http_dot_request__duration Request duration',
					'# TYPE http_dot_request__duration histogram',
					'http_dot_request__duration_bucket{le="1"} 1',
					'http_dot_request__duration_bucket{le="+Inf"} 1',
					'http_dot_request__duration_sum 0.5',
					'http_dot_request__duration_count 1',
					'',
				].join('\n'),
			);

			const valuesOm1 = await reg.metrics({
				contentType: Registry.OPENMETRICS_CONTENT_TYPE,
				escaping: 'values',
			});
			expect(valuesOm1).toBe(
				[
					'# HELP U__http_2e_request__duration Request duration',
					'# TYPE U__http_2e_request__duration histogram',
					'U__http_2e_request__duration_bucket{le="1"} 1',
					'U__http_2e_request__duration_bucket{le="+Inf"} 1',
					'U__http_2e_request__duration_sum 0.5',
					'U__http_2e_request__duration_count 1',
					'# EOF',
					'',
				].join('\n'),
			);
		});
	});

	describe('Registry.aggregate with OpenMetrics 2.0', () => {
		it('preserves earliest startTimestamp and unit across aggregated registries', async () => {
			const reg1 = new Registry(Registry.OPENMETRICS_2_0_CONTENT_TYPE);
			const reg2 = new Registry(Registry.OPENMETRICS_2_0_CONTENT_TYPE);

			Date.now = jest.fn(() => 1700000010000);
			const c1 = new Counter({
				name: 'agg_counter_total',
				help: 'Aggregated counter',
				unit: 'requests',
				registers: [reg1],
			});
			c1.inc(2);

			Date.now = jest.fn(() => 1700000020000);
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
					'agg_counter_total 7 st@1700000010',
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
			const h = new Histogram({
				name: 'http.request.duration',
				help: 'HTTP request duration',
				unit: 'seconds',
				buckets: [0.1, 1],
				registers: [reg],
			});
			c.inc(3);
			h.observe(0.25);

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
				expect(body20).toContain('http_requests_total 3 st@1700000000.123');
				expect(body20).toContain(
					'{"http.request.duration"} {count:1,sum:0.25,bucket:[0.1:0,1:1,+Inf:1]} st@1700000000.123',
				);
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
				expect(bodyProm).toContain('http_request_duration_bucket{le="0.1"} 0');
				expect(bodyProm).toContain('http_request_duration_bucket{le="1"} 1');
			} finally {
				await new Promise(resolve => server.close(resolve));
			}
		});
	});
});

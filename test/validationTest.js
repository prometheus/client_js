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
	validateMetricName,
	validateLegacyMetricName,
	validateLabelName,
	validateLegacyLabelName,
	validateLabel,
	escapeName,
	escapeLabelName,
} = require('../lib/validation');

describe('validation', () => {
	describe('validateLabel', () => {
		it('should not throw on known label', () => {
			expect(() => {
				validateLabel(['exists'], { exists: null });
			}).not.toThrow();
		});

		it('should throw on unknown label', () => {
			expect(() => {
				validateLabel(['exists'], { somethingElse: null });
			}).toThrow(
				'Added label "somethingElse" is not included in initial labelset: [ \'exists\' ]',
			);
		});
	});

	describe('validateMetricName and validateLegacyMetricName', () => {
		it('validates UTF-8 metric names and rejects newlines, empty, and lone surrogates', () => {
			expect(validateMetricName('http_requests_total')).toBe(true);
			expect(validateMetricName('http.server.duration')).toBe(true);
			expect(validateMetricName('metric with spaces & 🚀')).toBe(true);
			expect(validateMetricName('')).toBe(false);
			expect(validateMetricName('bad\nname')).toBe(false);
			expect(validateMetricName('bad\rname')).toBe(false);
			expect(validateMetricName('bad\uD800name')).toBe(false);
			expect(validateMetricName(null)).toBe(false);
		});

		it('validates legacy ASCII metric names', () => {
			expect(validateLegacyMetricName('http_requests_total:rate5m')).toBe(true);
			expect(validateLegacyMetricName('http.server.duration')).toBe(false);
			expect(validateLegacyMetricName('1leading_digit')).toBe(false);
			expect(validateLegacyMetricName('')).toBe(false);
		});
	});

	describe('validateLabelName and validateLegacyLabelName', () => {
		it('validates UTF-8 label names and rejects newlines, empty, and lone surrogates', () => {
			expect(
				validateLabelName(['method', 'http.status_code', 'label 🚀']),
			).toEqual([]);
			expect(validateLabelName(['valid', '', 'bad\nlabel'])).toEqual([
				'',
				'bad\nlabel',
			]);
		});

		it('validates legacy ASCII label names', () => {
			expect(validateLegacyLabelName(['method', 'status_code'])).toEqual([]);
			expect(
				validateLegacyLabelName(['http.status_code', 'colon:label']),
			).toEqual(['http.status_code', 'colon:label']);
		});
	});

	describe('escapeName and escapeLabelName', () => {
		it('supports allow-utf-8, underscores, dots, and values schemes', () => {
			expect(escapeName('http.requests_total', 'allow-utf-8')).toBe(
				'http.requests_total',
			);
			expect(escapeName('http.requests_total', 'underscores')).toBe(
				'http_requests_total',
			);
			expect(escapeName('http.requests_total', 'dots')).toBe(
				'http_dot_requests__total',
			);
			expect(escapeName('http_requests_total', 'dots')).toBe(
				'http__requests__total',
			);
			expect(escapeName('no:escaping_required', 'dots')).toBe(
				'no:escaping__required',
			);
			expect(escapeName('http.requests_total', 'values')).toBe(
				'U__http_2e_requests__total',
			);
			expect(escapeName('label with 😱', 'values')).toBe(
				'U__label_20_with_20__1f631_',
			);
			expect(escapeName('valid_legacy:name', 'underscores')).toBe(
				'valid_legacy:name',
			);
			expect(escapeLabelName('colon:in:label', 'underscores')).toBe(
				'colon_in_label',
			);
			expect(escapeName('', 'underscores')).toBe('');
			expect(() => escapeName('foo', 'invalid-scheme')).toThrow(
				'Invalid escaping scheme: invalid-scheme',
			);
		});
	});

	describe('UTF-8 exposition and escaping schemes in Registry', () => {
		const { Registry, Gauge, Histogram } = require('../index');

		it('quotes non-legacy UTF-8 names under allow-utf-8 and escapes them under underscores, dots, and values', async () => {
			const reg = new Registry(
				`${Registry.PROMETHEUS_CONTENT_TYPE}; escaping=allow-utf-8`,
			);
			const g = new Gauge({
				name: 'http.server.duration',
				help: 'Server duration',
				labelNames: ['http.method', 'legacy_label'],
				registers: [reg],
			});
			g.set({ 'http.method': 'GET', legacy_label: 'ok' }, 1.5);

			const utf8Out = await reg.metrics();
			expect(utf8Out).toBe(
				[
					'# HELP "http.server.duration" Server duration',
					'# TYPE "http.server.duration" gauge',
					'{"http.server.duration","http.method"="GET",legacy_label="ok"} 1.5',
					'',
				].join('\n'),
			);

			const underscoresOut = await reg.metrics({ escaping: 'underscores' });
			expect(underscoresOut).toBe(
				[
					'# HELP http_server_duration Server duration',
					'# TYPE http_server_duration gauge',
					'http_server_duration{http_method="GET",legacy_label="ok"} 1.5',
					'',
				].join('\n'),
			);

			const dotsOut = await reg.metrics({ escaping: 'dots' });
			expect(dotsOut).toBe(
				[
					'# HELP http_dot_server_dot_duration Server duration',
					'# TYPE http_dot_server_dot_duration gauge',
					'http_dot_server_dot_duration{http_dot_method="GET",legacy__label="ok"} 1.5',
					'',
				].join('\n'),
			);

			const valuesOut = await reg.metrics({ escaping: 'values' });
			expect(valuesOut).toBe(
				[
					'# HELP U__http_2e_server_2e_duration Server duration',
					'# TYPE U__http_2e_server_2e_duration gauge',
					'U__http_2e_server_2e_duration{U__http_2e_method="GET",legacy_label="ok"} 1.5',
					'',
				].join('\n'),
			);
		});

		it('rejects exemplars on Prometheus registries with escaping param, avoids double-escaping invalid custom names, and preserves counter.name across format switches', async () => {
			const { Counter } = require('../index');
			const promUtf8Reg = new Registry(
				`${Registry.PROMETHEUS_CONTENT_TYPE}; escaping=allow-utf-8`,
			);
			expect(
				() =>
					new Counter({
						name: 'test_exemplar_counter_total',
						help: 'help',
						enableExemplars: true,
						registers: [promUtf8Reg],
					}),
			).toThrow('Exemplars are supported only on OpenMetrics registries');

			promUtf8Reg.registerMetric({
				name: 'bad\nname',
				async get() {
					return {
						name: 'bad\nname',
						help: 'bad help',
						type: 'gauge',
						values: [{ value: 1, labels: { 'bad\nlabel': 'v' } }],
					};
				},
			});
			const customOut = await promUtf8Reg.metrics();
			expect(customOut).toBe(
				[
					'# HELP bad\\nname bad help',
					'# TYPE bad\\nname gauge',
					'bad\\nname{bad\\nlabel="v"} 1',
					'',
				].join('\n'),
			);

			const omReg = new Registry(Registry.OPENMETRICS_CONTENT_TYPE);
			const c = new Counter({
				name: 'switch_counter_total',
				help: 'Switch counter',
				registers: [omReg],
			});
			c.inc(4);
			await omReg.metrics();
			expect(c.name).toBe('switch_counter_total');
			omReg.setContentType(Registry.PROMETHEUS_CONTENT_TYPE);
			expect(await omReg.metrics()).toContain('switch_counter_total 4');
		});

		it('preserves literal _bucket, _sum, and _count suffixes on histograms under dots and values escaping', async () => {
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
		});
	});
});

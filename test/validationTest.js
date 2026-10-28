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
	validateUnit,
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

	describe('validateUnit', () => {
		it('validates unit strings', () => {
			expect(validateUnit('seconds')).toBe(true);
			expect(validateUnit('')).toBe(true);
			expect(validateUnit('bad\nunit')).toBe(false);
			expect(validateUnit('bad\runit')).toBe(false);
			expect(validateUnit(123)).toBe(false);
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
				'http_requests_total',
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
});

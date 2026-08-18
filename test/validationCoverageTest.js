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

describe('validation coverage', () => {
	const { validateMetricName, validateLabelName, validateLabel } = require('../lib/validation');

	describe('validateMetricName', () => {
		it('should accept valid Prometheus metric names', () => {
			expect(validateMetricName('http_requests_total')).toBe(true);
			expect(validateMetricName(':custom_metric:')).toBe(true);
			expect(validateMetricName('process_cpu_seconds_total')).toBe(true);
		});

		it('should reject invalid metric names starting with numbers or containing invalid characters', () => {
			expect(validateMetricName('123_invalid')).toBe(false);
			expect(validateMetricName('invalid-metric-name')).toBe(false);
			expect(validateMetricName('invalid metric')).toBe(false);
		});
	});

	describe('validateLabelName', () => {
		it('should return empty array when all label names are valid', () => {
			expect(validateLabelName(['method', 'status_code', 'handler'])).toEqual([]);
		});

		it('should return list of invalid label names when invalid characters are used', () => {
			const result = validateLabelName(['valid_name', 'invalid-label', '123_start_with_digit']);
			expect(result).toEqual(['invalid-label', '123_start_with_digit']);
		});

		it('should handle default empty parameter', () => {
			expect(validateLabelName()).toEqual([]);
		});
	});

	describe('validateLabel', () => {
		it('should allow valid subsets of configured labels', () => {
			expect(() => {
				validateLabel(['method', 'status'], { method: 'GET' });
			}).not.toThrow();
		});

		it('should throw descriptive error when unknown label is provided', () => {
			expect(() => {
				validateLabel(['method'], { route: '/api/v1' });
			}).toThrow(/Added label "route" is not included in initial labelset/);
		});
	});
});

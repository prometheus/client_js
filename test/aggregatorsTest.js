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

describe('aggregators', () => {
	const aggregators = require('../index').aggregators;
	const metrics = [
		{
			help: 'metric_help',
			name: 'metric_name',
			type: 'does not matter',
			values: [
				{ labels: [], value: 1 },
				{ labels: ['label1'], value: 2 },
			],
		},
		{
			help: 'metric_help',
			name: 'metric_name',
			type: 'does not matter',
			values: [
				{ labels: [], value: 3 },
				{ labels: ['label1'], value: 4 },
			],
		},
	];

	describe('sum', () => {
		it('properly sums values', () => {
			const result = aggregators.sum(metrics);
			expect(result.help).toBe('metric_help');
			expect(result.name).toBe('metric_name');
			expect(result.type).toBe('does not matter');
			expect(result.values).toEqual([
				{ value: 4, labels: [] },
				{ value: 6, labels: ['label1'] },
			]);
		});
	});

	describe('first', () => {
		it('takes the first value', () => {
			const result = aggregators.first(metrics);
			expect(result.help).toBe('metric_help');
			expect(result.name).toBe('metric_name');
			expect(result.type).toBe('does not matter');
			expect(result.values).toEqual([
				{ value: 1, labels: [] },
				{ value: 2, labels: ['label1'] },
			]);
		});
	});

	describe('omit', () => {
		it('returns undefined', () => {
			const result = aggregators.omit(metrics);
			expect(result).toBeUndefined();
		});
	});

	describe('average', () => {
		it('properly averages values', () => {
			const result = aggregators.average(metrics);
			expect(result.help).toBe('metric_help');
			expect(result.name).toBe('metric_name');
			expect(result.type).toBe('does not matter');
			expect(result.values).toEqual([
				{ value: 2, labels: [] },
				{ value: 3, labels: ['label1'] },
			]);
		});
	});

	describe('min', () => {
		it('takes the minimum of the values', () => {
			const result = aggregators.min(metrics);
			expect(result.help).toBe('metric_help');
			expect(result.name).toBe('metric_name');
			expect(result.type).toBe('does not matter');
			expect(result.values).toEqual([
				{ value: 1, labels: [] },
				{ value: 2, labels: ['label1'] },
			]);
		});
	});

	describe('max', () => {
		it('takes the maximum of the values', () => {
			const result = aggregators.max(metrics);
			expect(result.help).toBe('metric_help');
			expect(result.name).toBe('metric_name');
			expect(result.type).toBe('does not matter');
			expect(result.values).toEqual([
				{ value: 3, labels: [] },
				{ value: 4, labels: ['label1'] },
			]);
		});
	});

	describe('(common)', () => {
		it('separates metrics by metricName', () => {
			const metrics2 = [
				{
					help: 'metric_help',
					name: 'metric_name',
					type: 'does not matter',
					values: [{ labels: [], value: 1, metricName: 'abc' }],
				},
				{
					help: 'metric_help',
					name: 'metric_name',
					type: 'does not matter',
					values: [{ labels: [], value: 3, metricName: 'abc' }],
				},
				{
					help: 'metric_help',
					name: 'metric_name',
					type: 'does not matter',
					values: [{ labels: [], value: 5, metricName: 'def' }],
				},
			];
			const result = aggregators.sum(metrics2);
			expect(result.values).toEqual([
				{ value: 4, labels: [], metricName: 'abc' },
				{ value: 5, labels: [], metricName: 'def' },
			]);
		});
	});
});

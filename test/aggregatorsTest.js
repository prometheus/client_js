'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');

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
			assert.strictEqual(result.help, 'metric_help');
			assert.strictEqual(result.name, 'metric_name');
			assert.strictEqual(result.type, 'does not matter');
			assert.deepStrictEqual(result.values, [
				{ value: 4, labels: [] },
				{ value: 6, labels: ['label1'] },
			]);
		});
	});

	describe('first', () => {
		it('takes the first value', () => {
			const result = aggregators.first(metrics);
			assert.strictEqual(result.help, 'metric_help');
			assert.strictEqual(result.name, 'metric_name');
			assert.strictEqual(result.type, 'does not matter');
			assert.deepStrictEqual(result.values, [
				{ value: 1, labels: [] },
				{ value: 2, labels: ['label1'] },
			]);
		});
	});

	describe('omit', () => {
		it('returns undefined', () => {
			const result = aggregators.omit(metrics);
			assert.strictEqual(result, undefined);
		});
	});

	describe('average', () => {
		it('properly averages values', () => {
			const result = aggregators.average(metrics);
			assert.strictEqual(result.help, 'metric_help');
			assert.strictEqual(result.name, 'metric_name');
			assert.strictEqual(result.type, 'does not matter');
			assert.deepStrictEqual(result.values, [
				{ value: 2, labels: [] },
				{ value: 3, labels: ['label1'] },
			]);
		});
	});

	describe('min', () => {
		it('takes the minimum of the values', () => {
			const result = aggregators.min(metrics);
			assert.strictEqual(result.help, 'metric_help');
			assert.strictEqual(result.name, 'metric_name');
			assert.strictEqual(result.type, 'does not matter');
			assert.deepStrictEqual(result.values, [
				{ value: 1, labels: [] },
				{ value: 2, labels: ['label1'] },
			]);
		});
	});

	describe('max', () => {
		it('takes the maximum of the values', () => {
			const result = aggregators.max(metrics);
			assert.strictEqual(result.help, 'metric_help');
			assert.strictEqual(result.name, 'metric_name');
			assert.strictEqual(result.type, 'does not matter');
			assert.deepStrictEqual(result.values, [
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
			assert.deepStrictEqual(result.values, [
				{ value: 4, labels: [], metricName: 'abc' },
				{ value: 5, labels: [], metricName: 'def' },
			]);
		});
	});
});

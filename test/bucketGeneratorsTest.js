'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');

describe('bucketGenerators', () => {
	const linearBuckets = require('../index').linearBuckets;
	const exponentialBuckets = require('../index').exponentialBuckets;

	let result;
	describe('linear buckets', () => {
		beforeEach(() => {
			result = linearBuckets(0, 50, 10);
		});

		it('should start on 0', () => {
			assert.strictEqual(result[0], 0);
		});
		it('should return 10 buckets', () => {
			assert.strictEqual(result.length, 10);
		});
		it('should have width 50 between buckets', () => {
			assert.strictEqual(result[1] - result[0], 50);
			assert.strictEqual(result[9] - result[8], 50);
			assert.strictEqual(result[4] - result[3], 50);
		});
		it('should not allow negative count', () => {
			const fn = function () {
				linearBuckets(2, 1, 0);
			};
			assert.throws(fn, Error);
		});

		it('should not propagate rounding errors', () => {
			result = linearBuckets(0.1, 0.1, 10);
			assert.strictEqual(result[9], 1);
		});
	});

	describe('exponential buckets', () => {
		beforeEach(() => {
			result = exponentialBuckets(1, 2, 5);
		});

		it('should start at start value', () => {
			assert.strictEqual(result[0], 1);
		});
		it('should return 5 items', () => {
			assert.strictEqual(result.length, 5);
		});
		it('should increment with a factor of 2', () => {
			assert.strictEqual(result[1] / result[0], 2);
			assert.strictEqual(result[3] / result[2], 2);
		});

		it('should not allow factor of equal or less than 1', () => {
			const fn = function () {
				exponentialBuckets(1, 1, 5);
			};
			assert.throws(fn, Error);
		});
		it('should not allow negative start', () => {
			const fn = function () {
				exponentialBuckets(0, 1, 5);
			};
			assert.throws(fn, Error);
		});
		it('should not allow negative count', () => {
			const fn = function () {
				exponentialBuckets(2, 10, 0);
			};
			assert.throws(fn, Error);
		});
	});
});

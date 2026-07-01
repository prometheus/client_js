'use strict';

describe('bucketGenerators', () => {
	const linearBuckets = require('../index').linearBuckets;
	const exponentialBuckets = require('../index').exponentialBuckets;

	let result;
	describe('linear buckets', () => {
		beforeEach(() => {
			result = linearBuckets(0, 50, 10);
		});

		it('should start on 0', () => {
			expect(result[0]).toEqual(0);
		});
		it('should return 10 buckets', () => {
			expect(result).toHaveLength(10);
		});
		it('should have width 50 between buckets', () => {
			expect(result[1] - result[0]).toEqual(50);
			expect(result[9] - result[8]).toEqual(50);
			expect(result[4] - result[3]).toEqual(50);
		});
		it('should not allow negative count', () => {
			const fn = function () {
				linearBuckets(2, 1, 0);
			};
			expect(fn).toThrow(Error);
		});

		it('should not propagate rounding errors', () => {
			result = linearBuckets(0.1, 0.1, 10);
			expect(result[9]).toEqual(1);
		});
	});

	describe('exponential buckets', () => {
		beforeEach(() => {
			result = exponentialBuckets(1, 2, 5);
		});

		it('should start at start value', () => {
			expect(result[0]).toEqual(1);
		});
		it('should return 5 items', () => {
			expect(result).toHaveLength(5);
		});
		it('should increment with a factor of 2', () => {
			expect(result[1] / result[0]).toEqual(2);
			expect(result[3] / result[2]).toEqual(2);
		});

		it('should not allow factor of equal or less than 1', () => {
			const fn = function () {
				exponentialBuckets(1, 1, 5);
			};
			expect(fn).toThrow(Error);
		});
		it('should not allow negative start', () => {
			const fn = function () {
				exponentialBuckets(0, 1, 5);
			};
			expect(fn).toThrow(Error);
		});
		it('should not allow negative count', () => {
			const fn = function () {
				exponentialBuckets(2, 10, 0);
			};
			expect(fn).toThrow(Error);
		});
	});
});

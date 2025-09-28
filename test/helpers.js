'use strict';

const { describe } = require('node:test');
const assert = require('node:assert');

/*
 * Helper function to implement describe.each functionality
 * Similar to Jest's describe.each, used extensively in the test suite
 */
function describeEach(cases) {
	return function (titleTemplate, fn) {
		cases.forEach(testCase => {
			const title = titleTemplate.replace(/%s/g, testCase[0]);
			describe(title, () => {
				fn(...testCase);
			});
		});
	};
}

/*
 * Enhanced assertion helpers that match Jest patterns
 */
const expect = {
	/*
	 * Strict equality check
	 */
	toEqual: (actual, expected) => {
		if (typeof expected === 'object' && expected !== null) {
			assert.deepStrictEqual(actual, expected);
		} else {
			assert.strictEqual(actual, expected);
		}
	},

	/*
	 * Length assertion
	 */
	toHaveLength: (actual, expectedLength) => {
		assert.strictEqual(actual.length, expectedLength);
	},

	/*
	 * Truthiness check
	 */
	toBeTruthy: actual => {
		assert.ok(actual);
	},

	/*
	 * Falsiness check
	 */
	toBeFalsy: actual => {
		assert.ok(!actual);
	},

	/*
	 * Function throw assertion
	 */
	toThrow: (fn, expectedError) => {
		if (expectedError) {
			assert.throws(fn, expectedError);
		} else {
			assert.throws(fn);
		}
	},

	/*
	 * Error message assertion (replaces toThrowErrorMatchingSnapshot)
	 */
	toThrowWithMessage: (fn, expectedMessage) => {
		try {
			fn();
			assert.fail('Expected function to throw');
		} catch (error) {
			assert.strictEqual(error.message, expectedMessage);
		}
	},

	/*
	 * General expectation wrapper
	 */
	expect: actual => {
		return {
			toEqual: expected => expect.toEqual(actual, expected),
			toHaveLength: length => expect.toHaveLength(actual, length),
			toBeTruthy: () => expect.toBeTruthy(actual),
			toBeFalsy: () => expect.toBeFalsy(actual),
			toThrow: error => expect.toThrow(actual, error),
			toThrowWithMessage: message => expect.toThrowWithMessage(actual, message),
		};
	},
};

/*
 * Timer mock utilities using @sinonjs/fake-timers
 */
const FakeTimers = require('@sinonjs/fake-timers');

let clock = null;

const timers = {
	useFakeTimers: (config = {}) => {
		if (clock) {
			clock.uninstall();
		}
		const defaultConfig = { toFake: ['Date', 'hrtime'] };
		clock = FakeTimers.install({ ...defaultConfig, ...config });
		return clock;
	},

	useRealTimers: () => {
		if (clock) {
			clock.uninstall();
			clock = null;
		}
	},

	advanceTimersByTime: ms => {
		if (clock) {
			clock.tick(ms);
		}
	},

	setSystemTime: time => {
		if (clock) {
			clock.setSystemTime(time);
		}
	},

	getClock: () => clock,
};

/*
 * Simple wait function for async tests
 */
function wait(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
	describeEach,
	expect: expect.expect,
	timers,
	wait,
};

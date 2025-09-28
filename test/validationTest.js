'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');

describe('validation', () => {
	describe('validateLabel', () => {
		const validateLabel = require('../lib/validation').validateLabel;

		it('should not throw on known label', () => {
			// Should not throw
			validateLabel(['exists'], { exists: null });
		});

		it('should throw on unknown label', () => {
			assert.throws(() => {
				validateLabel(['exists'], { somethingElse: null });
			}, /Added label "somethingElse" is not included in initial labelset/);
		});
	});
});

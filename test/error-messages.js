'use strict';

/**
 * Error messages extracted from Jest snapshots for use in node:test assertions
 */
module.exports = {
	// Counter errors
	COUNTER_DECREASE_ERROR: 'It is not possible to decrease a counter',
	INVALID_VALUE_NUMBER: value => `Value is not a valid number: ${value}`,
	INVALID_LABEL_ARGUMENTS: (
		actualCount,
		actualLabels,
		expectedCount,
		expectedLabels,
	) =>
		`Invalid number of arguments (${actualCount}): "${actualLabels}" for label names (${expectedCount}): "${expectedLabels}".`,

	// Histogram errors
	RESERVED_LABEL_LE: 'le is a reserved label keyword',

	// Common error patterns
	INVALID_NUMBER: value => `Value is not a valid number: ${value}`,
	INVALID_LABEL_SET: label =>
		`Added label "${label}" is not included in initial labelset: [ 'foo' ]`,
};

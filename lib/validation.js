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

const util = require('util');

// Legacy Prometheus / OpenMetrics 1.0 identifier patterns:
// https://prometheus.io/docs/concepts/data_model/#metric-names-and-labels
const metricRegexp = /^[a-zA-Z_:][a-zA-Z0-9_:]*$/;
const labelRegexp = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const loneSurrogateRegexp =
	/(?:[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF])/;

const ALLOW_UTF8 = 'allow-utf-8';
const ESCAPE_UNDERSCORES = 'underscores';
const ESCAPE_DOTS = 'dots';
const ESCAPE_VALUES = 'values';
const ESCAPING_SCHEMES = [
	ALLOW_UTF8,
	ESCAPE_UNDERSCORES,
	ESCAPE_DOTS,
	ESCAPE_VALUES,
];

function hasInvalidUTF8OrNewline(str) {
	return (
		str.includes('\n') || str.includes('\r') || loneSurrogateRegexp.test(str)
	);
}

exports.ALLOW_UTF8 = ALLOW_UTF8;
exports.ESCAPE_UNDERSCORES = ESCAPE_UNDERSCORES;
exports.ESCAPE_DOTS = ESCAPE_DOTS;
exports.ESCAPE_VALUES = ESCAPE_VALUES;
exports.ESCAPING_SCHEMES = ESCAPING_SCHEMES;

exports.validateMetricName = function validateMetricName(name) {
	return (
		typeof name === 'string' &&
		name.length > 0 &&
		!hasInvalidUTF8OrNewline(name)
	);
};

exports.validateLegacyMetricName = function validateLegacyMetricName(name) {
	return typeof name === 'string' && metricRegexp.test(name);
};

exports.isValidLabelName = function isValidLabelName(name) {
	return (
		typeof name === 'string' &&
		name.length > 0 &&
		!hasInvalidUTF8OrNewline(name)
	);
};

exports.isValidLegacyLabelName = function isValidLegacyLabelName(name) {
	return typeof name === 'string' && labelRegexp.test(name);
};

exports.validateLabelName = function validateLabelName(names = []) {
	return names.filter(name => !exports.isValidLabelName(name));
};

exports.validateLegacyLabelName = function validateLegacyLabelName(names = []) {
	return names.filter(name => !exports.isValidLegacyLabelName(name));
};

exports.validateUnit = function validateUnit(unit) {
	return typeof unit === 'string' && !hasInvalidUTF8OrNewline(unit);
};

function isLegacyChar(codePoint, index, isLabel) {
	const isAlpha =
		(codePoint >= 0x61 && codePoint <= 0x7a) ||
		(codePoint >= 0x41 && codePoint <= 0x5a);
	const isDigit = codePoint >= 0x30 && codePoint <= 0x39;
	if (isAlpha || codePoint === 0x5f) {
		return true;
	}
	if (!isLabel && codePoint === 0x3a) {
		return true;
	}
	if (index > 0 && isDigit) {
		return true;
	}
	return false;
}

/**
 * Escapes a metric or label name according to the requested escaping scheme.
 * Matches `model.EscapeName` from `github.com/prometheus/common/model`.
 *
 * @param {string} name
 * @param {string} [scheme]
 * @param {boolean} [isLabel]
 * @returns {string}
 */
exports.escapeName = function escapeName(
	name,
	scheme = ESCAPE_UNDERSCORES,
	isLabel = false,
) {
	if (typeof name !== 'string' || name.length === 0) {
		return name;
	}

	if (scheme === ALLOW_UTF8) {
		return name;
	}

	const isValidLegacy = isLabel
		? exports.isValidLegacyLabelName(name)
		: exports.validateLegacyMetricName(name);

	switch (scheme) {
		case ESCAPE_UNDERSCORES: {
			if (isValidLegacy) {
				return name;
			}
			let escaped = '';
			let i = 0;
			for (const char of name) {
				const cp = char.codePointAt(0);
				escaped += isLegacyChar(cp, i, isLabel) ? char : '_';
				i++;
			}
			return escaped;
		}
		case ESCAPE_DOTS: {
			if (isValidLegacy) {
				return name;
			}
			let escaped = '';
			let i = 0;
			for (const char of name) {
				const cp = char.codePointAt(0);
				if (char === '_') {
					escaped += '__';
				} else if (char === '.') {
					escaped += '_dot_';
				} else if (isLegacyChar(cp, i, isLabel)) {
					escaped += char;
				} else {
					escaped += '__';
				}
				i++;
			}
			return escaped;
		}
		case ESCAPE_VALUES: {
			if (isValidLegacy) {
				return name;
			}
			let escaped = 'U__';
			let i = 0;
			for (const char of name) {
				const cp = char.codePointAt(0);
				if (char === '_') {
					escaped += '__';
				} else if (isLegacyChar(cp, i, isLabel)) {
					escaped += char;
				} else if (cp >= 0xd800 && cp <= 0xdfff) {
					escaped += '_FFFD_';
				} else {
					escaped += `_${cp.toString(16)}_`;
				}
				i++;
			}
			return escaped;
		}
		default:
			throw new Error(`Invalid escaping scheme: ${scheme}`);
	}
};

exports.escapeLabelName = function escapeLabelName(
	name,
	scheme = ESCAPE_UNDERSCORES,
) {
	return exports.escapeName(name, scheme, true);
};

exports.validateLabel = function validateLabel(savedLabels, labels) {
	for (const label in labels) {
		if (!savedLabels.includes(label)) {
			throw new Error(
				`Added label "${label}" is not included in initial labelset: ${util.inspect(
					savedLabels,
				)}`,
			);
		}
	}
};

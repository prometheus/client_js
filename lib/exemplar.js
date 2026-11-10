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

const { validateLabelName } = require('./validation');

const MAX_EXEMPLAR_LABEL_LENGTH = 2048;
const OM1_MAX_EXEMPLAR_LABEL_LENGTH = 128;

/**
 * Class representing an OpenMetrics exemplar.
 *
 * @property {object} labelSet
 * @property {number} value
 * @property {number} [timestamp]
 * */
class Exemplar {
	constructor(labelSet = {}, value = null) {
		this.labelSet = labelSet;
		this.value = value;
	}

	static get MAX_EXEMPLAR_LABEL_LENGTH() {
		return MAX_EXEMPLAR_LABEL_LENGTH;
	}

	static get OM1_MAX_EXEMPLAR_LABEL_LENGTH() {
		return OM1_MAX_EXEMPLAR_LABEL_LENGTH;
	}

	static countExemplarRunes(labelSet) {
		let total = 0;
		for (const [labelName, labelValue] of Object.entries(labelSet)) {
			total += [...String(labelName)].length + [...String(labelValue)].length;
		}
		return total;
	}

	/**
	 * Validation for the label set format.
	 * Defaults to 128 UTF-8 code points for OpenMetrics 1.0 compatibility;
	 * OpenMetrics 2.0 registries allow up to 2048 UTF-8 code points.
	 *
	 * @param {object} labelSet - Exemplar labels.
	 * @param {number} [maxRunes] - Maximum allowed UTF-8 code points.
	 * @throws {RangeError|Error}
	 * @returns {void}
	 */
	validateExemplarLabelSet(labelSet, maxRunes = OM1_MAX_EXEMPLAR_LABEL_LENGTH) {
		const invalidLabelNames = validateLabelName(Object.keys(labelSet));
		if (invalidLabelNames.length > 0) {
			throw new Error(
				`At least one exemplar label name is invalid: ${invalidLabelNames.join(',')}`,
			);
		}
		if (Exemplar.countExemplarRunes(labelSet) > maxRunes) {
			throw new RangeError(
				`Label set size must be smaller than ${maxRunes} UTF-8 chars`,
			);
		}
	}

	/**
	 * Truncates an exemplar label set to fit within `maxRunes` UTF-8 code points
	 * for OpenMetrics 1.0 exposition, prioritizing `trace_id` and `span_id`.
	 * Returns `null` if no labels fit (or if the exemplar label set is empty).
	 *
	 * @param {object} labelSet
	 * @param {number} [maxRunes]
	 * @returns {object|null}
	 */
	static truncateExemplarLabelSet(
		labelSet,
		maxRunes = OM1_MAX_EXEMPLAR_LABEL_LENGTH,
	) {
		if (!labelSet || typeof labelSet !== 'object') {
			return null;
		}
		const entries = Object.entries(labelSet);
		if (entries.length === 0) {
			return null;
		}
		if (Exemplar.countExemplarRunes(labelSet) <= maxRunes) {
			return { ...labelSet };
		}

		const priorityKeys = ['trace_id', 'span_id'];
		const prioritized = entries
			.filter(([k]) => priorityKeys.includes(k))
			.sort(([a], [b]) => priorityKeys.indexOf(a) - priorityKeys.indexOf(b));
		const rest = entries.filter(([k]) => !priorityKeys.includes(k));
		const orderedEntries = [...prioritized, ...rest];

		const truncated = {};
		let usedRunes = 0;
		for (const [k, v] of orderedEntries) {
			const pairRunes = [...String(k)].length + [...String(v)].length;
			if (usedRunes + pairRunes <= maxRunes) {
				truncated[k] = v;
				usedRunes += pairRunes;
			}
		}

		return Object.keys(truncated).length > 0 ? truncated : null;
	}
}

module.exports = Exemplar;

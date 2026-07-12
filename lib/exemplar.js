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

	/**
	 * Validation for the label set format.
	 * See
	 * {@link https://github.com/OpenObservability/OpenMetrics/blob/d99b705f611b75fec8f450b05e344e02eea6921d/specification/OpenMetrics.md#exemplars OpenMetrics Docs}
	 * for details.
	 *
	 * @param {object} labelSet - Exemplar labels.
	 * @throws {RangeError}
	 * @returns {void}
	 */
	validateExemplarLabelSet(labelSet) {
		let res = '';
		for (const [labelName, labelValue] of Object.entries(labelSet)) {
			res += `${labelName}${labelValue}`;
		}
		if (res.length > 128) {
			throw new RangeError(
				'Label set size must be smaller than 128 UTF-8 chars',
			);
		}
	}
}

module.exports = Exemplar;

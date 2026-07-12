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

// These are from https://prometheus.io/docs/concepts/data_model/#metric-names-and-labels
const metricRegexp = /^[a-zA-Z_:][a-zA-Z0-9_:]*$/;
const labelRegexp = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

exports.validateMetricName = function (name) {
	return metricRegexp.test(name);
};

exports.validateLabelName = function (names = []) {
	return names.filter(name => !labelRegexp.test(name));
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

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

const Registry = require('./registry');
const { isObject } = require('./util');
const { validateMetricName, validateLabelName } = require('./validation');

/**
 * @abstract
 */
class Metric {
	constructor(config, defaults = {}) {
		if (!isObject(config)) {
			throw new TypeError('constructor expected a config object');
		}
		Object.assign(
			this,
			{
				labelNames: [],
				registers: [Registry.globalRegistry],
				aggregator: 'sum',
				enableExemplars: false,
			},
			defaults,
			config,
		);
		if (!this.registers) {
			// in case config.registers is `undefined`
			this.registers = [Registry.globalRegistry];
		}
		if (!this.help) {
			throw new Error('Missing mandatory help parameter');
		}
		if (!this.name) {
			throw new Error('Missing mandatory name parameter');
		}
		if (!validateMetricName(this.name)) {
			throw new Error(`Invalid metric name: ${this.name}`);
		}
		const invalidLabelNames = validateLabelName(this.labelNames);
		if (invalidLabelNames.length > 0) {
			throw new Error(
				`At least one label name is invalid: ${invalidLabelNames.join(',')}`,
			);
		}

		if (this.collect && typeof this.collect !== 'function') {
			throw new Error('Optional "collect" parameter must be a function');
		}

		if (this.labelNames) {
			this.sortedLabelNames = [...this.labelNames].sort();
		} else {
			this.sortedLabelNames = [];
		}

		// TODO: Bad things happen when you call functions on half-initialized objects, yo
		this.reset();

		for (const register of this.registers) {
			if (
				this.enableExemplars &&
				register.contentType === Registry.PROMETHEUS_CONTENT_TYPE
			) {
				throw new TypeError(
					'Exemplars are supported only on OpenMetrics registries',
				);
			}
			register.registerMetric(this);
		}
	}

	reset() {
		/* abstract */
	}
}

module.exports = { Metric };

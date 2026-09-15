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

const { LabelGrouper, Grouper } = require('./util');
const {
	copyNativeHistogram,
	sumNativeHistograms,
	nativeHistogramKey,
} = require('./nativeHistogram');

/**
 * Returns a new function that applies the `aggregatorFn` to the values.
 * @param {Function} aggregatorFn function to apply to values.
 * @param {Function} [nativeAggregatorFn] function to apply to native histograms.
 * @returns {Function} aggregator function
 */
function AggregatorFactory(aggregatorFn, nativeAggregatorFn) {
	return metrics => {
		if (metrics.length === 0) return;
		// Same-named metrics must agree on whether native histograms are enabled.
		const hasNativeHistograms = metrics[0].nativeHistograms !== undefined;
		if (hasNativeHistograms && !nativeAggregatorFn) {
			throw new TypeError(
				'Native histograms support only sum, first, or omit aggregation',
			);
		}
		const result = {
			help: metrics[0].help,
			name: metrics[0].name,
			type: metrics[0].type,
			values: [],
			aggregator: metrics[0].aggregator,
		};
		// Gather metrics by metricName and labels.
		const byNames = new Map();
		metrics.forEach(metric => {
			metric.values.forEach(value => {
				const name = value.metricName ?? '';
				let group = byNames.get(name);
				if (group === undefined) {
					group = hasNativeHistograms ? new Grouper() : new LabelGrouper();
					byNames.set(name, group);
				}
				if (hasNativeHistograms) {
					group.add(nativeHistogramKey(value.labels), value);
				} else {
					group.add(value);
				}
			});
		});
		// Apply aggregator function to gathered metrics.
		byNames.forEach(group => {
			group.forEach(values => {
				const valObj = {
					value: aggregatorFn(values),
					labels: values[0].labels,
				};

				if (values[0].metricName !== undefined) {
					valObj.metricName = values[0].metricName;
				}
				// NB: Timestamps are omitted.
				result.values.push(valObj);
			});
		});
		if (hasNativeHistograms) {
			const byLabels = new Grouper();
			for (const metric of metrics) {
				for (const histogram of metric.nativeHistograms) {
					byLabels.add(nativeHistogramKey(histogram.labels), histogram);
				}
			}
			result.nativeHistograms = Array.from(
				byLabels.values(),
				nativeAggregatorFn,
			);
		}
		return result;
	};
}
// Export for users to define their own aggregation methods.
exports.AggregatorFactory = AggregatorFactory;

/**
 * Functions that can be used to aggregate metrics from multiple registries.
 */
exports.aggregators = {
	/**
	 * @returns The sum of values.
	 */
	sum: AggregatorFactory(
		v => v.reduce((p, c) => p + c.value, 0),
		sumNativeHistograms,
	),
	/**
	 * @returns The first value.
	 */
	first: AggregatorFactory(
		v => v[0].value,
		v => copyNativeHistogram(v[0]),
	),
	/**
	 * @returns {undefined} Undefined; omits the metric.
	 */
	omit: () => {},
	/**
	 * @returns The arithmetic mean of the values.
	 */
	average: AggregatorFactory(
		v => v.reduce((p, c) => p + c.value, 0) / v.length,
	),
	/**
	 * @returns The minimum of the values.
	 */
	min: AggregatorFactory(v =>
		v.reduce((p, c) => Math.min(p, c.value), Infinity),
	),
	/**
	 * @returns The maximum of the values.
	 */
	max: AggregatorFactory(v =>
		v.reduce((p, c) => Math.max(p, c.value), -Infinity),
	),
};

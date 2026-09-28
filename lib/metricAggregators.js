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
 * @returns {Function} aggregator function
 */
function AggregatorFactory(aggregatorFn) {
	return metrics => {
		if (metrics.length === 0) return;
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
					group = new LabelGrouper();
					byNames.set(name, group);
				}
				group.add(value);
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
		return result;
	};
}
function aggregateNativeHistograms(metrics, method) {
	if (metrics.length === 0) return;
	const byNames = new Map();
	const byLabels = new Grouper();
	for (const metric of metrics) {
		for (const sample of metric.values) {
			const name = sample.metricName ?? '';
			let group = byNames.get(name);
			if (group === undefined) {
				group = new Map();
				byNames.set(name, group);
			}
			const key = nativeHistogramKey(sample.labels);
			const value = group.get(key);
			if (value === undefined) {
				const copy = { value: sample.value, labels: sample.labels };
				if (sample.metricName !== undefined)
					copy.metricName = sample.metricName;
				group.set(key, copy);
			} else if (method === 'sum') {
				value.value += sample.value;
			}
		}
		for (const histogram of metric.nativeHistograms) {
			byLabels.add(nativeHistogramKey(histogram.labels), histogram);
		}
	}
	return {
		help: metrics[0].help,
		name: metrics[0].name,
		type: metrics[0].type,
		aggregator: metrics[0].aggregator,
		values: Array.from(byNames.values()).flatMap(group =>
			Array.from(group.values()),
		),
		nativeHistograms: Array.from(byLabels.values(), histograms =>
			method === 'sum'
				? sumNativeHistograms(histograms)
				: copyNativeHistogram(histograms[0]),
		),
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
	sum: AggregatorFactory(v => v.reduce((p, c) => p + c.value, 0)),
	/**
	 * @returns The first value.
	 */
	first: AggregatorFactory(v => v[0].value),
	/**
	 * @returns The sum of native histograms and their classic samples.
	 */
	sumNative: metrics => aggregateNativeHistograms(metrics, 'sum'),
	/**
	 * @returns The first native histogram and classic sample for each label set.
	 */
	firstNative: metrics => aggregateNativeHistograms(metrics, 'first'),
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

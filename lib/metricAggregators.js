'use strict';

const { LabelGrouper } = require('./util');

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

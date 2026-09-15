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

const { getValueAsString, Grouper } = require('./util');
const { aggregators } = require('./metricAggregators');

class Registry {
	static get PROMETHEUS_CONTENT_TYPE() {
		return 'text/plain; version=0.0.4; charset=utf-8';
	}

	static get OPENMETRICS_CONTENT_TYPE() {
		return 'application/openmetrics-text; version=1.0.0; charset=utf-8';
	}

	static get PROMETHEUS_PROTOBUF_CONTENT_TYPE() {
		return 'application/vnd.google.protobuf; proto=io.prometheus.client.MetricFamily; encoding=delimited';
	}

	constructor(regContentType = Registry.PROMETHEUS_CONTENT_TYPE) {
		this._metrics = new Map();
		this._collectors = [];
		this._defaultLabels = {};
		if (!isSupportedContentType(regContentType)) {
			throw new TypeError(`Content type ${regContentType} is unsupported`);
		}
		this._contentType = regContentType;
	}

	/**
	 * Return all metrics
	 *
	 * @see lib/metricAggregators.js
	 * @param {string} [aggregator] - filter by aggregator type, typically used for sum.
	 * @returns {object[]}
	 */

	getMetricsAsArray(aggregator) {
		const values = this._metrics.values();
		if (aggregator === undefined) {
			return Array.from(values);
		} else {
			return Array.from(
				// metrics without an explicit aggregator default to 'sum'
				values.filter(metric => aggregator === (metric.aggregator ?? 'sum')),
			);
		}
	}

	async getMetricsAsString(metrics) {
		const isOpenMetrics =
			this.contentType === Registry.OPENMETRICS_CONTENT_TYPE;
		const metric =
			typeof metrics.getForPromString === 'function'
				? await metrics.getForPromString()
				: await metrics.get();

		const name = escapeString(
			isOpenMetrics && metric.type === 'counter'
				? standardizeCounterName(metric.name)
				: metric.name,
		);
		const help = `# HELP ${name} ${escapeString(metric.help)}`;
		const type = `# TYPE ${name} ${metric.type}`;
		const values = [help, type];

		let defaultLabelNames = Object.keys(this._defaultLabels);
		if (defaultLabelNames.length === 0) {
			defaultLabelNames = undefined;
		}

		for (const val of metric.values ?? []) {
			const { metricName = name, labels = {} } = val;
			let { sharedLabels } = val;
			const seriesName =
				isOpenMetrics && metric.type === 'counter'
					? `${metricName}_total`
					: metricName;

			// Make a copy before mutating
			const seriesLabels =
				defaultLabelNames === undefined ? labels : { ...labels };
			if (defaultLabelNames !== undefined) {
				for (const labelName of defaultLabelNames) {
					seriesLabels[labelName] ??= this._defaultLabels[labelName];
					if (
						sharedLabels !== undefined &&
						Object.hasOwn(sharedLabels, labelName) &&
						(sharedLabels[labelName] === null ||
							sharedLabels[labelName] === undefined)
					) {
						sharedLabels = {
							...sharedLabels,
							[labelName]: this._defaultLabels[labelName],
						};
					}
				}
			}

			// We have to flatten these separately to avoid duplicate labels appearing
			// between the base labels and the shared labels
			const labelParts = formatLabels(seriesLabels, sharedLabels);
			if (sharedLabels !== undefined) {
				// A histogram declared without label names still shares an empty
				// object, and appending its flattened form would emit `{le="1",}`
				const flattenedShared = flattenSharedLabels(sharedLabels);
				if (flattenedShared) {
					labelParts.push(flattenedShared);
				}
			}
			const labelsString = labelParts.length ? `{${labelParts.join(',')}}` : '';
			let fullMetricLine = `${seriesName}${labelsString} ${getValueAsString(
				val.value,
			)}`;

			const { exemplar } = val;
			if (exemplar && isOpenMetrics) {
				const formattedExemplars = formatLabels(exemplar.labelSet);
				fullMetricLine += ` # {${formattedExemplars.join(
					',',
				)}} ${getValueAsString(exemplar.value)} ${exemplar.timestamp}`;
			}
			values.push(fullMetricLine);
		}

		return values.join('\n');
	}

	async metrics() {
		const contentType = this.contentType;
		let output;
		if (contentType === Registry.PROMETHEUS_PROTOBUF_CONTENT_TYPE) {
			const { encodeMetricFamily } = require('./protobuf');
			const buffers = await Promise.all(
				this.getMetricsAsArray().map(async metric => {
					const data =
						typeof metric.getForPromString === 'function'
							? await metric.getForPromString()
							: await metric.get();
					return encodeMetricFamily(data, this._defaultLabels);
				}),
			);
			output = Buffer.concat(buffers);
		} else {
			const strings = await Promise.all(
				this.getMetricsAsArray().map(metric => this.getMetricsAsString(metric)),
			);
			output =
				contentType === Registry.OPENMETRICS_CONTENT_TYPE
					? `${strings.join('\n')}\n# EOF\n`
					: `${strings.join('\n\n')}\n`;
		}
		return output;
	}

	registerMetric(metric) {
		const existing = this._metrics.get(metric.name);
		if (existing !== undefined && existing !== metric) {
			throw new Error(
				`A metric with the name ${metric.name} has already been registered.`,
			);
		}

		this._metrics.set(metric.name, metric);
	}

	clear() {
		this._metrics = new Map();
		this._defaultLabels = {};
	}

	/**
	 * Retrieve metrics as Objects fit for JSON formatting.
	 *
	 * @param {string} [aggregator] - filter by aggregator type, typically used for sum.
	 * @returns {Promise<*[]>}
	 */
	async getMetricsAsJSON(aggregator) {
		const metrics = [];
		let defaultLabelNames = Object.keys(this._defaultLabels);
		if (defaultLabelNames.length === 0) {
			defaultLabelNames = undefined;
		}

		const promises = this.getMetricsAsArray(aggregator).map(metric =>
			metric.get(),
		);

		const resolves = await Promise.all(promises);

		for (const item of resolves) {
			if (defaultLabelNames !== undefined) {
				for (const values of [item.values, item.nativeHistograms]) {
					for (const val of values ?? []) {
						// Make a copy before mutating
						val.labels = { ...val.labels };

						for (const labelName of defaultLabelNames) {
							val.labels[labelName] ??= this._defaultLabels[labelName];
						}
					}
				}
			}

			metrics.push(item);
		}

		return metrics;
	}

	removeSingleMetric(name) {
		this._metrics.delete(name);
	}

	getSingleMetricAsString(name) {
		return this.getMetricsAsString(this._metrics.get(name));
	}

	getSingleMetric(name) {
		return this._metrics.get(name);
	}

	setDefaultLabels(labels) {
		this._defaultLabels = labels;
	}

	resetMetrics() {
		for (const metric of this._metrics.values()) {
			metric.reset();
		}
	}

	get contentType() {
		return this._contentType;
	}

	setContentType(metricsContentType) {
		if (isSupportedContentType(metricsContentType)) {
			this._contentType = metricsContentType;
			return this;
		} else {
			throw new Error(`Content type ${metricsContentType} is unsupported`);
		}
	}

	static merge(registers) {
		const regType = registers[0].contentType;
		for (const reg of registers) {
			if (reg.contentType !== regType) {
				throw new Error(
					'Registers can only be merged if they have the same content type',
				);
			}
		}
		const mergedRegistry = new Registry(regType);

		const metricsToMerge = registers.reduce(
			(acc, reg) => acc.concat(reg.getMetricsAsArray()),
			[],
		);

		metricsToMerge.forEach(mergedRegistry.registerMetric, mergedRegistry);
		return mergedRegistry;
	}

	/**
	 * Creates a new Registry instance from an array of metrics that were
	 * created by `registry.getMetricsAsJSON()`. Metrics are aggregated using
	 * the method specified by their `aggregator` property, or by summation if
	 * `aggregator` is undefined.
	 * @param {Array} metricsArr Array of metrics, each of which created by
	 *   `registry.getMetricsAsJSON()`.
	 * @param {string} registryType content type of the new registry. Defaults
	 * to PROMETHEUS_CONTENT_TYPE.
	 * @returns {Registry} aggregated registry.
	 */
	static aggregate(
		metricsArr,
		registryType = Registry.PROMETHEUS_CONTENT_TYPE,
	) {
		const aggregatedRegistry = new Registry();
		const metricsByName = new Grouper();

		aggregatedRegistry.setContentType(registryType);

		// Gather by name
		metricsArr.forEach(metrics => {
			metrics.forEach(metric => {
				metricsByName.add(metric.name, metric);
			});
		});

		// Aggregate gathered metrics.
		metricsByName.forEach(metrics => {
			// Metrics without an explicit aggregator are summed (see the
			// `aggregator` config docs and the worker/cluster shutdown path,
			// which relies on that default).
			const aggregatorName = metrics[0].aggregator ?? 'sum';
			const aggregatorFn = aggregators[aggregatorName];
			if (typeof aggregatorFn !== 'function') {
				throw new Error(`'${aggregatorName}' is not a defined aggregator.`);
			}
			const aggregatedMetric = aggregatorFn(metrics);
			// NB: The 'omit' aggregator returns undefined.
			if (aggregatedMetric !== undefined) {
				const aggregatedMetricWrapper = {
					get: () => aggregatedMetric,
					...aggregatedMetric,
				};
				aggregatedRegistry.registerMetric(aggregatedMetricWrapper);
			}
		});

		return aggregatedRegistry;
	}
}

function isSupportedContentType(contentType) {
	return [
		Registry.PROMETHEUS_CONTENT_TYPE,
		Registry.OPENMETRICS_CONTENT_TYPE,
		Registry.PROMETHEUS_PROTOBUF_CONTENT_TYPE,
	].includes(contentType);
}

function formatLabels(labels, exclude) {
	const formatted = [];
	for (const [name, value] of Object.entries(labels)) {
		if (!exclude || !Object.hasOwn(exclude, name)) {
			formatted.push(`${name}="${escapeLabelValue(value)}"`);
		}
	}
	return formatted;
}

const sharedLabelCache = new WeakMap();
function flattenSharedLabels(labels) {
	const cached = sharedLabelCache.get(labels);
	if (cached !== undefined) {
		return cached;
	}

	const formattedLabels = formatLabels(labels);
	const flattened = formattedLabels.join(',');
	sharedLabelCache.set(labels, flattened);
	return flattened;
}
function escapeLabelValue(str) {
	if (typeof str !== 'string') {
		return str;
	}
	return escapeString(str).replace(/"/g, '\\"');
}
function escapeString(str) {
	return str.replace(/\\/g, '\\\\').replace(/\n/g, '\\n');
}
function standardizeCounterName(name) {
	return name.replace(/_total$/, '');
}

module.exports = Registry;
module.exports.globalRegistry = new Registry();

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

	constructor(regContentType = Registry.PROMETHEUS_CONTENT_TYPE) {
		this._metrics = new Map();
		this._collectors = [];
		this._defaultLabels = {};
		if (
			regContentType !== Registry.PROMETHEUS_CONTENT_TYPE &&
			regContentType !== Registry.OPENMETRICS_CONTENT_TYPE
		) {
			throw new TypeError(`Content type ${regContentType} is unsupported`);
		}
		this._contentType = regContentType;
	}

	/**
	 * Return all metrics
	 *
	 * @returns {object[]}
	 */

	getMetricsAsArray() {
		return Array.from(this._metrics.values());
	}

	async getMetricsAsString(metrics) {
		const metric =
			typeof metrics.getForPromString === 'function'
				? await metrics.getForPromString()
				: await metrics.get();

		const name = escapeString(metric.name);
		const help = `# HELP ${name} ${escapeString(metric.help)}`;
		const type = `# TYPE ${name} ${metric.type}`;
		const values = [help, type];

		let defaultLabelNames = Object.keys(this._defaultLabels);
		if (defaultLabelNames.length === 0) {
			defaultLabelNames = undefined;
		}

		const isOpenMetrics =
			this.contentType === Registry.OPENMETRICS_CONTENT_TYPE;

		for (const val of metric.values || []) {
			let { metricName = name, labels = {} } = val;
			const { sharedLabels = {} } = val;
			if (isOpenMetrics && metric.type === 'counter') {
				metricName = `${metricName}_total`;
			}

			if (defaultLabelNames !== undefined) {
				// Make a copy before mutating
				labels = { ...labels };

				for (const labelName of defaultLabelNames) {
					labels[labelName] ??= this._defaultLabels[labelName];
				}
			}

			// We have to flatten these separately to avoid duplicate labels appearing
			// between the base labels and the shared labels
			const formattedLabels = formatLabels(labels, sharedLabels);

			const flattenedShared = flattenSharedLabels(sharedLabels);
			const labelParts = [...formattedLabels, flattenedShared].filter(Boolean);
			const labelsString = labelParts.length ? `{${labelParts.join(',')}}` : '';
			let fullMetricLine = `${metricName}${labelsString} ${getValueAsString(
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
		const isOpenMetrics =
			this.contentType === Registry.OPENMETRICS_CONTENT_TYPE;

		const promises = this.getMetricsAsArray().map(metric => {
			if (isOpenMetrics && metric.type === 'counter') {
				metric.name = standardizeCounterName(metric.name);
			}
			return this.getMetricsAsString(metric);
		});

		const resolves = await Promise.all(promises);

		return isOpenMetrics
			? `${resolves.join('\n')}\n# EOF\n`
			: `${resolves.join('\n\n')}\n`;
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

	async getMetricsAsJSON() {
		const metrics = [];
		let defaultLabelNames = Object.keys(this._defaultLabels);
		if (defaultLabelNames.length === 0) {
			defaultLabelNames = undefined;
		}

		const promises = [];

		for (const metric of this.getMetricsAsArray()) {
			promises.push(metric.get());
		}

		const resolves = await Promise.all(promises);

		for (const item of resolves) {
			if (defaultLabelNames !== undefined && item.values !== undefined) {
				for (const val of item.values) {
					// Make a copy before mutating
					val.labels = { ...val.labels };

					for (const labelName of defaultLabelNames) {
						val.labels[labelName] ??= this._defaultLabels[labelName];
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
		if (
			metricsContentType === Registry.OPENMETRICS_CONTENT_TYPE ||
			metricsContentType === Registry.PROMETHEUS_CONTENT_TYPE
		) {
			this._contentType = metricsContentType;
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
			const aggregatorName = metrics[0].aggregator;
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

// Copyright The Prometheus Authors
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

'use strict';

const { getValueAsString, Grouper } = require('./util');
const { aggregators } = require('./metricAggregators');
const {
	ALLOW_UTF8,
	ESCAPE_UNDERSCORES,
	ESCAPING_SCHEMES,
	validateMetricName,
	validateLegacyMetricName,
	isValidLabelName,
	isValidLegacyLabelName,
	escapeName,
	escapeLabelName,
} = require('./validation');

function parseRegistryContentType(ct) {
	if (typeof ct !== 'string') {
		return null;
	}
	const parts = ct.split(';').map(p => p.trim());
	const mediaType = parts[0].toLowerCase();
	const params = {};
	for (let i = 1; i < parts.length; i++) {
		if (!parts[i]) continue;
		const eqIdx = parts[i].indexOf('=');
		if (eqIdx === -1) return null;
		const k = parts[i].slice(0, eqIdx).trim().toLowerCase();
		const v = parts[i]
			.slice(eqIdx + 1)
			.trim()
			.replace(/^"(.*)"$/, '$1');
		params[k] = v;
	}
	if (params.charset !== 'utf-8') {
		return null;
	}
	if (
		params.escaping !== undefined &&
		!ESCAPING_SCHEMES.includes(params.escaping)
	) {
		return null;
	}
	if (mediaType === 'text/plain' && params.version === '0.0.4') {
		return {
			isOpenMetrics: false,
			escaping: params.escaping ?? ESCAPE_UNDERSCORES,
		};
	}
	if (
		mediaType === 'application/openmetrics-text' &&
		params.version === '1.0.0'
	) {
		return {
			isOpenMetrics: true,
			escaping: params.escaping ?? ESCAPE_UNDERSCORES,
		};
	}
	return null;
}

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
		if (!parseRegistryContentType(regContentType)) {
			throw new TypeError(`Content type ${regContentType} is unsupported`);
		}
		this._contentType = regContentType;
	}

	#resolveExpositionOptions(options) {
		const info = parseRegistryContentType(this._contentType);
		let escapingOverride;
		if (options && typeof options === 'object' && options.escaping) {
			if (!ESCAPING_SCHEMES.includes(options.escaping)) {
				throw new Error(`Invalid escaping scheme: ${options.escaping}`);
			}
			escapingOverride = options.escaping;
		}
		return {
			...info,
			escaping: escapingOverride ?? info.escaping,
		};
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

	async getMetricsAsString(metrics, options) {
		const { isOpenMetrics, escaping } = this.#resolveExpositionOptions(options);
		const metric =
			typeof metrics.getForPromString === 'function'
				? await metrics.getForPromString()
				: await metrics.get();

		const rawFamilyName =
			isOpenMetrics && metric.type === 'counter'
				? standardizeCounterName(metric.name)
				: metric.name;
		const isValidFamily = validateMetricName(rawFamilyName);

		const familyName = isValidFamily
			? escapeName(rawFamilyName, escaping, false)
			: escapeString(rawFamilyName);

		const headerMetricName =
			escaping === ALLOW_UTF8 &&
			isValidFamily &&
			!validateLegacyMetricName(rawFamilyName)
				? `"${escapeLabelValue(familyName)}"`
				: familyName;

		const help = `# HELP ${headerMetricName} ${escapeString(metric.help)}`;
		const type = `# TYPE ${headerMetricName} ${metric.type}`;
		const values = [help, type];

		let defaultLabelNames = Object.keys(this._defaultLabels);
		if (defaultLabelNames.length === 0) {
			defaultLabelNames = undefined;
		}

		for (const val of metric.values ?? []) {
			let seriesName;
			let isValidSeries = isValidFamily;
			if (
				(metric.type === 'histogram' || metric.type === 'summary') &&
				val.metricName !== undefined &&
				val.metricName.startsWith(`${metric.name}_`)
			) {
				const suffix = val.metricName.slice(metric.name.length);
				seriesName = `${familyName}${suffix}`;
			} else if (val.metricName === undefined) {
				seriesName =
					isOpenMetrics && metric.type === 'counter'
						? `${familyName}_total`
						: familyName;
			} else {
				const rawValMetricName =
					isOpenMetrics && metric.type === 'counter'
						? standardizeCounterName(val.metricName)
						: val.metricName;
				isValidSeries = validateMetricName(rawValMetricName);
				const escapedValMetricName = isValidSeries
					? escapeName(rawValMetricName, escaping, false)
					: escapeString(rawValMetricName);

				seriesName =
					isOpenMetrics && metric.type === 'counter'
						? `${escapedValMetricName}_total`
						: escapedValMetricName;
			}

			const { labels = {}, sharedLabels } = val;

			// Make a copy before mutating
			const seriesLabels =
				defaultLabelNames === undefined ? labels : { ...labels };
			if (defaultLabelNames !== undefined) {
				for (const labelName of defaultLabelNames) {
					seriesLabels[labelName] ??= this._defaultLabels[labelName];
				}
			}

			// We have to flatten these separately to avoid duplicate labels appearing
			// between the base labels and the shared labels
			const labelParts = formatLabels(seriesLabels, sharedLabels, escaping);
			if (sharedLabels !== undefined) {
				// A histogram declared without label names still shares an empty
				// object, and appending its flattened form would emit `{le="1",}`
				const flattenedShared = flattenSharedLabels(sharedLabels, escaping);
				if (flattenedShared) {
					labelParts.push(flattenedShared);
				}
			}
			const sampleHeader = buildSampleHeader(
				seriesName,
				labelParts,
				escaping,
				isValidSeries,
			);
			let fullMetricLine = `${sampleHeader} ${getValueAsString(val.value)}`;

			const { exemplar } = val;
			if (exemplar && isOpenMetrics) {
				const formattedExemplars = formatLabels(
					exemplar.labelSet,
					undefined,
					escaping,
				);
				fullMetricLine += ` # {${formattedExemplars.join(
					',',
				)}} ${getValueAsString(exemplar.value)} ${exemplar.timestamp}`;
			}
			values.push(fullMetricLine);
		}

		return values.join('\n');
	}

	async metrics(options) {
		const { isOpenMetrics } = this.#resolveExpositionOptions(options);

		const promises = this.getMetricsAsArray().map(metric =>
			this.getMetricsAsString(metric, options),
		);

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

	getSingleMetricAsString(name, options) {
		return this.getMetricsAsString(this._metrics.get(name), options);
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
		if (parseRegistryContentType(metricsContentType)) {
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

function buildSampleHeader(
	seriesName,
	labelParts,
	escaping = ESCAPE_UNDERSCORES,
	isValidSeries = true,
) {
	const needsQuoting =
		escaping === ALLOW_UTF8 &&
		isValidSeries &&
		!validateLegacyMetricName(seriesName);

	if (needsQuoting) {
		const quotedName = `"${escapeLabelValue(seriesName)}"`;
		return `{${[quotedName, ...labelParts].join(',')}}`;
	}
	const labelsString = labelParts.length ? `{${labelParts.join(',')}}` : '';
	return `${seriesName}${labelsString}`;
}

function formatLabelName(name, escaping = ESCAPE_UNDERSCORES) {
	const isValid = isValidLabelName(name);
	const escaped = isValid
		? escapeLabelName(name, escaping)
		: escapeString(name);
	if (escaping === ALLOW_UTF8 && isValid && !isValidLegacyLabelName(name)) {
		return `"${escapeLabelValue(escaped)}"`;
	}
	return escaped;
}

function formatLabels(labels, exclude, escaping = ESCAPE_UNDERSCORES) {
	const formatted = [];
	for (const [name, value] of Object.entries(labels)) {
		if (!exclude || !Object.hasOwn(exclude, name)) {
			formatted.push(
				`${formatLabelName(name, escaping)}="${escapeLabelValue(value)}"`,
			);
		}
	}
	return formatted;
}

const sharedLabelCaches = new Map();
function flattenSharedLabels(labels, escaping = ESCAPE_UNDERSCORES) {
	let cache = sharedLabelCaches.get(escaping);
	if (!cache) {
		cache = new WeakMap();
		sharedLabelCaches.set(escaping, cache);
	}
	const cached = cache.get(labels);
	if (cached !== undefined) {
		return cached;
	}

	const formattedLabels = formatLabels(labels, undefined, escaping);
	const flattened = formattedLabels.join(',');
	cache.set(labels, flattened);
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

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

const {
	getValueAsString,
	getOpenMetrics20ValueAsString,
	formatTimestamp,
	defineStartTimestamp,
	defineRawValue,
	Grouper,
} = require('./util');
const { aggregators } = require('./metricAggregators');
const Exemplar = require('./exemplar');
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

const PROMETHEUS_CONTENT_TYPE = 'text/plain; version=0.0.4; charset=utf-8';
const OPENMETRICS_0_0_1_CONTENT_TYPE =
	'application/openmetrics-text; version=0.0.1; charset=utf-8';
const OPENMETRICS_CONTENT_TYPE =
	'application/openmetrics-text; version=1.0.0; charset=utf-8';
const OPENMETRICS_2_0_CONTENT_TYPE =
	'application/openmetrics-text; version=2.0.0; charset=utf-8';
const OPENMETRICS_2_0_RC_CONTENT_TYPE =
	'application/openmetrics-text; version=2.0.0-rc; charset=utf-8';

const SUPPORTED_CONTENT_TYPES = [
	PROMETHEUS_CONTENT_TYPE,
	OPENMETRICS_0_0_1_CONTENT_TYPE,
	OPENMETRICS_CONTENT_TYPE,
	OPENMETRICS_2_0_CONTENT_TYPE,
	OPENMETRICS_2_0_RC_CONTENT_TYPE,
];

const DEFAULT_ACCEPTED_FORMATS = [
	OPENMETRICS_2_0_RC_CONTENT_TYPE,
	OPENMETRICS_2_0_CONTENT_TYPE,
	OPENMETRICS_CONTENT_TYPE,
	OPENMETRICS_0_0_1_CONTENT_TYPE,
	PROMETHEUS_CONTENT_TYPE,
];

function parseContentTypeInfo(ct) {
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

	let baseContentType;
	let isOpenMetrics = false;
	let isOpenMetrics20 = false;
	let defaultEscaping = ESCAPE_UNDERSCORES;

	if (mediaType === 'text/plain' && params.version === '0.0.4') {
		baseContentType = PROMETHEUS_CONTENT_TYPE;
	} else if (mediaType === 'application/openmetrics-text') {
		isOpenMetrics = true;
		if (params.version === '0.0.1') {
			baseContentType = OPENMETRICS_0_0_1_CONTENT_TYPE;
		} else if (params.version === '1.0.0') {
			baseContentType = OPENMETRICS_CONTENT_TYPE;
		} else if (params.version === '2.0.0') {
			baseContentType = OPENMETRICS_2_0_CONTENT_TYPE;
			isOpenMetrics20 = true;
			defaultEscaping = ALLOW_UTF8;
		} else if (
			params.version === '2.0.0-rc' ||
			(typeof params.version === 'string' &&
				params.version.startsWith('2.0.0-rc.'))
		) {
			baseContentType = OPENMETRICS_2_0_RC_CONTENT_TYPE;
			isOpenMetrics20 = true;
			defaultEscaping = ALLOW_UTF8;
		} else {
			return null;
		}
	} else {
		return null;
	}

	return {
		baseContentType,
		isOpenMetrics,
		isOpenMetrics20,
		escaping: params.escaping ?? defaultEscaping,
		explicitEscaping: params.escaping !== undefined,
	};
}

function defaultEscapingForBase(baseContentType) {
	if (
		baseContentType === OPENMETRICS_2_0_CONTENT_TYPE ||
		baseContentType === OPENMETRICS_2_0_RC_CONTENT_TYPE
	) {
		return ALLOW_UTF8;
	}
	return ESCAPE_UNDERSCORES;
}

function withEscaping(baseContentType, escaping) {
	const scheme =
		escaping && ESCAPING_SCHEMES.includes(escaping)
			? escaping
			: defaultEscapingForBase(baseContentType);
	return `${baseContentType}; escaping=${scheme}`;
}

class Registry {
	static get PROMETHEUS_CONTENT_TYPE() {
		return PROMETHEUS_CONTENT_TYPE;
	}

	static get OPENMETRICS_0_0_1_CONTENT_TYPE() {
		return OPENMETRICS_0_0_1_CONTENT_TYPE;
	}

	static get OPENMETRICS_CONTENT_TYPE() {
		return OPENMETRICS_CONTENT_TYPE;
	}

	static get OPENMETRICS_2_0_CONTENT_TYPE() {
		return OPENMETRICS_2_0_CONTENT_TYPE;
	}

	static get OPENMETRICS_2_0_RC_CONTENT_TYPE() {
		return OPENMETRICS_2_0_RC_CONTENT_TYPE;
	}

	/**
	 * Negotiates an exposition Content-Type from an HTTP `Accept` header value
	 * against `acceptedFormats` (defaults to OpenMetrics 2.0-rc, 2.0.0, 1.0.0,
	 * 0.0.1, and Prometheus 0.0.4).
	 *
	 * @param {string} [acceptHeader]
	 * @param {string[]} [acceptedFormats]
	 * @returns {string}
	 */
	static negotiate(acceptHeader, acceptedFormats = DEFAULT_ACCEPTED_FORMATS) {
		const validAccepted = Array.isArray(acceptedFormats)
			? acceptedFormats
					.map(f => parseContentTypeInfo(f)?.baseContentType)
					.filter(Boolean)
			: [];

		const fallbackBase =
			validAccepted.length === 0 ||
			validAccepted.includes(PROMETHEUS_CONTENT_TYPE)
				? PROMETHEUS_CONTENT_TYPE
				: validAccepted[0];

		if (
			typeof acceptHeader !== 'string' ||
			acceptHeader.trim() === '' ||
			validAccepted.length === 0
		) {
			return withEscaping(fallbackBase, ESCAPE_UNDERSCORES);
		}

		const clauses = acceptHeader.split(',');
		let bestMatch = null;

		for (let clauseIdx = 0; clauseIdx < clauses.length; clauseIdx++) {
			const rawClause = clauses[clauseIdx].trim();
			if (!rawClause) continue;

			const parts = rawClause.split(';').map(p => p.trim());
			const mediaRange = parts[0].toLowerCase();
			const slashIdx = mediaRange.indexOf('/');
			if (slashIdx === -1) continue;
			const type = mediaRange.slice(0, slashIdx).trim();
			const subtype = mediaRange.slice(slashIdx + 1).trim();

			let q = 1.0;
			const params = {};
			let validClause = true;

			for (let i = 1; i < parts.length; i++) {
				if (!parts[i]) continue;
				const eqIdx = parts[i].indexOf('=');
				if (eqIdx === -1) continue;
				const k = parts[i].slice(0, eqIdx).trim().toLowerCase();
				const v = parts[i]
					.slice(eqIdx + 1)
					.trim()
					.replace(/^"(.*)"$/, '$1');
				if (k === 'q') {
					const parsedQ = Number(v);
					if (Number.isNaN(parsedQ) || parsedQ < 0 || parsedQ > 1) {
						validClause = false;
						break;
					}
					q = parsedQ;
				} else {
					params[k] = v;
				}
			}

			if (!validClause || q === 0) {
				continue;
			}
			if (
				params.charset !== undefined &&
				params.charset.toLowerCase() !== 'utf-8'
			) {
				continue;
			}

			let matchedBase = null;
			let specificity = 0;

			if (type === '*' && subtype === '*') {
				matchedBase = fallbackBase;
				specificity = 1;
			} else if (type === 'text' && (subtype === '*' || subtype === 'plain')) {
				if (
					(params.version === undefined || params.version === '0.0.4') &&
					validAccepted.includes(PROMETHEUS_CONTENT_TYPE)
				) {
					matchedBase = PROMETHEUS_CONTENT_TYPE;
					specificity =
						subtype === '*' ? 2 : params.version !== undefined ? 4 : 3;
				}
			} else if (
				type === 'application' &&
				(subtype === '*' || subtype === 'openmetrics-text')
			) {
				if (subtype === '*') {
					const firstOm = validAccepted.find(
						f => f !== PROMETHEUS_CONTENT_TYPE,
					);
					if (firstOm) {
						matchedBase = firstOm;
						specificity = 2;
					}
				} else {
					const ver = params.version;
					let target = null;
					if (ver === undefined) {
						target = validAccepted.includes(OPENMETRICS_0_0_1_CONTENT_TYPE)
							? OPENMETRICS_0_0_1_CONTENT_TYPE
							: OPENMETRICS_CONTENT_TYPE;
					} else if (ver === '0.0.1') {
						target = OPENMETRICS_0_0_1_CONTENT_TYPE;
					} else if (ver === '1.0.0') {
						target = OPENMETRICS_CONTENT_TYPE;
					} else if (ver === '2.0.0') {
						target = OPENMETRICS_2_0_CONTENT_TYPE;
					} else if (ver === '2.0.0-rc' || ver.startsWith('2.0.0-rc.')) {
						target = OPENMETRICS_2_0_RC_CONTENT_TYPE;
					}
					if (target && validAccepted.includes(target)) {
						matchedBase = target;
						specificity = params.version !== undefined ? 4 : 3;
					}
				}
			}

			if (!matchedBase) {
				continue;
			}

			const acceptedRank = validAccepted.indexOf(matchedBase);
			let escaping;
			if (params.escaping && ESCAPING_SCHEMES.includes(params.escaping)) {
				escaping = params.escaping;
			} else if (type === '*' && subtype === '*') {
				escaping = ESCAPE_UNDERSCORES;
			} else {
				escaping = defaultEscapingForBase(matchedBase);
			}

			const candidate = {
				baseContentType: matchedBase,
				escaping,
				q,
				specificity,
				acceptedRank,
				clauseIdx,
			};

			if (
				!bestMatch ||
				candidate.q > bestMatch.q ||
				(candidate.q === bestMatch.q &&
					candidate.specificity > bestMatch.specificity) ||
				(candidate.q === bestMatch.q &&
					candidate.specificity === bestMatch.specificity &&
					candidate.acceptedRank < bestMatch.acceptedRank)
			) {
				bestMatch = candidate;
			}
		}

		if (!bestMatch) {
			return withEscaping(fallbackBase, ESCAPE_UNDERSCORES);
		}

		return withEscaping(bestMatch.baseContentType, bestMatch.escaping);
	}

	negotiate(acceptHeader, acceptedFormats = DEFAULT_ACCEPTED_FORMATS) {
		return Registry.negotiate(acceptHeader, acceptedFormats);
	}

	constructor(regContentType = Registry.PROMETHEUS_CONTENT_TYPE) {
		this._metrics = new Map();
		this._collectors = [];
		this._defaultLabels = {};
		if (!parseContentTypeInfo(regContentType)) {
			throw new TypeError(`Content type ${regContentType} is unsupported`);
		}
		this._contentType = regContentType;
	}

	#resolveExpositionOptions(options) {
		let targetContentType = this._contentType;
		let escapingOverride;

		if (typeof options === 'string') {
			targetContentType = options;
		} else if (options && typeof options === 'object') {
			if (options.contentType) {
				targetContentType = options.contentType;
			} else if (options.accept !== undefined) {
				targetContentType = Registry.negotiate(
					options.accept,
					options.acceptedFormats,
				);
			}
			if (options.escaping) {
				if (!ESCAPING_SCHEMES.includes(options.escaping)) {
					throw new Error(`Invalid escaping scheme: ${options.escaping}`);
				}
				escapingOverride = options.escaping;
			}
		}

		const info = parseContentTypeInfo(targetContentType);
		if (!info) {
			throw new Error(`Content type ${targetContentType} is unsupported`);
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
		const formatInfo = this.#resolveExpositionOptions(options);
		const metric =
			typeof metrics.getForPromString === 'function'
				? await metrics.getForPromString()
				: await metrics.get();

		const { isOpenMetrics, isOpenMetrics20, escaping } = formatInfo;
		const isOpenMetrics1 = isOpenMetrics && !isOpenMetrics20;

		const rawFamilyName =
			isOpenMetrics1 && metric.type === 'counter'
				? standardizeCounterName(metric.name)
				: metric.name;

		const familyName = validateMetricName(rawFamilyName)
			? escapeName(rawFamilyName, escaping, false)
			: escapeString(rawFamilyName);

		const headerMetricName =
			escaping === ALLOW_UTF8 &&
			validateMetricName(familyName) &&
			!validateLegacyMetricName(familyName)
				? `"${escapeLabelValue(familyName)}"`
				: familyName;

		const helpText = isOpenMetrics20
			? escapeString(metric.help).replace(/\r+$/, '')
			: escapeString(metric.help);
		const help = `# HELP ${headerMetricName} ${helpText}`;
		const type = `# TYPE ${headerMetricName} ${metric.type}`;
		const values = [help, type];

		if (isOpenMetrics && metric.unit) {
			values.push(`# UNIT ${headerMetricName} ${escapeString(metric.unit)}`);
		}

		let defaultLabelNames = Object.keys(this._defaultLabels);
		if (defaultLabelNames.length === 0) {
			defaultLabelNames = undefined;
		}

		if (isOpenMetrics20) {
			if (metric.type === 'histogram') {
				values.push(
					...formatOpenMetrics20Histogram(
						metric,
						familyName,
						this._defaultLabels,
						defaultLabelNames,
						escaping,
					),
				);
				return values.join('\n');
			}
			if (metric.type === 'summary') {
				values.push(
					...formatOpenMetrics20Summary(
						metric,
						familyName,
						this._defaultLabels,
						defaultLabelNames,
						escaping,
					),
				);
				return values.join('\n');
			}
		}

		const valueFormatter = isOpenMetrics20
			? getOpenMetrics20ValueAsString
			: getValueAsString;

		for (const val of metric.values ?? []) {
			let seriesName;
			if (
				(metric.type === 'histogram' || metric.type === 'summary') &&
				val.metricName !== undefined &&
				val.metricName.startsWith(`${metric.name}_`)
			) {
				const suffix = val.metricName.slice(metric.name.length);
				seriesName = `${familyName}${suffix}`;
			} else {
				const rawValMetricName =
					val.metricName !== undefined
						? isOpenMetrics1 && metric.type === 'counter'
							? standardizeCounterName(val.metricName)
							: val.metricName
						: rawFamilyName;
				const escapedValMetricName = validateMetricName(rawValMetricName)
					? escapeName(rawValMetricName, escaping, false)
					: escapeString(rawValMetricName);

				seriesName =
					isOpenMetrics1 && metric.type === 'counter'
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

			const sampleHeader = buildSampleHeader(seriesName, labelParts, escaping);
			let fullMetricLine = `${sampleHeader} ${valueFormatter(val.value)}`;

			if (val.timestamp !== undefined) {
				fullMetricLine += ` ${formatTimestamp(val.timestamp)}`;
			}

			if (
				isOpenMetrics20 &&
				metric.type === 'counter' &&
				val.startTimestamp !== undefined
			) {
				fullMetricLine += ` st@${formatTimestamp(val.startTimestamp)}`;
			}

			const { exemplar } = val;
			if (exemplar && isOpenMetrics && exemplar.timestamp !== undefined) {
				if (isOpenMetrics20) {
					if (isValidExemplarForExport(exemplar)) {
						const formattedExemplars = formatLabels(
							exemplar.labelSet ?? {},
							undefined,
							escaping,
						);
						fullMetricLine += ` # {${formattedExemplars.join(
							',',
						)}} ${getOpenMetrics20ValueAsString(
							exemplar.value,
						)} ${formatTimestamp(exemplar.timestamp)}`;
					}
				} else {
					const truncatedLabels = Exemplar.truncateExemplarLabelSet(
						exemplar.labelSet,
						Exemplar.OM1_MAX_EXEMPLAR_LABEL_LENGTH,
					);
					if (truncatedLabels) {
						const formattedExemplars = formatLabels(
							truncatedLabels,
							undefined,
							escaping,
						);
						fullMetricLine += ` # {${formattedExemplars.join(
							',',
						)}} ${getValueAsString(exemplar.value)} ${formatTimestamp(
							exemplar.timestamp,
						)}`;
					}
				}
			}
			values.push(fullMetricLine);
		}

		return values.join('\n');
	}

	async metrics(options) {
		const formatInfo = this.#resolveExpositionOptions(options);
		const isOpenMetrics = formatInfo.isOpenMetrics;

		const promises = this.getMetricsAsArray().map(metric =>
			this.getMetricsAsString(metric, options),
		);

		const resolves = await Promise.all(promises);

		return isOpenMetrics
			? resolves.length > 0
				? `${resolves.join('\n')}\n# EOF\n`
				: '# EOF\n'
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
					const st = val.startTimestamp;
					const rv = val.rawValue;
					// Make a copy before mutating
					val.labels = { ...val.labels };

					for (const labelName of defaultLabelNames) {
						val.labels[labelName] ??= this._defaultLabels[labelName];
					}
					if (st !== undefined) defineStartTimestamp(val, st);
					if (rv !== undefined) defineRawValue(val, rv);
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
		if (parseContentTypeInfo(metricsContentType)) {
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

function isValidExemplarForExport(exemplar) {
	if (!exemplar || typeof exemplar !== 'object') {
		return false;
	}
	if (
		typeof exemplar.timestamp !== 'number' ||
		!Number.isFinite(exemplar.timestamp) ||
		exemplar.timestamp < 0
	) {
		return false;
	}
	const labelSet = exemplar.labelSet ?? {};
	for (const name of Object.keys(labelSet)) {
		if (!isValidLabelName(name)) {
			return false;
		}
	}
	return (
		Exemplar.countExemplarRunes(labelSet) <= Exemplar.MAX_EXEMPLAR_LABEL_LENGTH
	);
}

function buildSampleHeader(
	seriesName,
	labelParts,
	escaping = ESCAPE_UNDERSCORES,
) {
	const needsQuoting =
		escaping === ALLOW_UTF8 &&
		validateMetricName(seriesName) &&
		!validateLegacyMetricName(seriesName);

	if (needsQuoting) {
		const quotedName = `"${escapeLabelValue(seriesName)}"`;
		return `{${[quotedName, ...labelParts].join(',')}}`;
	}
	const labelsString = labelParts.length ? `{${labelParts.join(',')}}` : '';
	return `${seriesName}${labelsString}`;
}

function extractBaseLabels(
	labels = {},
	sharedLabels,
	defaultLabels,
	defaultLabelNames,
	excludedKey,
) {
	const base = {};
	for (const k in labels) {
		if (
			k !== excludedKey &&
			(!sharedLabels || !Object.hasOwn(sharedLabels, k))
		) {
			base[k] = labels[k];
		}
	}
	if (defaultLabelNames !== undefined) {
		for (const labelName of defaultLabelNames) {
			if (!sharedLabels || !Object.hasOwn(sharedLabels, labelName)) {
				base[labelName] ??= defaultLabels[labelName];
			}
		}
	}
	if (sharedLabels !== undefined) {
		for (const [k, v] of Object.entries(sharedLabels)) {
			if (k !== excludedKey) {
				base[k] = v;
			}
		}
	}
	return base;
}

function makeBaseLabelKey(baseLabels) {
	const keys = Object.keys(baseLabels);
	if (keys.length === 0) return '';
	keys.sort();
	return JSON.stringify(keys.map(k => [k, String(baseLabels[k])]));
}

function formatOpenMetrics20Histogram(
	metric,
	familyName,
	defaultLabels,
	defaultLabelNames,
	escaping,
) {
	const groups = new Map();
	const bucketSuffix = `${metric.name}_bucket`;
	const sumSuffix = `${metric.name}_sum`;
	const countSuffix = `${metric.name}_count`;

	for (const val of metric.values ?? []) {
		const baseLabels = extractBaseLabels(
			val.labels,
			val.sharedLabels,
			defaultLabels,
			defaultLabelNames,
			'le',
		);
		const key = makeBaseLabelKey(baseLabels);
		let group = groups.get(key);
		if (!group) {
			group = {
				baseLabels,
				buckets: [],
				sum: 0,
				count: 0,
				startTimestamp: undefined,
				timestamp: undefined,
			};
			groups.set(key, group);
		}

		if (val.metricName === bucketSuffix || val.labels?.le !== undefined) {
			group.buckets.push({
				le: val.labels.le,
				count: val.value,
				exemplar: val.exemplar,
			});
		} else if (val.metricName === sumSuffix) {
			group.sum = val.value;
		} else if (val.metricName === countSuffix) {
			group.count = val.value;
			if (val.startTimestamp !== undefined) {
				group.startTimestamp = val.startTimestamp;
			}
			if (val.timestamp !== undefined) {
				group.timestamp = val.timestamp;
			}
		}
	}

	const lines = [];
	for (const group of groups.values()) {
		const labelParts = formatLabels(group.baseLabels, undefined, escaping);
		const sampleHeader = buildSampleHeader(familyName, labelParts, escaping);
		const bucketParts = group.buckets.map(b => {
			const boundStr =
				b.le === '+Inf' ? '+Inf' : getOpenMetrics20ValueAsString(Number(b.le));
			return `${boundStr}:${b.count}`;
		});

		let line = `${sampleHeader} {count:${group.count},sum:${getOpenMetrics20ValueAsString(
			group.sum,
		)},bucket:[${bucketParts.join(',')}]}`;

		if (group.timestamp !== undefined) {
			line += ` ${formatTimestamp(group.timestamp)}`;
		}
		if (group.startTimestamp !== undefined) {
			line += ` st@${formatTimestamp(group.startTimestamp)}`;
		}

		for (const b of group.buckets) {
			if (b.exemplar && isValidExemplarForExport(b.exemplar)) {
				const exLabels = formatLabels(
					b.exemplar.labelSet ?? {},
					undefined,
					escaping,
				);
				line += ` # {${exLabels.join(',')}} ${getOpenMetrics20ValueAsString(
					b.exemplar.value,
				)} ${formatTimestamp(b.exemplar.timestamp)}`;
			}
		}

		lines.push(line);
	}

	return lines;
}

function formatOpenMetrics20Summary(
	metric,
	familyName,
	defaultLabels,
	defaultLabelNames,
	escaping,
) {
	const groups = new Map();
	const sumSuffix = `${metric.name}_sum`;
	const countSuffix = `${metric.name}_count`;

	for (const val of metric.values ?? []) {
		const baseLabels = extractBaseLabels(
			val.labels,
			val.sharedLabels,
			defaultLabels,
			defaultLabelNames,
			'quantile',
		);
		const key = makeBaseLabelKey(baseLabels);
		let group = groups.get(key);
		if (!group) {
			group = {
				baseLabels,
				quantiles: [],
				sum: 0,
				count: 0,
				startTimestamp: undefined,
				timestamp: undefined,
			};
			groups.set(key, group);
		}

		if (val.metricName === sumSuffix) {
			group.sum = val.value;
		} else if (val.metricName === countSuffix) {
			group.count = val.value;
			if (val.startTimestamp !== undefined) {
				group.startTimestamp = val.startTimestamp;
			}
			if (val.timestamp !== undefined) {
				group.timestamp = val.timestamp;
			}
		} else if (val.labels?.quantile !== undefined) {
			group.quantiles.push({
				quantile: val.labels.quantile,
				value: val.rawValue !== undefined ? val.rawValue : val.value,
				hasRawValue: val.rawValue !== undefined,
			});
		}
	}

	const lines = [];
	for (const group of groups.values()) {
		const labelParts = formatLabels(group.baseLabels, undefined, escaping);
		const sampleHeader = buildSampleHeader(familyName, labelParts, escaping);
		const quantileParts = group.quantiles.map(q => {
			const qVal = group.count === 0 && !q.hasRawValue ? NaN : q.value;
			return `${getOpenMetrics20ValueAsString(
				Number(q.quantile),
			)}:${getOpenMetrics20ValueAsString(qVal)}`;
		});

		let line = `${sampleHeader} {count:${group.count},sum:${getOpenMetrics20ValueAsString(
			group.sum,
		)},quantile:[${quantileParts.join(',')}]}`;

		if (group.timestamp !== undefined) {
			line += ` ${formatTimestamp(group.timestamp)}`;
		}
		if (group.startTimestamp !== undefined) {
			line += ` st@${formatTimestamp(group.startTimestamp)}`;
		}

		lines.push(line);
	}

	return lines;
}

function formatLabelName(name, escaping = ESCAPE_UNDERSCORES) {
	const escaped = isValidLabelName(name)
		? escapeLabelName(name, escaping)
		: escapeString(name);
	if (
		escaping === ALLOW_UTF8 &&
		isValidLabelName(escaped) &&
		!isValidLegacyLabelName(escaped)
	) {
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
module.exports.SUPPORTED_CONTENT_TYPES = SUPPORTED_CONTENT_TYPES;
module.exports.DEFAULT_ACCEPTED_FORMATS = DEFAULT_ACCEPTED_FORMATS;

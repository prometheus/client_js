/**
 * Histogram
 */
'use strict';

const util = require('util');
const {
	getLabels,
	isObject,
	isEmpty,
	nowTimestamp,
	LabelMap,
} = require('./util');
const { Metric } = require('./metric');
const Exemplar = require('./exemplar');

class Histogram extends Metric {
	constructor(config) {
		super(config, {
			buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
		});

		this.type = 'histogram';
		this.defaultLabels = {};
		this.defaultExemplarLabelSet = {};
		this.enableExemplars = false;

		for (const label of this.labelNames) {
			if (label === 'le') {
				throw new Error('le is a reserved label keyword');
			}
		}

		this.upperBounds = this.buckets;
		this.bucketValues = this.upperBounds.reduce((acc, upperBound) => {
			acc[upperBound] = 0;
			return acc;
		}, {});

		if (config.enableExemplars) {
			this.enableExemplars = true;
			this.bucketExemplars = this.upperBounds.reduce((acc, upperBound) => {
				acc[upperBound] = null;
				return acc;
			}, {});
			Object.freeze(this.bucketExemplars);
			this.observe = this.observeWithExemplar;
		} else {
			this.observe = this.observeWithoutExemplar;
		}

		Object.freeze(this.bucketValues);
		Object.freeze(this.upperBounds);

		if (this.labelNames.length === 0) {
			this.store = new LabelMap(this.labelNames);
			this.store.merge(
				{},
				createBaseValues({}, this.bucketValues, this.bucketExemplars),
			);
		}
	}

	/**
	 * Observe a value in histogram.
	 * @param {object} labels - Object with labels where key is the label key and value is label value. Can only be one level deep
	 * @param {number} value - Value to observe in the histogram
	 * @returns {void}
	 */
	observeWithoutExemplar(labels, value) {
		observe(this, labels === 0 ? 0 : labels || {}, value);
	}

	observeWithExemplar({
		labels = this.defaultLabels,
		value,
		exemplarLabels = this.defaultExemplarLabelSet,
	} = {}) {
		observe(this, labels === 0 ? 0 : labels || {}, value);
		this.updateExemplar(labels, value, exemplarLabels);
	}

	updateExemplar(labels, value, exemplarLabels) {
		if (isEmpty(exemplarLabels)) return;
		const bound = findBound(this.upperBounds, value);
		const { bucketExemplars } = this.store.entry(labels);
		let exemplar = bucketExemplars[bound];
		if (!isObject(exemplar)) {
			exemplar = new Exemplar();
			bucketExemplars[bound] = exemplar;
		}
		exemplar.validateExemplarLabelSet(exemplarLabels);
		exemplar.labelSet = exemplarLabels;
		exemplar.value = value;
		exemplar.timestamp = nowTimestamp();
	}

	async get() {
		const data = await this.getForPromString();
		data.values = data.values.map(splayLabels);
		return data;
	}

	async getForPromString() {
		if (this.collect) {
			const v = this.collect();
			if (v instanceof Promise) await v;
		}
		const data = Array.from(this.store.values());
		const values = data
			.map(extractBucketValuesForExport(this))
			.reduce(addSumAndCountForExport(this), []);

		return {
			name: this.name,
			help: this.help,
			type: this.type,
			values,
			aggregator: this.aggregator,
		};
	}

	reset() {
		this.store = new LabelMap(this.labelNames);
	}

	/**
	 * Initialize the metrics for the given combination of labels to zero.
	 * @param {object} labels - Object with labels where key is the label key and value is label value. Can only be one level deep
	 * @returns {void}
	 */
	zero(labels) {
		this.store.validate(labels);
		this.store.merge(
			labels,
			createBaseValues(labels, this.bucketValues, this.bucketExemplars),
		);
	}

	/**
	 * Start a timer that could be used to logging durations.
	 * @param {object} labels - Object with labels where key is the label key and value is label value. Can only be one level deep
	 * @param {object} exemplarLabels - Object with labels for exemplar where key is the label key and value is label value. Can only be one level deep
	 * @returns {Function} - Function to invoke when you want to stop the timer and observe the duration in seconds
	 * @example
	 * var end = histogram.startTimer();
	 * makeExpensiveXHRRequest(function(err, res) {
	 * 	const duration = end(); //Observe the duration of expensiveXHRRequest and returns duration in seconds
	 * 	console.log('Duration', duration);
	 * });
	 */
	startTimer(labels, exemplarLabels) {
		return this.enableExemplars
			? startTimerWithExemplar(this, labels, exemplarLabels)
			: startTimer(this, labels);
	}

	labels(...args) {
		const labels = getLabels(this.labelNames, args);
		this.store.validate(labels);
		return {
			observe: value => observe(this, labels, value),
			startTimer: () => startTimer(this, labels),
		};
	}

	remove(...args) {
		const labels = getLabels(this.labelNames, args);
		this.store.validate(labels);
		this.store.remove(labels);
	}
}

function startTimer(histogram, startLabels) {
	const start = process.hrtime();
	return endLabels => {
		const delta = process.hrtime(start);
		const value = delta[0] + delta[1] / 1e9;
		histogram.observe(Object.assign({}, startLabels, endLabels), value);
		return value;
	};
}

function startTimerWithExemplar(histogram, startLabels, startExemplarLabels) {
	const start = process.hrtime();
	return (endLabels, endExemplarLabels) => {
		const delta = process.hrtime(start);
		const value = delta[0] + delta[1] / 1e9;
		histogram.observe({
			labels: Object.assign({}, startLabels, endLabels),
			value,
			exemplarLabels: Object.assign({}, startExemplarLabels, endExemplarLabels),
		});
		return value;
	};
}

function setValuePair(labels, value, metricName, exemplar, sharedLabels = {}) {
	return {
		labels,
		sharedLabels,
		value,
		metricName,
		exemplar,
	};
}

function findBound(upperBounds, value) {
	for (let i = 0; i < upperBounds.length; i++) {
		const bound = upperBounds[i];
		if (value <= bound) {
			return bound;
		}
	}
	return -1;
}

/**
 * @param {Histogram} histogram
 * @param {object} labels - Object with labels where key is the label key and value is label value. Can only be one level deep
 * @param {number} value - Value to observe in the histogram
 */
function observe(histogram, labels, value) {
	const labelValuePair = convertLabelsAndValues(labels, value);

	if (!Number.isFinite(labelValuePair.value)) {
		throw new TypeError(
			`Value is not a valid number: ${util.format(labelValuePair.value)}`,
		);
	}

	histogram.store.validate(labelValuePair.labels);
	let entry = histogram.store.entry(labelValuePair.labels);
	if (entry === undefined) {
		entry = histogram.store.merge(
			labelValuePair.labels,
			createBaseValues(
				labelValuePair.labels,
				histogram.bucketValues,
				histogram.bucketExemplars,
			),
		);
	}

	const b = findBound(histogram.upperBounds, labelValuePair.value);

	entry.sum += labelValuePair.value;
	entry.count += 1;

	if (Object.hasOwn(entry.bucketValues, b)) {
		entry.bucketValues[b] += 1;
	}
}

function createBaseValues(labels, bucketValues, bucketExemplars) {
	const result = {
		labels,
		bucketValues: { ...bucketValues },
		sum: 0,
		count: 0,
	};
	if (bucketExemplars) {
		result.bucketExemplars = { ...bucketExemplars };
	}
	return result;
}

function convertLabelsAndValues(labels, value) {
	return isObject(labels)
		? {
				labels,
				value,
			}
		: {
				labels: {},
				value: labels,
			};
}

function extractBucketValuesForExport(histogram) {
	const name = `${histogram.name}_bucket`;
	return bucketData => {
		let acc = 0;
		const buckets = histogram.upperBounds.map(upperBound => {
			acc += bucketData.bucketValues[upperBound];
			return setValuePair(
				{ le: upperBound },
				acc,
				name,
				bucketData.bucketExemplars
					? bucketData.bucketExemplars[upperBound]
					: null,
				bucketData.labels,
			);
		});
		return { buckets, data: bucketData };
	};
}

function addSumAndCountForExport(histogram) {
	return (acc, d) => {
		acc.push(...d.buckets);

		const infLabel = { le: '+Inf' };
		acc.push(
			setValuePair(
				infLabel,
				d.data.count,
				`${histogram.name}_bucket`,
				d.data.bucketExemplars ? d.data.bucketExemplars['-1'] : null,
				d.data.labels,
			),
			setValuePair(
				{},
				d.data.sum,
				`${histogram.name}_sum`,
				undefined,
				d.data.labels,
			),
			setValuePair(
				{},
				d.data.count,
				`${histogram.name}_count`,
				undefined,
				d.data.labels,
			),
		);
		return acc;
	};
}

function splayLabels(bucket) {
	const { sharedLabels, labels, ...newBucket } = bucket;
	for (const label of Object.keys(sharedLabels)) {
		labels[label] = sharedLabels[label];
	}
	newBucket.labels = labels;
	return newBucket;
}

module.exports = Histogram;

/**
 * Counter metric
 */
'use strict';

const util = require('util');
const { isObject, getLabels, nowTimestamp, LabelMap } = require('./util');
const { Metric } = require('./metric');
const Exemplar = require('./exemplar');

class Counter extends Metric {
	constructor(config) {
		super(config);
		this.type = 'counter';
		this.defaultLabels = {};
		this.defaultValue = 1;
		this.defaultExemplarLabelSet = {};
		if (config.enableExemplars) {
			this.enableExemplars = true;
			this.inc = this.incWithExemplar;
		} else {
			this.inc = this.incWithoutExemplar;
		}
	}

	/**
	 * Increment counter.
	 * @param {object} labels - What label you want to be incremented
	 * @param {number} value - Value to increment, if omitted increment with 1
	 * @returns {void}
	 */
	incWithoutExemplar(labels, value) {
		if (!isObject(labels)) {
			value = labels;
			labels = {};
		}

		if (value && !Number.isFinite(value)) {
			throw new TypeError(`Value is not a valid number: ${util.format(value)}`);
		}
		if (value < 0) {
			throw new Error('It is not possible to decrease a counter');
		}

		if (value === null || value === undefined) value = 1;

		this.store.validate(labels);
		this.store.setDelta(labels, value);
	}

	/**
	 * Increment counter with exemplar, same as inc but accepts labels for an
	 * exemplar.
	 * If no label is provided the current exemplar labels are kept unchanged
	 * (defaults to empty set).
	 *
	 * @param {object} incOpts - Object with options about what metric to increase
	 * @param {object} incOpts.labels - What label you want to be incremented,
	 *                                  defaults to null (metric with no labels)
	 * @param {number} incOpts.value - Value to increment, defaults to 1
	 * @param {object} incOpts.exemplarLabels - Key-value  labels for the
	 *                                          exemplar, defaults to empty set {}
	 * @returns {void}
	 */
	incWithExemplar({
		labels = this.defaultLabels,
		value = this.defaultValue,
		exemplarLabels = this.defaultExemplarLabelSet,
	} = {}) {
		this.incWithoutExemplar(labels, value);
		this.updateExemplar(labels, exemplarLabels, value);
	}

	updateExemplar(labels, exemplarLabels, value) {
		if (exemplarLabels === this.defaultExemplarLabelSet) return;

		const entry = this.store.entry(labels);

		entry.exemplar ??= new Exemplar();
		entry.exemplar.validateExemplarLabelSet(exemplarLabels);
		entry.exemplar.labelSet = exemplarLabels;
		entry.exemplar.value = value ? value : 1;
		entry.exemplar.timestamp = nowTimestamp();
	}

	/**
	 * Reset counter.
	 * @returns {void}
	 */
	reset() {
		this.store = new LabelMap(this.labelNames);
		if (this.labelNames.length === 0) {
			this.store.set({}, 0);
		}
	}

	async get() {
		if (this.collect) {
			const v = this.collect();
			if ((v instanceof Promise) || (v.then instanceof Function)) await v;
		}

		return {
			help: this.help,
			name: this.name,
			type: this.type,
			values: Array.from(this.store.values()),
			aggregator: this.aggregator,
		};
	}

	labels(...args) {
		const labels = getLabels(this.labelNames, args) || {};
		return {
			inc: this.inc.bind(this, labels),
		};
	}

	remove(...args) {
		const labels = getLabels(this.labelNames, args) || {};
		this.store.validate(labels); //TODO: this isn't really necessary is it?
		this.store.remove(labels);
	}
}

module.exports = Counter;

/**
 * Gauge metric
 */
'use strict';

const util = require('util');

const { getLabels, isObject, LabelMap } = require('./util');
const { Metric } = require('./metric');

class Gauge extends Metric {
	constructor(config) {
		super(config);
		this.type = 'gauge';
	}

	/**
	 * Set a gauge to a value.
	 * @param {object} labels - Object with labels and their values
	 * @param {number} value - Value to set the gauge to, must be positive
	 * @returns {void}
	 */
	set(labels, value) {
		value = getValueArg(labels, value);
		labels = getLabelArg(labels);
		set(this, labels, value);
	}

	/**
	 * Reset gauge.
	 * @returns {void}
	 */
	reset() {
		this.store = new LabelMap(this.labelNames);
		if (this.labelNames.length === 0) {
			this.store.set({}, 0);
		}
	}

	/**
	 * Increment a gauge value.
	 * @param {object} labels - Object with labels where key is the label key and value is label value. Can only be one level deep
	 * @param {number} value - Value to increment - if omitted, increment with 1
	 * @returns {void}
	 */
	inc(labels, value) {
		value = getValueArg(labels, value) ?? 1;
		labels = getLabelArg(labels);
		setDelta(this, labels, value);
	}

	/**
	 * Decrement a gauge value.
	 * @param {object} labels - Object with labels where key is the label key and value is label value. Can only be one level deep
	 * @param {number} value - Value to decrement - if omitted, decrement with 1
	 * @returns {void}
	 */
	dec(labels, value) {
		value = getValueArg(labels, value) ?? 1;
		labels = getLabelArg(labels);
		setDelta(this, labels, -value);
	}

	/**
	 * Set the gauge to current unix epoch.
	 * @param {object} labels - Object with labels where key is the label key and value is label value. Can only be one level deep
	 * @returns {void}
	 */
	setToCurrentTime(labels) {
		const now = Date.now() / 1000;
		if (labels === undefined) {
			this.set(now);
		} else {
			this.set(labels, now);
		}
	}

	/**
	 * Start a timer.
	 * @param {object} labels - Object with labels where key is the label key and value is label value. Can only be one level deep
	 * @returns {Function} - Invoke this function to set the duration in seconds since you started the timer.
	 * @example
	 * var done = gauge.startTimer();
	 * makeXHRRequest(function(err, response) {
	 *	done(); //Duration of the request will be saved
	 * });
	 */
	startTimer(labels) {
		const start = performance.now();

		return endLabels => {
			const delta = (performance.now() - start) / 1e3;
			this.set(Object.assign({}, labels, endLabels), delta);
			return delta;
		};
	}

	async get() {
		if (this.collect) {
			const v = this.collect();
			if (v instanceof Promise) await v;
		}
		return {
			help: this.help,
			name: this.name,
			type: this.type,
			values: Array.from(this.store.values()),
			aggregator: this.aggregator,
		};
	}

	_getValue(labels) {
		return this.store.get(labels ?? {}) ?? 0;
	}

	labels(...args) {
		const labels = getLabels(this.labelNames, args);
		this.store.validate(labels);
		return {
			inc: this.inc.bind(this, labels),
			dec: this.dec.bind(this, labels),
			set: this.set.bind(this, labels),
			setToCurrentTime: this.setToCurrentTime.bind(this, labels),
			startTimer: this.startTimer.bind(this, labels),
		};
	}

	remove(...args) {
		const labels = getLabels(this.labelNames, args);
		this.store.validate(labels);
		this.store.remove(labels);
	}
}

function set(gauge, labels, value) {
	if (typeof value !== 'number') {
		throw new TypeError(`Value is not a valid number: ${util.format(value)}`);
	}

	gauge.store.validate(labels);
	gauge.store.set(labels, value);
}

function setDelta(gauge, labels, delta) {
	if (typeof delta !== 'number') {
		throw new TypeError(`Delta is not a valid number: ${util.format(delta)}`);
	}

	gauge.store.validate(labels);
	gauge.store.setDelta(labels, delta);
}

function getLabelArg(labels) {
	return isObject(labels) ? labels : {};
}

function getValueArg(labels, value) {
	return isObject(labels) ? value : labels;
}

module.exports = Gauge;

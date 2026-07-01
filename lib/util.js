'use strict';

const util = require('util');

exports.getValueAsString = function getValueString(value) {
	if (Number.isFinite(value)) {
		return `${value}`;
	}

	if (Number.isNaN(value)) {
		return 'Nan';
	} else if (value < 0) {
		return '-Inf';
	} else {
		return '+Inf';
	}
};

/**
 * @function removeLabels
 * @param {Map} hashMap
 * @param {string[]} labels
 * @param {string[]} sortedLabelNames
 */
exports.removeLabels = function removeLabels(
	hashMap,
	labels,
	sortedLabelNames,
) {
	hashMap.delete(hashObject(labels, sortedLabelNames));
};

/**
 * @function setValue
 * @param {Map} hashMap
 * @param {*} value
 * @param {object} labels
 */
exports.setValue = function setValue(hashMap, value, labels) {
	const hash = hashObject(labels);
	hashMap.set(hash, {
		value: typeof value === 'number' ? value : 0,
		labels: labels || {},
	});
	return hashMap;
};

/**
 * @function setValueDelta
 * @param {Map} hashMap
 * @param {*} deltaValue
 * @param {object} labels
 * @returns {Map}
 */
exports.setValueDelta = function setValueDelta(
	hashMap,
	deltaValue,
	labels,
	hash = '',
) {
	const value = typeof deltaValue === 'number' ? deltaValue : 0;
	const entry = hashMap.get(hash);

	if (entry !== undefined) {
		entry.value += value;
	} else {
		hashMap.set(hash, { value, labels });
	}
	return hashMap;
};

/**
 * @param {string[]} labelNames
 * @param {any[]} args
 * @returns {object}
 */
exports.getLabels = function (labelNames, args) {
	if (typeof args[0] === 'object') {
		return args[0];
	}

	if (labelNames.length !== args.length) {
		throw new Error(
			`Invalid number of arguments (${args.length}): "${args.join(
				', ',
			)}" for label names (${labelNames.length}): "${labelNames.join(', ')}".`,
		);
	}

	const acc = {};
	for (let i = 0; i < labelNames.length; i++) {
		acc[labelNames[i]] = args[i];
	}
	return acc;
};

function fastHashObject(keys, labels) {
	if (keys.length === 0) {
		return '';
	}

	let hash = '';

	for (let i = 0; i < keys.length; i++) {
		const key = keys[i];
		const value = labels[key];
		if (value === undefined) continue;

		hash += `${key}:${value},`;
	}

	return hash;
}

function hashObject(labels, labelNames) {
	// We don't actually need a hash here. We just need a string that
	// is unique for each possible labels object and consistent across
	// calls with equivalent labels objects.

	if (labelNames) {
		return fastHashObject(labelNames, labels);
	}

	const keys = Object.keys(labels);
	if (keys.length > 1) {
		keys.sort(); // need consistency across calls
	}

	return fastHashObject(keys, labels);
}
exports.hashObject = hashObject;

exports.isObject = function isObject(obj) {
	return obj !== null && typeof obj === 'object';
};

function isEmpty(obj) {
	for (const key in obj) {
		return false;
	}

	return true;
}

exports.isEmpty = isEmpty;

exports.nowTimestamp = function nowTimestamp() {
	return Date.now() / 1000;
};

/**
 * @typedef StatsEntry {}
 * @property value {*}
 * @property labels {object}
 */

/**
 * Lookup table for stats by labels.
 */
class LabelMap {
	/** @type {Set<string>} */
	#labelNames;

	/** @type {Map<string, StatsEntry>} */
	#map = new Map();

	constructor(labelNames = []) {
		this.#labelNames = new Set(labelNames.slice().sort());
	}

	/**
	 * @function setValue
	 * @param {object} labels
	 * @param {*} value
	 * @returns {LabelMap}
	 */
	set(labels, value = 0) {
		const key = this.keyFrom(labels);
		const entry = this.#map.get(key);

		if (entry !== undefined) {
			entry.value = value;
		} else {
			this.#map.set(key, { value, labels });
		}

		return this;
	}

	/**
	 * @function setDelta
	 * @param {object} labels
	 * @param {*} value
	 * @returns {LabelMap}
	 */
	setDelta(labels, value = 0) {
		const key = this.keyFrom(labels);
		const entry = this.#map.get(key);

		if (entry !== undefined) {
			entry.value += value;
		} else {
			this.#map.set(key, { value, labels });
		}

		return this;
	}

	/**
	 * Get an entry from the store.
	 * @param labels
	 * @returns {*}
	 */
	get(labels) {
		return this.#map.get(this.keyFrom(labels))?.value;
	}

	/**
	 * Returns a record or creates one if it does not exist
	 *
	 * If there is no record at the location of the key, the init() function is
	 * called to create an object to put there. This allows for nested structures.
	 *
	 * @param {object} labels labels for the new entry
	 * @param {[Function]} init function to generate an empty record
	 * @returns {*} the existing value or the result of init()
	 */
	getOrAdd(labels, init) {
		const key = this.keyFrom(labels);
		let entry = this.#map.get(key);

		if (entry === undefined) {
			entry = { value: init(), labels };
			this.#map.set(key, entry);
		}

		return entry.value;
	}

	/**
	 * Return the raw entry.
	 * Used internally by some Metrics. You should probably not call this directly.
	 * @protected
	 * @param labels {object}
	 * @returns {StatsEntry}
	 */
	entry(labels) {
		return this.#map.get(this.keyFrom(labels));
	}

	/**
	 * Support for additional fields on the storage record.
	 * @param labels {object} lookup key
	 * @param values {object}
	 * @returns {object}
	 */
	merge(labels, values) {
		const key = this.keyFrom(labels);

		let entry = this.#map.get(key);
		if (entry !== undefined) {
			Object.assign(entry, values, { labels });
		} else {
			entry = { ...values, labels };
			this.#map.set(key, entry);
		}

		return entry;
	}

	/**
	 * Clear all records.
	 */
	clear() {
		this.#map.clear();
	}

	/**
	 * Size of the collection.
	 * @returns {number}
	 */
	get size() {
		return this.#map.size;
	}

	/**
	 * Remove entries for a label.
	 * @function remove
	 * @param {object} labels
	 */
	remove(labels) {
		this.#map.delete(this.keyFrom(labels));
	}

	/**
	 * Determine if the given labels are all legal.
	 * @param labels {object=}
	 * @returns {boolean}
	 */
	validate(labels) {
		if (labels !== undefined) {
			for (const name in labels) {
				if (!this.#labelNames.has(name)) {
					throw new Error(
						`Added label "${name}" is not included in initial labelset: ${util.inspect(Array.from(this.#labelNames))}`,
					);
				}
			}
		}

		return true;
	}

	/**
	 * Return all of the entries in this collection.
	 * @returns {Iterator<StatsEntry>}
	 */
	values() {
		return this.#map.values();
	}

	/**
	 * Generate a sparse key for this Map.
	 * @protected
	 * @param labels {object}
	 * @returns {string}
	 */
	keyFrom(labels = {}) {
		if (isEmpty(labels)) {
			return '';
		}

		let key = '';

		for (const labelName of this.#labelNames) {
			key = key.concat(labels[labelName] ?? '', '|');
		}

		return key;
	}
}

exports.LabelMap = LabelMap;

class Grouper extends Map {
	/**
	 * Adds the `value` to the `key`'s array of values.
	 * @param {*} key Key to set.
	 * @param {*} value Value to add to `key`'s array.
	 * @returns {undefined} undefined.
	 */
	add(key, value) {
		const entry = this.get(key);
		if (entry !== undefined) {
			entry.push(value);
		} else {
			this.set(key, [value]);
		}
	}
}

exports.Grouper = Grouper;

const GROWTH_RATE = 1.25;

/**
 * For grouping metrics by labels for reporting purposes.
 */
class LabelGrouper {
	/** @type {string[]} */
	#labelNames = new Array(6).fill('');

	/** @type {Map<string, Array<any>>} */
	#map = new Map();

	/**
	 * Current number of columns
	 * @type {number}
	 */
	#count = 0;

	/**
	 * Create a grouper.
	 */
	constructor() {}

	/**
	 * Adds the `value` to the `key`'s array of values.
	 * @param {StatsEntry} value Value to add to `key`'s array.
	 * @returns {LabelGrouper} undefined.
	 */
	add(value) {
		const labels = value.labels;
		const key = this.keyFrom(labels);

		const entry = this.#map.get(key);
		if (entry !== undefined) {
			entry.push(value);
		} else {
			this.#map.set(key, [value]);
		}

		return this;
	}

	/**
	 * Look up an entry by labels.
	 * Note: This can end up modifying the store if labels are missing.
	 * @param {object} labels Key to retrieve.
	 * @returns {Array<StatsEntry>} undefined.
	 */
	get(labels) {
		return this.#map.get(this.keyFrom(labels));
	}

	/**
	 * Return all of the entries in this collection.
	 * @returns {Array<StatsEntry>}
	 */
	values() {
		return Array.from(this.#map.values()).filter(entry => entry.length > 0);
	}

	/**
	 * Loop over the entries.
	 * @param fn {Function}
	 */
	forEach(fn) {
		return this.#map.forEach(fn);
	}

	/**
	 * Remove all values from the Grouper.
	 * Leaves the entries, but zeroes out the value arrays.
	 * @returns {LabelGrouper}
	 */
	clear() {
		for (const entry of this.#map.values()) {
			entry.length = 0;
		}

		return this;
	}

	/**
	 * Create a key for the given labels.
	 * Note: This can end up modifying the store if labels are missing.
	 * @param labels
	 * @returns {string}
	 */
	keyFrom(labels = {}) {
		const keys = Object.keys(labels);

		if (keys.length === 0) {
			return '';
		}

		const arr = new Array(this.#labelNames.length);

		let count = 0;
		for (let i = 0; i < this.#count; i++) {
			const name = this.#labelNames[i];
			const value = labels[name];

			if (value !== undefined) {
				arr[i] = value;
				count++;
			}
		}

		if (count < keys.length) {
			let pos = this.#count;
			const missing = this.#expandLabels(labels);
			for (const name of missing) {
				arr[pos++] = labels[name];
			}
		}

		return arr.join('|');
	}

	/**
	 * Size of the collection.
	 * @returns {number}
	 */
	get size() {
		return this.#map.size;
	}

	/**
	 * Search the labels for missing values and expand the lookup table to handle them.
	 * @param labels
	 * @returns {*[]}
	 */
	#expandLabels(labels) {
		const missing = [];

		for (const name of Object.keys(labels)) {
			if (this.#labelNames.indexOf(name) === -1) {
				missing.push(name);
			}
		}

		const target = missing.length + this.#count;
		const current = this.#labelNames.length;
		let width = current;

		if (target > width) {
			while (target > width) {
				width = Math.ceil(width * GROWTH_RATE);
			}

			this.#labelNames.length = width;
			this.#labelNames.fill('', current, width);

			const extension = '|'.repeat(width - current);
			const newMap = new Map();

			for (const [key, value] of this.#map.entries()) {
				newMap.set(`${key}${extension}`, value);
			}

			this.#map = newMap;
		}

		for (let i = this.#count, j = 0; j < missing.length; i++, j++) {
			this.#labelNames[i] = missing[j];
		}

		this.#count = target;

		return missing;
	}
}

module.exports.LabelGrouper = LabelGrouper;

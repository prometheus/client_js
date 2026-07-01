'use strict';

const Gauge = require('../gauge');
const linuxVariant = require('./osMemoryHeapLinux');
const safeRss = require('./helpers/safeRss');

const PROCESS_RESIDENT_MEMORY = 'process_resident_memory_bytes';

function notLinuxVariant(registry, config = {}) {
	const namePrefix = config.prefix ? config.prefix : '';
	const labels = config.labels ? config.labels : {};
	const labelNames = Object.keys(labels);

	new Gauge({
		name: namePrefix + PROCESS_RESIDENT_MEMORY,
		help: 'Resident memory size in bytes.',
		registers: registry ? [registry] : undefined,
		labelNames,
		collect() {
			// process.memoryUsage.rss() is faster than process.memoryUsage() as it
			// only reads RSS from the OS without collecting all heap statistics
			const rss = safeRss();
			if (rss !== undefined) {
				this.set(labels, rss);
			}
		},
	});
}

function isLinux() {
	return typeof process !== 'undefined' && process.platform === 'linux';
}

module.exports = (registry, config) =>
	isLinux()
		? linuxVariant(registry, config)
		: notLinuxVariant(registry, config);

module.exports.metricNames = isLinux()
	? linuxVariant.metricNames
	: [PROCESS_RESIDENT_MEMORY];

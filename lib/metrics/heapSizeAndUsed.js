'use strict';

const Gauge = require('../gauge');
const v8 = require('v8');
const safeMemoryUsage = require('./helpers/safeMemoryUsage');

const NODEJS_HEAP_SIZE_TOTAL = 'nodejs_heap_size_total_bytes';
const NODEJS_HEAP_SIZE_USED = 'nodejs_heap_size_used_bytes';
const NODEJS_HEAP_SIZE_LIMIT = 'nodejs_heap_size_limit_bytes';
const NODEJS_EXTERNAL_MEMORY = 'nodejs_external_memory_bytes';

function isHeapStatisticsSupported() {
	if (typeof v8.getHeapStatistics !== 'function') {
		return false;
	}
	try {
		v8.getHeapStatistics();
		return true;
	} catch (e) {
		if (e.code === 'ERR_NOT_IMPLEMENTED') {
			return false;
		}
		throw e;
	}
}

const heapStatisticsSupported = isHeapStatisticsSupported();

module.exports = (registry, config = {}) => {
	if (typeof process.memoryUsage !== 'function') {
		return;
	}

	const labels = config.labels ? config.labels : {};
	const labelNames = Object.keys(labels);

	const registers = registry ? [registry] : undefined;
	const namePrefix = config.prefix ? config.prefix : '';
	let heapSizeLimit;
	const collect = () => {
		const memUsage = safeMemoryUsage();
		if (memUsage) {
			heapSizeTotal.set(labels, memUsage.heapTotal);
			heapSizeUsed.set(labels, memUsage.heapUsed);
			if (memUsage.external !== undefined) {
				externalMemUsed.set(labels, memUsage.external);
			}
		}
		if (heapSizeLimit) {
			try {
				heapSizeLimit.set(labels, v8.getHeapStatistics().heap_size_limit);
			} catch {
				// noop
			}
		}
	};

	const heapSizeTotal = new Gauge({
		name: namePrefix + NODEJS_HEAP_SIZE_TOTAL,
		help: 'Process heap size from Node.js in bytes.',
		registers,
		labelNames,
		// Use this one metric's `collect` to set all metrics' values.
		collect,
	});
	const heapSizeUsed = new Gauge({
		name: namePrefix + NODEJS_HEAP_SIZE_USED,
		help: 'Process heap size used from Node.js in bytes.',
		registers,
		labelNames,
	});
	const externalMemUsed = new Gauge({
		name: namePrefix + NODEJS_EXTERNAL_MEMORY,
		help: 'Node.js external memory size in bytes.',
		registers,
		labelNames,
	});

	if (heapStatisticsSupported) {
		heapSizeLimit = new Gauge({
			name: namePrefix + NODEJS_HEAP_SIZE_LIMIT,
			help: 'V8 maximum JavaScript heap size limit in bytes.',
			registers,
			labelNames,
		});
	}
};

module.exports.metricNames = [
	NODEJS_HEAP_SIZE_TOTAL,
	NODEJS_HEAP_SIZE_USED,
	...(heapStatisticsSupported ? [NODEJS_HEAP_SIZE_LIMIT] : []),
	NODEJS_EXTERNAL_MEMORY,
];

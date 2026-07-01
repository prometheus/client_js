'use strict';

const Gauge = require('../gauge');

const uptime =
	typeof process !== 'undefined' && typeof process.uptime === 'function'
		? process.uptime()
		: 0;

const startInSeconds = Math.round(Date.now() / 1000 - uptime);

const PROCESS_START_TIME = 'process_start_time_seconds';

module.exports = (registry, config = {}) => {
	const namePrefix = config.prefix ? config.prefix : '';
	const labels = config.labels ? config.labels : {};
	const labelNames = Object.keys(labels);

	new Gauge({
		name: namePrefix + PROCESS_START_TIME,
		help: 'Start time of the process since unix epoch in seconds.',
		registers: registry ? [registry] : undefined,
		labelNames,
		aggregator: 'omit',
		collect() {
			this.set(labels, startInSeconds);
		},
	});
};

module.exports.metricNames = [PROCESS_START_TIME];

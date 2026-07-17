'use strict';

const Summary = require('../summary');
const Histogram = require('../histogram');

const { performance } = require('perf_hooks');

// Reported always.
const NODEJS_EVENTLOOP_UTILIZATION_SUMMARY =
	'nodejs_eventloop_utilization_summary';

const NODEJS_EVENTLOOP_UTILIZATION_HISTOGRAM =
	'nodejs_eventloop_utilization_histogram';

const DEFAULT_ELU_HISTOGRAM_BUCKETS = [
	0.01, 0.05, 0.1, 0.25, 0.5, 0.6, 0.7, 0.75, 0.8, 0.9, 0.95, 0.99, 1,
];

const DEFAULT_ELU_SUMMARY_PERCENTILES = [
	0.01, 0.05, 0.5, 0.9, 0.95, 0.99, 0.999,
];

module.exports = (registry, config = {}) => {
	const eventLoopUtilization = performance.eventLoopUtilization;

	const namePrefix = config.prefix ? config.prefix : '';
	const labels = config.labels ? config.labels : {};
	const labelNames = Object.keys(labels);
	const registers = registry ? [registry] : undefined;

	const ageBuckets = config.eventLoopUtilizationAgeBuckets
		? config.eventLoopUtilizationAgeBuckets
		: 5;

	const maxAgeSeconds = config.eventLoopUtilizationMaxAgeSeconds
		? config.eventLoopUtilizationMaxAgeSeconds
		: 60;

	const percentiles = config.eventLoopUtilizationPercentiles
		? config.eventLoopUtilizationPercentiles
		: DEFAULT_ELU_SUMMARY_PERCENTILES;

	const summary = new Summary({
		name: namePrefix + NODEJS_EVENTLOOP_UTILIZATION_SUMMARY,
		help: 'Ratio of time the event loop is not idling in the event provider to the total time the event loop is running.',
		maxAgeSeconds,
		ageBuckets,
		percentiles,
		registers,
		labelNames,
	});

	const buckets = config.eventLoopUtilizationBuckets
		? config.eventLoopUtilizationBuckets
		: DEFAULT_ELU_HISTOGRAM_BUCKETS;

	const histogram = new Histogram({
		name: namePrefix + NODEJS_EVENTLOOP_UTILIZATION_HISTOGRAM,
		help: 'Ratio of time the event loop is not idling in the event provider to the total time the event loop is running.',
		buckets,
		registers,
		labelNames,
	});

	const intervalTimeout = config.eventLoopUtilizationTimeout || 100;

	let elu1 = eventLoopUtilization();
	let start = process.hrtime();

	setInterval(() => {
		const elu2 = eventLoopUtilization();
		const end = process.hrtime();

		const timeMs = (end[0] - start[0]) * 1000 + (end[1] - start[1]) / 1e6;
		const value = eventLoopUtilization(elu2, elu1).utilization;

		const blockedIntervalsNumber = Math.round(timeMs / intervalTimeout);
		for (let i = 0; i < blockedIntervalsNumber; i++) {
			summary.observe(value);
			histogram.observe(value);
		}

		elu1 = elu2;
		start = end;
	}, intervalTimeout).unref();
};

module.exports.metricNames = [
	NODEJS_EVENTLOOP_UTILIZATION_SUMMARY,
	NODEJS_EVENTLOOP_UTILIZATION_HISTOGRAM,
];

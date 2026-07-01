'use strict';

const { getLabelCombinations, getLabelNames } = require('./utils/labels');

module.exports = setupClusterSuite;

function setupClusterSuite(suite) {
	suite.add(
		`aggregate()`,
		(client, data) => client.AggregatorRegistry.aggregate(data),
		{ setup },
	);
}

async function setup(client) {
	const { Counter, Histogram, Registry } = client;
	const registers = new Array(3).fill(0).map(() => new Registry());
	const labelNames = getLabelNames(8);

	const counters = new Array(2).fill(0).map(
		(_, i) =>
			new Counter({
				name: `counter${i}`,
				help: 'counter',
				labelNames,
				registers,
			}),
	);

	const histograms = new Array(3).fill(0).map(
		(_, i) =>
			new Histogram({
				name: `histogram${i}`,
				help: 'histogram',
				labelNames,
				registers,
			}),
	);

	const combinations = getLabelCombinations([3, 5, 3, 4, 8], labelNames);

	for (const labels of combinations) {
		for (const counter of counters) {
			counter.inc(labels, 1);
			counter.inc(labels, 2);
		}
		for (const histogram of histograms) {
			histogram.observe(labels, 1);
			histogram.observe(labels, 0.2);
			histogram.observe(labels, 0.9);
			histogram.observe(labels, 2.1);
		}
	}

	const results = [];

	for (const registry of registers) {
		results.push(await registry.getMetricsAsJSON());
	}

	return results;
}

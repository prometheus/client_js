'use strict';

const { getLabelNames, getLabelCombinations } = require('./utils/labels');

module.exports = setupRegistrySuite;

function setupRegistrySuite(suite) {
	const labelSetups = [
		{ name: 'no labels', counts: [] },
		{ name: '1 x 64', counts: [64] },
		{ name: '2 x 4', counts: [4, 4] },
		{ name: '2 x 8', counts: [8, 8] },
		{ name: '6 x 2', counts: [2, 2, 2, 2, 2, 2] },
		{ name: '2 x 4, 2 defaults', counts: [4, 4], defaults: 2 },
		{ name: '2 x 2, 4 defaults', counts: [2, 2], defaults: 4 },
	];

	labelSetups.forEach(({ name, counts, defaults }) => {
		suite.add(
			`getMetricsAsJSON() ${name}`,
			(client, registry) => registry.getMetricsAsJSON(),
			{ setup: setup(counts, defaults, false) },
		);
	});

	labelSetups.forEach(({ name, counts, defaults }) => {
		suite.add(`metrics() ${name}`, (client, registry) => registry.metrics(), {
			setup: setup(counts, defaults, false),
		});
		suite.add(
			`metrics() ${name} and openMetrics`,
			(client, registry) => registry.metrics(),
			{ setup: setup(counts, defaults, true) },
		);
	});
}

function setup(labelCounts, defaultLabels, open) {
	return client => {
		const contentType = open
			? client.Registry.OPENMETRICS_CONTENT_TYPE
			: undefined;
		const registry = new client.Registry(contentType);

		if (defaultLabels) {
			const defaults = getLabelCombinations(new Array(defaultLabels).fill(1));
			registry.setDefaultLabels(defaults);
		}

		const histogram = new client.Histogram({
			name: 'histogram',
			help: 'histogram',
			labelNames: getLabelNames(labelCounts.length),
			registers: [registry],
		});

		const counter = new client.Counter({
			name: 'counter',
			help: 'counter',
			labelNames: getLabelNames(labelCounts.length),
			registers: [registry],
		});

		const labelCombinations = getLabelCombinations(labelCounts);

		labelCombinations.forEach(labels => histogram.observe({ ...labels }, 1));
		labelCombinations.forEach(labels => counter.inc({ ...labels }, 1));

		return registry;
	};
}

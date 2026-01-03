'use strict';

const Path = require('path');
const { createRequire } = require('node:module');
const { getLabelCombinations } = require('./utils/labels');

let count = 1;

module.exports = function setupSuites(benchmark) {
	benchmark.suite('osMemoryHeap', suite => {
		suite.add(
			'new',
			(client, { labels, metric: osMemoryHeap, registry }) =>
				osMemoryHeap(registry, {
					prefix: `heap${count++}`,
					help: 'HeapUsed',
					labels,
				}),
			{
				setup: (client, location) =>
					loadMetrics(client, location, 'osMemoryHeap'),
				teardown,
			},
		);

		suite.add('collect', async (client, { registry }) => registry.metrics(), {
			setup: (client, location) => {
				const ctx = loadMetrics(client, location, 'osMemoryHeap');
				const { metric: osMemoryHeap, labels, registry } = ctx;

				osMemoryHeap(registry, {
					prefix: `heap${count++}`,
					help: 'HeapUsed',
					labels,
				});

				return { registry };
			},
			teardown,
		});
	});
};

function loadMetrics(client, location, metricName) {
	const require = createRequire(location);
	const fromModule = Path.join(location, `./lib/metrics/${metricName}`);
	const combinations = getLabelCombinations([1], ['region', 'env']);

	return {
		metric: require(fromModule),
		labels: combinations[0],
		registry: new client.Registry(),
	};
}

function teardown(client, { registry }) {
	registry.clear();
}

'use strict';

const { getLabelNames, labelCombinationFactory } = require('./utils/labels');

module.exports = setupCounterSuite;

let count = 1;

function setupCounterSuite(suite) {
	suite.add(
		'new',
		(client, { labelNames, registry }) =>
			new client.Counter({
				name: `Counter${count++}`,
				help: 'Counter',
				labelNames,
				registers: [registry],
			}),
		{
			setup: client => {
				return {
					labelNames: getLabelNames(4),
					registry: new client.Registry(),
				};
			},
		},
	);
	suite.add(
		'inc',
		labelCombinationFactory([], (client, { Counter }, labels) =>
			Counter.inc(labels, 1),
		),
		{ teardown, setup: setup(0) },
	);

	suite.add(
		'inc with labels',
		labelCombinationFactory([8, 8, 3], (client, { Counter }, labels) =>
			Counter.inc(labels, 1),
		),
		{ teardown, setup: setup(3) },
	);
}

function setup(labelCount) {
	return client => {
		const registry = new client.Registry();

		const Counter = new client.Counter({
			name: 'Counter',
			help: 'Counter',
			labelNames: getLabelNames(labelCount),
			registers: [registry],
		});

		return { registry, Counter };
	};
}

function teardown(client, { registry }) {
	registry.clear();
}

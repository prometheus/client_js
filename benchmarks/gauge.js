'use strict';

const { getLabelNames, labelCombinationFactory } = require('./utils/labels');

module.exports = setupGaugeSuite;

function setupGaugeSuite(suite) {
	suite.add('inc', (client, { Gauge }) => Gauge.inc(1), {
		teardown,
		setup: setup(0),
	});

	suite.add(
		'inc with labels',
		labelCombinationFactory([8, 8], (client, { Gauge }, labels) =>
			Gauge.inc(labels, 1),
		),
		{ teardown, setup: setup(2) },
	);
}

function setup(labelCount) {
	return client => {
		const registry = new client.Registry();

		const Gauge = new client.Gauge({
			name: 'Gauge',
			help: 'Gauge',
			labelNames: getLabelNames(labelCount),
			registers: [registry],
		});

		return { registry, Gauge };
	};
}

function teardown(client, { registry }) {
	registry.clear();
}

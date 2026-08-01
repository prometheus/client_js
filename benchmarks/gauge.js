// Copyright The Prometheus Authors
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0

// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

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

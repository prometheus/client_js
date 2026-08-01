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

module.exports = setupHistogramSuite;

function setupHistogramSuite(suite) {
	suite.add(
		'observe#1 with 64',
		labelCombinationFactory([64], (client, { histogram }, labels) =>
			histogram.observe(labels, 1),
		),
		{ teardown, setup: setup(1) },
	);

	suite.add(
		'observe#2 with 8',
		labelCombinationFactory([8, 8], (client, { histogram }, labels) =>
			histogram.observe(labels, 1),
		),
		{ teardown, setup: setup(2) },
	);

	suite.add(
		'observe#2 with 4 and 2 with 2',
		labelCombinationFactory([4, 4, 2, 2], (client, { histogram }, labels) =>
			histogram.observe(labels, 1),
		),
		{ teardown, setup: setup(4) },
	);

	suite.add(
		'observe#2 with 2 and 2 with 4',
		labelCombinationFactory([2, 2, 4, 4], (client, { histogram }, labels) =>
			histogram.observe(labels, 1),
		),
		{ teardown, setup: setup(4) },
	);

	suite.add(
		'observe#6 with 2',
		labelCombinationFactory(
			[2, 2, 2, 2, 2, 2],
			(client, { histogram }, labels) => histogram.observe(labels, 1),
		),
		{ teardown, setup: setup(6) },
	);

	suite.add(
		'startTimer#1 with 64',
		labelCombinationFactory([64], (client, { histogram }, labels) =>
			histogram.startTimer(labels, 1)({}),
		),
		{ teardown, setup: setup(1) },
	);

	suite.add(
		'startTimer#2 with 8',
		labelCombinationFactory([8, 8], (client, { histogram }, labels) =>
			histogram.startTimer(labels, 1)({}),
		),
		{ teardown, setup: setup(2) },
	);

	suite.add(
		'startTimer#2 with 4 and 2 with 2',
		labelCombinationFactory([4, 4, 2, 2], (client, { histogram }, labels) =>
			histogram.startTimer(labels, 1)({}),
		),
		{ teardown, setup: setup(4) },
	);

	suite.add(
		'startTimer#2 with 2 and 2 with 4',
		labelCombinationFactory([2, 2, 4, 4], (client, { histogram }, labels) =>
			histogram.startTimer(labels, 1)({}),
		),
		{ teardown, setup: setup(4) },
	);

	suite.add(
		'startTimer#6 with 2',
		labelCombinationFactory(
			[2, 2, 2, 2, 2, 2],
			(client, { histogram }, labels) => histogram.startTimer(labels, 1)({}),
		),
		{ teardown, setup: setup(6) },
	);
}

function setup(labelCount) {
	return client => {
		const registry = new client.Registry();

		const histogram = new client.Histogram({
			name: 'histogram',
			help: 'histogram',
			labelNames: getLabelNames(labelCount),
			registers: [registry],
		});

		return { registry, histogram };
	};
}

function teardown(client, { registry }) {
	registry.clear();
}

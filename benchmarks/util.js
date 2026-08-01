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

const Path = require('path');

module.exports = setupUtilSuite;

function setupUtilSuite(suite) {
	const skip = ['@prometheus/client@latest'];

	suite.add(
		'hashObject',
		(client, Util) => {
			Util.hashObject({
				foo: 'longish',
				user_agent: 'Chrome',
				gateway: 'lb04',
				method: 'get',
				status_code: 200,
				phase: 'load',
			});
		},
		{ setup: findUtil, skip },
	);

	suite.add(
		'LabelMap.validate()',
		(client, labelMap) => {
			labelMap.validate({
				foo: 'longish',
				user_agent: 'Chrome',
				gateway: 'lb04',
				method: 'get',
				status_code: 200,
				phase: 'load',
				label1: 4,
			});
		},
		{ setup, skip },
	);

	suite.add(
		'LabelMap.keyFrom()',
		(client, labelMap) => {
			labelMap.keyFrom({
				foo: 'longish',
				user_agent: 'Chrome',
				gateway: 'lb04',
				method: 'get',
				status_code: 301,
				phase: 'load',
				label1: 4,
			});
		},
		{ setup, skip },
	);

	suite.add(
		'LabelGrouper.keyFrom()',
		(client, labelGrouper) => {
			if (labelGrouper === undefined) {
				return;
			}

			labelGrouper.keyFrom({
				foo: 'longish',
				user_agent: 'Chrome',
				gateway: 'lb04',
				method: 'get',
				status_code: 503,
				phase: 'load',
				label1: 4,
			});
		},
		{
			setup: (client, location) => {
				const Util = findUtil(client, location);

				return new Util.LabelGrouper();
			},
			skip: ['@prometheus/client@latest', '@prometheus/client@trunk'],
		},
	);
}

function setup(client, location) {
	const { LabelMap } = findUtil(client, location);

	return new LabelMap([
		'foo',
		'user_agent',
		'gateway',
		'method',
		'status_code',
		'phase',
		'label1',
	]);
}

function findUtil(client, location) {
	const Util = require(Path.join(location, 'lib/util.js'));
	return Util;
}

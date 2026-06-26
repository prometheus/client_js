'use strict';

const Path = require('path');

module.exports = setupUtilSuite;

function setupUtilSuite(suite) {
	const skip = ['prom-client@latest'];

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
			skip: ['prom-client@latest', 'prom-client@trunk'],
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

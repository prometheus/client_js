'use strict';

const Path = require('path');

module.exports = setupMemoryUsageSuite;

function setupMemoryUsageSuite(suite) {
	const skip = ['prom-client@latest', 'prom-client@trunk'];

	suite.add('process.memoryUsage().rss', () => process.memoryUsage().rss, {
		skip,
	});

	suite.add('process.memoryUsage.rss()', () => process.memoryUsage.rss(), {
		skip,
	});

	suite.add('safeMemoryUsage().rss', (_, helper) => helper()?.rss, {
		skip,
		setup: loadHelper('../lib/metrics/helpers/safeMemoryUsage.js'),
	});

	suite.add('safeRss()', (_, helper) => helper(), {
		skip,
		setup: loadHelper('../lib/metrics/helpers/safeRss.js'),
	});
}

function loadHelper(relativePath) {
	return () => require(Path.resolve(__dirname, relativePath));
}

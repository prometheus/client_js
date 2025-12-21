'use strict';

const Benchmark = require('faceoff').default;
const debug = require('debug')('benchmark');

/**
 * Async suite workaround. benchmark-regression forwards no options to
 * benchmark.js from its own suite() and run() functions.
 * And as implemented, benchmark.js only supports async setup()
 * and teardown() functions, not the test itself. Given that benchmark.js is
 * now an archived project, and benchmark-regression hasn't landed a PR since
 * 2018, that situation is unlikely to change soon.
 */

const benchmarks = new Benchmark({
	'prom-client@latest': 'prom-client@latest',
	'prom-client@trunk': 'git@github.com:siimon/prom-client',
	'prom-client@current': { location: process.cwd() },
});

benchmarks.suite('counter', require('./counter'));
benchmarks.suite('gauge', require('./gauge'));
benchmarks.suite('histogram', require('./histogram'));
benchmarks.suite('util', require('./util'));
benchmarks.suite('summary', require('./summary'));
benchmarks.suite('registry', require('./registry'));
benchmarks.suite('cluster', require('./cluster'));

benchmarks
	.run()
	.then(() => {
		debug('Process end');
	})
	.catch(err => {
		console.error('Failure', err);
		console.error(err.stack);
		// eslint-disable-next-line n/no-process-exit
		process.exit(1);
	});

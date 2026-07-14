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

const Benchmark = require('faceoff').default;

/**
 * Async suite workaround. benchmark-regression forwards no options to
 * benchmark.js from its own suite() and run() functions.
 * And as implemented, benchmark.js only supports async setup()
 * and teardown() functions, not the test itself. Given that benchmark.js is
 * now an archived project, and benchmark-regression hasn't landed a PR since
 * 2018, that situation is unlikely to change soon.
 */

const benchmarks = new Benchmark({
	// TODO: Update this once the module is published to as @prometheus/client.
	'@prometheus/client@latest': 'prom-client@latest',
	'@prometheus/client@trunk': 'git@github.com:prometheus/client_js',
	'@prometheus/client@current': { location: process.cwd() },
});

benchmarks.suite('counter', require('./counter'));
benchmarks.suite('gauge', require('./gauge'));
benchmarks.suite('histogram', require('./histogram'));
benchmarks.suite('util', require('./util'));
benchmarks.suite('summary', require('./summary'));
benchmarks.suite('registry', require('./registry'));
benchmarks.suite('cluster', require('./cluster'));

benchmarks.run().catch(err => {
	console.error('Failure', err);
	console.error(err.stack);
	// eslint-disable-next-line n/no-process-exit
	process.exit(1);
});

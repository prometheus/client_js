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

// Gauge
// Single Label
// Multiple Values

const { Gauge, register } = require('..');

async function main() {
	const g = new Gauge({
		name: 'test_gauge',
		help: 'Example of a gauge',
		labelNames: ['code'],
	});

	const done = g.startTimer({});

	g.set({ code: 200 }, 5);
	console.log(await register.metrics());
	/*
	# HELP test_gauge Example of a gauge
	# TYPE test_gauge gauge
	test_gauge{code="200"} 5
	*/

	g.set(15);
	console.log(await register.metrics());
	/*
	# HELP test_gauge Example of a gauge
	# TYPE test_gauge gauge
	test_gauge{code="200"} 5
	test_gauge 15
	*/

	g.labels('200').inc();
	console.log(await register.metrics());
	/*
	# HELP test_gauge Example of a gauge
	# TYPE test_gauge gauge
	test_gauge{code="200"} 6
	test_gauge 15
	*/

	g.inc();
	console.log(await register.metrics());
	/*
	# HELP test_gauge Example of a gauge
	# TYPE test_gauge gauge
	test_gauge{code="200"} 6
	test_gauge 16
	*/

	g.set(22);
	done();

	console.log(await register.metrics());
	/*
	# HELP test_gauge Example of a gauge
	# TYPE test_gauge gauge
	test_gauge{code="200"} 6
	test_gauge 22
	*/
}

main();

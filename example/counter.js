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

// Counter
// Single Label
// Multiple Values

const { Counter, register } = require('..');

async function main() {
	const c = new Counter({
		name: 'test_counter',
		help: 'Example of a counter',
		labelNames: ['code'],
	});

	c.inc({ code: 200 });
	console.log(await register.metrics());
	/*
	# HELP test_counter Example of a counter
	# TYPE test_counter counter
	test_counter{code="200"} 1
	*/

	c.inc({ code: 200 });
	console.log(await register.metrics());
	/*
	# HELP test_counter Example of a counter
	# TYPE test_counter counter
	test_counter{code="200"} 2
	*/

	c.inc();
	console.log(await register.metrics());
	/*
	# HELP test_counter Example of a counter
	# TYPE test_counter counter
	test_counter{code="200"} 2
	test_counter 1
	*/

	c.reset();
	console.log(await register.metrics());
	/*
	# HELP test_counter Example of a counter
	# TYPE test_counter counter
	*/

	c.inc(15);
	console.log(await register.metrics());
	/*
	# HELP test_counter Example of a counter
	# TYPE test_counter counter
	test_counter 15
	*/

	c.inc({ code: 200 }, 12);
	console.log(await register.metrics());
	/*
	# HELP test_counter Example of a counter
	# TYPE test_counter counter
	test_counter 15
	test_counter{code="200"} 12
	*/

	c.labels('200').inc(12);
	console.log(await register.metrics());
	/*
	# HELP test_counter Example of a counter
	# TYPE test_counter counter
	test_counter 15
	test_counter{code="200"} 24
	*/
}

main();

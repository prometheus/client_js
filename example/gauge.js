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

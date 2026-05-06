'use strict';

// Summary
// Single Label
// Multiple Values

const { Summary, register } = require('..');

async function main() {
	const summ = new Summary({
		name: 'test_summary',
		help: 'Example of summary',
		labelNames: ['code'],
		percentiles: [0.5, 0.9, 0.99],
	});

	summ.observe({ code: '200' }, 0.7);
	summ.observe({ code: '200' }, 0.1);
	summ.observe({ code: '400' }, 1.5);
	summ.observe({ code: '500' }, 2.2);

	console.log(await register.metrics());
	/*
	# HELP test_summary Example of summary
	# TYPE test_summary summary
	test_summary{quantile="0.5",code="200"} 0.4
	test_summary{quantile="0.9",code="200"} 0.7
	test_summary{quantile="0.99",code="200"} 0.7
	test_summary_sum{code="200"} 0.7999999999999999
	test_summary_count{code="200"} 2
	test_summary{quantile="0.5",code="400"} 1.5
	test_summary{quantile="0.9",code="400"} 1.5
	test_summary{quantile="0.99",code="400"} 1.5
	test_summary_sum{code="400"} 1.5
	test_summary_count{code="400"} 1
	test_summary{quantile="0.5",code="500"} 2.2
	test_summary{quantile="0.9",code="500"} 2.2
	test_summary{quantile="0.99",code="500"} 2.2
	test_summary_sum{code="500"} 2.2
	test_summary_count{code="500"} 1
	*/

	summ.observe({ code: '200' }, 0.4);
	console.log(await register.metrics());
	/*
	# HELP test_summary Example of summary
	# TYPE test_summary summary
	test_summary{quantile="0.5",code="200"} 0.4
	test_summary{quantile="0.9",code="200"} 0.7
	test_summary{quantile="0.99",code="200"} 0.7
	test_summary_sum{code="200"} 1.2
	test_summary_count{code="200"} 3
	test_summary{quantile="0.5",code="400"} 1.5
	test_summary{quantile="0.9",code="400"} 1.5
	test_summary{quantile="0.99",code="400"} 1.5
	test_summary_sum{code="400"} 1.5
	test_summary_count{code="400"} 1
	test_summary{quantile="0.5",code="500"} 2.2
	test_summary{quantile="0.9",code="500"} 2.2
	test_summary{quantile="0.99",code="500"} 2.2
	test_summary_sum{code="500"} 2.2
	test_summary_count{code="500"} 1
	*/
}

main();

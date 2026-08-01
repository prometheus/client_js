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

const client = require('../index');

function run() {
	const Registry = client.Registry;
	const register = new Registry();
	const gateway = new client.Pushgateway('http://127.0.0.1:9091', [], register);
	const prefix = 'dummy_prefix_name';

	const test = new client.Counter({
		name: `${prefix}_test`,
		help: `${prefix}_test`,
		registers: [register],
	});
	register.registerMetric(test);
	test.inc(10);

	return gateway
		.push({ jobName: prefix })
		.then(({ resp, body }) => {
			console.log(`Body: ${body}`);
			console.log(`Response status: ${resp.statusCode}`);
		})
		.catch(err => {
			console.log(`Error: ${err}`);
		});
}

run();

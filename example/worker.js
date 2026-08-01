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
const { Worker, isMainThread, workerData } = require('node:worker_threads');
const express = require('express');
const WorkerRegistry = require('../').WorkerRegistry;

const collector = workerData?.['@prometheus/client']?.collector === true;
const metricsServer = express();
const workerRegistry = new WorkerRegistry(
	WorkerRegistry.PROMETHEUS_CONTENT_TYPE,
	collector,
);

if (isMainThread) {
	// By default the main thread is the collector. Demonstrating off-loading.
	new Worker(Path.join(__filename), {
		env: { ...process.env, PORT: 3333 },
		workerData: {
			'@prometheus/client': { collector: true },
		},
	});

	for (let i = 1; i <= 10; i++) {
		const opts = { env: { ...process.env, PORT: 3000 + i } };
		new Worker(Path.join(__filename), opts);
	}
}

if (collector) {
	metricsServer.get('/cluster_metrics', async (req, res) => {
		try {
			const metrics = await workerRegistry.workerMetrics();
			res.set('Content-Type', workerRegistry.contentType);
			res.send(metrics);
		} catch (ex) {
			res.statusCode = 500;
			res.send(ex.message);
		}
	});

	metricsServer.listen(process.env.PORT, () => {
		console.log(
			`Cluster metrics server listening to ${process.env.PORT}, metrics exposed on /cluster_metrics`,
		);
	});
} else {
	require('./server.js');
}

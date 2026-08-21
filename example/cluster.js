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

const cluster = require('cluster');
const express = require('express');
const { ClusterRegistry } = require('../');

const metricsServer = express();
const clusterRegistry = new ClusterRegistry();

if (cluster.isPrimary) {
	require('../').collectDefaultMetrics({
		gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2, 5], // These are the default buckets.
	});

	for (let i = 1; i <= 4; i++) {
		cluster.fork({ ...process.env, PORT: 3000 + i });
	}

	async function gracefulShutdown(worker) {
		return new Promise((resolve, reject) => {
			worker.send('shutdown');
			worker.once('exit', event => {
				resolve(event);
			});
			worker.once('error', event => {
				reject(event);
			});
		});
	}

	async function shutdown() {
		console.log('Shutting down...');

		await Promise.all(Object.values(cluster.workers).map(gracefulShutdown));

		console.log('Workers terminated');
	}

	['SIGHUP', 'SIGINT', 'SIGQUIT', 'SIGTERM'].forEach(sig => {
		process.on(sig, async () => {
			await shutdown(sig);
			// eslint-disable-next-line n/no-process-exit
			process.exit(0);
		});
	});

	metricsServer.get('/cluster_metrics', async (req, res) => {
		try {
			const metrics = await clusterRegistry.clusterMetrics();
			res.set('Content-Type', clusterRegistry.contentType);
			res.send(metrics);
		} catch (ex) {
			console.error(ex);
			res.statusCode = 500;
			res.send(ex.message);
		}
	});

	metricsServer.listen(3000, () => {
		console.log(
			'Cluster metrics server listening to 3000, metrics exposed on /cluster_metrics',
		);
	});
} else {
	process.on('message', async message => {
		if (message === 'shutdown') {
			console.log('worker shutting down');
			try {
				await clusterRegistry.shutdown();
				// eslint-disable-next-line n/no-process-exit
				process.exit(0);
			} catch (error) {
				console.error(error);
				// eslint-disable-next-line n/no-process-exit
				process.exit(1);
			}
		}
	});

	require('./server.js');
}

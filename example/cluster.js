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
	for (let i = 1; i <= 4; i++) {
		cluster.fork({ ...process.env, PORT: 3000 + i });
	}

	metricsServer.get('/cluster_metrics', async (req, res) => {
		try {
			const metrics = await clusterRegistry.clusterMetrics();
			res.set('Content-Type', clusterRegistry.contentType);
			res.send(metrics);
		} catch (ex) {
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
	require('./server.js');
}

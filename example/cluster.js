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

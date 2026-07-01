'use strict';

const Path = require('path');
const { Worker, isMainThread, workerData } = require('node:worker_threads');
const express = require('express');
const WorkerRegistry = require('../').WorkerRegistry;

const collector = workerData?.['prom-client']?.collector === true;
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
			'prom-client': { collector: true },
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

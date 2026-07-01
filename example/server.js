'use strict';

const express = require('express');
const cluster = require('cluster');
const { isMainThread, threadId } = require('node:worker_threads');
const server = express();
const register = require('../').register;

// Enable collection of default metrics

require('../').collectDefaultMetrics({
	gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2, 5], // These are the default buckets.
});

// Create custom metrics

const Histogram = require('../').Histogram;
const h = new Histogram({
	name: 'test_histogram',
	help: 'Example of a histogram',
	labelNames: ['code'],
});

const Counter = require('../').Counter;
const c = new Counter({
	name: 'test_counter',
	help: 'Example of a counter',
	labelNames: ['code'],
});

new Counter({
	name: 'scrape_counter',
	help: 'Number of scrapes (example of a counter with a collect fn)',
	collect() {
		// collect is invoked each time `register.metrics()` is called.
		this.inc();
	},
});

const Gauge = require('../').Gauge;
const g = new Gauge({
	name: 'test_gauge',
	help: 'Example of a gauge',
	labelNames: ['method', 'code'],
});

// Set metric values to some random values for demonstration

setTimeout(() => {
	h.labels('200').observe(Math.random());
	h.labels('300').observe(Math.random());
}, 10);

setInterval(() => {
	c.inc({ code: 200 });
}, 5000);

setInterval(() => {
	c.inc({ code: 400 });
}, 2000);

setInterval(() => {
	c.inc();
}, 2000);

setInterval(() => {
	g.set({ method: 'get', code: 200 }, Math.random());
	g.set(Math.random());
	g.labels('post', '300').inc();
}, 100);

if (cluster.isWorker) {
	// Expose some worker-specific metric as an example
	setInterval(() => {
		c.inc({ code: `worker_${cluster.worker.id}` });
	}, 2000);
} else if (!isMainThread) {
	// Expose some worker-specific metric as an example
	setInterval(() => {
		c.inc({ code: `worker_${threadId}` });
	}, 2000);
}

const t = [];
setInterval(() => {
	for (let i = 0; i < 100; i++) {
		t.push(new Date());
	}
}, 10);
setInterval(() => {
	while (t.length > 0) {
		t.pop();
	}
});

// Setup server to Prometheus scrapes:

server.get('/metrics', async (req, res) => {
	try {
		res.set('Content-Type', register.contentType);
		res.end(await register.metrics());
	} catch (ex) {
		res.status(500).end(ex);
	}
});

server.get('/metrics/counter', async (req, res) => {
	try {
		res.set('Content-Type', register.contentType);
		res.end(await register.getSingleMetricAsString('test_counter'));
	} catch (ex) {
		res.status(500).end(ex);
	}
});

const port = process.env.PORT || 3000;
server.listen(port, () => {
	console.log(
		`Server listening to ${port}, metrics exposed on /metrics endpoint`,
	);
});

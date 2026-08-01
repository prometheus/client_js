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

const { register, Registry, Counter, Histogram } = require('..');

async function makeCounters() {
	const c = new Counter({
		name: 'test_counter_exemplar',
		help: 'Example of a counter with exemplar',
		labelNames: ['code'],
		enableExemplars: true,
	});

	const exemplarLabels = { traceId: '888', spanId: 'jjj' };

	c.inc({
		labels: { code: 300 },
		value: 1,
		exemplarLabels,
	});
	c.inc({
		labels: { code: 200 },
		exemplarLabels,
	});

	c.inc({ exemplarLabels });
	c.inc();
}

async function makeHistograms() {
	const h = new Histogram({
		name: 'test_histogram_exemplar',
		help: 'Example of a histogram with exemplar',
		labelNames: ['code'],
		enableExemplars: true,
	});

	const exemplarLabels = { traceId: '111', spanId: 'zzz' };

	h.observe({
		labels: { code: '200' },
		value: 1,
		exemplarLabels,
	});

	h.observe({
		labels: { code: '200' },
		value: 3,
		exemplarLabels,
	});

	h.observe({
		labels: { code: '200' },
		value: 0.3,
		exemplarLabels,
	});

	h.observe({
		labels: { code: '200' },
		value: 300,
		exemplarLabels,
	});
}

async function main() {
	// exemplars will be shown only by OpenMetrics registry types
	register.setContentType(Registry.OPENMETRICS_CONTENT_TYPE);

	makeCounters();
	makeHistograms();

	console.log(await register.metrics());
	console.log('---');

	// if you dont want to set the default registry to OpenMetrics type then you need to create a new registry and assign it to the metric

	register.setContentType(Registry.PROMETHEUS_CONTENT_TYPE);
	const omReg = new Registry(Registry.OPENMETRICS_CONTENT_TYPE);
	const c = new Counter({
		name: 'counter_with_exemplar',
		help: 'Example of a counter',
		labelNames: ['code'],
		registers: [omReg],
		enableExemplars: true,
	});
	c.inc({ labels: { code: '200' }, exemplarLabels: { traceId: 'traceA' } });
	console.log(await omReg.metrics());
}

main();

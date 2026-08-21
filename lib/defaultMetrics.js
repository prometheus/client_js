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

const { isObject } = require('./util');
const { globalRegistry } = require('./registry');

// Default metrics.
const processHandles = require('./metrics/processHandles');
const processRequests = require('./metrics/processRequests');
const processResources = require('./metrics/processResources');
const eventLoopLag = require('./metrics/eventLoopLag');
const eventLoopUtilization = require('./metrics/eventLoopUtilization');
const gc = require('./metrics/gc');
const heapSizeAndUsed = require('./metrics/heapSizeAndUsed');
const heapSpacesSizeAndUsed = require('./metrics/heapSpacesSizeAndUsed');
const version = require('./metrics/version');
const processCpuTotal = require('./metrics/processCpuTotal');
const processMaxFileDescriptors = require('./metrics/processMaxFileDescriptors');
const processOpenFileDescriptors = require('./metrics/processOpenFileDescriptors');
const osMemoryHeap = require('./metrics/osMemoryHeap');
const processStartTime = require('./metrics/processStartTime');

const metrics = {
	processHandles,
	processRequests,
	...(typeof process !== 'undefined' &&
	// eslint-disable-next-line n/no-unsupported-features/node-builtins
	typeof process.getActiveResourcesInfo === 'function'
		? { processResources }
		: {}),
	eventLoopLag,
	eventLoopUtilization,
	gc,
	heapSizeAndUsed,
	heapSpacesSizeAndUsed,
	version,
	processCpuTotal,
	processMaxFileDescriptors,
	processOpenFileDescriptors,
	osMemoryHeap,
	processStartTime,
};
const metricsList = Object.keys(metrics);

module.exports = function collectDefaultMetrics(config) {
	if (config !== null && config !== undefined && !isObject(config)) {
		throw new TypeError('config must be null, undefined, or an object');
	}

	config = { eventLoopMonitoringPrecision: 10, ...config };
	const register = config.register || globalRegistry;
	const existingMetrics = new Set(register.getMetricsAsArray());

	for (const metric of Object.values(metrics)) {
		metric(register, config);
	}

	const defaultMetrics = register
		.getMetricsAsArray()
		.filter(metric => !existingMetrics.has(metric));
	for (const metric of defaultMetrics) {
		register.removeSingleMetric(metric.name);
	}
	defaultMetrics.sort((a, b) => a.name.localeCompare(b.name));
	for (const metric of defaultMetrics) {
		register.registerMetric(metric);
	}
};

module.exports.metricsList = metricsList;

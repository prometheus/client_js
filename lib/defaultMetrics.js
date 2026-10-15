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

// Default metrics.
const processCpuTotal = require('./metrics/processCpuTotal');
const processStartTime = require('./metrics/processStartTime');
const osMemoryHeap = require('./metrics/osMemoryHeap');
const processOpenFileDescriptors = require('./metrics/processOpenFileDescriptors');
const processMaxFileDescriptors = require('./metrics/processMaxFileDescriptors');
const eventLoopLag = require('./metrics/eventLoopLag');
const eventLoopUtilization = require('./metrics/eventLoopUtilization');
const processHandles = require('./metrics/processHandles');
const processRequests = require('./metrics/processRequests');
const processResources = require('./metrics/processResources');
const heapSizeAndUsed = require('./metrics/heapSizeAndUsed');
const heapSpacesSizeAndUsed = require('./metrics/heapSpacesSizeAndUsed');
const version = require('./metrics/version');
const gc = require('./metrics/gc');

// `version` is deliberately first: it reports build and deployment
// configuration rather than a runtime statistic, and is easier to spot at the
// top of the output. Every other module is ordered alphabetically by the
// default Prometheus metric name(s) it registers, so metrics are reported in a
// stable, predictable order.
const metrics = {
	version,
	processHandles,
	processRequests,

	...(typeof process !== 'undefined' &&
	// eslint-disable-next-line n/no-unsupported-features/node-builtins
	typeof process.getActiveResourcesInfo === 'function'
		? { processResources }
		: {}),
	eventLoopLag,
	eventLoopUtilization,
	heapSizeAndUsed,
	gc,
	heapSpacesSizeAndUsed,
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

	config = { eventLoopMonitoringPrecision: 10, exclude: [], ...config };

	for (const metricGroup of Object.keys(metrics)) {
		if (config.exclude.includes(metricGroup)) {
			continue;
		}
		metrics[metricGroup](config.register, config);
	}
};

module.exports.metricsList = metricsList;

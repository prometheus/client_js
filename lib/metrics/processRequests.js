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
const Gauge = require('../gauge');
const { aggregateByObjectName } = require('./helpers/processMetricsHelpers');
const { updateMetrics } = require('./helpers/processMetricsHelpers');

const NODEJS_ACTIVE_REQUESTS = 'nodejs_active_requests';
const NODEJS_ACTIVE_REQUESTS_TOTAL = 'nodejs_active_requests_total';

module.exports = (registry, config = {}) => {
	// Don't do anything if the function is removed in later nodes (exists in node@6)
	if (typeof process._getActiveRequests !== 'function') {
		return;
	}

	const namePrefix = config.prefix ? config.prefix : '';
	const labels = config.labels ? config.labels : {};
	const labelNames = Object.keys(labels);

	new Gauge({
		name: namePrefix + NODEJS_ACTIVE_REQUESTS,
		help: 'Number of active libuv requests grouped by request type. Every request type is C++ class name.',
		labelNames: ['type', ...labelNames],
		registers: registry ? [registry] : undefined,
		collect() {
			const requests = process._getActiveRequests();
			updateMetrics(this, aggregateByObjectName(requests), labels);
		},
	});

	new Gauge({
		name: namePrefix + NODEJS_ACTIVE_REQUESTS_TOTAL,
		help: 'Total number of active requests.',
		registers: registry ? [registry] : undefined,
		labelNames,
		collect() {
			const requests = process._getActiveRequests();
			this.set(labels, requests.length);
		},
	});
};

module.exports.metricNames = [
	NODEJS_ACTIVE_REQUESTS,
	NODEJS_ACTIVE_REQUESTS_TOTAL,
];

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

const uptime =
	typeof process !== 'undefined' && typeof process.uptime === 'function'
		? process.uptime()
		: 0;

const startInSeconds = Math.round(Date.now() / 1000 - uptime);

const PROCESS_START_TIME = 'process_start_time_seconds';

module.exports = (registry, config = {}) => {
	const namePrefix = config.prefix ? config.prefix : '';
	const labels = config.labels ? config.labels : {};
	const labelNames = Object.keys(labels);

	new Gauge({
		name: namePrefix + PROCESS_START_TIME,
		help: 'Start time of the process since unix epoch in seconds.',
		registers: registry ? [registry] : undefined,
		labelNames,
		aggregator: 'omit',
		collect() {
			this.set(labels, startInSeconds);
		},
	});
};

module.exports.metricNames = [PROCESS_START_TIME];

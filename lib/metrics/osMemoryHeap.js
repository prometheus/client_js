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
const linuxVariant = require('./osMemoryHeapLinux');
const safeRss = require('./helpers/safeRss');

const PROCESS_RESIDENT_MEMORY = 'process_resident_memory_bytes';

function notLinuxVariant(registry, config = {}) {
	const namePrefix = config.prefix ? config.prefix : '';
	const labels = config.labels ? config.labels : {};
	const labelNames = Object.keys(labels);

	new Gauge({
		name: namePrefix + PROCESS_RESIDENT_MEMORY,
		help: 'Resident memory size in bytes.',
		registers: registry ? [registry] : undefined,
		labelNames,
		collect() {
			// process.memoryUsage.rss() is faster than process.memoryUsage() as it
			// only reads RSS from the OS without collecting all heap statistics
			const rss = safeRss();
			if (rss !== undefined) {
				this.set(labels, rss);
			}
		},
	});
}

function isLinux() {
	return typeof process !== 'undefined' && process.platform === 'linux';
}

module.exports = (registry, config) =>
	isLinux()
		? linuxVariant(registry, config)
		: notLinuxVariant(registry, config);

module.exports.metricNames = isLinux()
	? linuxVariant.metricNames
	: [PROCESS_RESIDENT_MEMORY];

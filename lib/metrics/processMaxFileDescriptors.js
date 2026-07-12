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
const fs = require('fs');

const PROCESS_MAX_FDS = 'process_max_fds';

let maxFds;

module.exports = (registry, config = {}) => {
	if (maxFds === undefined) {
		// This will fail if a linux-like procfs is not available.
		try {
			const limits = fs.readFileSync('/proc/self/limits', 'utf8');
			const lines = limits.split('\n');
			for (const line of lines) {
				if (line.startsWith('Max open files')) {
					const parts = line.split(/  +/);
					maxFds = Number(parts[1]);
					break;
				}
			}
		} catch {
			return;
		}
	}

	if (maxFds === undefined) return;

	const namePrefix = config.prefix ? config.prefix : '';
	const labels = config.labels ? config.labels : {};
	const labelNames = Object.keys(labels);

	new Gauge({
		name: namePrefix + PROCESS_MAX_FDS,
		help: 'Maximum number of open file descriptors.',
		registers: registry ? [registry] : undefined,
		labelNames,
		collect() {
			if (maxFds !== undefined) this.set(labels, maxFds);
		},
	});
};

module.exports.metricNames = [PROCESS_MAX_FDS];

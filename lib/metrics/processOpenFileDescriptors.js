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

const { debuglog } = require('node:util');
const Gauge = require('../gauge');
const fs = require('fs');
const process = require('process');

const debug = debuglog('prom:metrics:process-open-fds');

const PROCESS_OPEN_FDS = 'process_open_fds';

module.exports = (registry, config = {}) => {
	if (process.platform !== 'linux') {
		return;
	}

	const namePrefix = config.prefix ? config.prefix : '';
	const labels = config.labels ? config.labels : {};
	const labelNames = Object.keys(labels);

	new Gauge({
		name: namePrefix + PROCESS_OPEN_FDS,
		help: 'Number of open file descriptors.',
		registers: registry ? [registry] : undefined,
		labelNames,
		collect() {
			try {
				const fds = fs.readdirSync('/proc/self/fd');
				// Minus 1 to not count the fd that was used by readdirSync(),
				// it's now closed.
				this.set(labels, fds.length - 1);
			} catch (error) {
				debug('failed to collect open file descriptors: %o', error);
			}
		},
	});
};

module.exports.metricNames = [PROCESS_OPEN_FDS];

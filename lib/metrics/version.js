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

const version =
	typeof process !== 'undefined' && typeof process.version === 'string'
		? process.version
		: 'v0.0.0'; // Fallback for environments where process.version is not available

const versionSegments = version.slice(1).split('.').map(Number);

const NODE_VERSION_INFO = 'nodejs_version_info';

module.exports = (registry, config = {}) => {
	const namePrefix = config.prefix ? config.prefix : '';
	const labels = config.labels ? config.labels : {};
	const labelNames = Object.keys(labels);

	new Gauge({
		name: namePrefix + NODE_VERSION_INFO,
		help: 'Node.js version info.',
		labelNames: ['version', 'major', 'minor', 'patch', ...labelNames],
		registers: registry ? [registry] : undefined,
		aggregator: 'first',
		collect() {
			// Needs to be in collect() so value is present even if reg is reset
			this.labels(
				version,
				versionSegments[0],
				versionSegments[1],
				versionSegments[2],
				...Object.values(labels),
			).set(1);
		},
	});
};

module.exports.metricNames = [NODE_VERSION_INFO];

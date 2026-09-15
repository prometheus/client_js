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

const path = require('node:path');
const protobuf = require('protobufjs');

// Decode against the upstream .proto, independently of the runtime JSON
// descriptor and the client's conversion of metric snapshots to protobuf.
const root = protobuf.loadSync(path.join(__dirname, '../../lib/metrics.proto'));
const MetricFamily = root.lookupType('io.prometheus.client.MetricFamily');

function decodeMetricFamilies(buffer) {
	const reader = protobuf.Reader.create(buffer);
	const families = [];
	while (reader.pos < reader.len) {
		families.push(
			MetricFamily.toObject(MetricFamily.decodeDelimited(reader), {
				longs: Number,
				enums: String,
			}),
		);
	}
	return families;
}

function bucketCounts(histogram, side) {
	const counts = new Map();
	let index = 0;
	let count = 0;
	let position = 0;
	for (const span of histogram[`${side}Spans`]) {
		index += span.offset;
		for (let i = 0; i < span.length; i++, index++) {
			count += histogram[`${side}Deltas`][position++];
			if (count !== 0) counts.set(index, count);
		}
	}
	return counts;
}

function nextUp(value) {
	const data = new DataView(new ArrayBuffer(8));
	data.setFloat64(0, value);
	data.setBigUint64(0, data.getBigUint64(0) + 1n);
	return data.getFloat64(0);
}

module.exports = { decodeMetricFamilies, bucketCounts, nextUp };

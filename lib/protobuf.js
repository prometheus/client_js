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

const { Buffer } = require('node:buffer');
const protobuf = require('protobufjs/light');

// Loaded only when a registry is scraped as protobuf. The schema is vendored
// from prometheus/client_model/io/prometheus/client/metrics.proto.
const root = protobuf.Root.fromJSON(require('./metrics.json'));
const MetricFamily = root.lookupType('io.prometheus.client.MetricFamily');
const metricTypes = root.lookupEnum('io.prometheus.client.MetricType').values;

function encodeMetricFamily(metric, defaultLabels) {
	const type = metricTypes[metric.type.toUpperCase()];
	if (type === undefined) {
		throw new TypeError(
			`Cannot encode metric type ${metric.type} as Prometheus protobuf`,
		);
	}

	const groups = new Map();
	const defaultLabelEntries = Object.entries(defaultLabels);
	function labelsWithDefaults(labels, sharedLabels) {
		const merged = { ...defaultLabels, ...labels, ...sharedLabels };
		for (const [name, value] of defaultLabelEntries) {
			merged[name] ??= value;
		}
		return merged;
	}

	function groupFor(labels) {
		const key = JSON.stringify(labelPairs(labels));
		let group = groups.get(key);
		if (!group) {
			group = { label: labelPairs(labels), [metric.type]: {} };
			groups.set(key, group);
		}
		return group[metric.type];
	}

	for (const value of metric.values ?? []) {
		const labels = labelsWithDefaults(value.labels, value.sharedLabels);
		const metricName = value.metricName ?? metric.name;
		let bound;
		let quantile;
		if (metric.type === 'histogram' && metricName === `${metric.name}_bucket`) {
			bound = labels.le === '+Inf' ? Infinity : Number(labels.le);
			delete labels.le;
		} else if (metric.type === 'summary' && Object.hasOwn(labels, 'quantile')) {
			quantile = Number(labels.quantile);
			delete labels.quantile;
		}

		const data = groupFor(labels);
		switch (metric.type) {
			case 'counter':
			case 'gauge':
			case 'untyped':
				data.value = value.value;
				if (metric.type === 'counter' && value.exemplar) {
					data.exemplar = encodeExemplar(value.exemplar);
				}
				break;
			case 'histogram':
			case 'summary':
				if (metricName === `${metric.name}_sum`) {
					data.sampleSum = value.value;
				} else if (metricName === `${metric.name}_count`) {
					data.sampleCount = value.value;
				} else if (metric.type === 'histogram' && bound !== undefined) {
					data.bucket ??= [];
					const bucket = { cumulativeCount: value.value, upperBound: bound };
					if (value.exemplar) bucket.exemplar = encodeExemplar(value.exemplar);
					data.bucket.push(bucket);
				} else if (metric.type === 'summary' && quantile !== undefined) {
					data.quantile ??= [];
					data.quantile.push({ quantile, value: value.value });
				}
				break;
			default:
				throw new TypeError(
					`Cannot encode metric type ${metric.type} as Prometheus protobuf`,
				);
		}
	}

	for (const group of groups.values()) {
		if (group.histogram) {
			encodeHistogramCount(group.histogram, 'sampleCount');
			for (const bucket of group.histogram.bucket ?? []) {
				encodeHistogramCount(bucket, 'cumulativeCount');
			}
			group.histogram.bucket?.sort((a, b) => a.upperBound - b.upperBound);
		}
		if (
			group.summary?.sampleCount !== undefined &&
			!Number.isInteger(group.summary.sampleCount)
		) {
			throw new TypeError(
				`Prometheus protobuf requires an integer sample count for summary ${metric.name}`,
			);
		}
		group.summary?.quantile?.sort((a, b) => a.quantile - b.quantile);
	}

	return Buffer.from(
		MetricFamily.encodeDelimited({
			name: metric.name,
			help: metric.help,
			type,
			metric: [...groups.values()],
		}).finish(),
	);
}

// Classic histogram aggregation can produce fractional counts. Protobuf has
// dedicated double fields for them; uint64 encoding would truncate them.
function encodeHistogramCount(message, field) {
	const count = message[field];
	if (count !== undefined && !Number.isInteger(count)) {
		message[`${field}Float`] = count;
		delete message[field];
	}
}

function labelPairs(labels) {
	return Object.keys(labels)
		.sort()
		.map(name => {
			return {
				name,
				value: String(labels[name]),
			};
		});
}

function timestamp(seconds) {
	const milliseconds = Math.round(seconds * 1000);
	const wholeSeconds = Math.floor(milliseconds / 1000);
	return {
		seconds: wholeSeconds,
		nanos: (milliseconds - wholeSeconds * 1000) * 1e6,
	};
}

function encodeExemplar(exemplar) {
	return {
		label: labelPairs(exemplar.labelSet),
		value: exemplar.value,
		timestamp: timestamp(exemplar.timestamp),
	};
}

module.exports = { encodeMetricFamily };

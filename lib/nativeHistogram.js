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

const bounds = require('./nativeHistogramBounds');
const { isObject, nowTimestamp } = require('./util');

const MIN_SCHEMA = -4;
const MAX_SCHEMA = 8;
const MAX_EXEMPLARS = 10;
const float = new DataView(new ArrayBuffer(8));

function resolveNativeHistogramConfig(config) {
	if (!isObject(config)) return undefined;

	const factor =
		config.nativeHistogramBucketFactor === undefined
			? 0
			: config.nativeHistogramBucketFactor;
	const zeroThreshold =
		config.nativeHistogramZeroThreshold === undefined
			? 2 ** -128
			: config.nativeHistogramZeroThreshold;
	const maxBucketNumber =
		config.nativeHistogramMaxBucketNumber === undefined
			? 160
			: config.nativeHistogramMaxBucketNumber;

	if (!Number.isFinite(factor) || factor < 0) {
		throw new TypeError(
			'nativeHistogramBucketFactor must be a finite, non-negative number',
		);
	}
	if (!Number.isFinite(zeroThreshold) || zeroThreshold < 0) {
		throw new TypeError(
			'nativeHistogramZeroThreshold must be a finite, non-negative number',
		);
	}
	if (!Number.isSafeInteger(maxBucketNumber) || maxBucketNumber < 0) {
		throw new TypeError(
			'nativeHistogramMaxBucketNumber must be a non-negative safe integer',
		);
	}
	if (factor <= 1) return undefined;

	if (!['sum', 'first', 'omit'].includes(config.aggregator ?? 'sum')) {
		throw new TypeError(
			'Native histograms support only sum, first, or omit aggregation',
		);
	}

	let schema = MIN_SCHEMA;
	while (schema < MAX_SCHEMA && 2 ** (2 ** -schema) > factor) {
		schema++;
	}
	return { schema, zeroThreshold, maxBucketNumber };
}

class NativeHistogram {
	constructor(config) {
		this.schema = config.schema;
		this.zeroThreshold = config.zeroThreshold;
		this.maxBucketNumber = config.maxBucketNumber;
		this.zeroCount = 0;
		this.positiveBuckets = new Map();
		this.negativeBuckets = new Map();
		this.createdTimestamp = nowTimestamp();
		this.exemplars = [];
	}

	observe(value) {
		const magnitude = Math.abs(value);
		if (magnitude <= this.zeroThreshold) {
			this.zeroCount++;
			return;
		}

		const buckets = value > 0 ? this.positiveBuckets : this.negativeBuckets;
		addBucket(buckets, bucketIndex(magnitude, this.schema), 1);

		// Coarsening preserves every observation and does not reset the counter.
		// The limit is best effort once the lowest supported schema is reached.
		while (
			this.maxBucketNumber > 0 &&
			this.positiveBuckets.size + this.negativeBuckets.size >
				this.maxBucketNumber &&
			this.schema > MIN_SCHEMA
		) {
			this.positiveBuckets = coarsenBuckets(this.positiveBuckets, 1);
			this.negativeBuckets = coarsenBuckets(this.negativeBuckets, 1);
			this.schema--;
		}
	}

	addExemplar(exemplar) {
		this.exemplars.push(copyExemplar(exemplar));
		if (this.exemplars.length > MAX_EXEMPLARS) this.exemplars.shift();
	}

	snapshot({ labels, count, sum }) {
		const positive = encodeBuckets(this.positiveBuckets);
		const negative = encodeBuckets(this.negativeBuckets);

		// With no zero threshold, zero count, or spans, the wire format would
		// otherwise be indistinguishable from a classic histogram.
		if (
			positive.spans.length === 0 &&
			negative.spans.length === 0 &&
			this.zeroThreshold === 0 &&
			this.zeroCount === 0
		) {
			positive.spans.push({ offset: 0, length: 0 });
		}

		return {
			labels: { ...labels },
			count,
			sum,
			schema: this.schema,
			zeroThreshold: this.zeroThreshold,
			zeroCount: this.zeroCount,
			positiveSpans: positive.spans,
			positiveDeltas: positive.deltas,
			negativeSpans: negative.spans,
			negativeDeltas: negative.deltas,
			createdTimestamp: this.createdTimestamp,
			exemplars: this.exemplars.map(copyExemplar),
		};
	}
}

// Find the inclusive bucket boundary using the same significands as
// Prometheus. Math.ceil(Math.log2(value) * 2**schema) rounds incorrectly
// immediately above many boundaries, especially at large exponents.
function bucketIndex(value, schema) {
	let adjustment = 0;
	if (value < 2 ** -1022) {
		value *= 2 ** 52;
		adjustment = -52;
	}
	float.setFloat64(0, value);
	const high = float.getUint32(0);
	const exponent = (high >>> 20) - 1022 + adjustment;
	float.setUint32(0, (high & 0xfffff) | 0x3fe00000);
	const fraction = float.getFloat64(0);

	if (schema <= 0) {
		return Math.ceil((exponent - (fraction === 0.5 ? 1 : 0)) / 2 ** -schema);
	}

	const size = 2 ** schema;
	const stride = 2 ** (MAX_SCHEMA - schema);
	let low = 0;
	let highIndex = size;
	while (low < highIndex) {
		const mid = (low + highIndex) >>> 1;
		if (fraction <= bounds[mid * stride]) {
			highIndex = mid;
		} else {
			low = mid + 1;
		}
	}
	return low + (exponent - 1) * size;
}

function upperBound(index, schema) {
	if (schema < 0)
		return Math.min(2 ** (index * 2 ** -schema), Number.MAX_VALUE);

	const size = 2 ** schema;
	const exponent = Math.floor(index / size);
	const fraction =
		2 * bounds[(index - exponent * size) * 2 ** (MAX_SCHEMA - schema)];
	if (exponent >= 1024) return Number.MAX_VALUE;
	// Scale subnormals in two steps so the power itself doesn't underflow.
	if (exponent < -1022) {
		return fraction * 2 ** (exponent + 1074) * Number.MIN_VALUE;
	}
	return fraction * 2 ** exponent;
}

function addBucket(buckets, index, count) {
	buckets.set(index, (buckets.get(index) ?? 0) + count);
}

function coarsenBuckets(buckets, schemaDifference) {
	if (schemaDifference === 0) return buckets;
	const result = new Map();
	const divisor = 2 ** schemaDifference;
	for (const [index, count] of buckets) {
		addBucket(result, Math.ceil(index / divisor), count);
	}
	return result;
}

function encodeBuckets(buckets) {
	const spans = [];
	const deltas = [];
	let nextIndex = 0;
	let previousCount = 0;

	function append(count) {
		spans[spans.length - 1].length++;
		deltas.push(count - previousCount);
		previousCount = count;
	}

	for (const index of [...buckets.keys()].sort((a, b) => a - b)) {
		const gap = index - nextIndex;
		if (spans.length === 0 || gap > 2) {
			spans.push({ offset: gap, length: 0 });
		} else {
			for (let i = 0; i < gap; i++) append(0);
		}
		append(buckets.get(index));
		nextIndex = index + 1;
	}
	return { spans, deltas };
}

function decodeBuckets(spans, deltas) {
	const result = new Map();
	let index = 0;
	let count = 0;
	let deltaIndex = 0;
	for (const span of spans) {
		index += span.offset;
		for (let i = 0; i < span.length; i++) {
			count += deltas[deltaIndex++];
			if (count !== 0) result.set(index, count);
			index++;
		}
	}
	return result;
}

function copyExemplar(exemplar) {
	return {
		labelSet: { ...exemplar.labelSet },
		value: exemplar.value,
		timestamp: exemplar.timestamp,
	};
}

function nativeHistogramKey(labels) {
	return JSON.stringify(
		Object.keys(labels)
			.sort()
			.map(name => [name, String(labels[name])]),
	);
}

function copyNativeHistogram(histogram) {
	return {
		...histogram,
		labels: { ...histogram.labels },
		positiveSpans: histogram.positiveSpans.map(span => {
			return { ...span };
		}),
		positiveDeltas: [...histogram.positiveDeltas],
		negativeSpans: histogram.negativeSpans.map(span => {
			return { ...span };
		}),
		negativeDeltas: [...histogram.negativeDeltas],
		exemplars: (histogram.exemplars ?? []).map(copyExemplar),
	};
}

function sumNativeHistograms(histograms) {
	const schema = Math.min(...histograms.map(histogram => histogram.schema));
	const merged = new NativeHistogram({
		schema,
		zeroThreshold: Math.max(
			...histograms.map(histogram => histogram.zeroThreshold),
		),
		maxBucketNumber: 0,
	});
	const prepared = histograms.map(histogram => {
		return {
			histogram,
			positive: coarsenBuckets(
				decodeBuckets(histogram.positiveSpans, histogram.positiveDeltas),
				histogram.schema - schema,
			),
			negative: coarsenBuckets(
				decodeBuckets(histogram.negativeSpans, histogram.negativeDeltas),
				histogram.schema - schema,
			),
		};
	});

	// A larger zero threshold can cut through a populated bucket in another
	// histogram. Include that entire bucket; its observations cannot be split.
	let widened;
	do {
		widened = false;
		for (const source of prepared) {
			if (source.histogram.zeroThreshold === merged.zeroThreshold) continue;
			const index = bucketIndex(merged.zeroThreshold, schema);
			const bound = upperBound(index, schema);
			if (
				bound > merged.zeroThreshold &&
				(source.positive.has(index) || source.negative.has(index))
			) {
				merged.zeroThreshold = bound;
				widened = true;
			}
		}
	} while (widened);

	let count = 0;
	let sum = 0;
	merged.createdTimestamp = Math.min(
		...histograms.map(histogram => histogram.createdTimestamp),
	);
	for (const source of prepared) {
		count += source.histogram.count;
		sum += source.histogram.sum;
		merged.zeroCount += source.histogram.zeroCount;
		for (const [buckets, destination] of [
			[source.positive, merged.positiveBuckets],
			[source.negative, merged.negativeBuckets],
		]) {
			for (const [index, population] of buckets) {
				if (upperBound(index, schema) <= merged.zeroThreshold) {
					merged.zeroCount += population;
				} else {
					addBucket(destination, index, population);
				}
			}
		}
	}
	merged.exemplars = histograms
		.flatMap(histogram => histogram.exemplars ?? [])
		.sort((a, b) => a.timestamp - b.timestamp)
		.slice(-MAX_EXEMPLARS)
		.map(copyExemplar);

	return merged.snapshot({ labels: histograms[0].labels, count, sum });
}

module.exports = {
	NativeHistogram,
	resolveNativeHistogramConfig,
	copyNativeHistogram,
	sumNativeHistograms,
	nativeHistogramKey,
};

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

exports.linearBuckets = (start, width, count) => {
	if (count < 1) {
		throw new Error('Linear buckets needs a positive count');
	}

	const buckets = new Array(count);
	for (let i = 0; i < count; i++) {
		buckets[i] = start + i * width;
	}
	return buckets;
};

exports.exponentialBuckets = (start, factor, count) => {
	if (start <= 0) {
		throw new Error('Exponential buckets needs a positive start');
	}
	if (count < 1) {
		throw new Error('Exponential buckets needs a positive count');
	}
	if (factor <= 1) {
		throw new Error('Exponential buckets needs a factor greater than 1');
	}
	const buckets = new Array(count);
	for (let i = 0; i < count; i++) {
		buckets[i] = start;
		start *= factor;
	}
	return buckets;
};

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

/**
 * Prometheus client
 * @module Prometheus client
 */

'use strict';

exports.register = require('./lib/registry').globalRegistry;
exports.Registry = require('./lib/registry');
Object.defineProperty(exports, 'contentType', {
	configurable: false,
	enumerable: true,
	get() {
		return exports.register.contentType;
	},
	set(value) {
		exports.register.setContentType(value);
	},
});
exports.prometheusContentType = exports.Registry.PROMETHEUS_CONTENT_TYPE;
exports.openMetricsContentType = exports.Registry.OPENMETRICS_CONTENT_TYPE;
exports.validateMetricName = require('./lib/validation').validateMetricName;

exports.Counter = require('./lib/counter');
exports.Gauge = require('./lib/gauge');
exports.Histogram = require('./lib/histogram');
exports.Summary = require('./lib/summary');
exports.Pushgateway = require('./lib/pushgateway');

exports.linearBuckets = require('./lib/bucketGenerators').linearBuckets;
exports.exponentialBuckets =
	require('./lib/bucketGenerators').exponentialBuckets;

exports.collectDefaultMetrics = require('./lib/defaultMetrics');

exports.aggregators = require('./lib/metricAggregators').aggregators;
exports.ClusterRegistry = require('./lib/cluster');
exports.WorkerRegistry = require('./lib/worker');
/** @deprecated */
exports.AggregatorRegistry = exports.ClusterRegistry;
exports[Symbol('util')] = require('./lib/util');

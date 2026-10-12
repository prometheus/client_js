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

import {
	AggregatorRegistry,
	ClusterRegistry,
	Histogram,
	PrometheusProtobufContentType,
	Pushgateway,
	Registry,
	RegistryContentType,
	WorkerRegistry,
	prometheusProtobufContentType,
} from '../index';

const registry = new Registry(Registry.PROMETHEUS_PROTOBUF_CONTENT_TYPE);
const histogram = new Histogram({
	name: 'typescript_protobuf_histogram',
	help: 'Protobuf histogram TypeScript test',
	registers: [registry],
	labelNames: ['route'] as const,
	buckets: [1, 2],
});

histogram.observe({ route: '/' }, 0.2);
histogram.labels('/').observe(0.3);
histogram.zero({ route: '/' });
const type: PrometheusProtobufContentType = prometheusProtobufContentType;
const binary: Promise<Uint8Array> = registry.metrics();
const oneText: Promise<string> = registry.getMetricsAsString(histogram);
const singleText: Promise<string> = registry.getSingleMetricAsString(
	'typescript_protobuf_histogram',
);
const merged: Promise<Uint8Array> = Registry.merge([registry]).metrics();
const aggregate: Promise<Uint8Array> = Registry.aggregate([], type).metrics();
const switched: Promise<Uint8Array> = new Registry()
	.setContentType(type)
	.metrics();
const text: Promise<string> = new Registry().metrics();
const openMetrics: Promise<string> = new Registry(
	Registry.OPENMETRICS_CONTENT_TYPE,
).metrics();
const unknownFormat: Registry<RegistryContentType> = registry;
const unknownBody: Promise<string | Uint8Array> = unknownFormat.metrics();
void [
	binary,
	oneText,
	singleText,
	merged,
	aggregate,
	switched,
	text,
	openMetrics,
	unknownBody,
];

const cluster = new ClusterRegistry(type);
const workers = new WorkerRegistry(type);
const clusterBytes: Promise<Uint8Array> = cluster.clusterMetrics();
const workerBytes: Promise<Uint8Array> = workers.workerMetrics();
const switchedClusterBytes: Promise<Uint8Array> = new ClusterRegistry()
	.setContentType(type)
	.clusterMetrics();
const switchedWorkerBytes: Promise<Uint8Array> = new WorkerRegistry()
	.setContentType(type)
	.workerMetrics();
const switchedAggregatorBytes: Promise<Uint8Array> = new AggregatorRegistry()
	.setContentType(type)
	.clusterMetrics();
ClusterRegistry.setRegistries([registry, new Registry()]);
WorkerRegistry.setRegistries(registry);
void [
	clusterBytes,
	workerBytes,
	switchedClusterBytes,
	switchedWorkerBytes,
	switchedAggregatorBytes,
];

new Pushgateway('http://localhost:9091', registry);
// @ts-expect-error A protobuf registry returns bytes, not text.
const invalidText: Promise<string> = registry.metrics();
void invalidText;
// @ts-expect-error Label names remain checked for protobuf registries.
histogram.observe({ method: 'GET' }, 1);

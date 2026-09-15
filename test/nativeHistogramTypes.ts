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
	NativeHistogramValue,
	PrometheusProtobufContentType,
	Pushgateway,
	Registry,
	RegistryContentType,
	WorkerRegistry,
	prometheusProtobufContentType,
} from '../index';

const registry = new Registry(Registry.PROMETHEUS_PROTOBUF_CONTENT_TYPE);
const histogram = new Histogram({
	name: 'typescript_native_histogram',
	help: 'Native histogram TypeScript test',
	registers: [registry],
	labelNames: ['route'] as const,
	buckets: [],
	nativeHistogramBucketFactor: 1.1,
	nativeHistogramZeroThreshold: 0,
	nativeHistogramMaxBucketNumber: 160,
});

histogram.observe({ route: '/' }, 0.2);
histogram.labels('/').observe(0.3);
histogram.zero({ route: '/' });
const end = histogram.startTimer({ route: '/' }, { trace_id: 'abc' });
const elapsed: number = end(undefined, { span_id: 'def' });
const childElapsed: number = histogram.labels('/').startTimer()();
void elapsed;
void childElapsed;

const type: PrometheusProtobufContentType = prometheusProtobufContentType;
const binary: Promise<Uint8Array> = registry.metrics();
const oneText: Promise<string> = registry.getMetricsAsString(histogram);
const singleText: Promise<string> = registry.getSingleMetricAsString(
	'typescript_native_histogram',
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
new Histogram({
	name: 'typescript_native_exemplar_histogram',
	help: 'Native exemplars',
	registers: [registry],
	labelNames: ['route'] as const,
	nativeHistogramBucketFactor: 1.1,
	enableExemplars: true,
}).observe({
	labels: { route: '/' },
	value: 1,
	exemplarLabels: { trace_id: 'abc' },
});

async function nativeSnapshotsAreTyped() {
	const metric = await histogram.get();
	const snapshot: NativeHistogramValue | undefined =
		metric.nativeHistograms?.[0];
	if (snapshot) {
		const schema: number = snapshot.schema;
		const count: number = snapshot.count;
		const delta: number | undefined = snapshot.positiveDeltas[0];
		void [schema, count, delta];
	}
	const allMetrics = await registry.getMetricsAsJSON();
	const natives: NativeHistogramValue[] | undefined =
		allMetrics[0].nativeHistograms;
	void natives;
}
void nativeSnapshotsAreTyped;

// @ts-expect-error A protobuf registry returns bytes, not text.
const invalidText: Promise<string> = registry.metrics();
void invalidText;
new Histogram({
	name: 'invalid',
	help: 'invalid',
	// @ts-expect-error Native bucket factors are numeric.
	nativeHistogramBucketFactor: '1.1',
});
// @ts-expect-error Label names remain checked for native histograms.
histogram.observe({ method: 'GET' }, 1);

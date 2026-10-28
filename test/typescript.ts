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
	Counter,
	Pushgateway,
	Registry,
	MetricObject,
	MetricObjectWithValues,
	MetricType,
	MetricValue,
	MetricValueWithName,
	openMetrics20ContentType,
	openMetrics20RcContentType,
	openMetrics001ContentType,
	negotiateAccept,
	escapeName,
	escapeLabelName,
	validateLegacyMetricName,
	validateLegacyLabelName,
} from '../index';

const registry = new Registry();
const om20Registry = new Registry(Registry.OPENMETRICS_2_0_CONTENT_TYPE);
const om20RcRegistry = new Registry(Registry.OPENMETRICS_2_0_RC_CONTENT_TYPE);
const counter = new Counter({
	name: 'typescript_test_counter',
	help: 'TypeScript test counter',
	unit: 'requests',
	registers: [registry, om20Registry, om20RcRegistry],
});

const negotiated: string = negotiateAccept(
	'application/openmetrics-text;version=2.0.0',
);
const negotiatedFromReg: string = registry.negotiate(
	'application/openmetrics-text;version=2.0.0-rc',
);
const metricsWithOptions: Promise<string> = registry.metrics({
	accept: 'application/openmetrics-text;version=2.0.0',
	escaping: 'allow-utf-8',
});
const escapedMetricName: string = escapeName('a.b', 'dots');
const escapedLblName: string = escapeLabelName('a.b', 'underscores');
const isLegacy: boolean = validateLegacyMetricName('a_b');
const invalidLegacyLabels: string[] = validateLegacyLabelName(['a_b', 'a.b']);
void openMetrics20ContentType;
void openMetrics20RcContentType;
void openMetrics001ContentType;
void negotiated;
void negotiatedFromReg;
void metricsWithOptions;
void escapedMetricName;
void escapedLblName;
void isLegacy;
void invalidLegacyLabels;

const metricsText: Promise<string> = registry.getMetricsAsString(counter);
const gatewayWithRegistry = new Pushgateway('http://127.0.0.1:9091', registry);
const gatewayWithOptionsAndRegistry = new Pushgateway(
	'http://127.0.0.1:9091',
	{ timeout: 10, requireJobName: false },
	registry,
);
const gatewayWithNullOptionsAndRegistry = new Pushgateway(
	'http://127.0.0.1:9091',
	null,
	registry,
);

void metricsText;
void gatewayWithRegistry;
void gatewayWithOptionsAndRegistry;
void gatewayWithNullOptionsAndRegistry;

// The metric-object types are exported, so consumers can name the return
// types of Registry#getMetricsAsJSON()/getMetricsAsArray() and Metric#get()
// instead of re-deriving them. These annotations fail to compile if the types
// are removed, renamed, or reshaped.
async function metricObjectTypesAreExported() {
	const asJson: MetricObjectWithValues<MetricValue<string>>[] =
		await registry.getMetricsAsJSON();
	void asJson;

	const asArray: MetricObject[] = registry.getMetricsAsArray();
	void asArray;

	const counterSnapshot: MetricObjectWithValues<MetricValue<string>> =
		await counter.get();
	void counterSnapshot;

	const named: MetricValueWithName<string> = {
		value: 1,
		labels: {},
		metricName: 'typescript_test_counter',
	};
	void named;
}
void metricObjectTypesAreExported;

// MetricType matches the runtime strings reported in metric metadata, so a
// reported type can be compared against a literal and narrowed without casts.
// The switch fails to compile if the union and this member list ever drift
// apart, in either direction.
async function metricTypeMatchesRuntimeStrings() {
	const t: MetricType = 'counter';
	void t;

	const [first] = await registry.getMetricsAsJSON();
	if (first !== undefined && first.type === 'counter') {
		const narrowed: 'counter' = first.type;
		void narrowed;
	}

	const lockMembers = (type: MetricType): string => {
		switch (type) {
			case 'counter':
			case 'gauge':
			case 'histogram':
			case 'summary':
				return type;
			default: {
				const missing: never = type;
				return missing;
			}
		}
	};
	void lockMembers;

	// @ts-expect-error MetricType is a type-only string union with no runtime
	// object (#336), so value-style access must not compile.
	void MetricType.Counter;
}
void metricTypeMatchesRuntimeStrings;

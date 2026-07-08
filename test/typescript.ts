import { Counter, Pushgateway, Registry } from '../index';

const registry = new Registry();
const counter = new Counter({
	name: 'typescript_test_counter',
	help: 'TypeScript test counter',
	registers: [registry],
});

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

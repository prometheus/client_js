import { Counter, Registry } from '../index';

const registry = new Registry();
const counter = new Counter({
	name: 'typescript_test_counter',
	help: 'TypeScript test counter',
	registers: [registry],
});

const metricsText: Promise<string> = registry.getMetricsAsString(counter);

void metricsText;

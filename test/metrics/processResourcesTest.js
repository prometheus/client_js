'use strict';

describe('processRequests', () => {
	const register = require('../../index').register;
	const processResources = require('../../lib/metrics/processResources');

	beforeAll(() => {
		register.clear();
	});

	afterEach(() => {
		register.clear();
	});

	it('should add metric to the registry', async () => {
		// eslint-disable-next-line n/no-unsupported-features/node-builtins
		if (typeof process.getActiveResourcesInfo !== 'function') {
			return;
		}

		expect(await register.getMetricsAsJSON()).toHaveLength(0);

		processResources();

		const metrics = await register.getMetricsAsJSON();

		expect(metrics).toHaveLength(2);
		expect(metrics[0].help).toEqual(
			'Number of active resources that are currently keeping the event loop alive, grouped by async resource type.',
		);
		expect(metrics[0].type).toEqual('gauge');
		expect(metrics[0].name).toEqual('nodejs_active_resources');

		expect(metrics[1].help).toEqual('Total number of active resources.');
		expect(metrics[1].type).toEqual('gauge');
		expect(metrics[1].name).toEqual('nodejs_active_resources_total');
	});
});

'use strict';

const {
	describe,
	it,
	beforeEach,
	afterEach,
	before,
	after,
} = require('node:test');
const assert = require('node:assert');
const { describeEach } = require('../helpers');

describe('processRequests', () => {
	const register = require('../../index').register;
	const processResources = require('../../lib/metrics/processResources');

	before(() => {
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

		assert.strictEqual((await register.getMetricsAsJSON()).length, 0);

		processResources();

		const metrics = await register.getMetricsAsJSON();

		assert.strictEqual(metrics.length, 2);
		assert.strictEqual(
			metrics[0].help,
			'Number of active resources that are currently keeping the event loop alive, grouped by async resource type.',
		);
		assert.strictEqual(metrics[0].type, 'gauge');
		assert.strictEqual(metrics[0].name, 'nodejs_active_resources');

		assert.strictEqual(metrics[1].help, 'Total number of active resources.');
		assert.strictEqual(metrics[1].type, 'gauge');
		assert.strictEqual(metrics[1].name, 'nodejs_active_resources_total');
	});
});

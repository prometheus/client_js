'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const { describeEach } = require('./helpers');

const pushGatewayPath = '/path';
const pushGatewayURL = 'http://192.168.99.100:9091';
const pushGatewayFullURL = pushGatewayURL + pushGatewayPath;

// Note: Jest module mocking for 'http' module cannot be directly converted to node:test
// This would require using a different mocking strategy or library
const mockHttp = {
	calls: [],
	mockReturnValue: {
		on: () => {},
		end: () => {},
		write: () => {},
	},
	mockClear() {
		this.calls = [];
	},
	request(options) {
		this.calls.push({ options });
		return this.mockReturnValue;
	},
};

// Mock the http module by intercepting require calls
const Module = require('module');
const originalRequire = Module.prototype.require;
Module.prototype.require = function (...args) {
	if (args[0] === 'http') {
		return {
			request: (...requestArgs) => {
				mockHttp.calls.push(requestArgs);
				return mockHttp.mockReturnValue;
			},
		};
	}
	return originalRequire.apply(this, args);
};

const Registry = require('../index').Registry;

describeEach([
	['Prometheus', Registry.PROMETHEUS_CONTENT_TYPE],
	['OpenMetrics', Registry.OPENMETRICS_CONTENT_TYPE],
])('pushgateway with path and %s registry', (tag, regType) => {
	const Pushgateway = require('../index').Pushgateway;
	const register = require('../index').register;
	let instance;
	let registry = undefined;

	beforeEach(() => {
		register.setContentType(regType);
	});

	const tests = function () {
		describe('pushAdd', () => {
			it('should push metrics', () => {
				instance.pushAdd({ jobName: 'testJob' });

				assert.strictEqual(mockHttp.calls.length, 1);
				const invocation = mockHttp.calls[0][0];
				assert.strictEqual(invocation.method, 'POST');
				assert.strictEqual(invocation.path, '/path/metrics/job/testJob');
			});

			it('should use groupings', () => {
				instance.pushAdd({ jobName: 'testJob', groupings: { key: 'value' } });

				assert.strictEqual(mockHttp.calls.length, 1);
				const invocation = mockHttp.calls[0][0];
				assert.strictEqual(invocation.method, 'POST');
				assert.strictEqual(
					invocation.path,
					'/path/metrics/job/testJob/key/value',
				);
			});

			it('should escape groupings', () => {
				instance.pushAdd({ jobName: 'testJob', groupings: { key: 'va&lue' } });

				assert.strictEqual(mockHttp.calls.length, 1);
				const invocation = mockHttp.calls[0][0];
				assert.strictEqual(invocation.method, 'POST');
				assert.strictEqual(
					invocation.path,
					'/path/metrics/job/testJob/key/va%26lue',
				);
			});
		});

		describe('push', () => {
			it('should push with PUT', () => {
				instance.push({ jobName: 'testJob' });

				assert.strictEqual(mockHttp.calls.length, 1);
				const invocation = mockHttp.calls[0][0];
				assert.strictEqual(invocation.method, 'PUT');
				assert.strictEqual(invocation.path, '/path/metrics/job/testJob');
			});

			it('should uri encode url', () => {
				instance.push({ jobName: 'test&Job' });

				assert.strictEqual(mockHttp.calls.length, 1);
				const invocation = mockHttp.calls[0][0];
				assert.strictEqual(invocation.method, 'PUT');
				assert.strictEqual(invocation.path, '/path/metrics/job/test%26Job');
			});
		});

		describe('delete', () => {
			it('should push delete with no body', () => {
				instance.delete({ jobName: 'testJob' });

				assert.strictEqual(mockHttp.calls.length, 1);
				const invocation = mockHttp.calls[0][0];
				assert.strictEqual(invocation.method, 'DELETE');
				assert.strictEqual(invocation.path, '/path/metrics/job/testJob');
			});
		});

		describe('when using basic authentication', () => {
			const USERNAME = 'unittest';
			const PASSWORD = 'unittest';
			const auth = `${USERNAME}:${PASSWORD}`;

			beforeEach(() => {
				instance = new Pushgateway(
					`http://${auth}@192.168.99.100:9091${pushGatewayPath}`,
					null,
					registry,
				);
			});

			it('pushAdd should send POST request with basic auth data', () => {
				instance.pushAdd({ jobName: 'testJob' });

				assert.strictEqual(mockHttp.calls.length, 1);
				const invocation = mockHttp.calls[0][0];
				assert.strictEqual(invocation.method, 'POST');
				assert.strictEqual(invocation.auth, auth);
			});

			it('push should send PUT request with basic auth data', () => {
				instance.push({ jobName: 'testJob' });

				assert.strictEqual(mockHttp.calls.length, 1);
				const invocation = mockHttp.calls[0][0];
				assert.strictEqual(invocation.method, 'PUT');
				assert.strictEqual(invocation.auth, auth);
			});

			it('delete should send DELETE request with basic auth data', () => {
				instance.delete({ jobName: 'testJob' });

				assert.strictEqual(mockHttp.calls.length, 1);
				const invocation = mockHttp.calls[0][0];
				assert.strictEqual(invocation.method, 'DELETE');
				assert.strictEqual(invocation.auth, auth);
			});
		});

		it('should be possible to extend http/s requests with options', () => {
			instance = new Pushgateway(
				pushGatewayFullURL,
				{
					headers: {
						'unit-test': '1',
					},
				},
				registry,
			);

			instance.push({ jobName: 'testJob' });

			assert.strictEqual(mockHttp.calls.length, 1);
			const invocation = mockHttp.calls[0][0];
			assert.deepStrictEqual(invocation.headers, { 'unit-test': '1' });
		});
	};
	describe('global registry', () => {
		afterEach(() => {
			mockHttp.mockClear();
			register.clear();
		});
		beforeEach(() => {
			registry = undefined;
			instance = new Pushgateway(pushGatewayFullURL);
			const promClient = require('../index');
			const cnt = new promClient.Counter({ name: 'test', help: 'test' });
			cnt.inc(100);
		});
		tests();
	});
	describe('registry instance', () => {
		afterEach(() => {
			mockHttp.mockClear();
		});
		beforeEach(() => {
			registry = new Registry(regType);
			instance = new Pushgateway(pushGatewayFullURL, null, registry);
			const promClient = require('../index');
			const cnt = new promClient.Counter({
				name: 'test',
				help: 'test',
				registers: [registry],
			});
			cnt.inc(100);
		});
		tests();
	});
});

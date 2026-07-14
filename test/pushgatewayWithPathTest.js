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

const pushGatewayPath = '/path';
const pushGatewayURL = 'http://192.168.99.100:9091';
const pushGatewayFullURL = pushGatewayURL + pushGatewayPath;

const mockHttp = jest.fn().mockReturnValue({
	on: jest.fn(),
	end: jest.fn(),
	write: jest.fn(),
});

jest.mock('http', () => {
	return {
		request: mockHttp,
	};
});

const Registry = require('../index').Registry;

describe.each([
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

				expect(mockHttp).toHaveBeenCalledTimes(1);
				const [requestUrl, requestOptions] = mockHttp.mock.calls[0];
				expect(requestOptions.method).toEqual('POST');
				expect(requestUrl.pathname).toEqual('/path/metrics/job/testJob');
			});

			it('should use groupings', () => {
				instance.pushAdd({ jobName: 'testJob', groupings: { key: 'value' } });

				expect(mockHttp).toHaveBeenCalledTimes(1);
				const [requestUrl, requestOptions] = mockHttp.mock.calls[0];
				expect(requestOptions.method).toEqual('POST');
				expect(requestUrl.pathname).toEqual(
					'/path/metrics/job/testJob/key/value',
				);
			});

			it('should escape groupings', () => {
				instance.pushAdd({ jobName: 'testJob', groupings: { key: 'va&lue' } });

				expect(mockHttp).toHaveBeenCalledTimes(1);
				const [requestUrl, requestOptions] = mockHttp.mock.calls[0];
				expect(requestOptions.method).toEqual('POST');
				expect(requestUrl.pathname).toEqual(
					'/path/metrics/job/testJob/key/va%26lue',
				);
			});
		});

		describe('push', () => {
			it('should push with PUT', () => {
				instance.push({ jobName: 'testJob' });

				expect(mockHttp).toHaveBeenCalledTimes(1);
				const [requestUrl, requestOptions] = mockHttp.mock.calls[0];
				expect(requestOptions.method).toEqual('PUT');
				expect(requestUrl.pathname).toEqual('/path/metrics/job/testJob');
			});

			it('should uri encode url', () => {
				instance.push({ jobName: 'test&Job' });

				expect(mockHttp).toHaveBeenCalledTimes(1);
				const [requestUrl, requestOptions] = mockHttp.mock.calls[0];
				expect(requestOptions.method).toEqual('PUT');
				expect(requestUrl.pathname).toEqual('/path/metrics/job/test%26Job');
			});
		});

		describe('delete', () => {
			it('should push delete with no body', () => {
				instance.delete({ jobName: 'testJob' });

				expect(mockHttp).toHaveBeenCalledTimes(1);
				const [requestUrl, requestOptions] = mockHttp.mock.calls[0];
				expect(requestOptions.method).toEqual('DELETE');
				expect(requestUrl.pathname).toEqual('/path/metrics/job/testJob');
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

				expect(mockHttp).toHaveBeenCalledTimes(1);
				const [requestUrl, requestOptions] = mockHttp.mock.calls[0];
				expect(requestOptions.method).toEqual('POST');
				expect(requestUrl.username).toEqual(USERNAME);
				expect(requestUrl.password).toEqual(PASSWORD);
			});

			it('push should send PUT request with basic auth data', () => {
				instance.push({ jobName: 'testJob' });

				expect(mockHttp).toHaveBeenCalledTimes(1);
				const [requestUrl, requestOptions] = mockHttp.mock.calls[0];
				expect(requestOptions.method).toEqual('PUT');
				expect(requestUrl.username).toEqual(USERNAME);
				expect(requestUrl.password).toEqual(PASSWORD);
			});

			it('delete should send DELETE request with basic auth data', () => {
				instance.delete({ jobName: 'testJob' });

				expect(mockHttp).toHaveBeenCalledTimes(1);
				const [requestUrl, requestOptions] = mockHttp.mock.calls[0];
				expect(requestOptions.method).toEqual('DELETE');
				expect(requestUrl.username).toEqual(USERNAME);
				expect(requestUrl.password).toEqual(PASSWORD);
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

			expect(mockHttp).toHaveBeenCalledTimes(1);
			const [, requestOptions] = mockHttp.mock.calls[0];
			expect(requestOptions.headers).toEqual({ 'unit-test': '1' });
		});

		it('pins the http.request(url, options) call shape (no legacy options translation)', () => {
			instance.push({ jobName: 'testJob' });

			expect(mockHttp).toHaveBeenCalledTimes(1);
			const [requestUrl, requestOptions] = mockHttp.mock.calls[0];

			expect(requestUrl).toBeInstanceOf(URL);

			expect({
				url: requestUrl.toString(),
				options: requestOptions,
			}).toMatchSnapshot();
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

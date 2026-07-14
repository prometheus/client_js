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

const nock = require('nock');
const { gzipSync } = require('zlib');

const Registry = require('../index').Registry;

describe.each([
	['Prometheus', Registry.PROMETHEUS_CONTENT_TYPE],
	['OpenMetrics', Registry.OPENMETRICS_CONTENT_TYPE],
])('pushgateway with %s registry', (tag, regType) => {
	const Pushgateway = require('../index').Pushgateway;
	const register = require('../index').register;
	let instance;
	let registry = undefined;

	beforeEach(() => {
		register.setContentType(regType);
	});

	const tests = function () {
		let body;
		if (regType === Registry.OPENMETRICS_CONTENT_TYPE) {
			body = '# HELP test test\n# TYPE test counter\ntest_total 100\n# EOF\n';
		} else {
			body = '# HELP test test\n# TYPE test counter\ntest 100\n';
		}

		describe('pushAdd', () => {
			it('should push metrics', () => {
				const mockHttp = nock('http://192.168.99.100:9091')
					.post('/metrics/job/testJob', body)
					.reply(200);

				return instance.pushAdd({ jobName: 'testJob' }).then(() => {
					expect(mockHttp.isDone());
				});
			});

			it('should use groupings', () => {
				const mockHttp = nock('http://192.168.99.100:9091')
					.post('/metrics/job/testJob/key/value', body)
					.reply(200);

				return instance
					.pushAdd({
						jobName: 'testJob',
						groupings: { key: 'value' },
					})
					.then(() => {
						expect(mockHttp.isDone());
					});
			});

			it('should escape groupings', () => {
				const mockHttp = nock('http://192.168.99.100:9091')
					.post('/metrics/job/testJob/key/va%26lue', body)
					.reply(200);

				return instance
					.pushAdd({
						jobName: 'testJob',
						groupings: { key: 'va&lue' },
					})
					.then(() => {
						expect(mockHttp.isDone());
					});
			});

			it('should throw an error if the push failed', () => {
				nock('http://192.168.99.100:9091')
					.post('/metrics/job/testJob/key/value', body)
					.reply(400);

				return expect(
					instance.pushAdd({
						jobName: 'testJob',
						groupings: { key: 'value' },
					}),
				).rejects.toThrow('push failed with status 400');
			});

			it('should timeout when taking too long', () => {
				const mockHttp = nock('http://192.168.99.100:9091')
					.post('/metrics/job/testJob/key/va%26lue', body)
					.delay(100)
					.reply(200);

				expect.assertions(1);
				return instance
					.pushAdd({
						jobName: 'testJob',
						groupings: { key: 'va&lue' },
					})
					.catch(err => {
						expect(err.message).toStrictEqual('Pushgateway request timed out');
					});
			});

			it('should be possible to configure for gravel gateway integration (no job name required in path)', async () => {
				const mockHttp = nock('http://192.168.99.100:9091')
					.post('/metrics', body)
					.reply(200);

				instance = new Pushgateway(
					'http://192.168.99.100:9091',
					{
						timeout: 10,
						requireJobName: false,
					},
					registry,
				);

				return instance.pushAdd().then(() => expect(mockHttp.isDone()));
			});
		});

		describe('push', () => {
			it('should push with PUT', () => {
				const mockHttp = nock('http://192.168.99.100:9091')
					.put('/metrics/job/testJob', body)
					.reply(200);

				return instance.push({ jobName: 'testJob' }).then(() => {
					expect(mockHttp.isDone());
				});
			});

			it('should uri encode url', () => {
				const mockHttp = nock('http://192.168.99.100:9091')
					.put('/metrics/job/test%26Job', body)
					.reply(200);

				return instance.push({ jobName: 'test&Job' }).then(() => {
					expect(mockHttp.isDone());
				});
			});

			it('should throw an error if the push failed', () => {
				nock('http://192.168.99.100:9091')
					.put('/metrics/job/testJob/key/value', body)
					.reply(400);

				return expect(
					instance.push({
						jobName: 'testJob',
						groupings: { key: 'value' },
					}),
				).rejects.toThrow('push failed with status 400');
			});

			it('should timeout when taking too long', () => {
				const mockHttp = nock('http://192.168.99.100:9091')
					.put('/metrics/job/test%26Job', body)
					.delay(100)
					.reply(200);

				expect.assertions(1);
				return instance.push({ jobName: 'test&Job' }).catch(err => {
					expect(err.message).toStrictEqual('Pushgateway request timed out');
				});
			});
		});

		describe('delete', () => {
			it('should push delete with no body', () => {
				const mockHttp = nock('http://192.168.99.100:9091')
					.delete('/metrics/job/testJob')
					.reply(200);

				return instance.delete({ jobName: 'testJob' }).then(() => {
					expect(mockHttp.isDone());
				});
			});

			it('should throw an error if the push failed', () => {
				nock('http://192.168.99.100:9091')
					.delete('/metrics/job/testJob')
					.reply(400);

				return expect(instance.delete({ jobName: 'testJob' })).rejects.toThrow(
					'push failed with status 400',
				);
			});

			it('should timeout when taking too long', () => {
				const mockHttp = nock('http://192.168.99.100:9091')
					.delete('/metrics/job/testJob')
					.delay(100)
					.reply(200);

				expect.assertions(1);
				return instance.delete({ jobName: 'testJob' }).catch(err => {
					expect(err.message).toStrictEqual('Pushgateway request timed out');
				});
			});
		});

		describe('when using basic authentication', () => {
			const USERNAME = 'unittest';
			const PASSWORD = 'unittest';
			const auth = `${USERNAME}:${PASSWORD}`;

			beforeEach(() => {
				instance = new Pushgateway(
					`http://${auth}@192.168.99.100:9091`,
					null,
					registry,
				);
			});

			it('pushAdd should send POST request with basic auth data', () => {
				const mockHttp = nock(`http://${auth}@192.168.99.100:9091`)
					.post('/metrics/job/testJob', body)
					.reply(200);

				return instance.pushAdd({ jobName: 'testJob' }).then(() => {
					expect(mockHttp.isDone());
				});
			});

			it('push should send PUT request with basic auth data', () => {
				const mockHttp = nock(`http://${auth}@192.168.99.100:9091`)
					.put('/metrics/job/testJob', body)
					.reply(200);

				return instance.push({ jobName: 'testJob' }).then(() => {
					expect(mockHttp.isDone());
				});
			});

			it('delete should send DELETE request with basic auth data', () => {
				const mockHttp = nock(`http://${auth}@192.168.99.100:9091`)
					.delete('/metrics/job/testJob')
					.reply(200);

				return instance.delete({ jobName: 'testJob' }).then(() => {
					expect(mockHttp.isDone());
				});
			});
		});

		it('should be possible to extend http/s requests with options', () => {
			const mockHttp = nock('http://192.168.99.100:9091', {
				reqheaders: {
					'unit-test': '1',
				},
			})
				.put('/metrics/job/testJob', body)
				.reply(200);

			instance = new Pushgateway(
				'http://192.168.99.100:9091',
				{
					headers: {
						'unit-test': '1',
					},
				},
				registry,
			);

			return instance.push({ jobName: 'testJob' }).then(() => {
				expect(mockHttp.isDone());
			});
		});

		it('should use gzip request', () => {
			const mockHttp = nock('http://192.168.99.100:9091', {
				reqheaders: {
					'Content-Encoding': 'gzip',
				},
			})
				.post('/metrics/job/testJob', gzipSync(body))
				.reply(200);

			instance = new Pushgateway(
				'http://192.168.99.100:9091',
				{
					headers: {
						'Content-Encoding': 'gzip',
					},
				},
				registry,
			);

			return instance.pushAdd({ jobName: 'testJob' }).then(() => {
				expect(mockHttp.isDone());
			});
		});
	};

	describe('global registry', () => {
		afterEach(() => {
			register.clear();
		});

		beforeEach(() => {
			registry = undefined;
			instance = new Pushgateway('http://192.168.99.100:9091', { timeout: 10 });
			const promClient = require('../index');
			const cnt = new promClient.Counter({ name: 'test', help: 'test' });
			cnt.inc(100);
		});

		tests();
	});

	describe('registry instance', () => {
		afterEach(() => {
			register.clear();
		});

		beforeEach(() => {
			registry = new Registry(regType);
			instance = new Pushgateway(
				'http://192.168.99.100:9091',
				{ timeout: 10 },
				registry,
			);
			const promeClient = require('../index');
			const cnt = new promeClient.Counter({
				name: 'test',
				help: 'test',
				registers: [registry],
			});
			cnt.inc(100);
		});

		it('should use a registry passed as the second constructor argument', () => {
			const body =
				regType === Registry.OPENMETRICS_CONTENT_TYPE
					? '# HELP test test\n# TYPE test counter\ntest_total 100\n# EOF\n'
					: '# HELP test test\n# TYPE test counter\ntest 100\n';
			const mockHttp = nock('http://192.168.99.100:9091')
				.put('/metrics/job/testJob', body)
				.reply(200);

			instance = new Pushgateway('http://192.168.99.100:9091', registry);

			return instance.push({ jobName: 'testJob' }).then(() => {
				expect(mockHttp.isDone());
			});
		});

		tests();
	});
});

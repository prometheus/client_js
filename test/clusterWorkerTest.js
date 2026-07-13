// Copyright The Prometheus Authors
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

'use strict';

const process = require('process');

describe('cluster worker message handling', () => {
	const originalConnected = Object.getOwnPropertyDescriptor(
		process,
		'connected',
	);
	const originalSend = Object.getOwnPropertyDescriptor(process, 'send');

	afterEach(() => {
		jest.restoreAllMocks();
		jest.resetModules();
		jest.unmock('cluster');

		if (originalConnected) {
			Object.defineProperty(process, 'connected', originalConnected);
		} else {
			delete process.connected;
		}
		if (originalSend) {
			Object.defineProperty(process, 'send', originalSend);
		} else {
			delete process.send;
		}
	});

	it('does not send a metrics response after the IPC channel disconnects', async () => {
		let messageHandler;
		jest.doMock('cluster', () => {
			return { isPrimary: false };
		});
		jest.spyOn(process, 'on').mockImplementation((event, listener) => {
			if (event === 'message') messageHandler = listener;
			return process;
		});

		const send = jest.fn();
		Object.defineProperty(process, 'connected', {
			configurable: true,
			value: false,
		});
		Object.defineProperty(process, 'send', {
			configurable: true,
			value: send,
		});

		const AggregatorRegistry = require('../lib/cluster');
		new AggregatorRegistry();
		messageHandler({
			type: '@prometheus/client:getMetricsReq',
			requestId: 1,
		});
		await new Promise(resolve => setImmediate(resolve));

		expect(send).not.toHaveBeenCalled();
	});
});

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

const { immediate } = require('../lib/util');
const Registry = require('../lib/registry');
const Counter = require('../lib/counter');
const Gauge = require('../lib/gauge');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// Keep calling, as a render loop does, until a slice is used up.
function nextPause(fn = immediate) {
	for (let i = 0; i < 1e8; i++) {
		const pause = fn();
		if (pause !== undefined) return pause;
	}
	throw new Error('never paused');
}

function call64(fn) {
	let result;
	for (let i = 0; i < 64; i++) result = fn();
	return result;
}

// Load fresh copies of the modules, which capture the clock when they load.
function loadWithClock() {
	const clock = { now: performance.now() + 1000 };
	jest.spyOn(performance, 'now').mockImplementation(() => clock.now);
	let modules;
	jest.isolateModules(() => {
		modules = {
			immediate: require('../lib/util').immediate,
			Registry: require('../lib/registry'),
			Counter: require('../lib/counter'),
		};
	});
	return { clock, ...modules };
}

function loadUtil(timersFactory) {
	let util;
	jest.isolateModules(() => {
		if (timersFactory) jest.doMock('timers', timersFactory);
		util = require('../lib/util');
	});
	jest.dontMock('timers');
	return util;
}

describe('immediate()', () => {
	afterEach(() => {
		jest.useRealTimers();
		jest.restoreAllMocks();
	});

	it.each(['modern', 'legacy'])(
		'pauses and resumes under %s fake timers',
		async mode => {
			jest.useFakeTimers({ legacyFakeTimers: mode === 'legacy' });
			await nextPause();
		},
	);

	it('resumes when the global setImmediate is mocked later', async () => {
		jest.spyOn(global, 'setImmediate').mockImplementation(() => {});
		await nextPause();
		expect(global.setImmediate).not.toHaveBeenCalled();
	});

	it('uses the timers module when the global is faked before loading', async () => {
		const fake = Object.assign(() => {}, { clock: {} });
		const { setImmediate } = global;
		global.setImmediate = fake;
		let util;
		try {
			util = loadUtil();
		} finally {
			global.setImmediate = setImmediate;
		}

		await nextPause(util.immediate);
	});

	it('falls back to setTimeout when every setImmediate is faked', async () => {
		const fake = Object.assign(() => {}, { clock: {} });
		const { setImmediate } = global;
		global.setImmediate = fake;
		let util;
		try {
			util = loadUtil(() => {
				return { setImmediate: fake };
			});
		} finally {
			global.setImmediate = setImmediate;
		}

		await nextPause(util.immediate);
	});

	it('falls back to setTimeout without timers or setImmediate, as in browsers', async () => {
		const { setImmediate } = global;
		delete global.setImmediate;
		let util;
		try {
			util = loadUtil(() => {
				throw new Error('no timers module');
			});
		} finally {
			global.setImmediate = setImmediate;
		}

		await nextPause(util.immediate);
	});

	it('waits only once the slice is used up', async () => {
		const { clock, immediate: slicedImmediate } = loadWithClock();

		expect(call64(slicedImmediate)).toBeUndefined();
		clock.now += 0.6;
		expect(call64(slicedImmediate)).toBeUndefined();
		clock.now += 0.6;
		const pause = call64(slicedImmediate);
		expect(pause).toBeInstanceOf(Promise);
		await pause;

		expect(call64(slicedImmediate)).toBeUndefined();
	});

	it('starts a new slice after an idle gap instead of pausing', () => {
		const { clock, immediate: slicedImmediate } = loadWithClock();

		expect(call64(slicedImmediate)).toBeUndefined();
		clock.now += 5;
		expect(call64(slicedImmediate)).toBeUndefined();
	});
});

describe('Registry with pauses', () => {
	afterEach(() => {
		jest.useRealTimers();
		jest.restoreAllMocks();
	});

	it('renders the same output when it pauses on every series', async () => {
		const {
			clock,
			Registry: SlicedRegistry,
			Counter: SlicedCounter,
		} = loadWithClock();
		const registry = new SlicedRegistry();
		const counter = new SlicedCounter({
			name: 'c',
			help: 'c',
			labelNames: ['id'],
			registers: [registry],
		});
		for (let i = 0; i < 500; i++) counter.inc({ id: `${i}` });

		const unpaused = await registry.metrics();

		jest.spyOn(performance, 'now').mockImplementation(() => (clock.now += 0.9));
		expect(await registry.metrics()).toEqual(unpaused);
	});

	it('runs collect() callbacks concurrently', async () => {
		const registry = new Registry();
		for (const name of ['a', 'b', 'c']) {
			new Gauge({
				name,
				help: name,
				registers: [registry],
				async collect() {
					await sleep(50);
					this.set(1);
				},
			});
		}

		const start = Date.now();
		await registry.metrics();
		expect(Date.now() - start).toBeLessThan(140);
	});

	it('renders under fake timers', async () => {
		const registry = new Registry();
		new Counter({ name: 'c', help: 'c', registers: [registry] }).inc();

		jest.useFakeTimers();
		await expect(registry.metrics()).resolves.toContain('c 1');
		await expect(registry.getMetricsAsJSON()).resolves.toHaveLength(1);
	});
});

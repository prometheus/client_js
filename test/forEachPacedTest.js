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

const { performance: realPerformance } = require('perf_hooks');
const { forEachPaced } = require('../lib/util');
const Registry = require('../lib/registry');
const Counter = require('../lib/counter');
const Gauge = require('../lib/gauge');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// Busy work on the real clock, which modern fake timers leave running.
function spin(ms) {
	const end = realPerformance.now() + ms;
	while (realPerformance.now() < end);
}

// Runs forEachPaced over count items and records before which items it
// paused. Without a pause the items run in one go, so no microtask runs
// between them.
async function pausesIn(paced, count, work) {
	const pausedBefore = [];
	let awaited = false;
	await paced(
		Array.from({ length: count }, (_, i) => i),
		i => {
			if (awaited) {
				pausedBefore.push(i);
			}
			awaited = false;
			Promise.resolve().then(() => {
				awaited = true;
			});
			work(i);
		},
	);
	return pausedBefore;
}

// Load fresh copies of the modules, with a clock the test moves by hand.
function loadWithClock() {
	const clock = { now: performance.now() + 1000 };
	jest.spyOn(performance, 'now').mockImplementation(() => clock.now);
	let modules;
	jest.isolateModules(() => {
		modules = {
			forEachPaced: require('../lib/util').forEachPaced,
			Registry: require('../lib/registry'),
			Counter: require('../lib/counter'),
			Histogram: require('../lib/histogram'),
		};
	});
	return { clock, ...modules };
}

function loadUtil() {
	let util;
	jest.isolateModules(() => {
		util = require('../lib/util');
	});
	return util;
}

describe('forEachPaced()', () => {
	afterEach(() => {
		jest.useRealTimers();
		jest.restoreAllMocks();
	});

	it('calls fn for every item in order', async () => {
		const seen = [];
		await forEachPaced([1, 2, 3, 4, 5], item => seen.push(item));
		expect(seen).toEqual([1, 2, 3, 4, 5]);
	});

	it.each(['modern', 'legacy'])(
		'pauses and resumes under %s fake timers',
		async mode => {
			jest.useFakeTimers({ legacyFakeTimers: mode === 'legacy' });
			const pausedBefore = await pausesIn(forEachPaced, 50, () => spin(0.1));
			expect(pausedBefore.length).toBeGreaterThan(0);
		},
	);

	it('resumes when the global setImmediate is mocked later', async () => {
		jest.spyOn(global, 'setImmediate').mockImplementation(() => {});
		const pausedBefore = await pausesIn(forEachPaced, 50, () => spin(0.1));
		expect(pausedBefore.length).toBeGreaterThan(0);
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

		const pausedBefore = await pausesIn(util.forEachPaced, 50, () => spin(0.1));
		expect(pausedBefore.length).toBeGreaterThan(0);
	});

	it('pauses only once the slice is used up', async () => {
		const { clock, forEachPaced: paced } = loadWithClock();

		const pausedBefore = await pausesIn(paced, 10, () => {
			clock.now += 0.3;
		});
		expect(pausedBefore[0]).toBe(4);
	});

	it('pauses after an item slower than the slice', async () => {
		const { clock, forEachPaced: paced } = loadWithClock();

		const pausedBefore = await pausesIn(paced, 3, () => {
			clock.now += 5;
		});
		expect(pausedBefore).toEqual([1, 2]);
	});

	it('starts a new slice after the event loop turns instead of pausing', async () => {
		const { clock, forEachPaced: paced } = loadWithClock();

		await pausesIn(paced, 1, () => {
			clock.now += 0.9;
		});
		clock.now += 5;
		await new Promise(resolve => setImmediate(resolve));
		expect(await pausesIn(paced, 3, () => {})).toEqual([]);
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
		const registry = new SlicedRegistry(undefined, {
			nonBlockingExport: true,
		});
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

	it('exports a histogram series once when it is re-added during a pause', async () => {
		const {
			clock,
			Registry: SlicedRegistry,
			Histogram: SlicedHistogram,
		} = loadWithClock();
		const registry = new SlicedRegistry(undefined, {
			nonBlockingExport: true,
		});
		const histogram = new SlicedHistogram({
			name: 'h',
			help: 'h',
			labelNames: ['user'],
			registers: [registry],
		});
		for (let i = 0; i < 200; i++) histogram.observe({ user: `u${i}` }, 1);

		jest.spyOn(performance, 'now').mockImplementation(() => (clock.now += 0.9));
		const output = registry.metrics();
		histogram.remove({ user: 'u150' });
		histogram.observe({ user: 'u150' }, 1);

		const lines = (await output)
			.split('\n')
			.filter(line => line.includes('user="u150"'));
		expect(lines).toHaveLength(14);
	});

	it('runs collect() callbacks concurrently', async () => {
		const registry = new Registry(undefined, {
			nonBlockingExport: true,
		});
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
		const registry = new Registry(undefined, {
			nonBlockingExport: true,
		});
		new Counter({ name: 'c', help: 'c', registers: [registry] }).inc();

		jest.useFakeTimers();
		await expect(registry.metrics()).resolves.toContain('c 1');
		await expect(registry.getMetricsAsJSON()).resolves.toHaveLength(1);
	});
});

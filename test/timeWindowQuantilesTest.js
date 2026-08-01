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

describe('timeWindowQuantiles', () => {
	const TimeWindowQuantiles = require('../lib/timeWindowQuantiles');
	let instance;
	let clock;

	beforeEach(() => {
		jest.useFakeTimers('modern');
		jest.setSystemTime(0);
		instance = new TimeWindowQuantiles(5, 5);
	});

	describe('methods', () => {
		it('#push', () => {
			instance.push(1);
			instance.ringBuffer.forEach(td => {
				expect(td.centroids.size).toEqual(1);
			});
		});

		it('#reset', () => {
			instance.push(1);
			instance.reset();
			instance.ringBuffer.forEach(td => {
				expect(td.centroids.size).toEqual(0);
			});
		});

		it('#compress', () => {
			instance.push(1);
			instance.compress();
			instance.ringBuffer.forEach(td => {
				expect(td.centroids.size).toEqual(1);
			});
		});

		it('#percentile', () => {
			instance.push(1);
			expect(instance.percentile(0.5)).toEqual(1);
		});
	});

	describe('rotation', () => {
		it('rotatation interval should be configured', () => {
			let localInstance = new TimeWindowQuantiles(undefined, undefined);
			expect(localInstance.durationBetweenRotatesMillis).toEqual(Infinity);
			localInstance = new TimeWindowQuantiles(1, 1);
			expect(localInstance.durationBetweenRotatesMillis).toEqual(1000);
			localInstance = new TimeWindowQuantiles(10, 5);
			expect(localInstance.durationBetweenRotatesMillis).toEqual(2000);
		});

		it('should rotate', () => {
			instance.push(1);
			expect(instance.currentBuffer).toEqual(0);
			jest.advanceTimersByTime(1001);
			instance.percentile(0.5);
			expect(instance.currentBuffer).toEqual(1);
			jest.advanceTimersByTime(1001);
			instance.percentile(0.5);
			expect(instance.currentBuffer).toEqual(2);
			jest.advanceTimersByTime(1001);
			instance.percentile(0.5);
			expect(instance.currentBuffer).toEqual(3);
			jest.advanceTimersByTime(1001);
			instance.percentile(0.5);
			expect(instance.currentBuffer).toEqual(4);
			jest.advanceTimersByTime(1001);
			instance.percentile(0.5);
			expect(instance.currentBuffer).toEqual(0);

			instance.ringBuffer.forEach(td => {
				expect(td.centroids.size).toEqual(0);
			});
		});
	});
});

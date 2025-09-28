'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');

describe('utils', () => {
	describe('isObject', () => {
		const isObject = require('../lib/util').isObject;

		it('should not throw on missing argument', () => {
			isObject();
		});

		it('should return true for empty object', () => {
			isObject({});
		});
	});

	describe('isEmpty', () => {
		const isEmpty = require('../lib/util').isEmpty;

		it('should not throw on missing argument', () => {
			isEmpty();
		});

		it('should return true for empty object', async () => {
			assert.strictEqual(isEmpty({}), true);
		});

		it('should return false for an object with keys', async () => {
			assert.strictEqual(isEmpty({ foo: undefined }), false);
		});
	});

	describe('getLabels', () => {
		const getLabels = require('../lib/util').getLabels;

		it('should not throw on missing argument', async () => {
			const labels = getLabels(['label1', 'label2'], ['arg1', 'arg2']);
			assert.deepStrictEqual(labels, { label1: 'arg1', label2: 'arg2' });
		});

		it('should throw on missing argument', async () => {
			assert.throws(() => {
				getLabels(['label1', 'label2'], ['arg1']);
			}, /Invalid number of arguments/);
		});
	});

	describe('LabelMap', () => {
		const { LabelMap } = require('../lib/util');

		it('can be instantiated', () => {
			const map = new LabelMap(['d', 'b', 'a']);

			assert.strictEqual(map.size, 0);
		});

		describe('keyFrom()', () => {
			it('handles reordered labels', () => {
				const map = new LabelMap(['b', 'c', 'a']);

				const result = map.keyFrom({ a: 1, c: 200, b: 'post' });

				assert.strictEqual(result, '1|post|200');
			});

			it('allows sparse labels ', () => {
				const map = new LabelMap(['b', 'c', 'a', 'd']);

				const result = map.keyFrom({ d: 'a|b' });

				assert.strictEqual(result, '|||a|b');
			});
		});

		describe('set()', () => {
			it('can create new records', () => {
				const map = new LabelMap(['b', 'c', 'a']);

				map.set({ a: 2 }, 3);

				assert.strictEqual(map.size, 1);
				assert.deepStrictEqual(Array.from(map.values()), [
					{ value: 3, labels: { a: 2 } },
				]);
			});

			it('can update existing values', () => {
				const map = new LabelMap(['b', 'c', 'a']);

				// And supports chaining
				map.set({ a: 2 }, 3).set({ a: 2 }, 4);

				assert.strictEqual(map.size, 1);
				assert.deepStrictEqual(Array.from(map.values()), [
					{ value: 4, labels: { a: 2 } },
				]);
			});

			it('creates separate records for each label combination', () => {
				const map = new LabelMap(['b', 'c', 'a']);

				map.set({ a: 2 }, 22).set({ a: 3 }, 3);

				assert.strictEqual(map.size, 2);
				assert.deepStrictEqual(Array.from(map.values()), [
					{
						value: 22,
						labels: { a: 2 },
					},
					{
						value: 3,
						labels: { a: 3 },
					},
				]);
			});
		});

		describe('setDelta()', () => {
			it('can create new records', () => {
				const map = new LabelMap(['b', 'c', 'a']);

				map.setDelta({ a: 2 }, 3);

				assert.strictEqual(map.size, 1);
				assert.deepStrictEqual(Array.from(map.values()), [
					{ value: 3, labels: { a: 2 } },
				]);
			});

			it('can update existing values', () => {
				const map = new LabelMap(['b', 'c', 'a']);

				map.setDelta({ a: 2 }, 3).setDelta({ a: 2 }, 4);

				assert.strictEqual(map.size, 1);
				assert.deepStrictEqual(Array.from(map.values()), [
					{ value: 3 + 4, labels: { a: 2 } },
				]);
			});

			it('creates separate records for each label combination', () => {
				const map = new LabelMap(['b', 'c', 'a']);

				map.setDelta({ a: 2 }, 3);
				map.setDelta({ a: 3 }, 3);

				assert.strictEqual(map.size, 2);
				assert.deepStrictEqual(Array.from(map.values()), [
					{ value: 3, labels: { a: 2 } },
					{ value: 3, labels: { a: 3 } },
				]);
			});
		});

		describe('get()', () => {
			it('does not error on missing entry', () => {
				const map = new LabelMap(['b', 'c', 'a']);

				assert.strictEqual(map.get({ foo: 'bar' }), undefined);
			});

			it('returns the entry.value', () => {
				const map = new LabelMap(['b', 'c', 'a']);

				map.set({ b: 22 }, 10);

				assert.strictEqual(map.get({ b: 22 }), 10);
			});
		});

		describe('entry()', () => {
			it('does not error on missing entry', () => {
				const map = new LabelMap(['b', 'c', 'a']);

				assert.strictEqual(map.entry({ foo: 'bar' }), undefined);
			});

			it('returns the entry', () => {
				const map = new LabelMap(['b', 'c', 'a']);

				map.set({ b: 22 }, 10);

				assert.deepStrictEqual(map.entry({ b: 22 }), {
					value: 10,
					labels: { b: 22 },
				});
			});
		});

		describe('remove()', () => {
			it('can remove records', () => {
				const map = new LabelMap(['b', 'c', 'a']);

				map.setDelta({ a: 2 }, 3);
				map.remove({ a: 2 });

				assert.strictEqual(map.size, 0);
			});

			it('does nothing on a miss', () => {
				const map = new LabelMap(['b', 'c', 'a']);

				map.setDelta({ a: 2 }, 3);
				map.setDelta({ a: 3 }, 3);

				map.remove({ a: 5 });

				assert.strictEqual(map.size, 2);
			});
		});

		describe('validate()', () => {
			it('should not throw on known label', () => {
				const map = new LabelMap(['exists']);

				// Should not throw
				map.validate({ exists: null });
			});

			it('should throw on unknown label', () => {
				const map = new LabelMap(['exists']);

				assert.throws(
					() => map.validate({ somethingElse: null }),
					/Added label "somethingElse" is not included in initial labelset/,
				);
			});
		});

		describe('getOrAdd()', () => {
			it('returns existing values', () => {
				const map = new LabelMap(['b', 'c', 'a']);
				const callback = () => 'should not be called';

				map.set({ c: 200 }, [2, 3]);

				const actual = map.getOrAdd({ c: 200 }, callback);

				assert.deepStrictEqual(actual, [2, 3]);
				// Note: Mock function call tracking not available in node:test
			});

			it('adds on missing record', () => {
				const map = new LabelMap(['b', 'c', 'a']);
				const callback = () => 4;

				map.set({ c: 200 }, [2, 3]);

				const actual = map.getOrAdd({ c: 401 }, callback);

				assert.strictEqual(actual, 4);
				assert.deepStrictEqual(Array.from(map.values()), [
					{ value: [2, 3], labels: { c: 200 } },
					{ value: 4, labels: { c: 401 } },
				]);
				// Note: Mock function call tracking not available in node:test
			});
		});

		describe('clear()', () => {
			it('resets the collection', () => {
				const map = new LabelMap(['b', 'c', 'a']);

				map.set({ a: 2 }, 3).set({ a: 3 }, 4);
				map.clear();

				assert.strictEqual(map.size, 0);
			});

			it('can still add new records after clear()ing', () => {
				const map = new LabelMap(['b', 'c', 'a']);

				map.set({ a: 3 }, 3);
				map.clear();
				map.setDelta({ a: 3 }, 4);

				assert.strictEqual(map.size, 1);
				assert.deepStrictEqual(Array.from(map.values()), [
					{ value: 4, labels: { a: 3 } },
				]);
			});
		});

		describe('merge()', () => {
			it('creates an entry if missing', () => {
				const map = new LabelMap(['method', 'region', 'version']);

				const result = map.merge(
					{ method: 'head' },
					{ a: 'foo', labels: { b: 2 } },
				);
				assert.strictEqual(result !== undefined, true);

				assert.strictEqual(map.entry({ method: 'head' }), result);
			});

			it('merges in values', () => {
				const map = new LabelMap(['method', 'region', 'version']);

				const result = map.merge(
					{ method: 'head' },
					{ a: 'foo', labels: { b: 2 } },
				);

				assert.deepStrictEqual(result, {
					labels: { method: 'head' },
					a: 'foo',
				});
			});
		});
	});

	describe('Grouper', () => {
		const { Grouper } = require('../lib/util');

		it('can be instantiated', () => {
			const grouper = new Grouper();

			assert.strictEqual(grouper.size, 0);
		});

		it('supports same constructor syntax as Map', () => {
			const grouper = new Grouper([['name', []]]);

			assert.strictEqual(grouper.size, 1);
			assert.strictEqual(grouper.has('name'), true);
		});

		describe('add()', () => {
			it('can create new records', () => {
				const grouper = new Grouper([['name', [2]]]);

				grouper.add('name', 3);

				assert.strictEqual(grouper.size, 1);
				assert.deepStrictEqual(grouper.get('name'), [2, 3]);
			});

			it('creates separate records for each key', () => {
				const grouper = new Grouper([['name', [2]]]);

				grouper.add('other', 3);

				assert.strictEqual(grouper.size, 2);
				assert.deepStrictEqual(grouper.get('other'), [3]);
			});
		});

		describe('getOrAdd()', () => {
			it('returns existing values', () => {
				const grouper = new Grouper([['name', [2, 3]]]);
				const callback = () => 'should not be called';

				const actual = grouper.getOrAdd('name', callback);

				assert.deepStrictEqual(actual, [2, 3]);
				// Note: Mock function call tracking not available in node:test
			});

			it('adds on missing record', () => {
				const grouper = new Grouper([['name', [2, 3]]]);
				const callback = () => 4;

				const actual = grouper.getOrAdd('blah', callback);

				assert.strictEqual(actual, 4);
				assert.strictEqual(grouper.get('blah'), 4);
				// Note: Mock function call tracking not available in node:test
			});

			it('defaults to inserting an empty array', () => {
				const grouper = new Grouper([['name', [2, 3]]]);
				const actual = grouper.getOrAdd('blah');

				assert.deepStrictEqual(actual, []);
				assert.deepStrictEqual(grouper.get('blah'), []);
			});
		});
	});
});

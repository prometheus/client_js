'use strict';

describe('utils', () => {
	describe('isObject', () => {
		const isObject = require('../lib/util').isObject;

		it('should not throw on missing argument', () => {
			expect(isObject).not.toThrow();
		});

		it('should return true for empty object', () => {
			expect(isObject({})).toBe(true);
		});
	});

	describe('isEmpty', () => {
		const isEmpty = require('../lib/util').isEmpty;

		it('should not throw on missing argument', () => {
			expect(isEmpty).not.toThrow();
		});

		it('should return true for empty object', async () => {
			expect(isEmpty({})).toBe(true);
		});

		it('should return false for an object with keys', async () => {
			expect(isEmpty({ foo: undefined })).toBe(false);
		});
	});

	describe('getLabels', () => {
		const getLabels = require('../lib/util').getLabels;

		it('should not throw on missing argument', async () => {
			const labels = getLabels(['label1', 'label2'], ['arg1', 'arg2']);
			expect(labels).toEqual({ label1: 'arg1', label2: 'arg2' });
		});

		it('should throw on missing argument', async () => {
			expect(() => {
				getLabels(['label1', 'label2'], ['arg1']);
			}).toThrow(
				'Invalid number of arguments (1): "arg1" for label names (2): "label1, label2".',
			);
		});
	});

	describe('LabelMap', () => {
		const { LabelMap } = require('../lib/util');

		it('can be instantiated', () => {
			const map = new LabelMap(['d', 'b', 'a']);

			expect(map.size).toEqual(0);
		});

		describe('keyFrom()', () => {
			it('handles reordered labels', () => {
				const map = new LabelMap(['b', 'c', 'a']);

				const result = map.keyFrom({ a: 1, c: 200, b: 'post' });

				expect(result).toEqual('1|post|200|');
			});

			it('allows sparse labels ', () => {
				const map = new LabelMap(['b', 'c', 'a', 'd']);

				const result = map.keyFrom({ d: 'a|b' });

				expect(result).toEqual('|||a|b|');
			});
		});

		describe('set()', () => {
			it('can create new records', () => {
				const map = new LabelMap(['b', 'c', 'a']);

				map.set({ a: 2 }, 3);

				expect(map.size).toEqual(1);
				expect(Array.from(map.values())).toStrictEqual([
					{ value: 3, labels: { a: 2 } },
				]);
			});

			it('can update existing values', () => {
				const map = new LabelMap(['b', 'c', 'a']);

				// And supports chaining
				map.set({ a: 2 }, 3).set({ a: 2 }, 4);

				expect(map.size).toEqual(1);
				expect(Array.from(map.values())).toStrictEqual([
					{ value: 4, labels: { a: 2 } },
				]);
			});

			it('creates separate records for each label combination', () => {
				const map = new LabelMap(['b', 'c', 'a']);

				map.set({ a: 2 }, 22).set({ a: 3 }, 3);

				expect(map.size).toEqual(2);
				expect(Array.from(map.values())).toStrictEqual([
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

				expect(map.size).toEqual(1);
				expect(Array.from(map.values())).toStrictEqual([
					{ value: 3, labels: { a: 2 } },
				]);
			});

			it('can update existing values', () => {
				const map = new LabelMap(['b', 'c', 'a']);

				map.setDelta({ a: 2 }, 3).setDelta({ a: 2 }, 4);

				expect(map.size).toEqual(1);
				expect(Array.from(map.values())).toStrictEqual([
					{ value: 3 + 4, labels: { a: 2 } },
				]);
			});

			it('creates separate records for each label combination', () => {
				const map = new LabelMap(['b', 'c', 'a']);

				map.setDelta({ a: 2 }, 3);
				map.setDelta({ a: 3 }, 3);

				expect(map.size).toEqual(2);
				expect(Array.from(map.values())).toStrictEqual([
					{ value: 3, labels: { a: 2 } },
					{ value: 3, labels: { a: 3 } },
				]);
			});
		});

		describe('get()', () => {
			it('does not error on missing entry', () => {
				const map = new LabelMap(['b', 'c', 'a']);

				expect(map.get({ foo: 'bar' })).toBeUndefined();
			});

			it('returns the entry.value', () => {
				const map = new LabelMap(['b', 'c', 'a']);

				map.set({ b: 22 }, 10);

				expect(map.get({ b: 22 })).toEqual(10);
			});
		});

		describe('entry()', () => {
			it('does not error on missing entry', () => {
				const map = new LabelMap(['b', 'c', 'a']);

				expect(map.entry({ foo: 'bar' })).toBeUndefined();
			});

			it('returns the entry', () => {
				const map = new LabelMap(['b', 'c', 'a']);

				map.set({ b: 22 }, 10);

				expect(map.entry({ b: 22 })).toStrictEqual({
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

				expect(map.size).toEqual(0);
			});

			it('does nothing on a miss', () => {
				const map = new LabelMap(['b', 'c', 'a']);

				map.setDelta({ a: 2 }, 3);
				map.setDelta({ a: 3 }, 3);

				map.remove({ a: 5 });

				expect(map.size).toEqual(2);
			});
		});

		describe('validate()', () => {
			it('should not throw on known label', () => {
				const map = new LabelMap(['exists']);

				expect(() => map.validate({ exists: null })).not.toThrow();
			});

			it('should throw on unknown label', () => {
				const map = new LabelMap(['exists']);

				expect(() => map.validate({ somethingElse: null })).toThrow(
					'Added label "somethingElse" is not included in initial labelset: [ \'exists\' ]',
				);
			});
		});

		describe('getOrAdd()', () => {
			it('returns existing values', () => {
				const map = new LabelMap(['b', 'c', 'a']);
				const callback = jest.fn();

				map.set({ c: 200 }, [2, 3]);

				const actual = map.getOrAdd({ c: 200 }, callback);

				expect(actual).toStrictEqual([2, 3]);
				expect(callback).not.toHaveBeenCalled();
			});

			it('adds on missing record', () => {
				const map = new LabelMap(['b', 'c', 'a']);
				const callback = jest.fn(() => 4);

				map.set({ c: 200 }, [2, 3]);

				const actual = map.getOrAdd({ c: 401 }, callback);

				expect(actual).toStrictEqual(4);
				expect(Array.from(map.values())).toStrictEqual([
					{ value: [2, 3], labels: { c: 200 } },
					{ value: 4, labels: { c: 401 } },
				]);
				expect(callback).toHaveBeenCalled();
			});
		});

		describe('clear()', () => {
			it('resets the collection', () => {
				const map = new LabelMap(['b', 'c', 'a']);

				map.set({ a: 2 }, 3).set({ a: 3 }, 4);
				map.clear();

				expect(map.size).toEqual(0);
			});

			it('can still add new records after clear()ing', () => {
				const map = new LabelMap(['b', 'c', 'a']);

				map.set({ a: 3 }, 3);
				map.clear();
				map.setDelta({ a: 3 }, 4);

				expect(map.size).toEqual(1);
				expect(Array.from(map.values())).toStrictEqual([
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
				expect(result).toBeDefined();

				expect(map.entry({ method: 'head' })).toBe(result);
			});

			it('merges in values', () => {
				const map = new LabelMap(['method', 'region', 'version']);

				const result = map.merge(
					{ method: 'head' },
					{ a: 'foo', labels: { b: 2 } },
				);

				expect(result).toStrictEqual({
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

			expect(grouper.size).toEqual(0);
		});

		it('supports same constructor syntax as Map', () => {
			const grouper = new Grouper([['name', []]]);

			expect(grouper.size).toEqual(1);
			expect(grouper.has('name')).toBe(true);
		});

		describe('add()', () => {
			it('can create new records', () => {
				const grouper = new Grouper([['name', [2]]]);

				grouper.add('name', 3);

				expect(grouper.size).toEqual(1);
				expect(grouper.get('name')).toStrictEqual([2, 3]);
			});

			it('creates separate records for each key', () => {
				const grouper = new Grouper([['name', [2]]]);

				grouper.add('other', 3);

				expect(grouper.size).toEqual(2);
				expect(grouper.get('other')).toStrictEqual([3]);
			});
		});
	});

	describe('LabelGrouper', () => {
		const { LabelGrouper } = require('../lib/util');

		it('can be instantiated', () => {
			const grouper = new LabelGrouper();

			expect(grouper.size).toEqual(0);
		});

		describe('keyFrom()', () => {
			it('handles new labels', () => {
				const grouper = new LabelGrouper();

				const result = grouper.keyFrom({ a: 1, c: 200, b: 'post' });

				expect(result).toEqual('1|200|post|||');
			});

			it('allows sparse labels ', () => {
				const grouper = new LabelGrouper();

				grouper.keyFrom({ a: 1, b: 'post', c: 200 });

				const result = grouper.keyFrom({ d: 'a|b' });

				expect(result).toEqual('|||a|b||');
			});
		});

		describe('label expansion', () => {
			it('can still fetch earlier values', () => {
				const grouper = new LabelGrouper();

				const labels1 = { a: 1, b: 'post', c: 200, d: true };
				const labels2 = { d: false, e: true, f: 500, g: 1 };

				grouper.add({ labels: labels1, value: 4 });
				grouper.add({ labels: labels2, value: 5 });

				const result = grouper.get({ ...labels1 });

				expect(grouper.size).toEqual(2);
				expect(result).toStrictEqual([{ labels: { ...labels1 }, value: 4 }]);
			});

			it('can concatenate to existing entries', () => {
				const grouper = new LabelGrouper();

				// And supports chaining
				const labels = { a: 2 };
				grouper
					.add({ labels: { ...labels }, value: 3 })
					.add({ labels: { ...labels }, value: 4 });

				expect(grouper.size).toEqual(1);
				expect(Array.from(grouper.values())).toStrictEqual([
					[
						{ labels, value: 3 },
						{ labels, value: 4 },
					],
				]);
			});

			it('creates separate records for each label combination', () => {
				const grouper = new LabelGrouper();

				grouper
					.add({ labels: { a: 2 }, value: 22 })
					.add({ labels: { a: 3 }, value: 3 });

				expect(grouper.size).toEqual(2);
				expect(Array.from(grouper.values())).toStrictEqual([
					[{ value: 22, labels: { a: 2 } }],
					[{ value: 3, labels: { a: 3 } }],
				]);
			});
		});

		describe('get()', () => {
			it('does not error on missing entry', () => {
				const grouper = new LabelGrouper();

				expect(grouper.get({ foo: 'bar' })).toBeUndefined();
			});

			it('returns the entry.value', () => {
				const grouper = new LabelGrouper();

				grouper.add({ labels: { b: 22 }, value: 10 });

				expect(grouper.get({ b: 22 })).toStrictEqual([
					{ labels: { b: 22 }, value: 10 },
				]);
			});
		});

		describe('forEach()', () => {
			it('returns values', () => {
				const grouper = new LabelGrouper();

				grouper
					.add({ labels: { a: 2 }, value: 3 })
					.add({ labels: { a: 3 }, value: 4 });

				let count = 0;

				grouper.forEach((entry, key) => {
					expect(key).toBeDefined();
					expect(entry).toHaveLength(1);
					expect(entry[0]).toHaveProperty('labels');
					expect(entry[0]).toHaveProperty('value');
					count++;
				});

				expect(count).toBe(2);
			});
		});

		describe('clear()', () => {
			it('resets the collections', () => {
				const grouper = new LabelGrouper();

				grouper
					.add({ labels: { a: 2 }, value: 3 })
					.add({ labels: { a: 3 }, value: 4 });

				grouper.clear();

				expect(Array.from(grouper.values())).toStrictEqual([]);
			});

			it('can still add new records after clear()ing', () => {
				const grouper = new LabelGrouper();

				grouper.add({ labels: { a: 3 }, value: 3 });
				grouper.clear();
				grouper.add({ labels: { a: 3 }, value: 4 });

				expect(grouper.size).toEqual(1);
				expect(Array.from(grouper.values())).toStrictEqual([
					[{ labels: { a: 3 }, value: 4 }],
				]);
			});
		});
	});
});

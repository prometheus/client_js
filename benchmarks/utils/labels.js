'use strict';

const VALUES = {
	method: [
		'get',
		'post',
		'put',
		'delete',
		'delete',
		'head',
		'options',
		'patch',
	],
	status: [100, 200, 201, 301, 400, 401, 403, 404, 500, 502],
	account: ['user', 'admin', 'guest', 'bot'],
	region: ['us-west-1', 'us-east-1', 'us-west4', 'us-east1', 'europe-north1'],
	type: ['desktop', 'mobile', 'tablet', 'kiosk', 'watch', 'pos'],
	env: ['development', 'production', 'staging', 'qa'],
	protocol: ['http', 'https'],
	campaign: [
		'easter',
		'valentines',
		'christmas',
		'thanksgiving',
		'labor_day',
		'new_years',
		'halloween',
	],
	label1: [2, 4, 6, 8, 10, 12, 14, 16],
	label2: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
	label3: 'abcdefghijklmnopqrst'.split('').reverse(),
};

module.exports = {
	getLabelNames,
	getLabelCombinations,
	labelCombinationFactory,
};

function getLabelNames(count) {
	return Object.keys(VALUES).slice(0, count);
}

const flatten = (a, b) => [].concat(...a.map(c => b.map(d => [].concat(c, d))));
const cartesianProduct = (a, b, ...c) =>
	b ? cartesianProduct(flatten(a, b), ...c) : a;
const times = a => Array.from(Array(a)).map((_, x) => x);

function getLabelCombinations(labelValues, labelNames) {
	if (labelValues.length === 0) {
		return [{}];
	}

	labelNames ??= getLabelNames(labelValues.length);

	const labelValuesArray = labelNames.map((label, i) => {
		const count = labelValues[i] ?? 1;

		let values = VALUES[label] ?? [];
		if (values.length >= count) {
			values = values.slice(0, count);
		} else {
			values = values.concat(times(count - values.length));
		}

		return values;
	});

	if (labelValues.length === 1) {
		labelValuesArray.push([undefined]);
	}

	const labelValueCombinations = cartesianProduct(...labelValuesArray) ?? [];
	return labelValueCombinations.map(values =>
		labelNames.reduce((acc, label, i) => {
			acc[label] = values[i];
			return acc;
		}, {}),
	);
}

function labelCombinationFactory(labelValues, fn) {
	const labelCombinations = getLabelCombinations(labelValues);

	return (client, ctx) =>
		labelCombinations.forEach(labels => fn(client, ctx, labels));
}

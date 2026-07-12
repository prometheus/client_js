'use strict';

const http = require('http');
const https = require('https');
const { gzipSync } = require('zlib');
const Registry = require('./registry');
const { globalRegistry } = Registry;

class Pushgateway {
	constructor(gatewayUrl, options, registry = globalRegistry) {
		if (options instanceof Registry) {
			registry = options;
			options = {};
		}
		this.registry = registry;
		this.gatewayUrl = gatewayUrl;
		const { requireJobName, ...requestOptions } = {
			requireJobName: true,
			...options,
		};
		this.requireJobName = requireJobName;
		this.requestOptions = requestOptions;
	}

	pushAdd(params = {}) {
		if (this.requireJobName && !params.jobName) {
			throw new Error('Missing jobName parameter');
		}

		return useGateway.call(this, 'POST', params.jobName, params.groupings);
	}

	push(params = {}) {
		if (this.requireJobName && !params.jobName) {
			throw new Error('Missing jobName parameter');
		}

		return useGateway.call(this, 'PUT', params.jobName, params.groupings);
	}

	delete(params = {}) {
		if (this.requireJobName && !params.jobName) {
			throw new Error('Missing jobName parameter');
		}

		return useGateway.call(this, 'DELETE', params.jobName, params.groupings);
	}
}

async function useGateway(method, job, groupings) {
	// `URL` is a global since Node.js v10 - no `require('url')` needed.
	const requestParams = new URL(this.gatewayUrl);
	const gatewayUrlPath =
		requestParams.pathname && requestParams.pathname !== '/'
			? requestParams.pathname
			: '';
	const jobPath = job
		? `/job/${encodeURIComponent(job)}${generateGroupings(groupings)}`
		: '';
	requestParams.pathname = `${gatewayUrlPath}/metrics${jobPath}`;

	const httpModule = requestParams.protocol === 'https:' ? https : http;
	const options = { ...this.requestOptions, method };

	return new Promise((resolve, reject) => {
		if (method === 'DELETE' && options.headers) {
			delete options.headers['Content-Encoding'];
		}
		const req = httpModule.request(requestParams, options, resp => {
			let body = '';
			resp.setEncoding('utf8');
			resp.on('data', chunk => {
				body += chunk;
			});
			resp.on('end', () => {
				if (resp.statusCode >= 400) {
					reject(
						new Error(`push failed with status ${resp.statusCode}, ${body}`),
					);
				} else {
					resolve({ resp, body });
				}
			});
		});
		req.on('error', err => {
			reject(err);
		});

		req.on('timeout', () => {
			req.destroy(new Error('Pushgateway request timed out'));
		});

		if (method !== 'DELETE') {
			this.registry
				.metrics()
				.then(metrics => {
					if (
						options.headers &&
						options.headers['Content-Encoding'] === 'gzip'
					) {
						metrics = gzipSync(metrics);
					}
					req.write(metrics);
					req.end();
				})
				.catch(err => {
					reject(err);
				});
		} else {
			req.end();
		}
	});
}

function generateGroupings(groupings) {
	if (!groupings) {
		return '';
	}
	return Object.keys(groupings)
		.map(
			key =>
				`/${encodeURIComponent(key)}/${encodeURIComponent(groupings[key])}`,
		)
		.join('');
}

module.exports = Pushgateway;

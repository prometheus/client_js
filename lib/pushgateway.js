'use strict';

const url = require('url');
const http = require('http');
const https = require('https');
const { gzipSync } = require('zlib');
const { globalRegistry } = require('./registry');

class Pushgateway {
	constructor(gatewayUrl, options, registry) {
		if (!registry) {
			registry = globalRegistry;
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

function legacyUrlResolve(from, to) {
	const resolvedUrl = new URL(to, new URL(from, 'resolve://'));
	if (resolvedUrl.protocol === 'resolve:') {
		// `from` is a relative URL.
		const { pathname, search, hash } = resolvedUrl;
		return pathname + search + hash;
	}
	return resolvedUrl.toString();
}

function legacyUrlFromWhatwgUrl(whatwgUrl) {
	const legacyUrl = {
		hash: whatwgUrl.hash,
		host: whatwgUrl.host,
		href: whatwgUrl.href,
		pathname: whatwgUrl.pathname,
		port: whatwgUrl.port,
		protocol: whatwgUrl.protocol,
		search: whatwgUrl.search,

		// replaced
		hostname: whatwgUrl.hostname.replace(/^\[|]$/, ''),
		path: `${whatwgUrl.pathname}${whatwgUrl.search}`,
	};

	if (whatwgUrl.username) {
		legacyUrl.auth = whatwgUrl.username;

		if (whatwgUrl.password) {
			legacyUrl.auth += `:${whatwgUrl.password}`;
		}
	}

	return legacyUrl;
}

async function useGateway(method, job, groupings) {
	// `URL` first added in v6.13.0
	const gatewayUrlParsed = new url.URL(this.gatewayUrl);
	const gatewayUrlPath =
		gatewayUrlParsed.pathname && gatewayUrlParsed.pathname !== '/'
			? gatewayUrlParsed.pathname
			: '';
	const jobPath = job
		? `/job/${encodeURIComponent(job)}${generateGroupings(groupings)}`
		: '';
	const path = `${gatewayUrlPath}/metrics${jobPath}`;

	const target = legacyUrlResolve(this.gatewayUrl, path);
	const requestParams = new url.URL(target);
	const httpModule = isHttps(requestParams.href) ? https : http;
	const options = Object.assign(
		legacyUrlFromWhatwgUrl(requestParams),
		this.requestOptions,
		{ method },
	);

	return new Promise((resolve, reject) => {
		if (method === 'DELETE' && options.headers) {
			delete options.headers['Content-Encoding'];
		}
		const req = httpModule.request(options, resp => {
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

function isHttps(href) {
	return href.search(/^https/) !== -1;
}

module.exports = Pushgateway;

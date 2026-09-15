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

const http = require('node:http');
const client = require('../index');

const registry = new client.Registry(
	client.Registry.PROMETHEUS_PROTOBUF_CONTENT_TYPE,
);
client.collectDefaultMetrics({ register: registry });

const duration = new client.Histogram({
	name: 'http_request_duration_seconds',
	help: 'Time spent handling requests',
	labelNames: ['method'],
	nativeHistogramBucketFactor: 1.1,
	nativeHistogramMaxBucketNumber: 160,
	buckets: [],
	registers: [registry],
});

http
	.createServer(async (req, res) => {
		if (req.url === '/metrics') {
			try {
				const metrics = await registry.metrics();
				res.writeHead(200, { 'Content-Type': registry.contentType });
				res.end(metrics);
			} catch (error) {
				res.writeHead(500);
				res.end(error.message);
			}
			return;
		}

		const end = duration.startTimer({ method: req.method });
		res.writeHead(204);
		res.end();
		end();
	})
	.listen(Number(process.env.PORT ?? 3000));

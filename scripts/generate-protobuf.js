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

const fs = require('node:fs');
const path = require('node:path');
const protobuf = require('protobufjs');

// Keep the runtime descriptor in sync with the vendored upstream schema.
// Encoding uses protobufjs/light and JSON so bundlers can include it without
// runtime filesystem access or parsing .proto files.
const root = protobuf.loadSync(path.join(__dirname, '../lib/metrics.proto'));
fs.writeFileSync(
	path.join(__dirname, '../lib/metrics.json'),
	`${JSON.stringify(root.toJSON(), null, '\t')}\n`,
);

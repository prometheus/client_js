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

// Histogram
// Single Label
// Single Value

const { register, Histogram } = require('..');

const h = new Histogram({
	name: 'test_histogram',
	help: 'Example of a histogram',
	labelNames: ['code'],
});

h.labels('200').observe(0.4);
h.labels('200').observe(0.6);

h.observe({ code: '200' }, 0.4);

register.metrics().then(str => console.log(str));

/*
Output from metrics():

# HELP test_histogram Example of a histogram
# TYPE test_histogram histogram
test_histogram_bucket{le="0.005",code="200"} 0
test_histogram_bucket{le="0.01",code="200"} 0
test_histogram_bucket{le="0.025",code="200"} 0
test_histogram_bucket{le="0.05",code="200"} 0
test_histogram_bucket{le="0.1",code="200"} 0
test_histogram_bucket{le="0.25",code="200"} 0
test_histogram_bucket{le="0.5",code="200"} 2
test_histogram_bucket{le="1",code="200"} 3
test_histogram_bucket{le="2.5",code="200"} 3
test_histogram_bucket{le="5",code="200"} 3
test_histogram_bucket{le="10",code="200"} 3
test_histogram_bucket{le="+Inf",code="200"} 3
test_histogram_sum{code="200"} 1.4
test_histogram_count{code="200"} 3

*/

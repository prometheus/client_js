# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/) and this
project adheres to [Semantic Versioning](http://semver.org/).

## [Unreleased]

This release marks our first release under the Prometheus umbrella.

### Breaking

- Drop support for Node.js versions 16, 18, 20, 21 and 23
- Metric internal storage ('hashMap') changed to a separate object, LabelMap. If you have
  subclassed the built-in metric types you may need to adjust your code.

### Changed

- Add `Registry#getMetricsAsString()` to the TypeScript definitions
- Improve types for no labels
- perf: Faster stats gathering with lower memory overhead
- Simplified number format logic
- Simplified Histogram.observe() call stack
- Fix memory leak in cluster.js by deleting all expired requests
- perf: Sped up Map accesses
- perf: Remove truthy conditionals in hot code paths
- Show the invalid name in the validation errors
- perf: Improve performance of registry defaultLabels during metric processing
- perf: New, more space-efficient storage engine, 20-45% faster stats recording
- perf: Further improvement to key generation cost
- perf: Use faster `process.memoryUsage.rss()` API for resident memory collection (30-40% more ops/sec)
- fix: Browser compatibility for Gauge.startTimer()
- ci: Run benchmarks for pull requests
- ci: switch out deprecated benchmark-regression library for replacement
- AggregatorRegistry renamed to ClusterRegistry, old name deprecated
- chore: update faceoff to 1.1
- perf: Stat aggregation uses similar strategy to collection. 60% faster aggregation

### Added

- Node 26 added to the test matrix
- Expanded benchmarking code
- new WorkerRegistry to provide equivalent support to AggregatorRegistry
- Added examples for Summary metric

## [15.1.3] - 2024-06-27

### Changed

- Improve error message when number of registered labels mismatch with the number of labels provided

## [15.1.2] - 2024-04-16

### Changed

- Add `Registry.PROMETHEUS_CONTENT_TYPE` and `Registry.OPENMETRICS_CONTENT_TYPE` constants to the TypeScript types
- Correctly read and set `contentType` top level export

### Added

- Enable `bun.js` by catching `NotImplemented` error (Fixes [#570](https://github.com/prometheus/client_js/issues/570))

## [15.1.1] - 2024-03-26

### Changed

- Improve the memory usage of histograms when the `enableExemplars` option is disabled
- fix: Avoid updating exemplar values during subsequent metric changes (Fixes [#616](https://github.com/prometheus/client_js/issues/616))

## [15.1.0] - 2023-12-15

### Changed

- remove unnecessary loop from `osMemoryHeapLinux`
- Improve performance of `hashObject` by using pre-sorted array of label names
- Fix type of `collectDefaultMetrics.metricsList`

### Added

- Allow Pushgateway to now require job names for compatibility with Gravel Gateway.
- Allow `histogram.startTime()` to be used with exemplars.

[15.1.0]: https://github.com/prometheus/client_js/compare/v15.0.0...v15.1.0

## [15.0.0] - 2023-10-09

### Breaking

- drop support for Node.js versions 10, 12, 14, 17 and 19

### Changed

- Refactor histogram internals and provide a fast path for rendering metrics to
  Prometheus strings when there are many labels shared across different values.
- Disable custom content encoding for pushgateway delete requests in order to
  avoid failures from the server when using `Content-Encoding: gzip` header.
- Refactor `escapeString` helper in `lib/registry.js` to improve performance and
  avoid an unnecessarily complex regex.
- Cleanup code and refactor to be more efficient
- Correct TS types for working with OpenMetrics
- Updated Typescript and Readme docs for `setToCurrentTime()` to reflect units as seconds.
- Do not ignore error if request to pushgateway fails
- Make sure to reject the request to pushgateway if it times out

### Added

- Support for OpenMetrics and Exemplars

[15.0.0]: https://github.com/prometheus/client_js/compare/v14.2.0...v15.0.0

## [14.2.0] - 2023-03-06

### Changed

- Refactor `getMetricAsPrometheusString` method in the `Registry` class to use `Array.prototype.join`
  instead of loop of string concatenations.
- Also use `Array.prototype.map`, and object spread instead of an explicit `for` loop
- changed: updated the sample output in `example/default-metrics.js`
- `summary` metrics now has a `pruneAgedBuckets` config parameter
  to remove entries without any new values in the last `maxAgeSeconds`.
  Default is `false` (old behavior)

### Added

- Add `get` method to type definitions of metric classes

[14.2.0]: https://github.com/prometheus/client_js/compare/v14.1.1...v14.2.0

## [14.1.1] - 2022-12-31

### Changed

- Increase compatibility with external build system such as `rollup` by making perf_hooks optional in gc.js

[14.1.1]: https://github.com/prometheus/client_js/compare/v14.1.0...v14.1.1

## [14.1.0] - 2022-08-23

### Changed

- types: converted all the generic Metric types to be optional

- The `done()` functions returned by `gauge.startTimer()` and
  `summary.startTimer()` now return the timed duration. Histograms already had
  this behavior.

- types: fixed type for `registry.getMetricsAsArray()`

- Improve performance of `gague.inc()` and `gauge.dec()` by calling `hashObject()` once.

### Added

- The `processResources` metric was added, which keeps a track of all sorts of
  active resources. It consists of the following gauges:
  - `nodejs_active_resources` - Number of active resources that are currently
    keeping the event loop alive, grouped by async resource type.
  - `nodejs_active_resources_total` - Total number of active resources.
    It is supposed to provide the combined result of the `processHandles` and
    `processRequests` metrics along with information about any other types of
    async resources that these metrics do not keep a track of (like timers).

- Support gzipped pushgateway requests

[14.1.0]: https://github.com/prometheus/client_js/compare/v14.0.1...v14.1.0

## [14.0.1] - 2021-11-02

### Changed

- changed: typedef for pushgateway to reflect js implementation.

[14.0.1]: https://github.com/prometheus/client_js/compare/v14.0.0...v14.0.1

## [14.0.0] - 2021-09-18

### Breaking

- changed: `linearBuckets` does not propagate rounding errors anymore.

  Fewer bucket bounds will be affected by rounding errors. Histogram bucket
  labels may change. [`6f1f3b2`](https://github.com/prometheus/client_js/commit/6f1f3b24c9c21311ff33e7d4b987b40c6b304e04)

- changed: The push gateway methods `pushAdd()`, `push()` and `delete()` now
  return Promises instead of accepting a callback:

  ```js
  // Old:
  gateway.pushAdd({ jobName: 'test' }, (err, resp, body) => {});
  // New:
  gateway
    .pushAdd({ jobName: 'test' })
    .then(({ resp, body }) => {})
    .catch(err => {});
  // or
  const { resp, body } = await gateway.pushAdd({ jobName: 'test' });
  ```

  [`f177b1f`](https://github.com/prometheus/client_js/commit/f177b1fd3d4db5fc48fcb1ec02d94069fffcf144)

- changed: The default `nodejs_eventloop_lag_*` metrics are now reset every time
  they are observed. This prevents these metrics from "stabilizing" over a long
  period of time and becoming insensitive to small changes. For more info, see
  [#370](https://github.com/prometheus/client_js/issues/370). [`0f444cd`](https://github.com/prometheus/client_js/commit/0f444cd38e4c7074991270106c270f731bafddb8)

### Changed

- Add missing `await`/`then`s to examples. [`074f339`](https://github.com/prometheus/client_js/commit/074f339914e5d71b5829cd4a949affae23dbc409)
- Add missing type declaration for `client.contentType`. [`3b66641`](https://github.com/prometheus/client_js/commit/3b6664160bdd1555045b03d8f4c421022f30e1db)
- Modernize some label processing code. [`c9bf1d8`](https://github.com/prometheus/client_js/commit/c9bf1d8e3db3b5fb97faf2df9ca9b9af670288f3)

[14.0.0]: https://github.com/prometheus/client_js/compare/v13.2.0...v14.0.0

## [13.2.0] - 2021-08-08

### Changed

- Don't add event listener to `process` if cluster module is not used.
- fix: set labels for default memory metrics on linux.
- fix: fix DEP0152 deprecation warning in Node.js v16+.
- fix: Set aggregation mode for newer event loop metrics. (Fixes [#418](https://github.com/prometheus/client_js/issues/418))
- Improve performance of/reduce memory allocations in Gauge.

### Added

- feat: added `zero()` to `Histogram` for setting the metrics for a given label combination to zero
- fix: allow `Gauge.inc/dec(0)` without defaulting to 1

[13.2.0]: https://github.com/prometheus/client_js/compare/v13.1.0...v13.2.0

## [13.1.0] - 2021-01-24

### Changed

- fix: push client attempting to write Promise (fixes [#390](https://github.com/prometheus/client_js/issues/390))
- types: improve type checking of labels
- fix: Summary#observe should throw when adding additional labels to labelset (fixes [#262](https://github.com/prometheus/client_js/issues/262))

### Added

- feat: added the ability to pass labels as an object to `labels()` and `remove()`
- Added: More examples with commented output

[13.1.0]: https://github.com/prometheus/client_js/compare/v13.0.0...v13.1.0

## [13.0.0] - 2020-12-16

### Breaking

- changed: The following functions are now async (return a promise):
  `registry.metrics()`
  `registry.getMetricsAsJSON()`
  `registry.getMetricsAsArray()`
  `registry.getSingleMetricAsString()`

  If your metrics server has a line like `res.send(register.metrics())`, you
  should change it to `res.send(await register.metrics())`.

  Additionally, all metric types now accept an optional `collect` function,
  which is called when the metric's value should be collected and within which
  you should set the metric's value. You should provide a `collect` function for
  point-in-time metrics (e.g. current memory usage, as opposed to HTTP request
  durations that are continuously logged in a histogram).

- changed: `register.clusterMetrics()` no longer accepts a callback; it only
  returns a promise.

- removed: v12.0.0 added the undocumented functions `registry.registerCollector`
  and `registry.collectors()`. These have been removed. If you were using them,
  you should instead provide a `collect` function as described above.

### Changed

- fix: provide nodejs_version_info metric value after calling `registry.resetMetrics()` (#238)
- fix: provide process_max_fds metric value after calling `registry.resetMetrics()`
- fix: provide process_start_time_seconds metric value after calling `registry.resetMetrics()`
- chore: improve performance of `registry.getMetricAsPrometheusString`
- chore: refactor metrics to reduce code duplication
- chore: replace `utils.getPropertiesFromObj` with `Object.values`
- chore: remove unused `catch` bindings
- chore: upgrade Prettier to 2.x
- fix: startTimer returns `number` in typescript instead of `void`
- fix: incorrect typings of `registry.getSingleMetric' (#388)
- chore: stop testing node v13 on CI

### Added

- feat: exposed `registry.registerCollector()` and `registry.collectors()` methods in TypeScript declaration
- Added: complete working example of a pushgateway push in `example/pushgateway.js`
- feat: added support for adding labels to default metrics (#374)
- Added CHANGELOG reminder

[13.0.0]: https://github.com/prometheus/client_js/compare/v12.0.0...v13.0.0

## [12.0.0] - 2020-02-20

### Breaking

- Dropped support for end-of-life Node.js versions 6.x and 8.x
- Dropped the previously deprecated support for positional parameters in
  constructors, only the config object forms remain.
- Default metrics are collected on scrape of metrics endpoint, not on an
  interval. The `timeout` option to `collectDefaultMetrics(conf)` is no longer
  supported or needed, and the function no longer returns a `Timeout` object.

### Changed

- chore: remove ignored package-lock.json
- fix: `process_max_fds` is process limit, not OS (#314)
- Changed `Metric` labelNames & labelValues in TypeScript declaration to a generic type `T extends string`, instead of `string`
- Lazy-load Node.js Cluster module to fix Passenger support (#293)
- fix: avoid mutation bug in `registry.getMetricsAsJSON()`
- fix: improve performance of `registry.getMetrics*`
- End function of histogram `startTimer`, when invoked returns the number of seconds
- chore: reindent package.json
- chore: correct var name in processStartTime
- chore: add test for `process_start_time_seconds`
- chore: spelling corrections in README

### Added

- feat: implement GC metrics collection without native(C++) modules.
- feat: implement advanced event loop monitoring

[12.0.0]: https://github.com/prometheus/client_js/compare/v11.5.3...v12.0.0

## [11.5.3] - 2019-06-27

### Changed

- Parameter `compressCount` in Summaries to control compression of data in t-digest.
- Compress t-digest in Summaries

[11.5.3]: https://github.com/prometheus/client_js/compare/v11.5.2...v11.5.3

## [11.5.2] - 2019-06-20

### Changed

- fix: avoid mutation bug in registry

[11.5.2]: https://github.com/prometheus/client_js/compare/v11.5.1...v11.5.2

## [11.5.1] - 2019-06-13

### Changed

- fix: guard against missing constructor

[11.5.1]: https://github.com/prometheus/client_js/compare/v11.5.0...v11.5.1

## [11.5.0] - 2019-06-04

### Added

- Added `timestamps` toggle to `collectDefaultMetrics` options
- Export `validateMetricName`

[11.5.0]: https://github.com/prometheus/client_js/compare/v11.4.0...v11.5.0

## [11.4.0] - 2019-06-04

### Added

- `nodejs_active_handles` metric to the `collectDefaultMetrics()`. Unlike `nodejs_active_handles_total` it split count of active handles by type.
- `nodejs_active_requests` metric to the `collectDefaultMetrics()`. Unlike `nodejs_active_requests_total` it split count of active requests by type.

[11.4.0]: https://github.com/prometheus/client_js/compare/v11.3.0...v11.4.0

## [11.3.0] - 2019-04-02

### Changed

- Check that cluster worker is still connected before attempting to query it for
  metrics. (#244)

### Added

- Added a `remove()` method on each metric type, based on [Prometheus "Writing Client Libraries" section on labels](https://prometheus.io/docs/instrumenting/writing_clientlibs/#labels)

[11.3.0]: https://github.com/prometheus/client_js/compare/v11.2.1...v11.3.0

## [11.2.1]

### Breaking

### Changed

### Added

- Updated types for Summary in typescript definition file

[11.2.1]: https://github.com/prometheus/client_js/compare/v11.2.0...v11.2.1

## [11.2.0]

### Changed

- Updated child dependency `merge` patch version to remove vulnerability.

### Added

- Added an initial `benchmark` suite which can be run with `npm run benchmarks`.
- Add support for sliding windows in Summaries

[11.2.0]: https://github.com/prometheus/client_js/compare/v11.1.3...v11.2.0

## [11.1.3] - 2018-09-22

### Changed

- Fixed performance by avoiding `Object.assign` on hot paths, as well as
  mutating objects when appropriate.

[11.1.3]: https://github.com/prometheus/client_js/compare/v11.1.2...v11.1.3

## [11.1.2] - 2018-09-19

### Changed

- Allow setting Gauge values to NaN, +Inf, and -Inf
- Fixed `histogram` scrape performance by using `acc.push` instead of `acc.concat`. Fixes #216 with #219

[11.1.2]: https://github.com/prometheus/client_js/compare/v11.1.1...v11.1.2

## [11.1.1] - 2018-06-29

### Changed

- Fixed `processOpenFileDescriptors` metric when no custom config was set

[11.1.1]: https://github.com/prometheus/client_js/compare/v11.1.0...v11.1.1

## [11.1.0] - 2018-06-29

- Added ability to set a name prefix in the default metrics

### Changed

- Fixed `startTimer` utility to not mutate objects passed as `startLabels`
- Fixed `Counter` to validate labels parameter of `inc()` against initial
  labelset
- Fixed `AggregatorFactory` losing the aggregator method of metrics

[11.1.0]: https://github.com/prometheus/client_js/compare/v11.0.0...v11.1.0

## [11.0.0] - 2018-03-10

### Breaking

- Fixed `gauge.setToCurrentTime()` to use seconds instead of milliseconds
  - This conforms to Prometheus
    [best practices](https://prometheus.io/docs/practices/naming/#base-units)
- Dropped support for node 4

[11.0.0]: https://github.com/prometheus/client_js/compare/v10.2.3...v11.0.0

## [10.2.3] - 2018-02-28

### Breaking

### Changed

- Fixed issue that `registry.getMetricsAsJSON()` ignores registry default labels

### Added

[10.2.3]: https://github.com/prometheus/client_js/compare/v10.2.2...v10.2.3

## [10.2.2] - 2017-11-02

### Changed

- Fixed invalid `process_virtual_memory_bytes` reported under linux

## [10.2.1] - 2017-10-27

### Changed

- Only resolve/reject `clusterMetrics` promise if no callback is provided

## [10.2.0] - 2017-10-16

### Changed

- Don't add event listeners if cluster module is not used.
- Fixed issue with counters having extra records when using empty labels

### Added

- Added `reset` to Counter and Gauge
- Added `resetMetrics` to register to calling `reset` of all metric instances

## [10.1.1] - 2017-09-26

### Changed

- Update TypeScript definitions and JSDoc comments to match JavaScript sources
- Fix lexical scope of `arguments` in cluster code

## [10.1.0] - 2017-09-04

### Added

- Support aggregating metrics across workers in a Node.js cluster.

## [10.0.4] - 2017-08-22

### Changed

- Include invalid values in the error messages

## [10.0.3] - 2017-08-07

### Added

- Added registerMetric to definitions file

### Changed

- Fixed typing of DefaultMetricsCollectorConfiguration in definitions file
- Don't pass timestamps through to pushgateway by default

## [10.0.2] - 2017-07-07

### Changed

- Don't poll default metrics every single tick

## [10.0.1] - 2017-07-06

### Added

- Metrics should be initialized to 0 when there are no labels

## [10.0.0] - 2017-07-04

### Breaking

- Print deprecation warning when metrics are constructed using non-objects
- Print deprecation warning when `collectDefaultMetrics` is called with a number

### Added

- Ability to set default labels by registry
- Allow passing in `registry` as second argument to `collectDefaultMetrics` to
  use that instead of the default registry

### Changed

- Convert code base to ES2015 code (node 4)
  - add engines field to package.json
  - Use object shorthand
  - Remove `util-extend` in favor of `Object.assign`
  - Arrow functions over binding or putting `this` in a variable
  - Use template strings
  - `prototype` -> `class`

## [9.1.1] - 2017-06-17

### Changed

- Don't set timestamps for metrics that are never updated

## [9.1.0] - 2017-06-07

### Added

- Ability to merge registries

### Changed

- Correct typedefs for object constructor of metrics

## [9.0.0] - 2017-05-06

### Added

- Support for multiple registers
- Support for object literals in metric constructors
- Timestamp support

### Changed

- Collection of default metrics is now disabled by default. Start collection by
  running `collectDefaultMetrics()`.

### Deprecated

- Creating metrics with one argument per parameter - use object literals
  instead.

[10.2.2]: https://github.com/prometheus/client_js/compare/v10.2.1...v10.2.2
[10.2.1]: https://github.com/prometheus/client_js/compare/v10.2.0...v10.2.1
[10.2.0]: https://github.com/prometheus/client_js/compare/v10.1.1...v10.2.0
[10.1.1]: https://github.com/prometheus/client_js/compare/v10.1.0...v10.1.1
[10.1.0]: https://github.com/prometheus/client_js/compare/v10.0.4...v10.1.0
[10.0.4]: https://github.com/prometheus/client_js/compare/v10.0.3...v10.0.4
[10.0.3]: https://github.com/prometheus/client_js/compare/v10.0.2...v10.0.3
[10.0.2]: https://github.com/prometheus/client_js/compare/v10.0.1...v10.0.2
[10.0.1]: https://github.com/prometheus/client_js/compare/v10.0.0...v10.0.1
[10.0.0]: https://github.com/prometheus/client_js/compare/v9.1.1...v10.0.0
[9.1.1]: https://github.com/prometheus/client_js/compare/v9.1.0...v9.1.1
[9.1.0]: https://github.com/prometheus/client_js/compare/v9.0.0...v9.1.0
[9.0.0]: https://github.com/prometheus/client_js/commit/1ef835f908e1a5032f228bbc754479fe7ccf5201

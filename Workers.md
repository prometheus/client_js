# Notes on collection and short-lived processes

## Introduction

Worker threads present a large surface area for potential loss of telemetry data. In order to avoid
strange artifacts in your statistics, it's recommended that you hook the process lifecycle events
in order to guarantee that the aggregator does not lose access to historical data when the worker
exits.

While the examples here are specific to worker threads, the same general advice also applies to
cluster workers as well, as the implementations are nearly identical.

## Background

Statsd uses a fire and forget method for dumping stats to an external handler that is responsible
for the persistence of that data. OpenTelemetry and Prometheus, in contrast, assume that the
services are stable enough that we can ask them every so often for the data, and rely on them still
being there when we ask again later. This creates some challenges for gathering telemetry from
short running programs, child processes, and isolates.

Telemetry data is a mixture of values, such as Gauges, and sums, such as Counts and
Histograms. If a process crashes or becomes unresponsive, then it is no longer available to report
those sum values, causing them to be deducted from the aggregated data. This causes artifacts
in the telemetry data - places where numbers go down or remain flat when they should be
monotonically increasing. These data artifacts can and do result in judgment errors by human
operators performing triage, capacity planning, and a number of other tasks. As the person gathering
the telemetry, it is incumbent upon you to do your level best to avoid bad data being recorded.

We generally let processes crash on unhandled exceptions and rejections, but that complicates
telemetry collection. If you're thinking of adding Prometheus telemetry to your application, or to
a worker thread, one of your first concerns should be in reducing the number of unrecoverable errors
your code contains.

## Strategies

### Delegation

In the case of worker threads, sometimes short-lived is a feature, and in others it's an
inevitability. For extremely short-lived processes, it may be best for you to summarize the work
that was done in the worker and let the parent convert this information into the parent's own
statistics. This reduces the amount of aggregation that needs to be done by limiting the number of
processes that are being directly tracked. This is especially attractive in situations where the
worker thread is running computationally intensive tasks - these workers may not even respond in a
timely manner to messages sent to them because they are saturating the event loop with long,
synchronous tasks.

### Graceful shutdown

However, if your workers are loading modules that are in common with the rest of your stack, then
it may be that some of these modules expect telemetry to be running wherever they are running, in
which case you will want to do graceful shutdowns in the case of errors or orderly shutdown to
ensure that the aggregator sees this data in between scrape intervals. For this we have the
`shutdown()` function.

When a worker or cluster worker knows it is terminating, it can flush its latest telemetry to the
aggregator. This orderly shutdown is the most memory efficient option, as the prometheus client
can aggregate the data from all dead workers into a single data structure.

```javascript
// In worker bootstrapping code:

['SIGHUP', 'SIGINT', 'SIGQUIT', 'SIGTERM'].forEach(sig => {
  process.on(sig, async () => {
    await registry.shutdown();
    process.exit(0);
  });
});
```

See [the example](examples/workerTest.js) for a complete rundown, including the parent process
signalling workers to shut themselves down.

#### Space Complexity

The `shutdown()` function causes the main or the 'primary' process to aggregate all the 'sum'
metrics from all defunct workers that ran the shutdown to completion. The space needed in the
aggregator thread is proportional to the union of the cardinality of the stats from all of the
defunct workers. Therefore, so long as the cardinality of statistics is relatively common across
all workers (eg, workers do not label their own stats with threadId), then the space needed in the
aggregator thread is less than what the most prolific worker required - since the data is stored
as a snapshot instead of bringing forward the storage structure that underlies active Metrics.

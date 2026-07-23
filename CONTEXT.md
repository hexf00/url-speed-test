# URL Speed Test

URL Speed Test measures the download experience from a browser to a chosen HTTP resource and keeps comparable results on the client.

## Language

**Target**:
A read-only HTTP resource eligible for download measurement. A Target has one URL and may come from a Preset or Manual Target.
_Avoid_: Server, node, endpoint

**Preset**:
A named Target supplied by the application for repeatable selection.
_Avoid_: Built-in server, default URL

**Manual Target**:
A Target supplied by the person running a measurement.
_Avoid_: Custom server, ad hoc endpoint

**Run**:
One measurement of one Target with a declared concurrency.
_Avoid_: Job, session, batch item

**Batch**:
An ordered collection of Targets measured as sequential independent Runs.
_Avoid_: Parallel test, multi-target Run

**Sample**:
A time-window observation of decoded response-body bytes delivered to JavaScript during a Run.
_Avoid_: Packet, event

**Decoded Throughput**:
The live application-visible rate of decoded response-body bytes delivered to JavaScript. Samples and the live curve measure Decoded Throughput because browser Fetch streams run after content decoding.
_Avoid_: Network speed, wire speed

**Transferred Body Size**:
The completed response-body bytes before content decoding, excluding HTTP headers and protocol framing. A Result obtains this from validated Resource Timing entries or complete `Content-Length` responses; it is unavailable when the browser exposes neither exact source.
_Avoid_: Decoded size, total wire bytes

**Transfer Throughput**:
Transferred Body Size divided by the Run elapsed time. It is an exact final average, not a live Sample series.
_Avoid_: Live throughput, link capacity, physical bandwidth

**Compression Ratio**:
Decoded response-body bytes divided by Transferred Body Size for a completed Run.
_Avoid_: Percentage saved, compression level

**Result**:
The completed summary of a Run, including decoded Samples, final transfer facts when available, and browser-visible resource timing.
_Avoid_: Report, log entry

**History**:
The browser-local collection of completed Results identified by sanitized Target locations.
_Avoid_: Telemetry, server log

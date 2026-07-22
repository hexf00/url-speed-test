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
A time-window observation of bytes delivered and achieved throughput during a Run.
_Avoid_: Packet, event

**Throughput**:
The application-visible rate at which response-body bytes are delivered during a Run.
_Avoid_: Link capacity, physical bandwidth

**Result**:
The completed summary of a Run, including Samples, achieved throughput and browser-visible resource timing.
_Avoid_: Report, log entry

**History**:
The browser-local collection of completed Results identified by sanitized Target locations.
_Avoid_: Telemetry, server log

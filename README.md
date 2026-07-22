# URL Speed Test

English | [简体中文](./README.zh-CN.md)

[**Live demo**](https://hexf00.github.io/url-speed-test/)

[![CI](https://github.com/hexf00/url-speed-test/actions/workflows/ci.yml/badge.svg)](https://github.com/hexf00/url-speed-test/actions/workflows/ci.yml)

A backend-free, telemetry-free browser download speed tester. It measures the path
from the current client to a specific HTTP(S) file or API resource that you choose.

## What it measures

- Requests a manually entered or preset URL as-is, without appending cache-busting
  query parameters.
- Plots a live throughput curve in 250 ms windows and shows current, average, and
  peak throughput, transferred bytes, and duration.
- Shows browser-visible DNS, connection, TLS, TTFB, transfer, total timing, and HTTP
  protocol data.
- Uses one request by default, with configurable concurrency from 1 to 8 for the same URL.
- Stores results only in browser `localStorage`; query strings and fragments are
  removed from historical URLs.

The measurement path uses native `fetch`, `ReadableStream`, and the Resource Timing API.
It has no runtime framework or speed-test library dependencies.

## Run locally

This is a static site and must be served over HTTP(S):

```bash
python3 -m http.server 8080
```

Open <http://localhost:8080>, then enter a large-file URL that allows the browser to
read its response across origins.

You can also deploy the repository root to GitHub Pages, an object-storage static
site, or any web server. When the speed-test page uses HTTPS, the Target must also use
HTTPS because browsers block mixed-content requests.

## Configure preset Targets

Edit [`targets.json`](./targets.json):

```json
{
  "targets": [
    {
      "id": "cdn-east",
      "label": "CDN East",
      "url": "https://cdn.example.com/speed/100mb.bin"
    }
  ]
}
```

Preset and manual inputs normalize to the same Target and enter the same
`Target → Run → Result` execution path. Each Run measures exactly one Target. A future
Batch will start sequential, independent Runs so Targets do not compete for client
bandwidth while being compared.

Keep long-lived secrets out of a public `targets.json`. Enter temporary signed URLs
manually instead.

## Configure the Target service

A cross-origin download response must allow the speed-test page to read it:

```http
Access-Control-Allow-Origin: https://speed.example.com
```

To expose detailed DNS, connection, TLS, and TTFB phases, also return:

```http
Timing-Allow-Origin: https://speed.example.com
```

Use explicit allowed origins according to your security policy. Use `*` only when any
site is intentionally allowed to read the response and its timing data.

A suitable Target should:

- Be a read-only, idempotent `GET` resource with no business side effects.
- Be large enough, or stream long enough, for the configured duration. The browser
  aborts an unfinished request when the duration limit is reached.
- Return incompressible or already-compressed binary data. Fetch reads the
  application-visible response body, so highly compressible content served with
  `Content-Encoding` is a poor representation of transferred byte throughput.
- Accept anonymous access or query-string signatures. The tester uses
  `credentials: "omit"` and sends no cookies.

`cache: "no-store"` bypasses the browser HTTP cache without changing the Target URL.
Caching by an upstream CDN, reverse proxy, or origin remains controlled by the Target
service and is part of the measured client-to-service path.

## Interpret the result

- Mbps uses the decimal definition: `bytes × 8 / elapsed seconds / 1,000,000`.
- Concurrency defaults to 1, which resembles a normal single download. Increasing
  concurrency requests the same URL simultaneously and can reveal aggregate
  throughput when one connection does not saturate the path; it also multiplies
  Target requests and traffic.
- A `0 ms` DNS, connection, or TLS phase usually means the browser reused an existing
  resolution or connection.
- Without `Timing-Allow-Origin`, cross-origin throughput remains measurable while
  protected phase timings stay blank.
- A Result represents the browser, network, Target service, and cache path during
  that specific Run. Physical link capacity is a different metric.

## Development and validation

Node.js 24 is required:

```bash
npm ci
npm run check
npm test
npx playwright install chromium
npm run test:e2e
```

Unit tests cover URL handling, throughput calculation, Resource Timing, and History
sanitization. Playwright uses a real cross-origin streaming response to verify manual
URLs, preset Targets, the live curve, TAO degradation, and `localStorage` sanitization.

See [`CONTEXT.md`](./CONTEXT.md) for domain terminology and [`docs/adr`](./docs/adr)
for design decisions.

## Scope

The current release covers browser-to-Target download measurement. Upload testing,
ICMP ping, server-internal timing, a CORS-bypassing proxy, and backend History storage
are outside its scope.

## License

[MIT](./LICENSE)

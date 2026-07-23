# Separate transfer facts from decoded streaming Samples

Status: Accepted

## Context

Browsers negotiate HTTP content coding automatically. Fetch exposes the response stream only after gzip, Brotli, or another supported content coding has been decoded, so counting stream chunks overstates network response-body bytes for compressed Targets. `XMLHttpRequest` progress events have the same decoded-byte behavior in current browsers.

Resource Timing exposes `encodedBodySize` and `decodedBodySize`, but only after a request ends and only when cross-origin timing data is visible. A completed Fetch response can also expose the encoded `Content-Length`. Neither API exposes exact compressed byte progress for an interrupted response, so scaling decoded Samples by a final compression ratio would create a synthetic curve.

## Decision

- Keep browser Fetch as the only Run execution path.
- Define live Samples and the chart as Decoded Throughput.
- For a normally completed Run, derive Transferred Body Size from the complete set of matching Resource Timing entries when their aggregate decoded size matches the Fetch stream. If those sizes are protected, use `Content-Length` only when every response completed and every length is present.
- If neither exact source is available, or the Run ends at its duration limit, leave transfer metrics unavailable. Do not substitute decoded bytes under a transfer label.
- Calculate final Transfer Throughput from Transferred Body Size and Run elapsed time. Calculate Compression Ratio as decoded bytes divided by Transferred Body Size.
- Lead the Run summary and History with decoded average, latest-window, peak, and byte facts because they remain valid for completed and duration-limited Runs. Show exact transfer facts as optional detail.
- Treat the latest window as the most recent sampling interval. End-of-Run bookkeeping does not add an empty forced Sample that would overwrite a valid window; scheduled zero-byte windows remain visible as genuine stalls.
- Display byte sizes with decimal units so `MB` aligns with Mbps and browser network tools. Transferred Body Size excludes HTTP headers and protocol framing.
- Store the new Result shape as schema version 2 and remove the retired version 1 local History document rather than interpreting old decoded fields as transfer fields.

## Consequences

Completed compressed Runs show an exact final average, transferred response-body size, decoded size, ratio, and savings. The live curve remains useful but is explicitly application-visible decoded throughput. Cross-origin Targets get transfer metrics with `Timing-Allow-Origin` or a complete `Content-Length`; chunked cross-origin responses without either source show an unavailable state. Duration-limited Runs retain a useful decoded summary and History row but cannot claim exact compressed transfer bytes.

# Canonical Code Change Report

## Change classification

- Primary change type: API/runtime/schema change to the browser Result contract.
- User-visible outcome: Completed Runs report compressed response-body size, actual average transfer throughput, decoded size, compression ratio, and savings; long URLs stay inside the page layout.
- Repository surfaces affected: Measurement core, Result schema, local History schema, chart/UI rendering, responsive layout, Target fixture, tests, domain language, ADR, and bilingual README files.
- Current status: Verified.

## Accepted change contract

- Original request or issue claim: The UI showed `48.0 MiB` while browser developer tools showed `37.6 MB`; support gzip-aware actual speed and compression ratio, and stop long URLs from deforming the UI.
- Accepted target behavior: Treat content-decoded Fetch bytes as decoded Samples, use exact compressed response-body bytes for final transfer metrics, expose their relationship explicitly, and contain unbroken Target text without page-level horizontal overflow.
- Current behavior: Before this change, all byte and speed labels used decoded Fetch stream bytes and History schema version 1 preserved that ambiguity; an unbroken active or historical URL could expand the single-column grid to more than 32,000 CSS pixels.
- Source of truth: Result schema version 2 produced by `src/measurement.js`; Resource Timing `encodedBodySize` is primary for completed Runs and complete `Content-Length` is the exact cross-origin source when timing sizes are protected.
- Acceptance criteria: Gzip responses produce transferred bytes smaller than decoded bytes and a ratio above 1; aggregate concurrency sums all response entries; duration-limited Runs do not claim complete encoded size; absent exact sources render unavailable; decimal byte units are used; a 4,000-character active and historical URL leaves document scroll width equal to viewport width.
- Explicit non-goals: Estimating an encoded live curve, counting HTTP headers or protocol framing, adding a proxy/backend, controlling the browser `Accept-Encoding` header, or changing the one-Target-per-Run model.
- Inputs, states, or environments covered: Same-origin and CORS-readable HTTP(S) GET Targets; compressed and uncompressed completed responses; concurrency 1 through 8; TAO-visible Resource Timing; protected timing with complete `Content-Length`; duration abort; desktop and narrow responsive layouts.
- Inputs, states, or environments rejected: Exact encoded progress for incomplete responses, completed chunked cross-origin responses with protected timing sizes, and any transfer figure whose Resource Timing set cannot be reconciled with decoded Fetch bytes.
- Open ambiguities: None within the accepted browser API boundary.

## Evidence

- Source files inspected: `src/measurement.js`, `src/history.js`, `src/chart.js`, `app.js`, `index.html`, `styles.css`, `test/server.mjs`, all unit and Playwright tests, `CONTEXT.md`, README files, and existing ADRs.
- Call chain or data flow: Target form to `runDownload` to parallel Fetch readers to decoded Samples; after completion, exact Resource Timing entries or complete response lengths produce transfer facts; one Result feeds UI and sanitized local History.
- State transition: Running exposes decoded progress only; normal completion reconciles and publishes exact transfer facts; duration completion publishes decoded evidence with transfer fields set to null; user cancellation still produces no Result or History entry.
- Violated or changed invariant: A field labeled as received bytes or average speed must not silently mix content-decoded bytes with compressed network response-body bytes.
- Requirement evidence or root cause evidence: Chrome sent `Accept-Encoding: gzip, deflate, br, zstd`; a 6,000,000-byte decoded body produced 11,692 stream-transfer bytes, Fetch delivered all 6,000,000 decoded bytes, and Resource Timing reported `encodedBodySize=11692` plus `decodedBodySize=6000000`. Fetch and XHR exposed no resource entry during transfer. An aborted gzip response produced zero encoded and decoded Resource Timing sizes. Before the CSS fix, a 4,000-character Target expanded document scroll width from 390 to 32,300 pixels.
- Evidence excluding adjacent causes or adjacent ownership: Cache policy was already `no-store`; automatic content negotiation was active; switching to XHR did not expose encoded progress; the layout expansion was caused by min-content propagation through the grid and auto-layout table, not by the URL input's internal scroll width.

## Owning layer

- Owning layer: Browser measurement core owns Result semantics; the CSS grid/table layout owns visual containment.
- Why this layer owns the invariant or contract: `runDownload` is where decoded chunks, response completion, concurrency, Resource Timing, and response headers meet, so it alone can validate and emit one coherent Result. CSS owns whether that Result's unbroken Target label influences page sizing.
- Why adjacent layers do not own this change: The UI cannot reconstruct trustworthy encoded bytes from decoded Samples, the Target service need not implement a custom speed-test protocol, and History must project rather than reinterpret measurement facts.

## Implementation design

- Chosen implementation: Rename live fields to decoded semantics; aggregate validated Resource Timing encoded sizes across every completed response; use all complete `Content-Length` values only when timing sizes are protected; emit nullable transfer fields plus an explicit source; render decimal units and compression facts; bump and sanitize History v2; constrain the main grid and fixed-layout History table.
- Why this removes the defect or satisfies the requirement: The displayed actual size now uses the same pre-content-decoding response-body quantity that explains the developer-tools value, while decoded data remains visible under accurate labels. Layout min-content can no longer enlarge the page track.
- Canonical success path: One Fetch Run produces one Result v2; decoded Samples remain live, exact final transfer facts enter that same Result after completion, and both UI and History consume that Result without recomputation.
- Invalid states now impossible or rejected: Protected zero timing sizes cannot be reported as a zero-byte transfer; a partial Run cannot reuse the full `Content-Length`; ambiguous Resource Timing entry sets cannot be summed; old decoded History fields cannot appear under new transfer labels.
- Why no fallback, silent degradation, compatibility branch, broad guard, default substitution, retry, ignore, or catch-all recovery is introduced: Resource Timing and complete `Content-Length` are two declared exact sources in a single precedence rule, and `transferSource` records the chosen source. When neither proves the value, transfer metrics stay null and the UI says why. History v1 is deleted rather than interpreted through compatibility code.

## Long-term correctness

- Why this is correct beyond the immediate task: The domain contract names decoded and transferred quantities independently, validates multi-request aggregates, and represents browser observability limits as data instead of a guessed number.
- Future regression signal: Unit tests fail on source reconciliation, concurrency aggregation, partial completion, unavailable sizing, or History schema drift; Playwright fails on real gzip, no-TAO `Content-Length`, duration abort, signed URL privacy, or page overflow.
- Contract or invariant now enforced: Transfer labels only receive exact pre-decoding response-body bytes; live Samples always carry decoded names; page-level width never derives from an unbroken Target label.
- Migration target and deletion point, if any: History writes schema version 2 at `url-speed-test.history.v2`; the retired v1 document is deleted on read and clear, with no v1 compatibility reader.

## Debt impact

- Debt reduced or preserved: Removes ambiguous byte semantics and the auto-layout overflow defect without adding runtime dependencies or a second execution adapter.
- Oversized files touched: No repository size threshold is exceeded; `src/measurement.js` remains the cohesive owner of Run measurement and Result construction.
- Responsibility moved, removed, or clarified: Live chart responsibility is explicitly decoded throughput; final transfer responsibility is centralized in measurement core; History no longer gives old fields new meaning.
- New debt introduced: Standard browser APIs still cannot provide an exact encoded live curve, so the UI intentionally exposes only a final actual average and a live decoded curve.

## Implementation summary

- Files changed: Measurement, chart, History, application rendering, HTML/CSS, gzip test server, unit/E2E tests, `CONTEXT.md`, ADR 0001, new ADR 0004, and English/Chinese README files.
- Behavior changed: Byte display uses decimal units; completed Runs can report exact compressed response-body metrics and compression; partial or unobservable transfer facts remain unavailable; History uses schema v2; long URL text is clipped or locally scrolled.
- Tests changed: Added exact-source precedence, aggregation, partial/unavailable, read-only History, real concurrent gzip, and 4,000-character layout cases; updated existing Result and History assertions.

## Verification

- Failing signal before fix, or baseline behavior before requirement/refactor: Fetch counted 6,000,000 decoded bytes for an 11,692-byte gzip body; the long-URL reproduction widened a 390-pixel page to 32,300 pixels.
- Test added or updated: 21 Node unit tests and 7 Chromium E2E tests cover the accepted states and rejected states.
- Exact command: `npm run check && npm test`, `npm run test:e2e`, and `git diff --check` from `/root/code/url-speed-test-wire-throughput`.
- Exact result: Syntax checks passed; 21/21 unit tests passed; 7/7 Chromium tests passed; diff whitespace check passed.
- Regression scope: Measurement math and reconciliation, Resource Timing protection, concurrency, abort behavior, Result/History schema, URL privacy, gzip integration, browser rendering, and responsive containment.
- Why this verifies the accepted contract: The browser test observes real gzip decoding and Resource Timing, exercises the `Content-Length` source without TAO, and asserts both transfer/decoded separation and document width at the original failing input length.
- Why the original defect path, rejected state, or old ambiguous behavior is now impossible or rejected: Old field names no longer exist in Result v2, exact-source validation gates all transfer labels, v1 History is removed, and fixed grid/table sizing prevents min-content propagation to the document.

## GitHub communication

- Issue body responsibility: Preserve the observed `48.0 MiB` versus `37.6 MB` discrepancy and the long-URL layout symptom as user-facing evidence.
- Executor comment/report responsibility: Explain decoded versus compressed response-body bytes, the lack of exact encoded live progress, source availability, verification results, and remaining browser boundary.
- PR body responsibility: State the Result v2 contract, History migration, visual containment fix, exact commands/results, and no-dependency/no-backend scope.
- Reviewer responsibility: Validate browser sizing semantics, partial-response rejection, concurrency aggregation, schema migration, and responsive overflow assertions.

## Remaining uncertainty

- Remaining uncertainty: Browser developer tools may include a small header/framing estimate in their transferred column, while this product deliberately reports response-body bytes only; browser standards do not expose exact compressed progress during a running or aborted request.
- Missing evidence or decision input: None required for this implementation; the limitation is represented explicitly in the product contract and UI.
- Stop / proceed decision: Proceed to Draft PR because the accepted behavior is implemented and verified without synthetic measurements.

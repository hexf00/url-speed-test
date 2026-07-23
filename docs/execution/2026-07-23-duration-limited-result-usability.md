# Duration-limited Result usability

## Change classification

- Primary change type: Defect fix for duration-limited streaming Runs.
- User-visible outcome: A valid duration-limited Run shows decoded average, latest-window, peak, and byte measurements instead of appearing empty, and its History row explains the HTTP outcome.
- Repository surfaces affected: Browser measurement sampling, Result rendering, History rendering, page copy and layout, bilingual documentation, ADR evidence, and Playwright coverage.
- Current status: Verified locally against the deterministic fixture and the user-supplied cross-origin gzip stream.

## Accepted change contract

- Original request or issue claim: A ten-second Run against a streaming gzip API ended with `0.00` current speed while the primary Result and most History fields were blank.
- Accepted target behavior: Decoded measurements are the primary Run summary for both normally completed and duration-limited Runs; exact transfer measurements remain optional and are never estimated.
- Current behavior: End-of-Run sampling appended a tiny forced zero-byte Sample after the last scheduled Sample, and the UI led with transfer and protocol fields that the browser cannot expose for an interrupted cross-origin response.
- Source of truth: `CONTEXT.md` defines decoded Samples and Results; ADR 0004 requires duration-limited Runs to retain decoded evidence and forbids substituting decoded bytes for exact transfer facts.
- Acceptance criteria: A continuously streaming duration-limited Run ends with positive decoded average, latest-window, and peak values; exact transfer fields remain unavailable; Result metadata and History show HTTP status and completion reason; normally completed transfer measurements remain exact.
- Explicit non-goals: Adding a backend, browser extension, DevTools dependency, synthetic compression estimate, retry, alternate request path, upload test, or protocol inference.
- Inputs, states, or environments covered: Response-complete and duration-limited Fetch Runs, cross-origin CORS Targets with or without timing exposure, gzip and identity responses, existing schema-version-2 History.
- Inputs, states, or environments rejected: Claiming partial encoded bytes when the browser exposes no exact source, and treating a user-cancelled Run as a persisted Result.
- Open ambiguities: None for the accepted browser-only contract.

## Evidence

- Source files inspected: `src/measurement.js`, `src/history.js`, `app.js`, `index.html`, `styles.css`, `test/e2e/app.spec.js`, `test/server.mjs`, `CONTEXT.md`, both README files, and ADR 0004.
- Call chain or data flow: Form submit -> `runDownload` -> Fetch decoded stream -> scheduled Samples -> duration abort -> forced final Sample -> Result summary -> Result and History rendering.
- State transition: `running` -> `duration-limit` -> persisted Result with decoded summary and nullable transfer summary.
- Violated or changed invariant: The latest-window value must represent the latest real sampling interval; completion bookkeeping must not replace it with an empty sub-interval.
- Requirement evidence or root cause evidence: The production reproduction had a positive scheduled Sample immediately before `recordSample(true)` appended a zero-byte Sample a few milliseconds later. The Target returned HTTP 200 gzip data without exposed `Content-Length` or `Timing-Allow-Origin`, so ordinary page JavaScript had decoded bytes but no exact partial encoded-byte source.
- Evidence excluding adjacent causes or adjacent ownership: Decoded bytes and HTTP 200 proved CORS and streaming succeeded. DevTools observed encoded bytes, while Resource Timing remained zero after abort and after reader cancellation, proving that static-page code cannot recover the missing exact transfer facts through a different Fetch termination.

## Owning layer

- Owning layer: `src/measurement.js` owns Sample validity; `app.js` owns the browser projection of a valid Result.
- Why this layer owns the invariant or contract: Measurement decides which intervals become Samples, while the UI decides which already-valid Result facts are primary or optional.
- Why adjacent layers do not own this change: The Target cannot make partial encoded progress available through Fetch, History already persists the required decoded fields, and no schema or backend change is required.

## Implementation design

- Chosen implementation: Suppress only a forced final Sample with zero new decoded bytes when an earlier Sample exists; lead Run and History summaries with decoded facts; move actual transfer average into optional transfer detail; render HTTP status plus completion reason without placeholder protocol text.
- Why this removes the defect or satisfies the requirement: Completion can no longer overwrite the last sampled window, and every valid Result presents the measurements the browser actually obtained.
- Canonical success path: `Target -> Run -> Result`, with one Fetch path and one schema-version-2 History projection.
- Invalid states now impossible or rejected: An empty forced completion interval cannot become the latest Sample after a valid Sample, and unavailable exact transfer facts cannot displace decoded Result facts or be relabeled estimates.
- Why no fallback, silent degradation, compatibility branch, broad guard, default substitution, retry, ignore, or catch-all recovery is introduced: The condition distinguishes one explicit bookkeeping state; real scheduled zero-byte windows remain valid stalls, and transfer values remain exact-or-unavailable under the existing contract.

## Long-term correctness

- Why this is correct beyond the immediate task: The presentation follows data availability rather than one Target's headers, so any future duration-limited or timing-protected Target still yields a useful honest Result.
- Future regression signal: The Playwright duration-limit case fails if decoded average, latest-window, or peak becomes zero, if History loses its seven-field decoded-first projection, or if exact transfer bytes are fabricated.
- Contract or invariant now enforced: Decoded facts are always primary; transfer facts are exact and optional; completion bookkeeping is not a throughput Sample.
- Migration target and deletion point, if any: No migration is needed because existing version-2 History already stores all newly displayed fields.

## Debt impact

- Debt reduced or preserved: Removes misleading primary placeholders without adding a dependency, data model, request path, or backend.
- Oversized files touched: `app.js` remains the existing UI owner and changes from 408 to 412 physical lines; no new responsibility was added. `src/measurement.js` adds only the two-line Sample invariant.
- Responsibility moved, removed, or clarified: Transfer metrics move from the primary summary to optional detail; decoded Result facts already persisted by History become its primary projection.
- New debt introduced: None.

## Implementation summary

- Files changed: `src/measurement.js`, `app.js`, `index.html`, `styles.css`, `test/e2e/app.spec.js`, `CONTEXT.md`, both README files, ADR 0004, and this report.
- Behavior changed: Duration-limited Runs keep the latest meaningful decoded window, show a decoded-first Result, explain unavailable exact transfer facts, and retain useful History rows.
- Tests changed: Browser coverage now asserts positive decoded summary values, exact transfer unavailability, HTTP completion metadata, seven History cells, and completed compressed-Run behavior.

## Verification

- Failing signal before fix, or baseline behavior before requirement/refactor: The targeted Playwright case received `完成 · 实际传输速度不可见` instead of the required duration outcome; the production reproduction ended with decoded current `0.00` after a positive Sample.
- Test added or updated: `test/e2e/app.spec.js` duration-limit, signed URL, and compressed response cases.
- Exact command: `npm ci`; `npm test`; `npm run check`; `npm run test:e2e`; `git diff --check`; Playwright production-origin smoke against the user-supplied Target.
- Exact result: 21 unit tests passed, 7 Playwright tests passed, syntax and diff checks passed; the real ten-second Run showed decoded average `0.81 Mbps`, latest window `1.38 Mbps`, peak `2.77 Mbps`, `HTTP 200 · 达到时长上限`, and unavailable exact transfer facts.
- Regression scope: Sampling completion, decoded summary rendering, optional transfer rendering, History projection, long URL containment, CORS timing degradation, and completed gzip transfer measurement.
- Why this verifies the accepted contract: The deterministic case exercises the original abort ordering, and the real Target confirms the corrected projection under the same gzip, duration-limit, and timing-protected browser constraints.
- Why the original defect path, rejected state, or old ambiguous behavior is now impossible or rejected: The only empty forced Sample path returns before mutation, and UI/history primary fields read finite decoded summary values rather than nullable transfer fields.

## GitHub communication

- Issue body responsibility: No public issue copies the opaque user Target path; the durable fixture and this report preserve the defect without persisting that location.
- Executor comment/report responsibility: This document owns root cause, implementation, verification, and remaining boundary evidence.
- PR body responsibility: Summarize the decoded-first Result behavior, exact-or-unavailable transfer contract, and current verification.
- Reviewer responsibility: Independently verify the Sample condition, Result projection, exact transfer boundary, tests, and no-backend scope.

## Remaining uncertainty

- Remaining uncertainty: Throughput values vary by client and time; ordinary static-page JavaScript still cannot read exact partial compressed bytes for an aborted response.
- Missing evidence or decision input: Remote CI and explicit authorization to merge the resulting PR.
- Stop / proceed decision: Proceed to Draft PR after local validation; stop before Ready or merge until authorization is explicit.

# Browser Fetch owns measurement

Each Run uses browser `fetch` with `cache: "no-store"` as its measurement owner. The same request preserves the exact Target URL, produces decoded streaming Samples, and yields final response metadata and browser Resource Timing, giving the UI and History one Result path without an adapter-specific speed-test protocol. ADR 0004 defines how the Result separates decoded Samples from compressed transfer facts.

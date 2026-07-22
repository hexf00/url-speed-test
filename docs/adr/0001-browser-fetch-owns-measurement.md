# Browser Fetch owns measurement

Each Run uses browser `fetch` with `cache: "no-store"` as its measurement owner. The same request preserves the exact Target URL, produces streaming Samples, and yields browser Resource Timing, giving the UI and History one Result path without an adapter-specific speed-test protocol.

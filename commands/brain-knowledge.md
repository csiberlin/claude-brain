Quick reference for knowledge base usage patterns:

## During Work — Store Insights Directly

When you discover something worth remembering, call `brain_upsert` immediately. Entries default to **speculative** status (except `api` category, which defaults to **confirmed**).

**When to store:**
- After research: external knowledge (web, docs, MCP) is expensive to re-acquire
- At discovery: a proven pattern or anti-pattern worth warning about
- When comprehending complex code: a compressed map of what you learned

**Test:** "Would a future session waste significant tokens re-learning this?"

**What NOT to store:** routine fixes, things derivable from code or git, exploration that led nowhere.

## Speculative vs Confirmed

| Status | Meaning | Default for |
|--------|---------|-------------|
| `speculative` | Working hypothesis, tied to current approach | `map`, `decision`, `pattern` |
| `confirmed` | Validated knowledge, survives session abandonment | `api` (also: explicit user requests, `/brain-init` migrations) |

Use `confirmed: true` parameter to override the default when the user explicitly asks to store something.

## At Session End

- `/brain-keep` — promote all speculative entries to confirmed (happy path, work was committed)
- `/brain-abandon` — dead-end session: delete speculative entries, confirmed entries survive
- `/exit` — consolidation only (warns if speculative entries exist)

## Tiers

| Tier | What to store | Example |
|------|--------------|---------|
| `map` | Compressed summary of a file, module, or API. 10-20x smaller than source. Include: purpose, key exports, dependencies, gotchas. | "AuthMiddleware: validates JWT, refreshes if <5min expiry. Gotcha: passes through if X-Internal header." |
| `decision` | Non-obvious choice and its *why*. Things git blame won't explain. | "Chose node-fetch over axios — axios breaks ESM in this bundler." |
| `pattern` | Proven approach or anti-pattern. | "Anti-pattern: GridControl built-in filtering with virtual sources loads all into memory." |
| `api` | External library/service knowledge from research. | "Stripe webhooks: must return 200 within 5s or retries." |

## Source Tracking

Always set `source` (file path, URL, lib name) and `source_type` (`docs`, `code`, `verified`, `research`, `inferred`) when adding entries. Higher-trust sources are preferred during deduplication and conflict resolution.

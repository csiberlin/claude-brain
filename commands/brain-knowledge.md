Quick reference for knowledge base usage patterns:

## During Work — When to Store Knowledge

**At commit time (primary):** After committing, review what you learned. Store maps of complex code you comprehended, decisions that aren't obvious from the diff, and patterns worth reusing.

**After research:** When you consulted external sources (web, docs, MCP tools), store the knowledge before it leaves context. External knowledge is expensive to re-acquire.

**At pattern/anti-pattern discovery:** When you find something a senior dev would tell a teammate about — a trap to avoid, a technique that works well.

**Test:** "Would a future session waste significant tokens re-learning this?"

## Tiers

| Tier | What to store | Example |
|------|--------------|---------|
| `map` | Compressed summary of a file, module, or API. 10-20x smaller than source. Include: purpose, key exports, dependencies, gotchas. | "AuthMiddleware: validates JWT, refreshes if <5min expiry. Gotcha: passes through if X-Internal header." |
| `decision` | Non-obvious choice and its *why*. Things git blame won't explain. | "Chose node-fetch over axios — axios breaks ESM in this bundler." |
| `pattern` | Proven approach or anti-pattern. | "Anti-pattern: GridControl built-in filtering with virtual sources loads all into memory." |
| `api` | External library/service knowledge from research. | "Stripe webhooks: must return 200 within 5s or retries." |

## Source Tracking

Always set `source` (file path, URL, lib name) and `source_type` (`docs`, `code`, `verified`, `research`, `inferred`) when adding entries. Higher-trust sources are preferred during deduplication and conflict resolution.

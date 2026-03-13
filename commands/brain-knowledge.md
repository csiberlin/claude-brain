Quick reference for knowledge base usage patterns:

## During Work — Buffer Insights

When you discover something worth remembering, **append it to the buffer file** (`~/.claude/pending-insights.jsonl`) as a single JSON line:

```json
{"title": "...", "content": "...", "tags": ["..."], "category": "map|decision|pattern|api", "source": "file.ts", "source_type": "code", "project": "owner/repo", "tokens_spent": 5000, "timestamp": "2026-03-13T10:00:00Z"}
```

**When to buffer:**
- After research: external knowledge (web, docs, MCP) is expensive to re-acquire
- At discovery: a proven pattern or anti-pattern worth warning about
- When comprehending complex code: a compressed map of what you learned

**Test:** "Would a future session waste significant tokens re-learning this?"

**What NOT to buffer:** routine fixes, things derivable from code or git, exploration that led nowhere.

## After Commit — Promote from Buffer

After creating a commit, review `~/.claude/pending-insights.jsonl`:
- **Promote** entries validated by the commit → call `brain_upsert`
- **Skip** entries unrelated to this commit → leave in buffer
- **Discard** entries invalidated by the commit → remove from buffer

## At Session End

- `/brain-keep` — promote all buffered insights (happy path, work was committed)
- `/brain-abandon` — dead-end session: keeps `api`/`pattern`, discards `map`/`decision`
- `/exit` — consolidation only (warns if buffer is non-empty)

## Tiers

| Tier | What to store | Example |
|------|--------------|---------|
| `map` | Compressed summary of a file, module, or API. 10-20x smaller than source. Include: purpose, key exports, dependencies, gotchas. | "AuthMiddleware: validates JWT, refreshes if <5min expiry. Gotcha: passes through if X-Internal header." |
| `decision` | Non-obvious choice and its *why*. Things git blame won't explain. | "Chose node-fetch over axios — axios breaks ESM in this bundler." |
| `pattern` | Proven approach or anti-pattern. | "Anti-pattern: GridControl built-in filtering with virtual sources loads all into memory." |
| `api` | External library/service knowledge from research. | "Stripe webhooks: must return 200 within 5s or retries." |

## Source Tracking

Always set `source` (file path, URL, lib name) and `source_type` (`docs`, `code`, `verified`, `research`, `inferred`) when adding entries. Higher-trust sources are preferred during deduplication and conflict resolution.

# The Journey: Building a Brain for Claude Code

*A developer's story of going from zero agentic coding experience to building a production MCP server — and everything learned along the way.*

---

## The Spark (February 20, 2026)

It started with an observation, not a frustration. I noticed that GitHub Copilot in Visual Studio seemed to create a code database to optimize token usage. It indexes your codebase so it can be smarter about context. I asked Claude:

> *"Copilot in Visual Studio seems to create a code database to optimize token usage. Can we implement this somehow, e.g. in the current project, maybe as a separate database and MCP-Server?"*

Claude researched the approach and proposed three paths: FTS5 only, local embeddings, or API-based embeddings. I made my first product decision:

> *"Let's create a separate project and start with a simple, fast, offline and cost free approach."*

I knew nothing about MCP (Model Context Protocol), had never built an agentic tool, and had no idea what I was getting into. But the constraint was clear from day one: **simple, fast, offline, free.**

---

## Day One: The Initial Prototype (Feb 20)

Together we built the first version in a single session:

- A Node.js MCP server over stdio transport
- SQLite database at `~/.claude/knowledge.db`
- FTS5 full-text search (Porter stemmer, Unicode61 tokenization)
- 7 tools: `brain_search`, `brain_add`, `brain_update`, `brain_delete`, `brain_list_tags`, `brain_consolidate`, `brain_deduplicate` (later consolidated to 5)
- Slash commands: `/brain-init`, `/goodbye`, `/exit`
- Automatic project detection via `git remote get-url origin`

**What Claude brought to the table:** The MCP server boilerplate, Zod schema validation, FTS5 trigger-based sync — all patterns I wouldn't have known to reach for.

**What I brought:** The conviction that this needed to exist, and the product instinct that it should be dead simple — single SQLite file, no Docker, no Python, no external services.

### Competitive Research: Standing on Others' Shoulders

I knew I wasn't the first to think of this. So I told Claude:

> *"Research the internet for similar solutions like this project and suggest improvements."*

Claude came back with seven competitors: Anthropic's official Knowledge Graph Memory, Basic Memory (Obsidian integration), doobidoo/mcp-memory-service (the feature king — vector search, REST API, cloud sync, 13+ integrations), claude-knowledge-base-mcp, claude-server, Zep/Graphiti (temporal knowledge graph on Neo4j), and Knowns CLI.

More importantly, Claude organized an 11-item improvement roadmap, grouped by impact and effort:

- **Tier 1 (High Impact):** Semantic/vector search, relations/knowledge graph, temporal awareness
- **Tier 2 (Medium Impact):** Importance scoring, export/import, cross-project search
- **Tier 3 (Quality of Life):** `brain_stats`, batch operations, entry linking, auto-archival
- **Tier 4 (Architectural):** Optional REST API

The verdict: *"The biggest gaps vs. the competition are semantic search and entry relationships. Adding even basic vector search would put this project ahead of most alternatives in the lightweight, local-first category."*

I asked Claude to save this analysis for later reference, then said:

> *"I want to implement something now and come back later to improve. Let's work on #1 — semantic search. Let's discuss different approaches first."*

### Picking the Right Approach

Claude presented five options:

- **A: sqlite-vec Extension** — native, fast, but platform-specific binaries
- **B: In-Process JS Vector Search** — zero deps, but O(n) scan
- **C: ONNX Runtime** — powerful, but 50-100MB dependency
- **D: External Embedding API** — breaks the "fully local" promise
- **E: Hybrid FTS5 + Lightweight JS Vectors** — `@xenova/transformers` in WASM, no native deps, graceful degradation

Claude recommended E. I asked for a short explanation. Three steps: embed on add, hybrid search combining FTS5 + cosine similarity, graceful fallback for entries without embeddings.

> *"Let's do it."*

The model is `all-MiniLM-L6-v2`, ~23MB quantized to q8, runs entirely in WASM. No API calls, no network, no cost. We merged both search paths with **Reciprocal Rank Fusion** (RRF, k=60) — the same technique Vespa and Elasticsearch use at scale.

**Claude's honest assessment:** Brute-force vector search doesn't scale past ~10K entries. For a personal knowledge base? Fine. If it grows, swap in `sqlite-vec` for indexed HNSW search.

I accepted that trade-off. Ship now, optimize later.

### Pragmatic Cuts

During implementation, I kept things lean:

> *"We don't need backfill as this project is not released yet."*

But I also thought ahead. The single database holds all projects — wouldn't it grow forever? I proposed an export/import/forget mechanism.

Claude pushed back:

> *"The problem is real but small in practice. SQLite comfortably handles hundreds of thousands of rows. The complexity cost is high: export needs a file format, must include embeddings, handle versioning. Import needs conflict resolution. My recommendation: not worth it."*

> *"Thanks. We'll leave it as is. Please commit and push."*

This became a pattern: I'd propose, Claude would assess feasibility honestly, and I'd decide. No ego, just signal.

---

## The First Reckoning: Token Economics (Feb 23)

After a few days of actual use, the first hard lesson arrived.

I had written a detailed `knowledge-base.md` file explaining how to use the brain — when to store, what categories to use, consolidation workflows. The install script injected it into `~/.claude/CLAUDE.md` via an `@import`. Seemed clean.

**The problem:** Every single message now included ~700 extra tokens of instructions. That's 700 tokens of context window consumed before Claude even reads your question. Multiply by a long conversation and you're burning thousands of tokens on instructions the model already internalized three messages ago.

**The fix was embarrassing in its simplicity:** Don't `@import` the file. Install it as a separate reference file. Later (March 12), I went further — converted it to a slash command (`/brain-knowledge`) so it's only loaded when explicitly requested. Cost dropped from 700 tokens/message to 0.

Then I asked the question that reshaped the whole architecture:

> *"Would the opposite — moving the project knowledge from CLAUDE.md to the brain, removing it and just leaving general instructions in CLAUDE.md — significantly lower the token usage when working?"*

Claude did the math:

> *"CLAUDE.md cost: Fixed. Every message loads the full file — say it's 2K tokens of project knowledge. Over a 50-message session, that's 100K tokens regardless of relevance. Brain cost: On-demand. `brain_search` only fires when Claude decides it's relevant."*

> *"The sweet spot: keep CLAUDE.md lean (build commands, coding conventions) and let the brain hold the long tail (debugging tips, API quirks, patterns, decisions)."*

I asked whether this should be a separate command or part of `/brain-init`. Claude recommended `/brain-init` — *"It's the natural place. You're initializing the brain for this project, so that's when you'd migrate knowledge out of CLAUDE.md."*

**Lesson learned:** In agentic coding, every byte in the system prompt compounds. The architecture of your *instructions* matters as much as the architecture of your *code*.

### Understanding the Persistence Landscape

Around this time I started asking deeper questions about Claude Code's own memory mechanisms:

> *"Suppose I am implementing a new pattern which I like such that I want to use it for all future projects. What's the workflow using brain?"*

And then the key realization:

> *"So Claude Code would not really be able to do that without our 'brain', right?"*

Claude confirmed:

> *"Right. Without the brain, Claude Code has two options — both limited. CLAUDE.md: loaded every message, costs tokens on every turn even when irrelevant, not searchable, not cross-project. Auto-memory: flat markdown files, no search beyond grep, no categories, no project scoping. Neither supports 'store a pattern once, find it semantically across all future projects.'"*

This was the moment the project's value proposition crystallized. Not just "Claude remembers" — but **searchable, structured, cross-project knowledge that costs zero tokens when idle.**

---

## The Promotion Question (Feb 24)

A philosophical question emerged: if knowledge starts in the brain, should it ever graduate *back* to CLAUDE.md?

The argument: some knowledge is so fundamental it should be loaded every message. "Always use UTC for timestamps in this project." "The test database is on port 5433, not 5432." Keeping these in the brain means a `brain_search` call before every relevant task.

So I designed a **promotion system**:
- Entries older than 7 days (survived multiple sessions)
- Categories: architecture, pattern, or config only
- Project-scoped (no promoting general knowledge)
- A `/brain-sync` slash command to review candidates and move them to CLAUDE.md

**Claude's pushback was subtle but important:** The design was instruction-only — no server code changes needed. The slash command is just a prompt that guides Claude to search, filter, and edit. This was my first real understanding of MCP's power: **the tool doesn't need to do everything; sometimes the prompt IS the feature.**

We also added passive flagging — during `/goodbye`, Claude checks for promotion candidates and mentions them. No auto-promotion. The human decides.

---

## The Big Refactor: Two-Tier Knowledge Model (March 12)

Two weeks of daily use revealed the real architecture. I came back with clarity and we did a marathon session.

### The Token Budget Framework

I'd been tracking token costs informally. Now I formalized it:

- CLAUDE.md: keep under 100 lines. Above 200, instruction adherence degrades.
- MEMORY.md: first 200 lines loaded, rest silently truncated.
- Brain: zero cost when idle. ~40 tokens per search result snippet.

This reframing changed everything. The brain isn't just a convenience — it's the **only scalable knowledge store**. CLAUDE.md is for rules. MEMORY.md is for state. The brain is for knowledge.

### .claudeignore

A quick win: the WASM model files and build artifacts were being indexed by Claude Code's context system. Added `.claudeignore` to exclude `dist/`, `node_modules/`, and the model cache. Tiny change, meaningful context savings.

### Access Tracking

I added `last_accessed` and `access_count` columns. Now every `brain_search` result updates its access timestamp. This data answers the critical question: **is this knowledge actually being used?**

An entry with `access_count: 0` after 7 days is probably noise. An entry accessed 15 times is load-bearing. This distinction drives consolidation.

### Recency-Weighted Search

Not all knowledge ages equally. A pattern discovered yesterday is more likely relevant than one from three months ago. We added a gentle decay curve:

```
recency_boost = 1 / (1 + days_since_update / 365)
```

One day old: ~1.0x. One year old: ~0.5x. Never overwhelms relevance, just nudges.

**Claude flagged the risk:** aggressive recency weighting could bury foundational knowledge. The 365-day half-life was deliberately conservative. Old entries still surface — they just need to be slightly more relevant.

---

## The Strategy Redesign: From "Store Everything" to "Store What Matters"

The biggest intellectual leap came next.

### The Core Insight

The original strategy was: **"If you had to figure something out, store it."**

After weeks of use, I realized this was wrong. I was accumulating entries about routine fixes, obvious patterns, things I could re-derive in 10 seconds by reading the code. The brain was getting noisy, consolidation was dumping 50+ entries into context, and the cure was becoming the disease.

The new strategy: **"If a future session would waste significant tokens re-learning this, store it."**

This is a fundamentally different question. It filters out noise naturally:
- Routine bug fix? The code speaks for itself. Don't store.
- Spent 20 minutes researching a Stripe webhook quirk? Store it — that research is expensive to repeat.
- Discovered the ORM silently drops WHERE clauses on virtual tables? Store it — that's a trap future-you will fall into.

### Tiered Categories

The original six flat categories (`pattern`, `debugging`, `api`, `config`, `architecture`, `general`) didn't capture *intent*. I replaced them with four purpose-driven tiers:

| Tier | Purpose |
|------|---------|
| `map` | Compressed summaries. 10-20x smaller than source. Prevents re-reading. |
| `decision` | Non-obvious choices and their *why*. Things git blame won't explain. |
| `pattern` | Proven approaches and anti-patterns. Senior-dev wisdom. |
| `api` | External library/service knowledge. Expensive to re-acquire. |

Each tier answers a different question:
- `map`: "What does this code do?" (saves comprehension time)
- `decision`: "Why was it done this way?" (saves archaeology time)
- `pattern`: "What works/fails here?" (saves debugging time)
- `api`: "How does this external thing behave?" (saves research time)

### Source Tracking and Trust

Not all knowledge is created equal. An API behavior confirmed in official docs is more trustworthy than something inferred from Stack Overflow.

I added `source` (URL, file path, library name) and `source_type` with a trust hierarchy:

```
docs > code = verified > research > inferred
```

This feeds into deduplication — when two entries cover the same topic, prefer the one with higher-trust provenance. Not a hard rule (verified workarounds can override incorrect docs), but a sensible default.

**Claude's contribution here was the Zod refinement:** if you provide `source_type`, you must also provide `source`. A trust level without a reference is meaningless. Small constraint, prevents garbage data.

### Targeted Consolidation

The old `brain_consolidate` dumped every entry into context. With 50 entries, that's 5000+ tokens. The tool meant to save tokens was spending them.

New approach: **targeted review.** Only surface entries that need attention:
1. Stale maps (>14 days since update)
2. Never-accessed entries (7+ days old, 0 accesses)
3. Low-confidence entries (inferred/research, 30+ days, <3 accesses)

Capped at 20 items. Full review auto-triggers every 10th call (tracked in a `metadata` table), or on demand with `full: true`.

---

## Revisiting the Competition

The competitive research from day one kept paying dividends. Every design decision was informed by what others had built — and what they'd over-built.

doobidoo/mcp-memory-service has 13+ integrations and a REST API. Zep/Graphiti runs a full Neo4j graph database. Basic Memory generates beautiful Obsidian-compatible markdown. All impressive. All complex.

My thesis held: **the right knowledge at the right time beats more knowledge all the time.** The competitors optimize for storage capacity. I optimize for retrieval economics — getting the right 40-token snippet into context without paying for the other 50,000 tokens of stored knowledge.

---

## The Insight Buffer: Surviving Dead Ends (March 13)

A subtle problem had been nagging me. The knowledge strategy said "add insights at commit time" — but what if the session ends before a commit? Context compaction, `/clear`, or just closing the terminal — all of those destroy insights that existed only in conversation context.

Worse: what about dead-end sessions? Sometimes you spend 40,000 tokens researching an API, try an implementation approach, and it doesn't work. You abandon the branch. But the API knowledge you gathered? That's real. That's expensive to re-acquire. The implementation details are worthless, but the research isn't.

### The Buffer

The solution was deliberately low-tech: a JSONL file at `~/.claude/pending-insights.jsonl`. During work, Claude appends insights as JSON lines instead of calling `brain_add` directly. Each line includes a `tokens_spent` field — the approximate token cost to discover this insight. When you see "this API quirk cost 15,000 tokens to figure out," you think twice before discarding it.

### Two Ways to End a Session

This led to an interesting design question: how do you flush the buffer?

**Happy path (`/brain-keep`):** Work was committed, everything validated. Promote all buffered insights to the brain. If 5 or more entries were promoted, run consolidation automatically — heavy sessions benefit from cleanup.

**Dead end (`/brain-abandon`):** The implementation didn't work out. But knowledge has a category, and categories reveal intent:
- `api` and `pattern` entries are **general knowledge** — API behavior, library quirks, proven/disproven approaches. True regardless of whether the implementation worked. **Keep these.**
- `map` and `decision` entries are **implementation-specific** — code structure summaries, architectural choices for an approach that failed. Misleading in future sessions. **Discard these.**

This category-based triage was the key insight. The four-tier system designed earlier wasn't just for organization — it encodes the *epistemic status* of knowledge. Maps and decisions are bound to a specific implementation. Patterns and API knowledge transcend it.

> *"just to make it clear: by dead-end I mean that we just stop working on that branch/worktree. although the stuff we implemented did not work, we still gathered new knowledge."*

That quote captures the philosophy: **failed implementations still produce valuable knowledge, if you can separate the universal from the specific.**

### The Naming Journey

The commands went through a quick evolution:
- Started with `/goodbye` (existing) and a new `/brain-keep` + `/brain-abandon`
- Realized `/brain-keep` and `/goodbye` were redundant — both promote insights at session end
- Renamed `/goodbye` → alias for `/brain-keep` (backward compatibility)
- `/exit` stays as consolidation-only, but now warns if the buffer is non-empty

The naming tells you everything: *keep* your insights, or *abandon* the dead-end approach (but still keep what you learned about the world).

### No Code Changes

The entire feature is implemented as slash commands and conventions — zero MCP tools added, zero schema changes, zero TypeScript modified. The buffer is a plain file that Claude reads and writes directly. `brain_add` is still the only way knowledge enters the database.

This reinforced the lesson from the promotion system: **in agentic architectures, the prompt IS the feature.** Sometimes the right abstraction isn't a new tool — it's better instructions for the existing ones.

---

## Tool Consolidation: 8 → 5 (March 13)

After weeks of use, another token economics problem surfaced — this time not in instructions, but in the tools themselves.

Every MCP tool has a Zod schema that gets serialized into the context window. Eight tools means eight schemas, each with parameter descriptions, types, and constraints. That's roughly 900 tokens of schema overhead per conversation turn — loaded every message whether the tools are used or not.

The insight: several tools were semantically related and rarely used independently.

### Three Merges

**`brain_add` + `brain_update` → `brain_upsert`:** The distinction between "create" and "update" was an implementation detail leaking into the API. Make `id` optional — present means update, absent means add. One schema instead of two, and the calling convention is simpler: "store this knowledge" doesn't require knowing if an entry already exists.

The subtle design choice: `category` has no `.default()` in the schema. For adds, the default `"pattern"` is applied in code. For updates, omitting `category` means "don't change it." A schema-level default would silently overwrite existing categories on every update.

**`brain_stats` + `brain_list_tags` → `brain_info`:** Stats were always called before tags — you want the overview first, then drill into tags if something looks off. Merge them with an `include_tags` flag. Tags are opt-in to keep the default output compact.

**`brain_consolidate` + `brain_deduplicate` → `brain_maintain`:** Consolidation often reveals duplicates. Having to call a separate tool to act on what you just found adds a round-trip. Merge them with a `deduplicate` flag. The consolidation logic (targeted review, full sweep counter) stays identical. Dedup appends to the output when requested.

### The Result

Five tools: `brain_search`, `brain_upsert`, `brain_delete`, `brain_info`, `brain_maintain`. Each merge preserved the full behavior of both originals — no functionality lost, just fewer schema tokens per turn.

The pattern here echoes the token economics lesson from CLAUDE.md: **in agentic systems, every schema, every tool description, every parameter list is a tax on every message.** Fewer tools with richer parameters beats more tools with simpler parameters.

---

## What I Learned About Agentic Development

### 1. The Agent is a Collaborator, Not a Tool

My first instinct was to dictate architecture and have Claude type. That lasted about an hour. The actual dynamic is more like pair programming with a very knowledgeable partner who has no memory.

I bring: product vision, taste, the "why."
Claude brings: implementation patterns, API knowledge, the "how."

The best results came from describing the *problem* and letting Claude propose solutions, then pushing back on the parts that didn't feel right.

### 2. Instructions Are Architecture

In traditional software, your instructions are comments — nice to have, occasionally read. In agentic software, your instructions (CLAUDE.md, slash commands, tool descriptions) are *load-bearing architecture*. They determine what the agent does, when, and how well.

I spent more time refining slash command prompts than writing TypeScript. That felt wrong at first. It isn't.

### 3. Token Cost is the New Compute Cost

Every `@import`, every verbose tool description, every always-loaded instruction file burns context window across every message. In a 50-message conversation, a 700-token instruction file costs 35,000 tokens. That's not free.

Thinking in token budgets changed how I design: what's always-loaded vs. on-demand, what's a rule vs. a searchable fact, what goes in CLAUDE.md vs. the brain.

### 4. Design Docs Still Matter

Even with an AI writing most of the code, I wrote specs before implementing. Every major feature has a design doc:
- `brain-to-claudemd-promotion-design.md` (Feb 24)
- `token-efficiency-and-search-improvements-design.md` (Mar 12)
- `knowledge-strategy-redesign.md` (Mar 12)

These aren't for Claude's benefit — they're for mine. They force me to think through edge cases, articulate trade-offs, and commit to decisions before the momentum of implementation takes over.

### 5. Ship Simple, Iterate Honest

The brute-force vector search, the single SQLite file, the lack of entry relations — these are deliberate trade-offs, not shortcuts. Each has a known upgrade path (sqlite-vec, relations table, etc.) that I'll take when the current approach actually breaks.

YAGNI isn't laziness. It's discipline.

### 6. The Session Boundary is a Feature

Claude Code's session model (ephemeral conversations, persistent files) initially felt like a limitation. Then I realized: the session boundary is a natural checkpoint. `/goodbye` triggers consolidation. Commit time triggers knowledge capture. The constraints shape the workflow.

---

## The Current State

As of today (March 13, 2026), the project is:

- **5 MCP tools** (consolidated from 8) with hybrid FTS5 + vector search, RRF ranking, recency weighting, access tracking
- **7 slash commands** for initialization, knowledge reference, promotion, insight buffer flush, and session-end consolidation
- **~900 tokens saved per turn** from tool consolidation (fewer schemas in context)
- **4 tiered categories** with source tracking and trust hierarchy
- **Insight buffer** (`pending-insights.jsonl`) for persisting discoveries before commit
- **Targeted consolidation** that surfaces only what needs attention
- **~650 tokens saved per message** vs. the original design
- **Zero external dependencies** beyond Node.js and SQLite

The brain currently holds 6 entries for this project — maps of the architecture, database schema, search system, embeddings, project detection, and type system. Each one is 10-20x smaller than the source file it summarizes.

---

## What's Next

The roadmap is clear, prioritized by real pain points:

1. **sqlite-vec** for indexed vector search — when entries exceed ~1000, brute-force cosine will slow down
2. **Entry relations** — a lightweight knowledge graph (`relates_to`, `depends_on`, `contradicts`)
3. **Cross-project search** — some knowledge transcends project boundaries
4. **Export/import** — backup, sharing, migration between machines

But honestly? The current version solves my problem. Claude remembers. Sessions build on each other. Knowledge compounds instead of evaporating.

That was the whole point.

---

## Acknowledgments

Every commit in this project is `Co-Authored-By: Claude Opus 4.6`. That's not a formality — it's accurate. This project was built in conversation, with a partner who could write the code but needed me to know *what* to build and *why*.

The journey from "Claude forgets everything" to a working knowledge system took 20 days. The intellectual journey — from "store everything" to "store what matters," from eager capture to intent-driven knowledge, from flat categories to trust-weighted tiers — that's the real work. And it's ongoing.

*— Built in conversation, one session at a time.*

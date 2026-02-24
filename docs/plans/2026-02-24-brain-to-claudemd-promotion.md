# Brain-to-CLAUDE.md Knowledge Promotion — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable stable brain entries to be promoted into the appropriate CLAUDE.md files, closing the one-way knowledge flow gap.

**Architecture:** Instruction-only approach — no server code changes. A new `/brain-sync` slash command drives the promotion workflow. The `knowledge-base.md` instructions and `/goodbye`/`/exit` commands are updated to flag promotion candidates passively.

**Tech Stack:** Markdown slash commands, Claude Code instructions

---

### Task 1: Create `/brain-sync` slash command

**Files:**
- Create: `commands/brain-sync.md`

**Step 1: Write the slash command file**

Create `commands/brain-sync.md` with this exact content:

```markdown
Review brain entries for promotion to CLAUDE.md files. Promotion moves stable, proven knowledge out of the brain and into CLAUDE.md where it's loaded every message — reducing search dependency and token cost.

## Step 1: Gather entries

1. Call `brain_consolidate` to retrieve all knowledge entries for the current project.
2. From the returned entries, identify **promotion candidates** — entries that meet ALL of these criteria:
   - **Category** is `architecture`, `pattern`, or `config` (not `debugging`, `api`, or `general`)
   - **Age:** `created_at` is more than 7 days ago
   - **Project-scoped:** has a project tag matching the current project (not general/null)
3. If no candidates found, report "No entries are ready for promotion yet" and stop.

## Step 2: Present candidates

List each candidate with:
- Entry ID and title
- Category and age
- A one-line summary of the content

Ask the user which entries to promote: all, specific ones by ID, or none.

## Step 3: Promote approved entries

For each approved entry:

1. **Determine target file** by scanning the entry's content and tags for directory/file path references:
   - If the entry references files in a specific subdirectory (e.g., `src/services/`, `components/`) AND a CLAUDE.md already exists in that directory — target that file.
   - If the entry references a specific subdirectory but no CLAUDE.md exists there — create a new CLAUDE.md in that directory with a minimal `# <Directory Name>` header.
   - If no specific directory is referenced, or the knowledge is project-wide — target the project root CLAUDE.md.

2. **Read the target CLAUDE.md** and check whether equivalent knowledge is already captured (even if worded differently). Skip if already present.

3. **Edit the target CLAUDE.md:**
   - If a `## Knowledge` section exists, append the new content there.
   - If no `## Knowledge` section exists, add one at the end of the file.
   - Write the knowledge as a concise paragraph or bullet points — do NOT paste the raw brain entry verbatim. Rewrite it to read like curated documentation. Merge with adjacent entries on the same topic if applicable.

4. **Delete the brain entry** with `brain_delete`. The knowledge now lives in CLAUDE.md.

## Step 4: Report

Summarize what was done:
- How many entries were promoted
- Which CLAUDE.md files were modified or created
- How many entries were skipped (already captured or user declined)
- Remind the user to review and commit the CLAUDE.md changes
```

**Step 2: Verify the file exists and is well-formed**

Run: `cat commands/brain-sync.md | head -5`
Expected: First 5 lines of the file starting with "Review brain entries"

**Step 3: Commit**

```bash
git add commands/brain-sync.md
git commit -m "feat: add /brain-sync slash command for promoting brain entries to CLAUDE.md"
```

---

### Task 2: Update `/goodbye` and `/exit` to flag promotion candidates

**Files:**
- Modify: `commands/goodbye.md`
- Modify: `commands/exit.md`

**Step 1: Replace `commands/goodbye.md`**

Replace the entire content with:

```markdown
Before ending this session, consolidate your knowledge base:

1. Call `brain_consolidate` to retrieve all knowledge entries for review.
2. Review the returned entries carefully for contradictions, redundancies, and outdated information.
3. Use `brain_update` to fix or merge entries, `brain_delete` to remove bad ones, and `brain_deduplicate` to merge cross-project duplicates.
4. Check if any remaining entries qualify for promotion to CLAUDE.md — entries in `architecture`, `pattern`, or `config` categories that are more than 7 days old and project-scoped. If candidates exist, tell the user: "N brain entries are stable enough to promote to CLAUDE.md. Run /brain-sync to review them."
5. Once cleanup is complete, say goodbye.
```

**Step 2: Replace `commands/exit.md`**

Replace with the same content as `goodbye.md` (they are identical).

**Step 3: Verify both files match**

Run: `diff commands/goodbye.md commands/exit.md`
Expected: No output (files are identical)

**Step 4: Commit**

```bash
git add commands/goodbye.md commands/exit.md
git commit -m "feat: flag promotion candidates during session-end consolidation"
```

---

### Task 3: Update knowledge-base.md instructions

The knowledge-base.md template exists in three places that must stay in sync:
1. `~/.claude/knowledge-base.md` — the live instructions file
2. `install.sh` — the heredoc template for fresh installs (lines 29–61)
3. `commands/brain-init.md` — the template inside the `/brain-init` command (lines 8–40)

All three must have identical content. The approach: define the new content once, then apply it to all three locations.

**Files:**
- Modify: `install.sh:29-61` (heredoc content between KBEOF markers)
- Modify: `commands/brain-init.md:8-40` (content inside the triple-backtick block)

**Step 1: Update `install.sh`**

Replace the knowledge-base.md heredoc content (the text between `cat > "$KB_FILE" << 'KBEOF'` and `KBEOF`) with:

```
## Knowledge Base

You have access to a persistent knowledge base via MCP tools (`brain_add`, `brain_search`, `brain_update`, `brain_delete`, `brain_consolidate`). Use it proactively — **not when asked, but automatically**.

### Before Starting Work
- Call `brain_search` with keywords relevant to the task (project name, technology, problem domain)
- Check for existing patterns, past bugs, or architectural decisions that apply

### During Work — Mandatory Storage Triggers
After ANY of the following events, call `brain_add` immediately:

1. **You resolve a build/compile error** — store the error cause and fix (category: `debugging`)
2. **You discover an API quirk or gotcha** — e.g., namespace collisions, unexpected property names, missing methods (category: `api`)
3. **You establish a pattern used across multiple files** — e.g., how messages are plumbed, how columns flow through ViewModels (category: `pattern`)
4. **You make or encounter an architectural decision** — e.g., which ViewModel owns which data, how DI is structured (category: `architecture`)
5. **You learn a configuration detail** — e.g., solution file location, build commands, project structure (category: `config`)
6. **You work around a framework limitation** — e.g., using `using` aliases for type conflicts, using `EditSettings` instead of direct property (category: `debugging`)

**Rule of thumb:** If you had to figure something out (it wasn't obvious from the code alone), store it. Future sessions start fresh — anything not stored is lost.

### What Makes a Good Entry
- **Title:** Short, searchable (e.g., "DevExpress WPF: ColumnDefinition name collision with Shared namespace")
- **Content:** Specific and actionable — include the fix, not just the problem. Include file paths when relevant.
- **Tags:** Technology names, project names, error codes, concepts (e.g., `devexpress`, `wpf`, `gxreport`, `namespace-collision`)
- **Project:** Set the project identifier when the knowledge is project-specific

### Knowledge Promotion
Stable brain entries should eventually graduate to CLAUDE.md files where they're loaded every message. An entry qualifies when ALL of these are true:
- **Category** is `architecture`, `pattern`, or `config`
- **Age:** created more than 7 days ago
- **Project-scoped:** has a project tag (not general)
- **Not already in CLAUDE.md:** the target file doesn't already capture equivalent knowledge

Use `/brain-sync` to review and promote candidates on demand. During `/goodbye` or `/exit`, flag any candidates but do not auto-promote.

When promoting, place entries in the CLAUDE.md closest to the code they describe (e.g., knowledge about `src/services/` goes in `src/services/CLAUDE.md` if one exists). Fall back to the project root CLAUDE.md. Write promoted knowledge as curated documentation under a `## Knowledge` section — do not paste raw brain entries. After promoting, delete the brain entry with `brain_delete`.

### Before Session Ends
When the user says goodbye, ends the conversation, or you sense the session is wrapping up:
1. Call `brain_consolidate` to review all entries
2. Clean up: delete outdated entries, merge redundancies, resolve contradictions
3. Flag any promotion candidates and mention `/brain-sync` if candidates exist
4. You can also use `/goodbye` or `/exit` to trigger this

Categories: `pattern`, `debugging`, `api`, `config`, `architecture`, `general`
```

**Step 2: Update `commands/brain-init.md`**

Replace the knowledge-base.md content inside the triple-backtick code block (lines 8–40) with the identical content from Step 1.

**Step 3: Verify the two templates match**

Extract the knowledge-base.md content from both files and diff them. They should be identical.

**Step 4: Commit**

```bash
git add install.sh commands/brain-init.md
git commit -m "feat: add knowledge promotion instructions to knowledge-base.md template"
```

---

### Task 4: Update the live `~/.claude/knowledge-base.md`

**Files:**
- Modify: `~/.claude/knowledge-base.md`

**Step 1: Replace with updated content**

Replace the entire file with the same content used in Task 3. This updates the user's live instructions without requiring a reinstall.

**Step 2: Verify**

Run: `head -3 ~/.claude/knowledge-base.md`
Expected: First line is `## Knowledge Base`

**Step 3: Commit (not applicable — file is outside the repo)**

No commit needed. This file lives in the user's home directory, not in the repo.

---

### Task 5: Update install.sh output and README

**Files:**
- Modify: `install.sh:85` (slash command list in echo)
- Modify: `README.md` (slash commands table)

**Step 1: Update install.sh echo**

Change line 85 from:
```
echo "Slash commands installed: /brain-init, /goodbye, /exit"
```
to:
```
echo "Slash commands installed: /brain-init, /brain-sync, /goodbye, /exit"
```

Also update the "Available commands" section at the bottom (lines 90-93) to include:
```
echo "  /brain-sync  — Promote stable brain entries to CLAUDE.md"
```

**Step 2: Update README.md**

Add `/brain-sync` to the Slash Commands table:

```markdown
| `/brain-sync` | Promote stable brain entries to CLAUDE.md files |
```

**Step 3: Commit**

```bash
git add install.sh README.md
git commit -m "docs: add /brain-sync to install output and README"
```

---

### Task 6: Manual verification

**Step 1: Run install to verify everything copies correctly**

Run: `./install.sh`
Expected: Completes without errors. Shows `/brain-sync` in the installed commands list.

**Step 2: Verify slash command was installed**

Run: `ls ~/.claude/commands/brain-sync.md`
Expected: File exists

**Step 3: Verify live knowledge-base.md has promotion section**

Run: `grep "Knowledge Promotion" ~/.claude/knowledge-base.md`
Expected: Matches the section header

**Step 4: Final commit (if any fixups needed)**

Only if previous steps revealed issues that needed fixing.

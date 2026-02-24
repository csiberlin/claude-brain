#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== Claude Knowledge Base MCP Server ==="
echo ""

echo "[1/5] Installing dependencies..."
cd "$SCRIPT_DIR"
npm install

echo ""
echo "[2/5] Building..."
npm run build

echo ""
echo "[3/5] Registering MCP server in Claude Code..."
claude mcp add --transport stdio --scope user knowledge-base -- node "$SCRIPT_DIR/dist/index.js"

echo ""
echo "[4/5] Installing knowledge base instructions..."
CLAUDE_DIR="$HOME/.claude"
mkdir -p "$CLAUDE_DIR"
KB_FILE="$CLAUDE_DIR/knowledge-base.md"
CLAUDE_MD="$CLAUDE_DIR/CLAUDE.md"

if [ ! -f "$KB_FILE" ]; then
  cat > "$KB_FILE" << 'KBEOF'
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
KBEOF
  echo "Created $KB_FILE"
else
  echo "knowledge-base.md already exists, skipping"
fi

if [ ! -f "$CLAUDE_MD" ]; then
  echo "@knowledge-base.md" > "$CLAUDE_MD"
  echo "Created $CLAUDE_MD with @knowledge-base.md reference"
elif ! grep -qF "@knowledge-base.md" "$CLAUDE_MD"; then
  printf '\n@knowledge-base.md\n' >> "$CLAUDE_MD"
  echo "Added @knowledge-base.md reference to $CLAUDE_MD"
else
  echo "@knowledge-base.md reference already present in CLAUDE.md"
fi

echo ""
echo "[5/5] Installing slash commands..."
COMMANDS_DIR="$HOME/.claude/commands"
mkdir -p "$COMMANDS_DIR"
for cmd in "$SCRIPT_DIR"/commands/*.md; do
  cp "$cmd" "$COMMANDS_DIR/$(basename "$cmd")"
done
echo "Slash commands installed: /brain-init, /brain-sync, /goodbye, /exit"

echo ""
echo "=== Done! Restart Claude Code to activate. ==="
echo ""
echo "Available commands:"
echo "  /brain-init  — Enable auto-knowledge and migrate CLAUDE.md to brain"
echo "  /brain-sync  — Promote stable brain entries to CLAUDE.md"
echo "  /goodbye     — Consolidate knowledge and end session"
echo "  /exit        — Same as /goodbye"
echo ""
echo "Use /mcp in Claude Code to verify the server is running."

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
claude mcp add --transport stdio --scope user knowledge-base -- node "$SCRIPT_DIR/dist/index.js" || echo "MCP server already registered (this is fine)"

echo ""
echo "[4/5] Configuring knowledge base in Claude Code..."
CLAUDE_DIR="$HOME/.claude"
mkdir -p "$CLAUDE_DIR"
CLAUDE_MD="$CLAUDE_DIR/CLAUDE.md"

# Remove old @import if present
if [ -f "$CLAUDE_MD" ]; then
  grep -v '@knowledge-base\.md' "$CLAUDE_MD" > "$CLAUDE_MD.tmp" && mv "$CLAUDE_MD.tmp" "$CLAUDE_MD"
fi

# Remove old knowledge-base.md file if present
rm -f "$CLAUDE_DIR/knowledge-base.md"

# Remove existing ## Knowledge Base section (from prior installs) so we can write a fresh one
if [ -f "$CLAUDE_MD" ] && grep -qF "## Knowledge Base" "$CLAUDE_MD"; then
  # Remove from "## Knowledge Base" to next "##" heading or end of file
  awk '/^## Knowledge Base/{skip=1; next} /^## /{skip=0} !skip' "$CLAUDE_MD" > "$CLAUDE_MD.tmp" && mv "$CLAUDE_MD.tmp" "$CLAUDE_MD"
  echo "Removed old Knowledge Base section from $CLAUDE_MD"
fi

# Append minimal brain reference
BRAIN_REF='
## Knowledge Base

You have access to a persistent knowledge base via MCP tools. Use `brain_search` before starting work to check for relevant knowledge. Buffer insights to `~/.claude/pending-insights.jsonl` during work — they get promoted to brain after commit or at session end. Use `/brain-keep` to end a session, or `/brain-abandon` if the session was a dead end. Use `/exit` for consolidation only.'

if [ ! -f "$CLAUDE_MD" ]; then
  echo "$BRAIN_REF" > "$CLAUDE_MD"
  echo "Created $CLAUDE_MD with brain reference"
else
  echo "$BRAIN_REF" >> "$CLAUDE_MD"
  echo "Added brain reference to $CLAUDE_MD"
fi

echo ""
echo "[5/5] Installing slash commands..."
COMMANDS_DIR="$HOME/.claude/commands"
mkdir -p "$COMMANDS_DIR"
for cmd in "$SCRIPT_DIR"/commands/*.md; do
  cp "$cmd" "$COMMANDS_DIR/$(basename "$cmd")"
done
echo "Slash commands installed: /brain-init, /brain-knowledge, /brain-sync, /brain-keep, /brain-abandon, /goodbye, /exit"

echo ""
echo "=== Done! Restart Claude Code to activate. ==="
echo ""
echo "Available commands:"
echo "  /brain-init      — Enable auto-knowledge and migrate CLAUDE.md to brain"
echo "  /brain-knowledge — Quick reference for brain usage patterns"
echo "  /brain-sync      — Promote stable brain entries to CLAUDE.md"
echo "  /brain-keep      — Flush insight buffer and end session"
echo "  /brain-abandon   — Dead-end session: keep general knowledge, discard impl details"
echo "  /goodbye         — Alias for /brain-keep"
echo "  /exit            — Consolidate knowledge (warns if buffer non-empty)"
echo ""
echo "Use /mcp in Claude Code to verify the server is running."

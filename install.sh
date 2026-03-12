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
echo "[4/5] Installing knowledge base instructions..."
CLAUDE_DIR="$HOME/.claude"
mkdir -p "$CLAUDE_DIR"
KB_FILE="$CLAUDE_DIR/knowledge-base.md"
CLAUDE_MD="$CLAUDE_DIR/CLAUDE.md"

if [ ! -f "$KB_FILE" ]; then
  cp "$SCRIPT_DIR/knowledge-base.md" "$KB_FILE"
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

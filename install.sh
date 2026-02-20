#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== Claude Knowledge Base MCP Server ==="
echo ""

echo "[1/4] Installing dependencies..."
cd "$SCRIPT_DIR"
npm install

echo ""
echo "[2/4] Building..."
npm run build

echo ""
echo "[3/4] Registering MCP server in Claude Code..."
claude mcp add --transport stdio --scope user knowledge-base -- node "$SCRIPT_DIR/dist/index.js"

echo ""
echo "[4/4] Installing slash commands..."
COMMANDS_DIR="$HOME/.claude/commands"
mkdir -p "$COMMANDS_DIR"
for cmd in "$SCRIPT_DIR"/commands/*.md; do
  cp "$cmd" "$COMMANDS_DIR/$(basename "$cmd")"
done
echo "Slash commands installed: /brain-init, /goodbye, /exit"

echo ""
echo "=== Done! Restart Claude Code to activate. ==="
echo ""
echo "Available commands:"
echo "  /brain-init  — Enable auto-knowledge and migrate CLAUDE.md to brain"
echo "  /goodbye     — Consolidate knowledge and end session"
echo "  /exit        — Same as /goodbye"
echo ""
echo "Use /mcp in Claude Code to verify the server is running."

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition

Write-Host "=== Claude Knowledge Base MCP Server ==="
Write-Host ""

Write-Host "[1/5] Installing dependencies..."
Set-Location $ScriptDir
npm install

Write-Host ""
Write-Host "[2/5] Building..."
npm run build

Write-Host ""
Write-Host "[3/5] Registering MCP server in Claude Code..."
claude mcp add --transport stdio --scope user knowledge-base -- node "$ScriptDir\dist\index.js"

Write-Host ""
Write-Host "[4/5] Installing knowledge base instructions..."
$ClaudeDir = Join-Path $env:USERPROFILE ".claude"
if (-not (Test-Path $ClaudeDir)) {
    New-Item -ItemType Directory -Path $ClaudeDir -Force | Out-Null
}
$KbFile = Join-Path $ClaudeDir "knowledge-base.md"
$ClaudeMd = Join-Path $ClaudeDir "CLAUDE.md"

if (-not (Test-Path $KbFile)) {
    @"
## Knowledge Base

You have access to a persistent knowledge base via MCP tools (``brain_add``, ``brain_search``, ``brain_update``, ``brain_delete``, ``brain_consolidate``). Use it proactively — **not when asked, but automatically**.

### Before Starting Work
- Call ``brain_search`` with keywords relevant to the task (project name, technology, problem domain)
- Check for existing patterns, past bugs, or architectural decisions that apply

### During Work — Mandatory Storage Triggers
After ANY of the following events, call ``brain_add`` immediately:

1. **You resolve a build/compile error** — store the error cause and fix (category: ``debugging``)
2. **You discover an API quirk or gotcha** — e.g., namespace collisions, unexpected property names, missing methods (category: ``api``)
3. **You establish a pattern used across multiple files** — e.g., how messages are plumbed, how columns flow through ViewModels (category: ``pattern``)
4. **You make or encounter an architectural decision** — e.g., which ViewModel owns which data, how DI is structured (category: ``architecture``)
5. **You learn a configuration detail** — e.g., solution file location, build commands, project structure (category: ``config``)
6. **You work around a framework limitation** — e.g., using ``using`` aliases for type conflicts, using ``EditSettings`` instead of direct property (category: ``debugging``)

**Rule of thumb:** If you had to figure something out (it wasn't obvious from the code alone), store it. Future sessions start fresh — anything not stored is lost.

### What Makes a Good Entry
- **Title:** Short, searchable (e.g., "DevExpress WPF: ColumnDefinition name collision with Shared namespace")
- **Content:** Specific and actionable — include the fix, not just the problem. Include file paths when relevant.
- **Tags:** Technology names, project names, error codes, concepts (e.g., ``devexpress``, ``wpf``, ``gxreport``, ``namespace-collision``)
- **Project:** Set the project identifier when the knowledge is project-specific

### Before Session Ends
When the user says goodbye, ends the conversation, or you sense the session is wrapping up:
1. Call ``brain_consolidate`` to review all entries
2. Clean up: delete outdated entries, merge redundancies, resolve contradictions
3. You can also use ``/goodbye`` or ``/exit`` to trigger this

Categories: ``pattern``, ``debugging``, ``api``, ``config``, ``architecture``, ``general``
"@ | Set-Content -Path $KbFile -Encoding UTF8
    Write-Host "Created $KbFile"
} else {
    Write-Host "knowledge-base.md already exists, skipping"
}

if (-not (Test-Path $ClaudeMd)) {
    "@knowledge-base.md" | Set-Content -Path $ClaudeMd -Encoding UTF8
    Write-Host "Created $ClaudeMd with @knowledge-base.md reference"
} elseif (-not (Select-String -Path $ClaudeMd -Pattern "@knowledge-base.md" -SimpleMatch -Quiet)) {
    Add-Content -Path $ClaudeMd -Value "`n@knowledge-base.md"
    Write-Host "Added @knowledge-base.md reference to $ClaudeMd"
} else {
    Write-Host "@knowledge-base.md reference already present in CLAUDE.md"
}

Write-Host ""
Write-Host "[5/5] Installing slash commands..."
$CommandsDir = Join-Path $env:USERPROFILE ".claude\commands"
if (-not (Test-Path $CommandsDir)) {
    New-Item -ItemType Directory -Path $CommandsDir -Force | Out-Null
}
foreach ($cmd in Get-ChildItem "$ScriptDir\commands\*.md") {
    Copy-Item $cmd.FullName -Destination (Join-Path $CommandsDir $cmd.Name)
}
Write-Host "Slash commands installed: /brain-init, /goodbye, /exit"

Write-Host ""
Write-Host "=== Done! Restart Claude Code to activate. ==="
Write-Host ""
Write-Host "Available commands:"
Write-Host "  /brain-init  -- Enable auto-knowledge and migrate CLAUDE.md to brain"
Write-Host "  /goodbye     -- Consolidate knowledge and end session"
Write-Host "  /exit        -- Same as /goodbye"
Write-Host ""
Write-Host "Use /mcp in Claude Code to verify the server is running."

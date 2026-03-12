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
    Copy-Item "$ScriptDir\knowledge-base.md" -Destination $KbFile
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

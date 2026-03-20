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
Write-Host "[4/5] Configuring knowledge base in Claude Code..."
$ClaudeDir = Join-Path $env:USERPROFILE ".claude"
if (-not (Test-Path $ClaudeDir)) {
    New-Item -ItemType Directory -Path $ClaudeDir -Force | Out-Null
}
$ClaudeMd = Join-Path $ClaudeDir "CLAUDE.md"

# Remove old @import if present
if (Test-Path $ClaudeMd) {
    $content = Get-Content $ClaudeMd -Raw
    if ($content -match '@knowledge-base\.md') {
        $content = ($content -split "`n" | Where-Object { $_ -notmatch '^@knowledge-base\.md' }) -join "`n"
        Set-Content -Path $ClaudeMd -Value $content -Encoding UTF8 -NoNewline
        Write-Host "Removed old @knowledge-base.md import from $ClaudeMd"
    }
}

# Remove old knowledge-base.md file if present
$KbFile = Join-Path $ClaudeDir "knowledge-base.md"
if (Test-Path $KbFile) {
    Remove-Item $KbFile
    Write-Host "Removed old $KbFile"
}

# Remove existing MANDATORY and Knowledge Base sections (from prior installs)
if (Test-Path $ClaudeMd) {
    $lines = Get-Content $ClaudeMd
    $output = @()
    $skip = $false
    foreach ($line in $lines) {
        if ($line -match '^## MANDATORY: Consult Knowledge Base First' -or $line -match '^## Knowledge Base') {
            $skip = $true
            continue
        }
        if ($skip -and $line -match '^## ') {
            $skip = $false
        }
        if (-not $skip) {
            $output += $line
        }
    }
    Set-Content -Path $ClaudeMd -Value ($output -join "`n") -Encoding UTF8 -NoNewline
    Write-Host "Cleaned old Knowledge Base sections from $ClaudeMd"
}

# Replace old tool names in any remaining content
if (Test-Path $ClaudeMd) {
    $content = Get-Content $ClaudeMd -Raw
    $content = $content -replace 'brain_add','brain_upsert' -replace 'brain_update','brain_upsert' -replace 'brain_list_tags','brain_info' -replace 'brain_consolidate','brain_maintain'
    Set-Content -Path $ClaudeMd -Value $content -Encoding UTF8 -NoNewline
}

# Extract Knowledge Base section from brain-init.md (single source of truth)
$brainInitPath = Join-Path $ScriptDir "commands\brain-init.md"
$brainInitLines = Get-Content $brainInitPath
$inside = $false
$brainRef = @()
foreach ($line in $brainInitLines) {
    if ($line -match '^```$') {
        if ($inside) { break }
        $inside = $true
        continue
    }
    if ($inside) {
        $brainRef += $line
    }
}

if ($brainRef.Count -eq 0) {
    Write-Host "WARNING: Could not extract Knowledge Base section from brain-init.md"
} else {
    $brainText = "`n" + ($brainRef -join "`n")
    if (-not (Test-Path $ClaudeMd)) {
        Set-Content -Path $ClaudeMd -Value $brainText -Encoding UTF8 -NoNewline
        Write-Host "Created $ClaudeMd with brain reference"
    } else {
        Add-Content -Path $ClaudeMd -Value $brainText
        Write-Host "Added brain reference to $ClaudeMd"
    }
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

# TodoFlow Self-Check Script (PowerShell)
# Runs all tests and verifies project health.

param(
    [switch]$SkipFrontend,
    [switch]$SkipRust,
    [switch]$Quick
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$Pass = 0
$Fail = 0

function Log-Pass { Write-Host "[PASS] $args" -ForegroundColor Green; $script:Pass++ }
function Log-Fail { Write-Host "[FAIL] $args" -ForegroundColor Red; $script:Fail++ }
function Log-Info { Write-Host "[INFO] $args" -ForegroundColor Yellow }

Set-Location $ProjectRoot

Write-Host "==============================" -ForegroundColor Cyan
Write-Host "  TodoFlow Self-Check (PS)"
Write-Host "  $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
Write-Host "==============================" -ForegroundColor Cyan
Write-Host ""

# 1. Verify required files exist
Write-Host "--- Checking project files ---"
$RequiredFiles = @(
    "src-tauri\Cargo.toml",
    "src-tauri\src\lib.rs",
    "src-tauri\src\main.rs",
    "src-tauri\src\db\task_repo.rs",
    "src-tauri\src\db\tag_repo.rs",
    "src-tauri\src\db\attachment_repo.rs",
    "src-tauri\tests\ipc_integration.rs",
    "src\test\setup.ts",
    "src\test\test-utils.tsx",
    "src\test\mocks.ts"
)
foreach ($file in $RequiredFiles) {
    if (Test-Path $file) {
        Log-Pass "File exists: $file"
    } else {
        Log-Fail "File missing: $file"
    }
}

# 2. Check snapshot file count
Write-Host ""
Write-Host "--- Checking snapshots ---"
$SnapDir = "src\test\visual\__snapshots__"
if (Test-Path $SnapDir) {
    $SnapCount = (Get-ChildItem -Path $SnapDir -Filter "*.snap" -File).Count
    if ($SnapCount -ge 3) {
        Log-Pass "Snapshot files: $SnapCount (threshold: 3)"
    } else {
        Log-Fail "Snapshot files: $SnapCount (expected >= 3)"
    }
} else {
    Log-Fail "Snapshot directory not found: $SnapDir"
}

# 3. Frontend tests
if (-not $SkipFrontend) {
    Write-Host ""
    Write-Host "--- Running frontend tests ---"
    if ($Quick) {
        Log-Info "Quick mode: running smoke test subset"
        $testResult = npx vitest run --reporter=dot 2>&1; $exitCode = $LASTEXITCODE
    } else {
        $testResult = npx vitest run --reporter=dot 2>&1; $exitCode = $LASTEXITCODE
    }
    if ($exitCode -eq 0) {
        Log-Pass "Frontend tests passed"
    } else {
        Log-Fail "Frontend tests failed"
    }
} else {
    Log-Info "Skipping frontend tests"
}

# 4. Rust tests
if (-not $SkipRust) {
    Write-Host ""
    Write-Host "--- Running Rust tests ---"
    Push-Location src-tauri
    try {
        cargo test 2>&1 | Out-Host
        if ($LASTEXITCODE -eq 0) {
            Log-Pass "Rust tests passed"
        } else {
            Log-Fail "Rust tests failed"
        }
    } finally {
        Pop-Location
    }
} else {
    Log-Info "Skipping Rust tests"
}

# Summary
Write-Host ""
Write-Host "==============================" -ForegroundColor Cyan
Write-Host "  Results: $Pass passed, $Fail failed" -ForegroundColor $(if ($Fail -gt 0) { "Red" } else { "Green" })
Write-Host "==============================" -ForegroundColor Cyan

exit $Fail

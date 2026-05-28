#!/usr/bin/env bash
set -euo pipefail

# TodoFlow Self-Check Script
# Runs all tests and verifies project health.
# Exit code 0 = all checks passed.

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

PASS=0
FAIL=0
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

log_pass() { echo -e "${GREEN}[PASS]${NC} $1"; PASS=$((PASS + 1)); }
log_fail() { echo -e "${RED}[FAIL]${NC} $1"; FAIL=$((FAIL + 1)); }
log_info() { echo -e "${YELLOW}[INFO]${NC} $1"; }

cd "$PROJECT_ROOT"

echo "=============================="
echo "  TodoFlow Self-Check"
echo "  $(date '+%Y-%m-%d %H:%M:%S')"
echo "=============================="
echo ""

# 1. Verify required files exist
echo "--- Checking project files ---"
REQUIRED_FILES=(
  "src-tauri/Cargo.toml"
  "src-tauri/src/lib.rs"
  "src-tauri/src/main.rs"
  "src-tauri/src/db/task_repo.rs"
  "src-tauri/src/db/tag_repo.rs"
  "src-tauri/src/db/attachment_repo.rs"
  "src-tauri/tests/ipc_integration.rs"
  "src/test/setup.ts"
  "src/test/test-utils.tsx"
  "src/test/mocks.ts"
)
for file in "${REQUIRED_FILES[@]}"; do
  if [ -f "$file" ]; then
    log_pass "File exists: $file"
  else
    log_fail "File missing: $file"
  fi
done

# 2. Check snapshot file count
echo ""
echo "--- Checking snapshots ---"
SNAP_COUNT=$(find src/test/visual/__snapshots__ -name "*.snap" 2>/dev/null | wc -l)
if [ "$SNAP_COUNT" -ge 3 ]; then
  log_pass "Snapshot files: $SNAP_COUNT (threshold: 3)"
else
  log_fail "Snapshot files: $SNAP_COUNT (expected >= 3)"
fi

# 3. Frontend tests
echo ""
echo "--- Running frontend tests ---"
if npx vitest run --reporter=dot 2>&1; then
  log_pass "Frontend tests passed"
else
  log_fail "Frontend tests failed"
fi

# 4. Rust tests compile check
echo ""
echo "--- Running Rust tests ---"
if cargo test --manifest-path src-tauri/Cargo.toml 2>&1; then
  log_pass "Rust tests passed"
else
  log_fail "Rust tests failed"
fi

# Summary
echo ""
echo "=============================="
echo "  Results: ${GREEN}$PASS passed${NC}, ${RED}$FAIL failed${NC}"
echo "=============================="

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0

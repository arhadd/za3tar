#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

fail() { printf 'release check failed: %s\n' "$*" >&2; exit 1; }
pass() { printf '✓ %s\n' "$*"; }

command -v node >/dev/null || fail "node is required"
command -v npm >/dev/null || fail "npm is required"


node_version="$(node -p "require('./package.json').version")"
cargo_version="$(python3 - <<'PY'
import re
from pathlib import Path
text = Path('src-tauri/Cargo.toml').read_text()
m = re.search(r'^version\s*=\s*"([^"]+)"', text, re.M)
if not m:
    raise SystemExit('missing Cargo package version')
print(m.group(1))
PY
)"
tauri_version="$(python3 - <<'PY'
import json
print(json.load(open('src-tauri/tauri.conf.json'))['version'])
PY
)"

[[ "$node_version" == "$cargo_version" && "$cargo_version" == "$tauri_version" ]] || 
  fail "version mismatch: package=$node_version cargo=$cargo_version tauri=$tauri_version"
pass "versions agree at $node_version"

node_license="$(node -p "require('./package.json').license")"
cargo_license="$(python3 - <<'PY'
import re
from pathlib import Path
text = Path('src-tauri/Cargo.toml').read_text()
m = re.search(r'^license\s*=\s*"([^"]+)"', text, re.M)
if not m:
    raise SystemExit('missing Cargo package license')
print(m.group(1))
PY
)"
[[ "$node_license" == "AGPL-3.0-only" && "$cargo_license" == "AGPL-3.0-only" ]] ||
  fail "application licence mismatch: package=$node_license cargo=$cargo_license"
[[ -s LICENSE && -s LICENSES/Apache-2.0.txt && -s LICENSES/README.md ]] ||
  fail "licence files are incomplete"
grep -q 'SPDX-License-Identifier: Apache-2.0' docs/AGENT-PROTOCOL.md ||
  fail "protocol specification is missing its Apache-2.0 marker"
grep -q 'Not licensed for reuse' site/README.md ||
  fail "site/ is missing its not-licensed-for-reuse notice"
pass "split licence boundary is explicit"

npm run build
pass "frontend production build"

if [[ "$(uname -s)" == "Darwin" ]]; then
  command -v cargo >/dev/null || fail "cargo is required on macOS"

  # The helper must exist before any cargo step: tauri.conf.json lists it as a
  # bundled resource, so the Tauri build script fails the moment it is missing.
  # On a dev machine a stale binary hides this; on a clean checkout it does not.
  npm run capture:build
  [[ -x src-tauri/binaries/za3tar-capture ]] || fail "capture helper was not built"
  pass "native capture helper"

  cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check
  pass "Rust formatting"
  cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
  pass "Rust lints"
  cargo test --manifest-path src-tauri/Cargo.toml
  pass "Rust tests"
else
  printf '↷ Rust/Tauri and native capture checks skipped (release target requires macOS)\n'
fi

printf '\nrelease candidate checks passed for v%s\n' "$node_version"

#!/bin/zsh
set -eu
cd "$(dirname "$0")/.."
mkdir -p .build/checks
export CLANG_MODULE_CACHE_PATH="$PWD/.build/clang-cache"
swiftc -module-cache-path "$PWD/.build/swift-cache" \
  Sources/Handoff/Models.swift Sources/Handoff/Store.swift Tests/HandoffTests/NoteTests.swift \
  -o .build/checks/NoteChecks
.build/checks/NoteChecks

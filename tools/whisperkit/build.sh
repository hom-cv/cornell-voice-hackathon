#!/bin/sh
set -eu
cd "$(dirname "$0")"
# All dependencies are local checkouts beside WHISPERKIT_SOURCE_PATH.
# The original project is only read; build/cache output stays in this directory.
mkdir -p .cache/clang .cache/swiftpm .swiftpm/configuration .swiftpm/security
export CLANG_MODULE_CACHE_PATH="$PWD/.cache/clang"
exec swift build -c release --product nimbus-whisperkit --disable-sandbox \
  --cache-path "$PWD/.cache/swiftpm" \
  --config-path "$PWD/.swiftpm/configuration" \
  --security-path "$PWD/.swiftpm/security" \
  -Xswiftc -module-cache-path -Xswiftc "$PWD/.cache/clang"

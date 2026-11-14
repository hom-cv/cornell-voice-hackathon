#!/bin/zsh
set -eu
cd "$(dirname "$0")/.."
export CLANG_MODULE_CACHE_PATH="$PWD/.build/clang-cache"
export SWIFTPM_MODULECACHE_OVERRIDE="$PWD/.build/swift-cache"
swift build --disable-sandbox --cache-path "$PWD/.build/package-cache"
HANDOFF_BIN_DIR=$(swift build --disable-sandbox --cache-path "$PWD/.build/package-cache" --show-bin-path)
HANDOFF_APP="$PWD/.build/Handoff.app"
mkdir -p "$HANDOFF_APP/Contents/MacOS" "$HANDOFF_APP/Contents/Resources"
cp "$HANDOFF_BIN_DIR/Handoff" "$HANDOFF_APP/Contents/MacOS/Handoff"
cp Resources/Info.plist "$HANDOFF_APP/Contents/Info.plist"
for resource in "$HANDOFF_BIN_DIR/"*.bundle(N); do
    ditto "$resource" "$HANDOFF_APP/$(basename "$resource")"
done
codesign --force --deep --sign - "$HANDOFF_APP"
if ! open "$HANDOFF_APP"; then
    exec "$HANDOFF_APP/Contents/MacOS/Handoff"
fi

#!/usr/bin/env bash
# Build the za3tar-capture helper, embedding Info.plist (for TCC usage strings)
# and code-signing it. The system-audio tap permission prompt only fires for a
# signed binary, so we sign here — with a real Developer ID if one is available,
# otherwise ad-hoc (which is enough to test locally on this machine).
set -euo pipefail
cd "$(dirname "$0")"

OUT="${1:-za3tar-capture}"
case "$OUT" in */*) mkdir -p "$(dirname "$OUT")";; esac
PLIST="Info.plist"
ENTITLEMENTS="capture.entitlements"

echo "compiling $OUT (arm64, macOS)…"
swiftc -O za3tar-capture.swift -o "$OUT" \
  -framework AudioToolbox -framework AVFoundation \
  -Xlinker -sectcreate -Xlinker __TEXT -Xlinker __info_plist -Xlinker "$PLIST"

# Pick a signing identity: prefer a Developer ID, else ad-hoc ("-").
IDENTITY="-"
if security find-identity -v -p codesigning 2>/dev/null | grep -q "Developer ID Application"; then
  IDENTITY="$(security find-identity -v -p codesigning | grep "Developer ID Application" | head -1 | awk '{print $2}')"
  echo "signing with Developer ID: $IDENTITY"
else
  echo "no Developer ID found — signing ad-hoc (local testing only)"
fi

codesign --force --sign "$IDENTITY" \
  --entitlements "$ENTITLEMENTS" \
  --options runtime \
  --identifier com.ala.za3tar.capture \
  "$OUT"

# $OUT may be absolute (the npm script passes a full path) or relative to here.
case "$OUT" in
  /*) echo "done: $OUT" ;;
  *)  echo "done: $(pwd)/$OUT" ;;
esac
codesign -dv "$OUT" 2>&1 | sed 's/^/  /' || true

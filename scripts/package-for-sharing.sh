#!/bin/bash
# Creates a shareable zip: Daily-TODO-macOS-v1.0.0.zip
# Contains the app zip and INSTALL.md — no credentials.

set -e
cd "$(dirname "$0")/.."

VERSION="1.0.0"
SHARE_NAME="Daily-TODO-macOS-v${VERSION}"
APP_ZIP="dist/Daily TODO-${VERSION}-arm64-mac.zip"

if [ ! -f "$APP_ZIP" ]; then
  echo "Building app first..."
  CSC_IDENTITY_AUTO_DISCOVERY=false npm run dist || true
fi

if [ ! -f "$APP_ZIP" ]; then
  echo "Build failed — expected: $APP_ZIP"
  exit 1
fi

STAGE="dist/${SHARE_NAME}"
rm -rf "$STAGE"
mkdir -p "$STAGE"
cp "$APP_ZIP" "$STAGE/"
cp INSTALL.md "$STAGE/"

cd dist
rm -f "${SHARE_NAME}.zip"
zip -r "${SHARE_NAME}.zip" "${SHARE_NAME}"

echo ""
echo "✓ Ready to share:"
echo "  $(pwd)/${SHARE_NAME}.zip"
echo ""
echo "Send this zip to anyone on Mac (Apple Silicon). They unzip and follow INSTALL.md."

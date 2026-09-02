#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "Building Daily TODO..."
npm run tauri:build -- --bundles app

APP_PATH="src-tauri/target/release/bundle/macos/Tudu.app"
ZIP_NAME="Daily-TODO-macOS-v2.0.0.zip"
OUT_DIR="dist"
mkdir -p "$OUT_DIR"

if [ -d "$APP_PATH" ]; then
  ditto -c -k --sequesterRsrc --keepParent "$APP_PATH" "$OUT_DIR/$ZIP_NAME"
  cp INSTALL.md "$OUT_DIR/"
  echo "Created $OUT_DIR/$ZIP_NAME"
else
  echo "App bundle not found at $APP_PATH"
  exit 1
fi

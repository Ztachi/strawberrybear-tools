#!/bin/bash
# 一键打包并启动应用

set -e

# 切换到项目根目录
cd "$(dirname "$0")/.."

echo "Building..."
pnpm tauri build --bundles app

APP_PATH="./src-tauri/target/release/bundle/macos/InfinityNikkiPlayer.app"
if [ -d "$APP_PATH" ]; then
    echo "Launching $APP_PATH ..."
    "$APP_PATH/Contents/MacOS/infinity-nikki-player" &
    echo "Done! App is running."
else
    echo "Error: App bundle not found at $APP_PATH"
    exit 1
fi

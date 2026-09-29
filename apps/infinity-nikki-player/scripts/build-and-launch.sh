#!/bin/bash
# 构建 macOS 应用包，并通过 Launch Services 启动以验证系统级应用身份。

set -euo pipefail

cd "$(dirname "$0")/.."

if [ "$(uname -s)" != "Darwin" ]; then
    echo "错误：该命令仅用于验证 macOS 应用包。"
    exit 1
fi

echo "正在构建 macOS 应用包……"
# 本地预览不生成 updater 签名产物，避免依赖发布环境中的私钥。
pnpm tauri build --bundles app --config '{"bundle":{"createUpdaterArtifacts":false}}'

APP_PATH="./src-tauri/target/release/bundle/macos/InfinityNikkiPlayer.app"
if [ -d "$APP_PATH" ]; then
    echo "正在通过 macOS Launch Services 启动 ${APP_PATH}……"
    /usr/bin/open -n "$APP_PATH"
    echo "应用已启动。"
else
    echo "错误：未找到应用包 ${APP_PATH}"
    exit 1
fi

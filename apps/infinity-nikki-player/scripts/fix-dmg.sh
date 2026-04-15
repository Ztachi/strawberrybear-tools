#!/bin/bash
# 修复 Tauri dmg 安装问题的脚本

DMG_PATH="$1"
APP_NAME="InfinityNikkiPlayer"

if [ -z "$DMG_PATH" ]; then
    echo "Usage: $0 <path-to-dmg>"
    exit 1
fi

# 挂载 dmg
MOUNT_POINT="/Volumes/${APP_NAME}"
hdiutil attach "$DMG_PATH" -mountpoint "$MOUNT_POINT" -nobrowse 2>&1

# 修复 Info.plist 中的 CFBundleExecutable
/usr/libexec/PlistBuddy -c "Set :CFBundleExecutable ${APP_NAME}" "${MOUNT_POINT}/${APP_NAME}.app/Contents/Info.plist" 2>/dev/null

# 复制到 Applications
cp -R "${MOUNT_POINT}/${APP_NAME}.app" /Applications/

# 卸载 dmg
hdiutil detach "$MOUNT_POINT" 2>&1

# 重新签名
codesign --force --deep --sign - "/Applications/${APP_NAME}.app" 2>&1

echo "Done! You can now run: open /Applications/${APP_NAME}.app"

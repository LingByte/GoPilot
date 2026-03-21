#!/bin/bash

# 修复 Info.plist 以支持文件拖放
# 这个脚本在构建后运行

APP_BUNDLE="$1"
if [ -z "$APP_BUNDLE" ]; then
    # 尝试找到最新的构建
    APP_BUNDLE=$(find target -name "GoPilot.app" -type d | head -1)
fi

if [ -z "$APP_BUNDLE" ] || [ ! -d "$APP_BUNDLE" ]; then
    echo "错误: 找不到 GoPilot.app"
    exit 1
fi

INFO_PLIST="$APP_BUNDLE/Contents/Info.plist"

if [ ! -f "$INFO_PLIST" ]; then
    echo "错误: 找不到 Info.plist: $INFO_PLIST"
    exit 1
fi

echo "修改 Info.plist: $INFO_PLIST"

# 检查是否已经包含 CFBundleDocumentTypes
if plutil -extract CFBundleDocumentTypes "$INFO_PLIST" > /dev/null 2>&1; then
    echo "Info.plist 已经包含 CFBundleDocumentTypes，跳过修改"
    exit 0
fi

# 使用 plutil 添加文件关联
plutil -insert CFBundleDocumentTypes -xml '<array><dict><key>CFBundleTypeName</key><string>All Files</string><key>CFBundleTypeRole</key><string>Editor</string><key>LSItemContentTypes</key><array><string>public.data</string><string>public.content</string><string>public.item</string><string>public.directory</string></array><key>LSHandlerRank</key><string>Owner</string></dict><dict><key>CFBundleTypeName</key><string>Folder</string><key>CFBundleTypeRole</key><string>Editor</string><key>LSItemContentTypes</key><array><string>public.folder</string><string>public.directory</string></array><key>LSHandlerRank</key><string>Owner</string></dict></array>' "$INFO_PLIST"

if [ $? -eq 0 ]; then
    echo "成功添加文件关联配置到 Info.plist"
else
    echo "警告: 无法修改 Info.plist"
    exit 1
fi


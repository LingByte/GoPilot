#!/bin/bash

# GoPilot macOS 构建脚本
# 使用方法: ./scripts/build-macos.sh

set -e  # 遇到错误立即退出

echo "🚀 开始构建 GoPilot macOS 版本..."
echo ""

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# 检查必要工具
echo "📋 检查必要工具..."
command -v node >/dev/null 2>&1 || { echo -e "${RED}❌ 错误: 未找到 Node.js${NC}" >&2; exit 1; }
command -v npm >/dev/null 2>&1 || { echo -e "${RED}❌ 错误: 未找到 npm${NC}" >&2; exit 1; }
command -v rustc >/dev/null 2>&1 || { echo -e "${RED}❌ 错误: 未找到 Rust${NC}" >&2; exit 1; }
echo -e "${GREEN}✅ 所有必要工具已安装${NC}"
echo ""

# 检查图标文件
echo "🖼️  检查图标文件..."
if [ ! -f "src-tauri/icons/icon.icns" ]; then
    echo -e "${YELLOW}⚠️  警告: 未找到 icon.icns，将使用默认图标${NC}"
else
    echo -e "${GREEN}✅ 图标文件存在${NC}"
fi
echo ""

# 清理之前的构建
echo "🧹 清理之前的构建文件..."
rm -rf dist
rm -rf src-tauri/target/release/bundle
echo -e "${GREEN}✅ 清理完成${NC}"
echo ""

# 安装依赖
echo "📦 安装依赖..."
if [ ! -d "node_modules" ]; then
    npm install
else
    echo "依赖已存在，跳过安装"
fi
echo -e "${GREEN}✅ 依赖检查完成${NC}"
echo ""

# 构建前端
echo "🔨 构建前端..."
npm run build
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ 前端构建成功${NC}"
else
    echo -e "${RED}❌ 前端构建失败${NC}"
    exit 1
fi
echo ""

# 构建 Tauri 应用
echo "📱 构建 Tauri 应用..."
echo "这可能需要几分钟时间，请耐心等待..."
npm run tauri:build

if [ $? -eq 0 ]; then
    echo ""
    echo -e "${GREEN}✅ 构建成功！${NC}"
    echo ""
    
    # 检查输出
    if [ -d "src-tauri/target/release/bundle/macos" ]; then
        echo "📦 应用位置:"
        echo "   $(pwd)/src-tauri/target/release/bundle/macos/GoPilot.app"
        echo ""
        echo "📊 应用信息:"
        ls -lh src-tauri/target/release/bundle/macos/ | grep -E "GoPilot|\.dmg"
        echo ""
        echo "🎉 构建完成！可以运行以下命令打开应用："
        echo "   open src-tauri/target/release/bundle/macos/GoPilot.app"
    else
        echo -e "${YELLOW}⚠️  警告: 未找到预期的输出目录${NC}"
    fi
else
    echo -e "${RED}❌ 构建失败${NC}"
    exit 1
fi


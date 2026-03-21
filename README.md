# GoPilot

<div align="center">

<img src="public/app-icon.png" alt="GoPilot Logo" width="70" height="70">

**A modern code editor for Go development, inspired by GoLand**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Go Version](https://img.shields.io/badge/Go-1.21+-blue.svg)](https://golang.org/)
[![React](https://img.shields.io/badge/React-18.2.0-blue.svg)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.2.2-blue.svg)](https://www.typescriptlang.org/)
[![Tauri](https://img.shields.io/badge/Tauri-2.0-blue.svg)](https://tauri.app/)

</div>

## 📚 项目简介

GoPilot 是一个现代化的 Go 语言代码编辑器，基于 Tauri + React + TypeScript 构建。提供类似 GoLand 的开发体验，包括语法高亮、代码补全、文件管理、终端集成等功能。

## ✨ 核心功能

- 📝 **代码编辑器** - 基于 Monaco Editor，支持 Go 语言语法高亮和代码补全
- 📁 **文件管理** - 可视化文件树，支持文件夹展开/折叠
- 🖥️ **集成终端** - 内置终端，支持运行 Go 程序
- 🎨 **主题支持** - 支持深色/浅色主题切换
- ⚡ **高性能** - 基于 Tauri，原生性能，体积小巧
- 🔍 **代码搜索** - 快速搜索文件和代码
- 🚀 **一键运行** - 快速运行 Go 程序

## 🚀 快速开始

### 环境要求

- Node.js 20+
- Rust (for Tauri)
- Go 1.21+ (可选，用于开发 Go 程序)

### 安装依赖

```bash
# 克隆项目
git clone <your-repo-url>
cd GoPilot

# 安装前端依赖
npm install
```

### 开发模式

```bash
# 启动开发服务器
npm run tauri:dev
```

### 构建生产版本

```bash
# 构建应用
npm run tauri:build

# 或使用构建脚本（推荐）
./scripts/build-macos.sh
```

详细打包说明请参考：[macOS 打包指南](./docs/BUILD_MACOS.md)

## 📦 技术栈

### 前端技术
- **React 18.2.0** - 现代化用户界面框架
- **TypeScript 5.2.2** - 类型安全的JavaScript
- **Tauri 2.0** - 跨平台桌面应用框架
- **Tailwind CSS** - 实用优先的CSS框架
- **Monaco Editor** - VS Code 编辑器核心
- **Zustand** - 轻量级状态管理
- **React Router** - 路由管理

### 后端技术
- **Rust** - Tauri 后端
- **Go** - 可选，用于 Go 语言工具链集成

## 🏗️ 项目结构

```
GoPilot/
├── src/
│   ├── components/
│   │   └── Editor/          # 编辑器相关组件
│   │       ├── CodeEditor.tsx    # 代码编辑器
│   │       ├── FileTree.tsx      # 文件树
│   │       └── Terminal.tsx      # 终端组件
│   ├── pages/
│   │   └── Editor.tsx        # 主编辑器页面
│   ├── App.tsx              # 应用入口
│   └── main.tsx             # React 入口
├── src-tauri/               # Tauri 后端
│   ├── src/
│   │   └── main.rs          # Rust 主文件
│   └── Cargo.toml           # Rust 依赖配置
├── package.json             # Node.js 依赖
└── README.md               # 项目说明
```

## 🎯 功能特性

### 代码编辑
- ✅ Go 语言语法高亮
- ✅ 代码自动补全
- ✅ 代码格式化
- ✅ 多文件编辑
- ✅ 文件保存/打开

### 文件管理
- ✅ 文件树导航
- ✅ 文件夹展开/折叠
- ✅ 文件图标识别
- ✅ 文件搜索

### 终端集成
- ✅ 内置终端
- ✅ 命令历史
- ✅ 支持 Go 命令运行
- ✅ 终端窗口可调整大小

## 🔧 开发计划

- [ ] Go 语言 LSP 集成
- [ ] 代码调试功能
- [ ] Git 集成
- [ ] 插件系统
- [ ] 代码片段管理
- [ ] 多主题支持
- [ ] 快捷键自定义
- [ ] 项目管理

## 📝 许可证

MIT License

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📧 联系方式

如有问题或建议，请通过 GitHub Issues 反馈。

---

**GoPilot** - 让 Go 开发更简单、更高效！

#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// 查找 GoPilot.app
function findAppBundle() {
  const possiblePaths = [
    path.join(__dirname, '../../target/release/bundle/macos/GoPilot.app'),
    path.join(__dirname, '../../target/debug/bundle/macos/GoPilot.app'),
  ];
  
  for (const appPath of possiblePaths) {
    if (fs.existsSync(appPath)) {
      return appPath;
    }
  }
  
  // 尝试查找
  try {
    const result = execSync('find target -name "GoPilot.app" -type d 2>/dev/null | head -1', {
      cwd: path.join(__dirname, '../..'),
      encoding: 'utf8'
    }).trim();
    if (result) {
      return path.join(__dirname, '../..', result);
    }
  } catch (e) {
    // 忽略错误
  }
  
  return null;
}

const appBundle = findAppBundle();

if (!appBundle) {
  console.error('错误: 找不到 GoPilot.app');
  console.log('请先运行: npm run tauri:build');
  process.exit(1);
}

const infoPlistPath = path.join(appBundle, 'Contents/Info.plist');

if (!fs.existsSync(infoPlistPath)) {
  console.error(`错误: 找不到 Info.plist: ${infoPlistPath}`);
  process.exit(1);
}

console.log(`修改 Info.plist: ${infoPlistPath}`);

// 检查是否已经包含 CFBundleDocumentTypes
try {
  execSync(`plutil -extract CFBundleDocumentTypes "${infoPlistPath}" > /dev/null 2>&1`, {
    encoding: 'utf8'
  });
  console.log('Info.plist 已经包含 CFBundleDocumentTypes，跳过修改');
  process.exit(0);
} catch (e) {
  // 不存在，继续添加
}

// 读取现有的 Info.plist
let plistContent = fs.readFileSync(infoPlistPath, 'utf8');

// 创建文件关联配置的 XML
const documentTypesXML = `	<key>CFBundleDocumentTypes</key>
	<array>
		<dict>
			<key>CFBundleTypeName</key>
			<string>All Files</string>
			<key>CFBundleTypeRole</key>
			<string>Editor</string>
			<key>LSItemContentTypes</key>
			<array>
				<string>public.data</string>
				<string>public.content</string>
				<string>public.item</string>
				<string>public.directory</string>
			</array>
			<key>LSHandlerRank</key>
			<string>Owner</string>
		</dict>
		<dict>
			<key>CFBundleTypeName</key>
			<string>Folder</string>
			<key>CFBundleTypeRole</key>
			<string>Editor</string>
			<key>LSItemContentTypes</key>
			<array>
				<string>public.folder</string>
				<string>public.directory</string>
			</array>
			<key>LSHandlerRank</key>
			<string>Owner</string>
		</dict>
	</array>
`;

// 在 </dict> 之前插入配置
if (plistContent.includes('CFBundleDocumentTypes')) {
  console.log('Info.plist 已经包含 CFBundleDocumentTypes，跳过修改');
  process.exit(0);
}

// 找到最后一个 </dict> 并在之前插入
const lastDictIndex = plistContent.lastIndexOf('</dict>');
if (lastDictIndex === -1) {
  console.error('错误: 无法找到 </dict> 标签');
  process.exit(1);
}

const newContent = plistContent.slice(0, lastDictIndex) + documentTypesXML + '\t' + plistContent.slice(lastDictIndex);

// 写回文件
fs.writeFileSync(infoPlistPath, newContent, 'utf8');

// 验证修改
try {
  execSync(`plutil -lint "${infoPlistPath}"`, { encoding: 'utf8' });
  console.log('成功添加文件关联配置到 Info.plist');
} catch (e) {
  console.error('警告: Info.plist 格式可能有问题，请检查');
  process.exit(1);
}


/**
 * 路径工具函数
 * 在浏览器环境中模拟 Node.js path 模块的基本功能
 */

export function joinPath(...parts: string[]): string {
  return parts.join('/').replace(/\/+/g, '/');
}

export function dirname(path: string): string {
  const parts = path.split('/');
  parts.pop();
  return parts.join('/');
}

export function basename(path: string): string {
  const parts = path.split('/');
  return parts[parts.length - 1] || '';
}

export function extname(path: string): string {
  const basename = path.split('/').pop() || '';
  const dotIndex = basename.lastIndexOf('.');
  return dotIndex > 0 ? basename.slice(dotIndex) : '';
}

export function normalize(path: string): string {
  return path.replace(/\/+/g, '/').replace(/\/$/, '') || '/';
}

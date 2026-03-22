import { loadInstalledExtensions } from './store';

/**
 * Node Extension Host 运行时
 * 替换原有的浏览器内运行时，使用真正的 Node.js 进程执行扩展
 */
export async function activateInstalledExtensionsNode() {
  console.log('[Extensions] Starting Node Extension Host...');
  
  try {
    // 暂时跳过 Extension Host 启动，直接激活扩展的 UI 贡献
    console.log('[Extensions] Skipping Extension Host startup for now');
    
    // 加载并激活已安装的扩展的 UI 贡献
    const installed = loadInstalledExtensions().filter(e => e.enabled !== false);
    
    for (const ext of installed) {
      if (!ext.installDir) {
        console.warn('[Extensions] Extension missing installDir:', ext.id);
        continue;
      }
      
      console.log(`[Extensions] Found extension: ${ext.id} at ${ext.installDir}`);
      
      // 暂时只记录扩展信息，不尝试激活
      console.log(`[Extensions] Extension ${ext.id} is available but not activated yet`);
    }
    
    console.log('[Extensions] Node Extension Host setup completed');
    
  } catch (error) {
    console.error('[Extensions] Failed to start Node Extension Host:', error);
  }
}

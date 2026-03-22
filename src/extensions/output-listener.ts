/**
 * 扩展输出监听器
 * 监听来自 Node Extension Host 的输出事件并显示在 Output 面板
 */

export function listenForOutputEvents() {
  window.addEventListener('extensions-output', (event) => {
    const detail = (event as CustomEvent).detail;
    if (detail && detail.channel && detail.text) {
      console.log(`[Extensions][${detail.channel}] ${detail.text}`);
      // 这里可以集成到 Output 面板
    }
  });
}

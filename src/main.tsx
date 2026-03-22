import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App.tsx'
import './index.css'
import { initTheme } from '@/theme/theme'

// 静默处理 xterm.js RenderService 错误
const originalError = console.error;
console.error = (...args) => {
  const message = String(args[0] || '');
  const errorString = message + ' ' + args.slice(1).map(String).join(' ');
  
  if (errorString.includes('Cannot read properties of undefined (reading \'dimensions\')') ||
      errorString.includes('get dimensions') ||
      errorString.includes('RenderService') ||
      errorString.includes('Viewport._innerRefresh') ||
      errorString.includes('t2.Viewport._innerRefresh')) {
    // 静默忽略 RenderService 相关错误
    return;
  }
  originalError.apply(console, args);
};

// 静默处理全局错误事件
window.addEventListener('error', (event) => {
  const errorString = String(event.message || '');
  if (errorString.includes('Cannot read properties of undefined (reading \'dimensions\')') ||
      errorString.includes('get dimensions') ||
      errorString.includes('RenderService') ||
      errorString.includes('Viewport._innerRefresh') ||
      errorString.includes('t2.Viewport._innerRefresh')) {
    event.preventDefault();
    return false;
  }
});

// 静默处理未捕获的 Promise 错误
window.addEventListener('unhandledrejection', (event) => {
  const errorString = String(event.reason?.message || event.reason || '');
  if (errorString.includes('Cannot read properties of undefined (reading \'dimensions\')') ||
      errorString.includes('get dimensions') ||
      errorString.includes('RenderService') ||
      errorString.includes('Viewport._innerRefresh') ||
      errorString.includes('t2.Viewport._innerRefresh')) {
    event.preventDefault();
    return false;
  }

  // Monaco (and some editor integrations) may reject promises with a cancellation error during model switches.
  // This is expected and should not surface as an unhandled rejection.
  if (
    errorString === 'Canceled' ||
    errorString === 'Cancelled' ||
    errorString.includes('Canceled: Canceled') ||
    errorString.includes('Cancelled: Cancelled')
  ) {
    event.preventDefault();
    return false;
  }
});

initTheme()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>,
)

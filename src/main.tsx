import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App.tsx'
import './index.css'
import { initTheme } from '@/theme/theme'

// 静默处理 xterm.js RenderService 错误
const originalError = console.error;
console.error = (...args) => {
  const message = args[0];
  if (typeof message === 'string' && message.includes('Cannot read properties of undefined (reading \'dimensions\')')) {
    // 静默忽略 RenderService 错误
    return;
  }
  originalError.apply(console, args);
};

// 静默处理全局错误事件
window.addEventListener('error', (event) => {
  if (event.message && event.message.includes('Cannot read properties of undefined (reading \'dimensions\')')) {
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

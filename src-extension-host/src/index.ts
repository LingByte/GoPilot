#!/usr/bin/env node

import { ExtensionHost } from './extension-host';

// 启动 Extension Host
const host = new ExtensionHost();

console.log('[ExtensionHost] Started');

export { ExtensionHost };

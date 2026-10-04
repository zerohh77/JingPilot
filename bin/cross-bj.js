#!/usr/bin/env node

console.error('提示：cross-bj 已弃用，请改用 jingpilot；当前兼容别名将在后续版本移除。');
await import('./jingpilot.js');

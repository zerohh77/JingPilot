#!/usr/bin/env node

import { homedir } from 'node:os';
import { migrateLegacyData } from '../src/lib/migration.js';

try {
  const result = migrateLegacyData({ home: homedir() });
  console.log('JingPilot 配置、state 与日志迁移完成');
  console.log(`备份目录：${result.backupDir}`);
  console.log(`live-submit：${result.manifest.preserved.live_submit_confirmed ? 'enabled' : 'disabled'}`);
  console.log(`pending_attempt：${result.manifest.preserved.pending_attempt ? 'present' : 'clear'}`);
} catch (error) {
  console.error(`迁移失败：${error.message}`);
  process.exitCode = 1;
}

#!/usr/bin/env node

import { KeychainStore, KEYCHAIN_SERVICE, LEGACY_KEYCHAIN_SERVICE } from '../src/lib/keychain.js';

try {
  const result = new KeychainStore().migrateLegacyAccounts();
  console.log(`Keychain namespace：${LEGACY_KEYCHAIN_SERVICE} → ${KEYCHAIN_SERVICE}`);
  console.log(`已迁移并回读验证：${result.migrated.join(', ')}`);
  if (result.skipped.length) console.log(`旧条目不存在，已跳过：${result.skipped.join(', ')}`);
  console.log('旧 Keychain 条目已保留用于回滚；未输出任何 secret');
} catch (error) {
  console.error(`Keychain 迁移失败：${error.message}`);
  process.exitCode = 1;
}

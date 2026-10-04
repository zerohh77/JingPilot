import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { migrateLegacyData, migrationPaths } from '../src/lib/migration.js';

test('旧 config/state/log 复制校验后原子迁移，安全状态和旧文件保持不变', () => {
  const home = mkdtempSync(join(tmpdir(), 'jingpilot-migration-'));
  const paths = migrationPaths(home);
  mkdirSync(paths.legacyConfigDir, { recursive: true });
  mkdirSync(paths.legacyDataDir, { recursive: true });
  mkdirSync(paths.legacyLogDir, { recursive: true });
  mkdirSync(paths.olderLogDir, { recursive: true });
  mkdirSync(join(home, 'Library', 'LaunchAgents'), { recursive: true });

  const config = { version: 2, entry_type: '六环外', live_submit_confirmed: true };
  const state = { version: 1, last_apply_result: 'confirmed', pending_attempt: { fingerprint: 'test-only' } };
  writeFileSync(paths.legacyConfig, `${JSON.stringify(config)}\n`, { mode: 0o600 });
  writeFileSync(paths.legacyState, `${JSON.stringify(state)}\n`, { mode: 0o600 });
  writeFileSync(join(paths.legacyDataDir, 'run.lock'), '{"pid":999999}', { mode: 0o600 });
  writeFileSync(join(paths.legacyLogDir, 'scheduler.log'), 'old log\n', { mode: 0o600 });
  writeFileSync(join(paths.olderLogDir, 'older.log'), 'older log\n', { mode: 0o600 });

  const result = migrateLegacyData({ home, now: new Date('2026-09-22T08:00:00.000Z') });
  assert.deepEqual(JSON.parse(readFileSync(join(paths.dataDir, 'config.json'), 'utf8')), config);
  assert.deepEqual(JSON.parse(readFileSync(join(paths.dataDir, 'state.json'), 'utf8')), state);
  assert.equal(result.manifest.preserved.live_submit_confirmed, true);
  assert.deepEqual(result.manifest.preserved.pending_attempt, state.pending_attempt);
  assert.equal(existsSync(join(paths.dataDir, 'run.lock')), false, '瞬时锁不能迁入新运行目录');
  assert.equal(readFileSync(join(paths.logDir, 'imported-cross-bj', 'scheduler.log'), 'utf8'), 'old log\n');
  assert.equal(readFileSync(join(paths.logDir, 'legacy', 'jinjingzheng', 'older.log'), 'utf8'), 'older log\n');
  assert.equal(existsSync(paths.legacyConfig), true);
  assert.equal(existsSync(paths.legacyState), true);
  assert.equal(existsSync(join(result.backupDir, 'legacy-data', 'run.lock')), true);
  rmSync(home, { recursive: true, force: true });
});

test('目标目录已存在时 fail closed，不覆盖生产数据', () => {
  const home = mkdtempSync(join(tmpdir(), 'jingpilot-migration-stop-'));
  const paths = migrationPaths(home);
  mkdirSync(paths.legacyConfigDir, { recursive: true });
  mkdirSync(paths.legacyDataDir, { recursive: true });
  mkdirSync(paths.dataDir, { recursive: true });
  writeFileSync(paths.legacyConfig, '{}');
  writeFileSync(paths.legacyState, '{}');
  assert.throws(() => migrateLegacyData({ home }), /目标目录已存在/);
  rmSync(home, { recursive: true, force: true });
});

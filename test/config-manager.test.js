import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadConfig, saveConfig, validateConfig } from '../src/lib/config-manager.js';

test('配置文件不写入 password、token 或通知 secret，并使用 0600', () => {
  const dir = mkdtempSync(join(tmpdir(), 'jingpilot-config-'));
  const path = join(dir, 'config.json');
  saveConfig({
    entry_type: '六环外',
    auth: 'token-secret',
    bjt_phone: 'TEST-PHONE',
    bjt_pwd: 'password-secret',
    notify_urls: ['bark://secret'],
  }, { path });
  const raw = readFileSync(path, 'utf8');
  assert.doesNotMatch(raw, /token-secret|password-secret|TEST-PHONE|bark:\/\/secret/);
  assert.equal(statSync(path).mode & 0o777, 0o600);
  assert.equal(loadConfig({ path }).entry_type, '六环外');
  rmSync(dir, { recursive: true, force: true });
});

test('配置层拒绝保存或使用六环内自动申请类型', () => {
  const dir = mkdtempSync(join(tmpdir(), 'jingpilot-config-forbidden-'));
  const path = join(dir, 'config.json');
  assert.throws(() => saveConfig({ entry_type: '六环内' }, { path }), /仅允许六环外/);
  assert.throws(() => validateConfig({ entry_type: '六环内' }), /六环内配置已被禁止/);
  rmSync(dir, { recursive: true, force: true });
});

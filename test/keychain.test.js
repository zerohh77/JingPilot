import test from 'node:test';
import assert from 'node:assert/strict';
import { JingPilotError } from '../src/lib/errors.js';
import { KeychainStore, KEYCHAIN_SERVICE, LEGACY_KEYCHAIN_SERVICE } from '../src/lib/keychain.js';

function memoryRunner(initial = {}) {
  const values = new Map(Object.entries(initial));
  const runner = (args) => {
    const command = args[0];
    const service = args[args.indexOf('-s') + 1];
    const account = args[args.indexOf('-a') + 1];
    const key = `${service}/${account}`;
    if (command === 'find-generic-password') {
      if (!values.has(key)) throw new JingPilotError('missing', { code: 'KEYCHAIN_ERROR' });
      return values.get(key);
    }
    if (command === 'add-generic-password') {
      values.set(key, args[args.indexOf('-w') + 1]);
      return '';
    }
    throw new Error(`unexpected command: ${command}`);
  };
  return { runner, values };
}

test('新 Keychain 条目缺失时只读回退旧 namespace', () => {
  const memory = memoryRunner({ [`${LEGACY_KEYCHAIN_SERVICE}/bjt-phone`]: 'test-phone' });
  const store = new KeychainStore({ runner: memory.runner });
  assert.equal(store.get('bjt-phone'), 'test-phone');
});

test('没有任何通知 Keychain 条目时视为未配置', () => {
  const store = new KeychainStore({ runner: memoryRunner().runner });
  assert.deepEqual(store.getNotifyUrls(), []);
});

test('Keychain 迁移写入新 namespace 并回读验证，旧条目保留', () => {
  const memory = memoryRunner({
    [`${LEGACY_KEYCHAIN_SERVICE}/bjt-phone`]: 'test-phone',
    [`${LEGACY_KEYCHAIN_SERVICE}/bjt-password`]: 'test-password',
  });
  const result = new KeychainStore({ runner: memory.runner }).migrateLegacyAccounts();
  assert.deepEqual(result.migrated, ['bjt-phone', 'bjt-password']);
  assert.deepEqual(result.skipped, ['notify-urls']);
  assert.equal(memory.values.get(`${KEYCHAIN_SERVICE}/bjt-phone`), 'test-phone');
  assert.equal(memory.values.get(`${LEGACY_KEYCHAIN_SERVICE}/bjt-phone`), 'test-phone');
});

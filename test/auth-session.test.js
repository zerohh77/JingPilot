import test from 'node:test';
import assert from 'node:assert/strict';
import { AuthenticatedApi } from '../src/lib/auth-session.js';
import { AuthError } from '../src/lib/errors.js';

test('401 时重新认证一次并重试查询', async () => {
  let loginCount = 0;
  const client = new AuthenticatedApi({
    credentialsProvider: () => ({ phone: 'TEST-PHONE', password: 'TEST-PASSWORD' }),
    loginFn: async () => `token-${++loginCount}`,
    apiFactory: (token) => ({
      ensureSession: async () => {},
      getStateData: async () => {
        if (token === 'token-1') throw new AuthError();
        return { ok: true };
      },
    }),
  });
  assert.deepEqual(await client.getStateData(), { ok: true });
  assert.equal(loginCount, 2);
});

test('重新认证后仍 401 时停止，不无限循环', async () => {
  let loginCount = 0;
  const client = new AuthenticatedApi({
    credentialsProvider: () => ({ phone: 'TEST-PHONE', password: 'TEST-PASSWORD' }),
    loginFn: async () => `token-${++loginCount}`,
    apiFactory: () => ({ ensureSession: async () => {}, getStateData: async () => { throw new AuthError(); } }),
  });
  await assert.rejects(() => client.getStateData(), /重新认证后仍然失败/);
  assert.equal(loginCount, 2);
});

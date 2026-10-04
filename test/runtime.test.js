import test from 'node:test';
import assert from 'node:assert/strict';
import { createSafeNotificationSender } from '../src/lib/runtime.js';

test('通知 Keychain 读取失败时返回 rejected，绝不向主流程抛错', async () => {
  const warnings = [];
  const send = createSafeNotificationSender({
    keychain: { getNotifyUrls() { throw new Error('keychain unavailable'); } },
    logger: { warn(message) { warnings.push(message); } },
  });
  const results = await send('标题', '正文');
  assert.equal(results[0].status, 'rejected');
  assert.match(warnings[0], /不影响主流程/);
});

test('未配置通知时安全跳过，不读取 Webhook 或调用发送层', async () => {
  let deliveries = 0;
  const send = createSafeNotificationSender({
    keychain: { getNotifyUrls() { return []; } },
    logger: { info() { throw new Error('不应记录发送结果'); } },
    deliver: async () => { deliveries += 1; throw new Error('不应发送'); },
  });
  assert.deepEqual(await send('标题', '正文'), []);
  assert.equal(deliveries, 0);
});

test('通知实现异常和通知日志异常均不向主流程抛错', async () => {
  const send = createSafeNotificationSender({
    keychain: { getNotifyUrls() { return ['wecom://test']; } },
    logger: {
      warn() { throw new Error('log unavailable'); },
    },
    deliver: async () => { throw new Error('delivery unavailable'); },
  });
  const results = await send('标题', '正文');
  assert.equal(results[0].status, 'rejected');
});

test('通知展示日期透传到发送层，不改变 best-effort 结果', async () => {
  const displayDetails = { validFrom: '2026-10-01', validTo: '2026-10-07' };
  const send = createSafeNotificationSender({
    keychain: { getNotifyUrls() { return ['wecom://test']; } },
    logger: { info() {} },
    deliver: async (urls, title, body, received) => {
      assert.deepEqual(urls, ['wecom://test']);
      assert.equal(title, '进京证自动续办已提交');
      assert.equal(body, '正文');
      assert.deepEqual(received, displayDetails);
      return [{ status: 'fulfilled' }];
    },
  });
  assert.equal((await send('进京证自动续办已提交', '正文', displayDetails))[0].status, 'fulfilled');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { isSupportedNotifyUrl, normalizeNotifyUrl, notify, testNotify } from '../src/lib/notifier.js';
import { formatRunMessage, successfulRunNotification } from '../src/commands/run.js';
import { formatWeComText } from '../src/lib/wecom-text.js';

const fullWebhook = 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=test-key-not-real';

test('企业微信完整 Webhook 转换为 Keychain 通知格式', () => {
  assert.equal(normalizeNotifyUrl(fullWebhook), 'wecom://test-key-not-real');
  assert.equal(isSupportedNotifyUrl(fullWebhook), true);
  assert.equal(isSupportedNotifyUrl('https://example.com/hook'), false);
});

test('无人值守无操作结果生成脱敏事件消息', () => {
  const event = successfulRunNotification({
    outcome: 'no-action',
    vehicle: { licenseNumber: '京TST01' },
    decision: { record: { statusName: '审核通过(生效中)' }, reason: '当前证件仍在有效期内' },
  });
  assert.equal(event.title, 'JingPilot 自动检查完成');
  assert.match(event.body, /京\*\*\*01/);
  assert.doesNotMatch(event.body, /京TST01/);
});

test('企业微信 errcode=0 才算发送成功', async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (url, options) => {
    assert.equal(url, fullWebhook);
    const payload = JSON.parse(options.body);
    assert.equal(payload.msgtype, 'text');
    assert.equal(payload.text.content, [
      '✅ JingPilot 自动续办已提交',
      '',
      '车辆：京***12',
      '类型：六环外',
      '申请日期：2026-10-01',
      '有效期：2026-10-01 → 2026-10-07',
      '当前状态：审核中',
      '',
      '提交结果已通过 stateList 确认。',
    ].join('\n'));
    return { ok: true, json: async () => ({ errcode: 0, errmsg: 'ok' }) };
  };
  const [result] = await notify(
    ['wecom://test-key-not-real'],
    '进京证自动续办已提交',
    '车辆：京***12\n类型：六环外\n申请日期：2026-10-01\n状态：审核中',
    { validFrom: '2026-10-01', validTo: '2026-10-07' },
  );
  assert.equal(result.status, 'fulfilled');
});

test('四类企业微信事件使用统一普通文本模板，不含 Markdown 标记', () => {
  const cases = [
    {
      title: '进京证自动续办已提交',
      body: '车辆：京***12\n类型：六环外\n申请日期：2026-10-01\n状态：审核中',
      expected: '✅ JingPilot 自动续办已提交\n\n车辆：京***12\n类型：六环外\n申请日期：2026-10-01\n当前状态：审核中\n\n提交结果已通过 stateList 确认。',
    },
    {
      title: '进京证新证审核通过',
      body: '车辆：京***12\n类型：六环外\n状态：审核通过（待生效）',
      expected: '✅ JingPilot 新证审核通过\n\n车辆：京***12\n类型：六环外\n当前状态：审核通过（待生效）\n\n新证已审核通过，JingPilot 将继续管理下一续办周期。',
    },
    {
      title: '进京证自动续办异常',
      body: '阶段：认证\n错误：登录失败',
      expected: '⚠️ JingPilot 自动运行异常\n\n阶段：认证\n错误：登录失败\n提交状态：未继续提交\n\n本轮已安全停止，请检查。\nJingPilot 不会在状态不确定时重复提交。',
    },
    {
      title: '进京证自动续办已确认',
      body: '车辆：京***12\n类型：六环外\n申请日期：2026-10-01\n状态：审核中',
      expected: '✅ JingPilot 历史提交已确认\n\n车辆：京***12\n类型：六环外\n申请日期：2026-10-01\n当前状态：审核中\n\n此前处于未确认状态的申请，现已确认存在。\n无需再次提交。',
    },
  ];
  for (const { title, body, expected } of cases) {
    const content = formatWeComText(title, body);
    assert.equal(content, expected);
    assert.doesNotMatch(content, /^## |^> |`/m);
    assert.doesNotMatch(content, /pending|timeout/i);
  }
});

test('三类确认通知只展示已提供的完整真实有效期', () => {
  const period = { validFrom: '2026-10-01', validTo: '2026-10-07' };
  const cases = [
    {
      title: '进京证自动续办已提交',
      body: '车辆：京***12\n类型：六环外\n申请日期：2026-10-01\n状态：审核中',
      expected: '申请日期：2026-10-01\n有效期：2026-10-01 → 2026-10-07\n当前状态：审核中',
    },
    {
      title: '进京证新证审核通过',
      body: '车辆：京***12\n类型：六环外\n状态：审核通过（待生效）',
      expected: '类型：六环外\n有效期：2026-10-01 → 2026-10-07\n当前状态：审核通过（待生效）',
    },
    {
      title: '进京证自动续办已确认',
      body: '车辆：京***12\n类型：六环外\n申请日期：2026-10-01\n状态：审核中',
      expected: '申请日期：2026-10-01\n有效期：2026-10-01 → 2026-10-07\n当前状态：审核中',
    },
  ];
  for (const { title, body, expected } of cases) {
    const content = formatWeComText(title, body, period);
    assert.ok(content.includes(expected));
    for (const incomplete of [undefined, {}, { validFrom: period.validFrom }, { validTo: period.validTo }, { validFrom: period.validFrom, validTo: 'invalid' }]) {
      const fallback = formatWeComText(title, body, incomplete);
      assert.doesNotMatch(fallback, /有效期：|undefined|null/);
    }
  }
  const abnormal = formatWeComText('进京证自动续办异常', '阶段：认证\n错误：登录失败', period);
  assert.doesNotMatch(abnormal, /有效期：/);
  assert.equal(abnormal, '⚠️ JingPilot 自动运行异常\n\n阶段：认证\n错误：登录失败\n提交状态：未继续提交\n\n本轮已安全停止，请检查。\nJingPilot 不会在状态不确定时重复提交。');
});

test('固定保底地点仅在实际使用时出现在确认通知和 CLI 结果', () => {
  const body = '车辆：京***12\n类型：六环外\n申请日期：2026-10-01\n状态：审核中';
  for (const title of ['进京证自动续办已提交', '进京证自动续办已确认']) {
    assert.match(formatWeComText(title, body, { usedFixedDestination: true }), /⚠️ 目的地：已使用用户确认的固定保底地点/);
    assert.doesNotMatch(formatWeComText(title, body), /固定保底地点/);
  }
  const result = { outcome: 'submitted-confirmed', record: { statusName: '审核中' }, usedFixedDestination: true };
  assert.match(formatRunMessage(result), /⚠️ 目的地：已使用用户确认的固定保底地点/);
  assert.doesNotMatch(formatRunMessage({ ...result, usedFixedDestination: false }), /固定保底地点/);
  assert.match(formatRunMessage({
    outcome: 'dry-run', vehicle: { licenseNumber: '京TST01' }, entryType: '六环外',
    applyDate: '2026-10-01', usedFixedDestination: true,
  }), /⚠️ 目的地：已使用用户确认的固定保底地点/);
});

test('动态敏感字段脱敏，日常无需续办通知仍为普通文本', async (context) => {
  const message = formatWeComText('进京证自动续办异常', '阶段：认证\n错误：手机号 13800000000；Authorization: Bearer-token；https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=secret-key');
  assert.doesNotMatch(message, /13800000000|Bearer-token|secret-key/);
  const submitted = formatWeComText('进京证自动续办已提交', '车辆：京TST01\n类型：六环外\n申请日期：2026-10-01\n状态：审核中');
  assert.match(submitted, /车辆：京\*\*\*01/);
  assert.doesNotMatch(submitted, /京TST01/);

  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (_url, options) => {
    const payload = JSON.parse(options.body);
    assert.equal(payload.msgtype, 'text');
    assert.match(payload.text.content, /JingPilot 自动检查完成/);
    return { ok: true, json: async () => ({ errcode: 0 }) };
  };
  const [result] = await notify(['wecom://test-key-not-real'], 'JingPilot 自动检查完成', '结果：无需续办');
  assert.equal(result.status, 'fulfilled');
});

test('企业微信测试通知使用普通文本', async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (_url, options) => {
    const payload = JSON.parse(options.body);
    assert.equal(payload.msgtype, 'text');
    assert.equal(payload.text.content, '✅ JingPilot 通知测试\n\n企业微信通知通道工作正常。\n此消息用于验证企业微信与微信端的文本显示。');
    return { ok: true, json: async () => ({ errcode: 0 }) };
  };
  const [result] = await testNotify(['wecom://test-key-not-real']);
  assert.equal(result.status, 'fulfilled');
});

test('企业微信 HTTP 200 但业务错误仍判为失败', async (context) => {
  const originalFetch = globalThis.fetch;
  const originalError = console.error;
  const logged = [];
  context.after(() => { globalThis.fetch = originalFetch; });
  context.after(() => { console.error = originalError; });
  console.error = (...args) => logged.push(args.join(' '));
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({ errcode: 93000, errmsg: 'invalid webhook key: test-key-not-real' }),
  });
  const [result] = await notify(['wecom://test-key-not-real'], '标题', '正文');
  assert.equal(result.status, 'rejected');
  assert.match(result.reason.message, /WeCom API 93000/);
  assert.doesNotMatch(result.reason.message, /test-key-not-real/);
  assert.doesNotMatch(logged.join(' '), /test-key-not-real/);
});

test('企业微信网络异常不向日志或失败原因暴露 Webhook secret', async (context) => {
  const originalFetch = globalThis.fetch;
  const originalError = console.error;
  const logged = [];
  context.after(() => { globalThis.fetch = originalFetch; });
  context.after(() => { console.error = originalError; });
  console.error = (...args) => logged.push(args.join(' '));
  globalThis.fetch = async () => { throw new Error(`request to ${fullWebhook} failed`); };
  const [result] = await notify(['wecom://test-key-not-real'], '标题', '正文');
  assert.equal(result.status, 'rejected');
  assert.equal(result.reason.message, 'WeCom 网络请求失败');
  assert.doesNotMatch(logged.join(' '), /test-key-not-real/);
});

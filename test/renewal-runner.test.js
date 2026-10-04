import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { RenewalRunner } from '../src/lib/renewal-runner.js';
import { StateStore } from '../src/lib/state-store.js';
import { TransportError, SafetyError } from '../src/lib/errors.js';
import { record, stateData, vehicleDetail } from './fixtures.js';
import { fingerprintOfficialMapLocation } from '../src/lib/official-map.js';
import { createSafeNotificationSender } from '../src/lib/runtime.js';

const noopLogger = { info() {}, warn() {}, error() {} };

function setup({ states, submit, config = {}, sendNotification, applicationDetail, districtItems, locationResolver, logger = noopLogger } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'jingpilot-runner-'));
  const store = new StateStore({ path: join(dir, 'state.json') });
  let submitCount = 0;
  let stateIndex = 0;
  const api = {
    getStateData: async () => states[Math.min(stateIndex++, states.length - 1)],
    listVehicles: async () => [vehicleDetail()],
    getUserInfo: async () => ({ jsrxm: '测试用户', jszh: 'TEST-ID-NOT-REAL' }),
    getApplicationDetail: async (applyId, applyTime) => [applicationDetail || record('审核通过(生效中)', { applyId, sqsj: applyTime })],
    queryDictionary: async (type) => ({
      jjmd: [{ zdbm: '06', zdz: '其它' }],
      jjlk: [{ zdbm: '00606', zdz: '其他道路' }],
      qjxz: districtItems || [{ zdbm: '010', zdz: '昌平区' }],
    })[type],
    submitApply: async (payload) => {
      submitCount += 1;
      return submit ? submit(payload) : { code: 200 };
    },
  };
  const notifications = [];
  const runner = new RenewalRunner({
    api,
    config: {
      entry_type: '六环外',
      preferred_vehicle: '',
      application_defaults: {},
      confirm_delay_ms: 1,
      official_map_lookup_confirmed: false,
      live_submit_confirmed: true,
      ...config,
    },
    stateStore: store,
    logger,
    sendNotification: sendNotification || (async (title, body, displayDetails) => {
      notifications.push({ title, body, displayDetails });
      return [{ status: 'fulfilled', value: undefined }];
    }),
    sleep: async () => {},
    now: () => new Date(2026, 8, 22, 9, 0, 0),
    ...(locationResolver ? { locationResolver } : {}),
  });
  return { runner, store, notifications, getSubmitCount: () => submitCount, getStateCount: () => stateIndex, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

const oldState = stateData({ primary: [record('审核通过(生效中)')] });
const confirmedState = stateData({
  primary: [record('审核通过(生效中)')],
  secondary: [record('审核中', { applyId: 'apply-new', yxqs: '2026-09-23', yxqz: '' })],
});
const fixedDestination = {
  confirmed: true,
  name: '测试地铁站',
  area: '海淀区',
  longitude: '11.111111',
  latitude: '22.222222',
  fingerprint: fingerprintOfficialMapLocation(11.111111, 22.222222),
};

test('未配置通知时模拟查询与已确认提交流程均正常', async () => {
  const sendNotification = createSafeNotificationSender({
    keychain: { getNotifyUrls() { return []; } },
    logger: noopLogger,
    deliver: async () => { throw new Error('未配置通知时不应调用发送层'); },
  });
  const noActionState = stateData({
    primary: [record('审核通过(生效中)', { yxqz: '2026-09-30' })],
  });
  const checking = setup({ states: [noActionState], sendNotification });
  assert.equal((await checking.runner.run({ dryRun: true })).outcome, 'no-action');
  assert.equal(checking.getSubmitCount(), 0);
  checking.cleanup();

  const applying = setup({ states: [oldState, oldState, confirmedState], sendNotification });
  assert.equal((await applying.runner.run()).outcome, 'submitted-confirmed');
  assert.equal(applying.getSubmitCount(), 1);
  assert.equal(applying.store.load().pending_attempt, null);
  applying.cleanup();
});

test('真实流程二次查询后只 POST 一次，并由 stateList 确认', async () => {
  const messages = [];
  const context = setup({ states: [oldState, oldState, confirmedState], logger: { info: (message) => messages.push(message) } });
  const result = await context.runner.run();
  assert.equal(result.outcome, 'submitted-confirmed');
  assert.equal(context.getSubmitCount(), 1);
  assert.equal(context.store.load().pending_attempt, null);
  assert.equal(context.store.load().last_apply_id, 'apply-new');
  assert.match(messages.join('\n'), /二次确认成功：审核中/);
  assert.doesNotMatch(messages.join('\n'), /applyId=/);
  context.cleanup();
});

test('提交确认通知仅透传新申请的 stateList 有效期，不额外查询', async () => {
  const newState = stateData({
    primary: [record('审核通过(生效中)')],
    secondary: [record('审核中', { applyId: 'apply-new', yxqs: '2026-09-23', yxqz: '2026-09-29' })],
  });
  const context = setup({ states: [oldState, oldState, newState] });
  assert.equal((await context.runner.run()).outcome, 'submitted-confirmed');
  assert.equal(context.getStateCount(), 3);
  assert.deepEqual(context.notifications[0].displayDetails, { validFrom: '2026-09-23', validTo: '2026-09-29' });
  context.cleanup();
});

test('提交确认的新申请缺少到期日时不推算日期', async () => {
  const context = setup({ states: [oldState, oldState, confirmedState] });
  assert.equal((await context.runner.run()).outcome, 'submitted-confirmed');
  assert.deepEqual(context.notifications[0].displayDetails, { validFrom: '2026-09-23', validTo: '' });
  context.cleanup();
});

test('dry-run 展示动作但绝不 POST', async () => {
  const context = setup({ states: [oldState] });
  const result = await context.runner.run({ dryRun: true });
  assert.equal(result.outcome, 'dry-run');
  assert.equal(context.getSubmitCount(), 0);
  context.cleanup();
});

test('任意旧证地点无法还原时使用已确认固定地点，仍经过区县字典与 payload 校验', async () => {
  const context = setup({
    states: [oldState],
    config: {
      official_map_lookup_confirmed: true,
      official_map_location_fingerprint: fingerprintOfficialMapLocation(11.111111, 22.222222),
      fixed_destination_fallback: {
        confirmed: true,
        name: '测试地铁站',
        area: '海淀区',
        longitude: '11.111111',
        latitude: '22.222222',
        fingerprint: fingerprintOfficialMapLocation(11.111111, 22.222222),
      },
    },
    applicationDetail: record('审核通过(生效中)', {
      xxdz: '旧证另一目的地', area: '', jjdq: '', jjdzgdjd: '', jjdzgdwd: '',
    }),
    districtItems: [{ zdbm: '006', zdz: '海淀区' }],
    locationResolver: async (_address, options) => {
      assert.equal(options.selectionFingerprint, '');
      throw new SafetyError('地图结果不唯一', { code: 'MAP_LOCATION_AMBIGUOUS' });
    },
  });
  const first = await context.runner.inspect();
  const payload = await context.runner.loadPayload(first);
  assert.equal(payload.xxdz, '测试地铁站');
  assert.equal(payload.area, '海淀区');
  assert.equal(payload.jjdq, '006');
  assert.equal(payload.jjdzgdjd, '11.111111');
  assert.equal(payload.jjdzgdwd, '22.222222');
  assert.equal(payload.jjzzl, '02');
  assert.equal(context.getSubmitCount(), 0);
  context.cleanup();
});

test('固定地点回退时 dry-run 返回特殊提示标记且不 POST', async () => {
  const context = setup({
    states: [oldState],
    config: { official_map_lookup_confirmed: true, fixed_destination_fallback: fixedDestination },
    applicationDetail: record('审核通过(生效中)', {
      xxdz: '旧证另一目的地', area: '', jjdq: '', jjdzgdjd: '', jjdzgdwd: '',
    }),
    districtItems: [{ zdbm: '006', zdz: '海淀区' }],
    locationResolver: async () => { throw new SafetyError('地图结果不唯一', { code: 'MAP_LOCATION_AMBIGUOUS' }); },
  });
  const result = await context.runner.run({ dryRun: true });
  assert.equal(result.usedFixedDestination, true);
  assert.equal(context.getSubmitCount(), 0);
  context.cleanup();
});

test('固定地点回退后提交确认通知携带特殊提示标记', async () => {
  const context = setup({
    states: [oldState, oldState, confirmedState],
    config: { official_map_lookup_confirmed: true, fixed_destination_fallback: fixedDestination },
    applicationDetail: record('审核通过(生效中)', {
      xxdz: '旧证另一目的地', area: '', jjdq: '', jjdzgdjd: '', jjdzgdwd: '',
    }),
    districtItems: [{ zdbm: '006', zdz: '海淀区' }],
    locationResolver: async () => { throw new SafetyError('地图结果不唯一', { code: 'MAP_LOCATION_AMBIGUOUS' }); },
  });
  const result = await context.runner.run();
  assert.equal(result.outcome, 'submitted-confirmed');
  assert.equal(result.usedFixedDestination, true);
  assert.equal(context.notifications[0].displayDetails.usedFixedDestination, true);
  assert.equal(context.getSubmitCount(), 1);
  context.cleanup();
});

test('同名地点由已确认指纹选中固定落点时也提示', async () => {
  const context = setup({
    states: [oldState],
    config: {
      official_map_lookup_confirmed: true,
      official_map_location_fingerprint: fixedDestination.fingerprint,
      fixed_destination_fallback: fixedDestination,
    },
    applicationDetail: record('审核通过(生效中)', {
      xxdz: '测试地铁站', area: '', jjdq: '', jjdzgdjd: '', jjdzgdwd: '',
    }),
    districtItems: [{ zdbm: '006', zdz: '海淀区' }],
    locationResolver: async () => ({ area: '海淀区', jjdzgdjd: '11.111111', jjdzgdwd: '22.222222' }),
  });
  assert.equal((await context.runner.run({ dryRun: true })).usedFixedDestination, true);
  assert.equal(context.getSubmitCount(), 0);
  context.cleanup();
});

test('其他旧证地点可唯一解析时继续沿用原地点，不启用固定回退', async () => {
  const context = setup({
    states: [oldState],
    config: {
      official_map_lookup_confirmed: true,
      official_map_location_fingerprint: fingerprintOfficialMapLocation(11.111111, 22.222222),
      fixed_destination_fallback: {
        confirmed: true, name: '测试地铁站', area: '海淀区',
        longitude: '11.111111', latitude: '22.222222',
        fingerprint: fingerprintOfficialMapLocation(11.111111, 22.222222),
      },
    },
    applicationDetail: record('审核通过(生效中)', {
      xxdz: '旧证另一目的地', area: '', jjdq: '', jjdzgdjd: '', jjdzgdwd: '',
    }),
    locationResolver: async (_address, options) => {
      assert.equal(options.selectionFingerprint, '');
      return { area: '昌平区', jjdzgdjd: '116.4', jjdzgdwd: '40.2' };
    },
  });
  let usedFixedDestination = false;
  const payload = await context.runner.loadPayload(await context.runner.inspect(), {
    onFixedDestination: () => { usedFixedDestination = true; },
  });
  assert.equal(payload.xxdz, '旧证另一目的地');
  assert.equal(payload.jjdzgdjd, '116.4');
  assert.equal(payload.jjdzgdwd, '40.2');
  assert.equal(usedFixedDestination, false);
  assert.equal(context.getSubmitCount(), 0);
  context.cleanup();
});

test('未确认真实提交时在 POST 前停止', async () => {
  const context = setup({ states: [oldState], config: { live_submit_confirmed: false } });
  await assert.rejects(() => context.runner.run(), /首次真实提交尚未获得人工确认/);
  assert.equal(context.getSubmitCount(), 0);
  context.cleanup();
});

test('HTTP timeout 后 stateList 未确认时保留 pending，下一轮不重复 POST', async () => {
  const context = setup({
    states: [oldState, oldState, oldState, oldState],
    submit: async () => { throw new TransportError('timeout', { uncertain: true, path: 'insertApplyRecord' }); },
  });
  await assert.rejects(() => context.runner.run(), TransportError);
  assert.equal(context.getSubmitCount(), 1);
  assert.equal(context.store.load().pending_attempt.outcome, 'unconfirmed');
  await assert.rejects(() => context.runner.run(), SafetyError);
  assert.equal(context.getSubmitCount(), 1);
  context.cleanup();
});

test('上一轮 timeout 但 stateList 已出现新申请时不重复 POST', async () => {
  const context = setup({ states: [confirmedState] });
  context.store.update({
    pending_attempt: {
      id: 'attempt-1',
      outcome: 'uncertain',
      plate: 'TEST-PLATE-1',
      entryType: '六环外',
      applyDate: '2026-09-23',
      previousApplyIds: ['apply-old'],
    },
  });
  const result = await context.runner.run();
  assert.equal(result.outcome, 'recovered-confirmed');
  assert.equal(context.getSubmitCount(), 0);
  assert.equal(context.store.load().pending_attempt, null);
  context.cleanup();
});

test('历史未确认提交恢复后沿用固定地点提示标记', async () => {
  const context = setup({ states: [confirmedState] });
  context.store.update({
    pending_attempt: {
      id: 'attempt-1', outcome: 'uncertain', plate: 'TEST-PLATE-1', entryType: '六环外',
      applyDate: '2026-09-23', previousApplyIds: ['apply-old'], usedFixedDestination: true,
    },
  });
  const result = await context.runner.run();
  assert.equal(result.outcome, 'recovered-confirmed');
  assert.equal(result.usedFixedDestination, true);
  assert.equal(context.notifications[0].displayDetails.usedFixedDestination, true);
  assert.equal(context.getSubmitCount(), 0);
  context.cleanup();
});

test('历史提交确认通知只使用本次找到的申请有效期', async () => {
  const messages = [];
  const newState = stateData({
    primary: [record('审核通过(生效中)')],
    secondary: [record('审核中', { applyId: 'apply-new', yxqs: '2026-09-23', yxqz: '2026-09-29' })],
  });
  const context = setup({ states: [newState], logger: { info: (message) => messages.push(message) } });
  context.store.update({
    pending_attempt: {
      id: 'attempt-1', outcome: 'uncertain', plate: 'TEST-PLATE-1', entryType: '六环外',
      applyDate: '2026-09-23', previousApplyIds: ['apply-old'],
    },
  });
  assert.equal((await context.runner.run()).outcome, 'recovered-confirmed');
  assert.equal(context.getStateCount(), 1);
  assert.deepEqual(context.notifications[0].displayDetails, { validFrom: '2026-09-23', validTo: '2026-09-29' });
  assert.match(messages.join('\n'), /历史未确认提交已由 stateList 确认/);
  assert.doesNotMatch(messages.join('\n'), /applyId=/);
  context.cleanup();
});

test('新证审核通过通知使用该申请的真实有效期', async () => {
  const approvedState = stateData({
    secondary: [record('审核通过(待生效)', { applyId: 'apply-approved', yxqs: '2026-09-23', yxqz: '2026-09-29' })],
  });
  const context = setup({ states: [approvedState] });
  assert.equal((await context.runner.run()).outcome, 'no-action');
  assert.equal(context.getStateCount(), 1);
  assert.deepEqual(context.notifications[0].displayDetails, { validFrom: '2026-09-23', validTo: '2026-09-29' });
  context.cleanup();
});

test('通知函数抛错不影响 stateList 检查和主流程结果', async () => {
  const approvedState = stateData({
    secondary: [record('审核通过(待生效)', { applyId: 'apply-approved' })],
  });
  const context = setup({
    states: [approvedState],
    sendNotification: async () => { throw new Error('notification unavailable'); },
  });
  const result = await context.runner.run();
  assert.equal(result.outcome, 'no-action');
  assert.equal(context.getSubmitCount(), 0);
  assert.deepEqual(context.store.load().notified_approval_ids, []);
  context.cleanup();
});

test('审核通过通知发送失败不记已通知，后续运行继续尝试', async () => {
  const approvedState = stateData({
    secondary: [record('审核通过(待生效)', { applyId: 'apply-approved' })],
  });
  let attempts = 0;
  const context = setup({
    states: [approvedState],
    sendNotification: async () => {
      attempts += 1;
      return [{ status: 'rejected', reason: new Error('notification unavailable') }];
    },
  });
  assert.equal((await context.runner.run()).outcome, 'no-action');
  assert.equal((await context.runner.run()).outcome, 'no-action');
  assert.equal(attempts, 2);
  assert.deepEqual(context.store.load().notified_approval_ids, []);
  context.cleanup();
});

test('提交确认通知失败不影响续办结果及已确认状态', async () => {
  const context = setup({
    states: [oldState, oldState, confirmedState],
    sendNotification: async () => { throw new Error('notification unavailable'); },
  });
  assert.equal((await context.runner.run()).outcome, 'submitted-confirmed');
  assert.equal(context.getSubmitCount(), 1);
  assert.equal(context.store.load().pending_attempt, null);
  assert.equal(context.store.load().last_apply_result, 'confirmed');
  context.cleanup();
});

test('提交异常通知明确仅本轮安全停止', async () => {
  const context = setup({
    states: [oldState, oldState],
    submit: async () => { throw new TransportError('request rejected', { uncertain: false }); },
  });
  await assert.rejects(() => context.runner.run(), TransportError);
  assert.equal(context.notifications.length, 1);
  assert.match(context.notifications[0].body, /本轮已安全停止，未继续提交，请检查。/);
  assert.doesNotMatch(context.notifications[0].body, /已停止自动操作/);
  context.cleanup();
});

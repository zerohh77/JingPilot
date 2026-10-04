import test from 'node:test';
import assert from 'node:assert/strict';
import { parseStateData } from '../src/lib/models.js';
import { decideRenewal, selectStateVehicle } from '../src/lib/renewal-policy.js';
import { SafetyError } from '../src/lib/errors.js';
import { record, stateData } from './fixtures.js';

function vehicle(options) {
  return parseStateData(stateData(options)).vehicles[0];
}

test('还有 5 天时不续办', () => {
  const value = vehicle({ primary: [record('审核通过(生效中)', { yxqz: '2026-09-26' })] });
  const decision = decideRenewal(value, '六环外', { today: '2026-09-22' });
  assert.equal(decision.action, 'none');
  assert.equal(decision.remainingDays, 5);
});

test('剩余 1 天/今天最后一天时申请明天', () => {
  const value = vehicle({ primary: [record('审核通过(生效中)', { yxqz: '2026-09-22' })] });
  const decision = decideRenewal(value, '六环外', { today: '2026-09-22' });
  assert.equal(decision.action, 'apply');
  assert.equal(decision.applyDate, '2026-09-23');
});

test('已有待生效申请时不申请', () => {
  const value = vehicle({
    primary: [record('审核通过(生效中)')],
    secondary: [record('审核通过(待生效)', { applyId: 'apply-new' })],
  });
  assert.equal(decideRenewal(value, '六环外', { today: '2026-09-22' }).action, 'none');
});

test('审核中时不申请', () => {
  const value = vehicle({ secondary: [record('审核中')] });
  assert.equal(decideRenewal(value, '六环外', { today: '2026-09-22' }).action, 'none');
});

test('无证且 API 明确允许时计划申请今天', () => {
  const value = vehicle();
  const decision = decideRenewal(value, '六环外', { today: '2026-09-22' });
  assert.equal(decision.action, 'apply');
  assert.equal(decision.applyDate, '2026-09-22');
});

test('审核通过但已失效属于可识别的终态', () => {
  const value = vehicle({ primary: [record('审核通过(已失效)')] });
  const decision = decideRenewal(value, '六环外', { today: '2026-09-22' });
  assert.equal(decision.action, 'apply');
  assert.equal(decision.reason, '审核通过(已失效)');
  assert.equal(decision.applyDate, '2026-09-22');
});

test('未知状态 fail closed', () => {
  const value = vehicle({ primary: [record('未来的新状态')] });
  assert.throws(() => decideRenewal(value, '六环外', { today: '2026-09-22' }), SafetyError);
});

test('API 未允许所选类型时停止', () => {
  const value = vehicle({ primary: [record('审核通过(生效中)')], canOutside: false });
  assert.throws(() => decideRenewal(value, '六环外', { today: '2026-09-22' }), /未明确允许/);
});

test('多车且没有明确选择时停止', () => {
  const parsed = parseStateData(stateData());
  parsed.vehicles.push({ ...parsed.vehicles[0], licenseNumber: 'TEST-PLATE-2' });
  assert.throws(() => selectStateVehicle(parsed), /多辆车/);
});

test('生效中但到期日在过去时视为日期异常，不自动申请', () => {
  const value = vehicle({ primary: [record('审核通过(生效中)', { yxqz: '2026-09-20' })] });
  assert.throws(() => decideRenewal(value, '六环外', { today: '2026-09-22' }), /矛盾/);
});

test('决策层无条件拒绝六环内自动申请', () => {
  const value = vehicle({ primary: [record('审核通过(生效中)', { yxqz: '2026-09-22' })] });
  assert.throws(
    () => decideRenewal(value, '六环内', { today: '2026-09-22' }),
    /严禁申请六环内/,
  );
});

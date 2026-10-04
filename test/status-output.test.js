import test from 'node:test';
import assert from 'node:assert/strict';
import { formatStatusOutput } from '../src/commands/status.js';

function fixture() {
  return {
    config: { entry_type: '六环外', preferred_vehicle: '' },
    result: {
      vehicle: {
        licenseNumber: '京TST01',
        remainingTimes: '7',
        records: [{
          applyId: 'TEST-APPLY-001',
          statusName: '审核通过(生效中)',
          entryType: '02',
          entryTypeName: '进京证（六环外）',
          validFrom: '2030-01-01',
          validTo: '2030-01-07',
        }],
        secondaryRecords: [],
      },
      decision: {
        action: 'none',
        reason: '当前证件剩余 6 天',
        remainingDays: 6,
      },
    },
  };
}

test('status 默认输出使用产品化摘要并隐藏工程字段', () => {
  const message = formatStatusOutput(fixture());
  assert.equal(message, [
    'JingPilot Status',
    '',
    '✓ 登录成功',
    '✓ 状态查询成功',
    '',
    '车辆：京***01',
    '状态：审核通过（生效中）',
    '类型：六环外进京证',
    '有效期：2030-01-01 → 2030-01-07',
    '距到期：6 天',
    '六环内年度剩余申请次数：7',
    '自动续办：仅允许六环外',
    '',
    '结论：当前无需续办',
  ].join('\n'));
  assert.doesNotMatch(message, /stateList|JTGL Session|applyId|手机号|Authorization/);
});

test('status verbose 只追加脱敏技术信息', () => {
  const values = fixture();
  const message = formatStatusOutput({ ...values, verbose: true });
  assert.match(message, /JTGL Session：激活成功/);
  assert.match(message, /stateList：查询成功/);
  assert.match(message, /applyId：TES\*\*\*001/);
  assert.doesNotMatch(message, /TEST-APPLY-001|手机号|身份证|Authorization|Webhook/);
});

import { maskPlate, redact } from './masking.js';

function fields(body, names) {
  const lines = String(body).split('\n');
  return names.map(([label, source = label]) => {
    const line = lines.find((item) => item.startsWith(`${source}：`));
    const value = line ? line.slice(source.length + 1).trim() : '-';
    return `${label}：${label === '车辆' && value !== '-' ? maskPlate(value) : redact(value)}`;
  });
}

function validityLine({ validFrom, validTo } = {}) {
  const isDate = (value) => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  };
  return isDate(validFrom) && isDate(validTo) && validFrom <= validTo
    ? `有效期：${validFrom} → ${validTo}`
    : null;
}

export function formatWeComText(title, body, displayDetails) {
  const validity = validityLine(displayDetails);
  const fixedDestinationNotice = displayDetails?.usedFixedDestination === true
    ? '⚠️ 目的地：已使用用户确认的固定保底地点'
    : null;
  if (title === '进京证自动续办已提交') {
    return [
      '✅ JingPilot 自动续办已提交',
      '',
      ...fields(body, [['车辆'], ['类型'], ['申请日期']]),
      ...(validity ? [validity] : []),
      ...fields(body, [['当前状态', '状态']]),
      ...(fixedDestinationNotice ? [fixedDestinationNotice] : []),
      '',
      '提交结果已通过 stateList 确认。',
    ].join('\n');
  }
  if (title === '进京证新证审核通过') {
    return [
      '✅ JingPilot 新证审核通过',
      '',
      ...fields(body, [['车辆'], ['类型']]),
      ...(validity ? [validity] : []),
      ...fields(body, [['当前状态', '状态']]),
      '',
      '新证已审核通过，JingPilot 将继续管理下一续办周期。',
    ].join('\n');
  }
  if (title === '进京证自动续办已确认') {
    return [
      '✅ JingPilot 历史提交已确认',
      '',
      ...fields(body, [['车辆'], ['类型'], ['申请日期']]),
      ...(validity ? [validity] : []),
      ...fields(body, [['当前状态', '状态']]),
      ...(fixedDestinationNotice ? [fixedDestinationNotice] : []),
      '',
      '此前处于未确认状态的申请，现已确认存在。',
      '无需再次提交。',
    ].join('\n');
  }
  if (title === '进京证自动续办异常') {
    return [
      '⚠️ JingPilot 自动运行异常',
      '',
      ...fields(body, [['阶段'], ['错误']]),
      '提交状态：未继续提交',
      '',
      '本轮已安全停止，请检查。',
      'JingPilot 不会在状态不确定时重复提交。',
    ].join('\n');
  }
  if (title === '测试通知 / Test Notification') {
    return '✅ JingPilot 通知测试\n\n企业微信通知通道工作正常。\n此消息用于验证企业微信与微信端的文本显示。';
  }
  return `${title}\n${body}`;
}

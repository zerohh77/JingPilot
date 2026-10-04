import { createRuntime } from '../lib/runtime.js';
import { RenewalRunner } from '../lib/renewal-runner.js';
import { getAllRecords } from '../lib/models.js';
import { Logger } from '../lib/logger.js';
import { maskPlate } from '../lib/masking.js';
import { output, success, error } from '../output.js';

function maskApplyId(value = '') {
  return value ? `${value.slice(0, 3)}***${value.slice(-3)}` : '-';
}

function displayStatusName(value = '') {
  return value ? value.replaceAll('(', '（').replaceAll(')', '）') : '无记录';
}

function displayEntryType(record, configuredType) {
  const name = record?.entryTypeName || '';
  if (record?.entryType === '01' || name.includes('六环内')) return '六环内进京证';
  if (record?.entryType === '02' || name.includes('六环外')) return '六环外进京证';
  return configuredType ? `${configuredType}进京证` : '未知';
}

export function formatStatusOutput({ result, config, verbose = false }) {
  const latest = getAllRecords(result.vehicle)[0] || null;
  const lines = [
    'JingPilot Status',
    '',
    '✓ 登录成功',
    '✓ 状态查询成功',
    '',
    `车辆：${maskPlate(result.vehicle.licenseNumber)}`,
    `状态：${displayStatusName(latest?.statusName)}`,
    `类型：${displayEntryType(latest, config.entry_type)}`,
    `有效期：${latest?.validFrom || '-'} → ${latest?.validTo || '-'}`,
  ];
  if (Number.isFinite(result.decision.remainingDays)) {
    lines.push(`距到期：${result.decision.remainingDays} 天`);
  }
  lines.push(`六环内年度剩余申请次数：${result.vehicle.remainingTimes}`);
  lines.push('自动续办：仅允许六环外');
  lines.push('');
  lines.push(result.decision.action === 'apply'
    ? '结论：当前满足六环外办理条件（status 仅查询，不提交）'
    : '结论：当前无需续办');

  if (verbose) {
    lines.push('');
    lines.push('技术信息（脱敏）');
    lines.push('JTGL Session：激活成功');
    lines.push('stateList：查询成功');
    lines.push(`applyId：${maskApplyId(latest?.applyId)}`);
    lines.push(`配置申请类型：${config.entry_type}`);
    lines.push(`首选车辆：${config.preferred_vehicle ? maskPlate(config.preferred_vehicle) : '未设置'}`);
  }
  return lines.join('\n');
}

function formatStatusNotification({ result, config }) {
  const latest = getAllRecords(result.vehicle)[0] || null;
  return [
    `车辆：${maskPlate(result.vehicle.licenseNumber)}`,
    `状态：${latest?.statusName || '无记录'}`,
    `类型：${latest?.entryTypeName || config.entry_type}`,
    `生效日期：${latest?.validFrom || '-'}`,
    `到期日期：${latest?.validTo || '-'}`,
    `applyId：${maskApplyId(latest?.applyId)}`,
    `剩余次数：${result.vehicle.remainingTimes}`,
    `判断：${result.decision.reason}`,
  ].join('\n');
}

export function registerStatusCommand(program) {
  program
    .command('status')
    .description('只查询进京证状态，绝不提交')
    .option('-v, --verbose', '显示脱敏技术信息')
    .option('-n, --notify', '将状态发送到通知渠道')
    .option('--plate <plate>', '指定车牌号')
    .action(async (options) => {
      try {
        const runtime = createRuntime({ logger: new Logger({ consoleEnabled: false }) });
        const runner = new RenewalRunner({
          api: runtime.api,
          config: runtime.config,
          stateStore: runtime.stateStore,
          logger: runtime.logger,
          sendNotification: async () => {},
        });
        const result = await runner.inspect({ plate: options.plate });
        const message = formatStatusOutput({ result, config: runtime.config, verbose: options.verbose });
        if (options.notify) {
          await runtime.sendNotification('进京证状态', formatStatusNotification({ result, config: runtime.config }));
        }
        output(success({ needRenew: result.decision.action === 'apply' }, message));
      } catch (err) {
        output(error(`查询状态失败: ${err.message}`));
        process.exitCode = 1;
      }
    });
}

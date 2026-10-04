import { createRuntime } from '../lib/runtime.js';
import { Logger } from '../lib/logger.js';
import { RenewalRunner } from '../lib/renewal-runner.js';
import { withRunLock } from '../lib/run-lock.js';
import { maskPlate } from '../lib/masking.js';
import { output, success, error } from '../output.js';

export function successfulRunNotification(result) {
  if (result.outcome !== 'no-action') return null;
  return {
    title: 'JingPilot 自动检查完成',
    body: [
      `车辆：${maskPlate(result.vehicle.licenseNumber)}`,
      `状态：${result.decision.record?.statusName || '无记录'}`,
      `判断：${result.decision.reason}`,
      '结果：无需续办',
    ].join('\n'),
  };
}

export function formatRunMessage(result) {
  let message = '无需续办';
  if (result.outcome === 'dry-run') {
    message = `模拟完成：车辆 ${maskPlate(result.vehicle.licenseNumber)}，${result.entryType}，申请日期 ${result.applyDate}；未发送 POST`;
  } else if (['submitted-confirmed', 'recovered-confirmed'].includes(result.outcome)) {
    message = `申请已由 stateList 确认：${result.record.statusName}`;
  }
  if (result.usedFixedDestination === true) {
    message += '\n⚠️ 目的地：已使用用户确认的固定保底地点';
  }
  return message;
}

export async function runCommand({ plate, entryType, noNotify, dryRun = false } = {}) {
  let runtime;
  const logger = new Logger();
  try {
    runtime = createRuntime({ logger });
    if (entryType && entryType !== runtime.config.entry_type) {
      throw new Error(`命令行类型 ${entryType} 与已确认配置 ${runtime.config.entry_type} 不一致；请先用 jingpilot set entry-type 修改配置`);
    }
    const runner = new RenewalRunner({
      api: runtime.api,
      config: runtime.config,
      stateStore: runtime.stateStore,
      logger: runtime.logger,
      sendNotification: noNotify || dryRun ? async () => {} : runtime.sendNotification,
    });
    const result = await withRunLock(() => runner.run({ plate, dryRun }));
    const message = formatRunMessage(result);
    const notification = successfulRunNotification(result);
    if (notification && !noNotify && !dryRun) {
      await runtime.sendNotification(notification.title, notification.body);
    }
    output(success({ outcome: result.outcome }, message));
    return result;
  } catch (err) {
    logger.error(`运行失败 [${err.stage || 'unknown'}]: ${err.message}`);
    if (runtime && !noNotify) {
      try {
        await runtime.sendNotification(
          '进京证自动续办异常',
          `阶段：${err.stage || '运行'}\n错误：${err.message}\n本轮已安全停止，未继续提交，请检查。`,
        );
      } catch { /* notification failure must not hide the original error */ }
    }
    output(error(`运行失败: ${err.message}`));
    process.exitCode = 1;
    return null;
  }
}

export function registerRunCommand(program) {
  program
    .command('run')
    .description('安全检查并在符合条件时续办')
    .option('--plate <plate>', '指定车牌号（多车时必须指定或设置首选车辆）')
    .option('--entry-type <type>', '仅用于核对配置，不允许临时覆盖')
    .option('--dry-run', '完整模拟，绝不调用 insertApplyRecord')
    .option('--no-notify', '不发送通知')
    .action(runCommand);
}

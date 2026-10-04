import { StateStore } from '../lib/state-store.js';
import { maskPlate } from '../lib/masking.js';
import { output, success, error } from '../output.js';

export function registerStateCommand(program) {
  const command = program.command('state').description('查看或恢复本地防重复状态');
  command.command('show').description('显示本地状态账本（不含 secret）').action(() => {
    try {
      const value = new StateStore().load();
      const pending = value.pending_attempt;
      const lines = [
        `最近查询：${value.last_check || '-'}`,
        `最近申请尝试：${value.last_apply_attempt || '-'}`,
        `最近申请日期：${value.last_apply_date || '-'}`,
        `最近结果：${value.last_apply_result || '-'}`,
        `未确认提交：${pending ? '有' : '无'}`,
      ];
      if (pending) {
        lines.push(`车辆：${maskPlate(pending.plate)}`);
        lines.push(`状态：${pending.outcome}`);
        lines.push(`尝试 ID：${pending.id}`);
      }
      output(success(null, lines.join('\n')));
    } catch (err) {
      output(error(`读取状态失败: ${err.message}`));
      process.exitCode = 1;
    }
  });

  command
    .command('clear-pending')
    .description('人工核验服务端确无新申请后，解除 POST 阻塞')
    .requiredOption('--confirm', '确认已人工检查北京交警端不存在新申请')
    .action(() => {
      try {
        const store = new StateStore();
        const current = store.load();
        if (!current.pending_attempt) {
          output(success(null, '当前没有未确认提交'));
          return;
        }
        store.update({ pending_attempt: null, last_apply_result: 'manual-cleared' });
        output(success(null, '已解除本地 POST 阻塞；下次 run 仍会重新执行完整状态检查'));
      } catch (err) {
        output(error(`清理状态失败: ${err.message}`));
        process.exitCode = 1;
      }
    });
}

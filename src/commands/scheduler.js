import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { output, success, error } from '../output.js';

const scripts = {
  install: fileURLToPath(new URL('../../scripts/install-launchd.sh', import.meta.url)),
  uninstall: fileURLToPath(new URL('../../scripts/uninstall-launchd.sh', import.meta.url)),
  status: fileURLToPath(new URL('../../scripts/status-launchd.sh', import.meta.url)),
  wakeInstall: fileURLToPath(new URL('../../scripts/install-wake.sh', import.meta.url)),
  wakeUninstall: fileURLToPath(new URL('../../scripts/uninstall-wake.sh', import.meta.url)),
  wakeStatus: fileURLToPath(new URL('../../scripts/status-wake.sh', import.meta.url)),
};

function runScript(action) {
  try {
    execFileSync(scripts[action], [], { stdio: 'inherit' });
    output(success({ action }, `scheduler ${action} 完成`));
  } catch (err) {
    output(error(`scheduler ${action} 失败: ${err.message}`));
    process.exitCode = 1;
  }
}

export function registerSchedulerCommand(program) {
  const scheduler = program.command('scheduler').description('管理 macOS 用户级 LaunchAgent');
  scheduler.command('install').description('安装并加载无人值守任务').action(() => runScript('install'));
  scheduler.command('uninstall').description('卸载任务（保留日志和配置）').action(() => runScript('uninstall'));
  scheduler.command('status').description('查看任务安装和加载状态').action(() => runScript('status'));
  scheduler.command('wake-install').description('安装任务前自动唤醒与保活').action(() => runScript('wakeInstall'));
  scheduler.command('wake-uninstall').description('卸载自动唤醒与保活').action(() => runScript('wakeUninstall'));
  scheduler.command('wake-status').description('查看自动唤醒与保活状态').action(() => runScript('wakeStatus'));
}

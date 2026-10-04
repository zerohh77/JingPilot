import { KeychainStore } from '../lib/keychain.js';
import { getNotifyChannel, isSupportedNotifyUrl, normalizeNotifyUrl, testNotify } from '../lib/notifier.js';
import { output, success, error } from '../output.js';
import { readFileSync } from 'node:fs';

export function registerNotifyCommand(program) {
  const command = program.command('notify').description('通知渠道管理（secret 保存在 Keychain）');
  command.command('add [url]')
    .description('添加通知渠道；省略 URL 时使用隐藏输入')
    .option('--stdin', '从标准输入读取通知 URL（不回显）')
    .action(async (url, options) => {
    try {
      if (url && options.stdin) throw new Error('URL 参数与 --stdin 不能同时使用');
      if (options.stdin) {
        url = readFileSync(0, 'utf8').trim();
      } else if (!url) {
        const prompts = await import('@inquirer/prompts');
        url = await prompts.password({
          message: '请输入通知 Webhook 或通知 URL:',
          mask: '*',
          validate: (value) => value.trim().length > 0 || '通知 URL 不能为空',
        });
      }
      url = normalizeNotifyUrl(url);
      if (!isSupportedNotifyUrl(url)) throw new Error('通知 URL 格式不受支持');
      const keychain = new KeychainStore();
      const urls = keychain.getNotifyUrls();
      if (!urls.includes(url)) keychain.setNotifyUrls([...urls, url]);
      output(success(null, `通知渠道 ${getNotifyChannel(url)} 已保存到 Keychain（共 ${urls.includes(url) ? urls.length : urls.length + 1} 个）`));
    } catch (err) {
      output(error(`添加通知渠道失败: ${err.message}`));
      process.exitCode = 1;
    }
    });

  command.command('remove <url>').description('移除通知渠道').action((url) => {
    try {
      const keychain = new KeychainStore();
      const urls = keychain.getNotifyUrls().filter((item) => item !== url);
      keychain.setNotifyUrls(urls);
      output(success(null, `通知渠道已移除（剩余 ${urls.length} 个）`));
    } catch (err) {
      output(error(`移除通知渠道失败: ${err.message}`));
      process.exitCode = 1;
    }
  });

  command.command('test').description('发送测试通知').action(async () => {
    try {
      const urls = new KeychainStore().getNotifyUrls();
      if (urls.length === 0) throw new Error('未配置通知渠道');
      const results = await testNotify(urls);
      const succeeded = results.filter((item) => item.status === 'fulfilled').length;
      const failed = results.length - succeeded;
      if (failed > 0) throw new Error(`${failed} 个渠道发送失败`);
      output(success(null, `测试通知发送成功（${succeeded} 个渠道）`));
    } catch (err) {
      output(error(`测试通知失败: ${err.message}`));
      process.exitCode = 1;
    }
  });

  command.command('status').description('显示通知渠道类型，不显示 secret').action(() => {
    try {
      const urls = new KeychainStore().getNotifyUrls();
      const channels = urls.map(getNotifyChannel);
      output(success({ count: channels.length, channels }, channels.length > 0
        ? `通知渠道：${channels.join(', ')}（共 ${channels.length} 个；secret 未显示）`
        : '未配置通知渠道'));
    } catch (err) {
      output(error(`读取通知配置失败: ${err.message}`));
      process.exitCode = 1;
    }
  });
}

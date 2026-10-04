import { login } from '../lib/bjt-login.js';
import { ApiManager } from '../lib/api-manager.js';
import { API_BASE_URL } from '../constants.js';
import { defaultConfig, loadConfig, saveConfig } from '../lib/config-manager.js';
import { KeychainStore } from '../lib/keychain.js';
import { maskPhone } from '../lib/masking.js';
import { output, success, error } from '../output.js';
import { AUTOMATION_ENTRY_TYPE } from '../constants.js';

export function registerInitCommand(program) {
  program
    .command('init')
    .description('登录并初始化本机配置（凭据保存到 macOS Keychain）')
    .option('--phone <phone>', '北京通手机号')
    .option('--password <password>', '北京通密码')
    .option('--entry-type <type>', '自动申请类型（仅允许六环外）')
    .option('--notify <urls...>', '通知渠道 URL（安全保存到 Keychain）')
    .option('-f, --force', '覆盖已有配置')
    .action(async (options) => {
      try {
        const existing = loadConfig({ allowLegacy: true });
        if (existing && !options.force) throw new Error('已存在配置；确认覆盖时请使用 --force');
        const interactive = !(options.phone && options.password);
        let phone = options.phone;
        let password = options.password;
        const entryType = options.entryType || AUTOMATION_ENTRY_TYPE;
        let notifyUrls = options.notify || [];
        if (interactive) {
          const prompts = await import('@inquirer/prompts');
          phone ||= await prompts.input({ message: '请输入北京通手机号:', validate: (value) => value.length > 0 || '手机号不能为空' });
          password ||= await prompts.password({ message: '请输入北京通密码:', mask: '*', validate: (value) => value.length > 0 || '密码不能为空' });
          if (notifyUrls.length === 0) {
            const value = await prompts.input({ message: 'Bark URL（可留空）:' });
            notifyUrls = value ? [value.trim()] : [];
          }
        }
        if (entryType !== AUTOMATION_ENTRY_TYPE) {
          throw new Error('JingPilot 自动化仅允许六环外进京证，严禁配置六环内');
        }

        output(success(null, '正在登录北京通并激活 JTGL Session...'));
        const token = await login(phone, password);
        await new ApiManager(API_BASE_URL, token).ensureSession();

        const keychain = new KeychainStore();
        keychain.setCredentials({ phone, password });
        keychain.setNotifyUrls(notifyUrls);
        saveConfig({ ...defaultConfig(), entry_type: entryType });
        output(success({ phone: maskPhone(phone), entryType }, `初始化成功：${maskPhone(phone)}，${entryType}。Token 未落盘。`));
      } catch (err) {
        output(error(`初始化失败: ${err.message}`));
        process.exitCode = 1;
      }
    });
}

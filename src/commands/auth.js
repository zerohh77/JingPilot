import { createRuntime } from '../lib/runtime.js';
import { KeychainStore, OFFICIAL_MAP_KEY_ACCOUNT } from '../lib/keychain.js';
import { maskPhone } from '../lib/masking.js';
import { output, success, error } from '../output.js';

export function registerAuthCommand(program) {
  const auth = program.command('auth').description('认证管理');
  auth
    .command('test')
    .description('强制重新登录并激活 Session，不查询或提交申请')
    .action(async () => {
      try {
        const runtime = createRuntime();
        await runtime.api.authenticate();
        const { phone } = runtime.keychain.getCredentials();
        output(success(null, `认证成功：${maskPhone(phone)}`));
      } catch (err) {
        output(error(`认证失败: ${err.message}`));
        process.exitCode = 1;
      }
    });

  auth
    .command('map-key')
    .description('将自行取得的官方地图访问凭据保存到当前用户 Keychain')
    .action(async () => {
      try {
        const prompts = await import('@inquirer/prompts');
        const value = await prompts.password({
          message: '官方地图访问凭据（隐藏输入）:',
          mask: '*',
          validate: (input) => input.trim().length > 0 || '凭据不能为空',
        });
        new KeychainStore().set(OFFICIAL_MAP_KEY_ACCOUNT, value.trim());
        output(success(null, '官方地图访问凭据已保存到当前用户 Keychain；值未显示。'));
      } catch {
        output(error('保存官方地图访问凭据失败；值未显示。'));
        process.exitCode = 1;
      }
    });
}

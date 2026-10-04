import { loadConfig, validateConfig } from '../lib/config-manager.js';
import { KeychainStore } from '../lib/keychain.js';
import { maskPhone, maskPlate } from '../lib/masking.js';
import { output, success, error } from '../output.js';

export function registerConfigCommand(program) {
  const config = program.command('config').description('查看脱敏配置');
  config
    .command('show')
    .description('显示配置，不显示密码、Token 或 Bark key')
    .action(() => {
      try {
        const value = validateConfig(loadConfig());
        const keychain = new KeychainStore();
        const { phone } = keychain.getCredentials();
        const notifyCount = keychain.getNotifyUrls().length;
        const message = [
          `手机号：${maskPhone(phone)}`,
          `进京证类型：${value.entry_type}`,
          `首选车辆：${value.preferred_vehicle ? maskPlate(value.preferred_vehicle) : '未设置'}`,
          `通知渠道数：${notifyCount}`,
          `官方地图解析：${value.official_map_lookup_confirmed === true ? 'enabled' : 'disabled'}`,
          `真实提交：${value.live_submit_confirmed === true ? 'enabled' : 'disabled'}`,
          '凭据存储：macOS Keychain',
          'Token 持久化：否',
        ].join('\n');
        output(success(null, message));
      } catch (err) {
        output(error(`读取配置失败: ${err.message}`));
        process.exitCode = 1;
      }
    });
}

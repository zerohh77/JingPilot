import { execFileSync } from 'node:child_process';
import { JingPilotError } from './errors.js';

const SECURITY = '/usr/bin/security';
export const KEYCHAIN_SERVICE = 'io.github.zerohh77.jingpilot.credentials';
export const LEGACY_KEYCHAIN_SERVICE = 'com.cross-bj.credentials';
export const OFFICIAL_MAP_KEY_ACCOUNT = 'official-map-access-key';

function runSecurity(args, options = {}) {
  try {
    return execFileSync(SECURITY, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      ...options,
    }).trim();
  } catch (cause) {
    const stderr = String(cause?.stderr || '');
    throw new JingPilotError(
      stderr.includes('could not be found') ? 'Keychain 中未找到所需凭据' : 'macOS Keychain 操作失败',
      { code: 'KEYCHAIN_ERROR', stage: 'config', cause },
    );
  }
}

export class KeychainStore {
  constructor({ service = KEYCHAIN_SERVICE, legacyService = LEGACY_KEYCHAIN_SERVICE, runner = runSecurity } = {}) {
    this.service = service;
    this.legacyService = legacyService;
    this.runner = runner;
  }

  set(account, value) {
    if (!value) throw new JingPilotError(`不能把空值写入 Keychain: ${account}`, { code: 'CONFIG_ERROR', stage: 'config' });
    this.runner(['add-generic-password', '-U', '-s', this.service, '-a', account, '-w', String(value)]);
  }

  get(account, { optional = false } = {}) {
    try {
      return this.runner(['find-generic-password', '-s', this.service, '-a', account, '-w']);
    } catch (error) {
      if (!this.legacyService || this.legacyService === this.service) {
        if (optional && error.code === 'KEYCHAIN_ERROR') return '';
        throw error;
      }
      try {
        return this.runner(['find-generic-password', '-s', this.legacyService, '-a', account, '-w']);
      } catch (legacyError) {
        if (optional && legacyError.code === 'KEYCHAIN_ERROR') return '';
        throw legacyError;
      }
    }
  }

  migrateLegacyAccounts(accounts = ['bjt-phone', 'bjt-password', 'notify-urls']) {
    const migrated = [];
    const skipped = [];
    for (const account of accounts) {
      let value;
      try {
        value = this.runner(['find-generic-password', '-s', this.legacyService, '-a', account, '-w']);
      } catch (error) {
        if (account === 'notify-urls' && error.code === 'KEYCHAIN_ERROR') {
          skipped.push(account);
          continue;
        }
        throw error;
      }
      this.runner(['add-generic-password', '-U', '-s', this.service, '-a', account, '-w', String(value)]);
      const verified = this.runner(['find-generic-password', '-s', this.service, '-a', account, '-w']);
      if (verified !== String(value)) {
        throw new JingPilotError(`Keychain 迁移校验失败: ${account}`, { code: 'KEYCHAIN_ERROR', stage: 'migration' });
      }
      migrated.push(account);
    }
    return { migrated, skipped };
  }

  delete(account) {
    try {
      this.runner(['delete-generic-password', '-s', this.service, '-a', account]);
    } catch (error) {
      if (!String(error.cause?.stderr || '').includes('could not be found')) throw error;
    }
  }

  setCredentials({ phone, password }) {
    this.set('bjt-phone', phone);
    this.set('bjt-password', password);
  }

  getCredentials() {
    return { phone: this.get('bjt-phone'), password: this.get('bjt-password') };
  }

  setNotifyUrls(urls) {
    if (!urls || urls.length === 0) {
      this.delete('notify-urls');
      return;
    }
    this.set('notify-urls', JSON.stringify(urls));
  }

  getNotifyUrls() {
    const raw = this.get('notify-urls', { optional: true });
    if (!raw) return [];
    try {
      const value = JSON.parse(raw);
      return Array.isArray(value) ? value : [];
    } catch {
      throw new JingPilotError('Keychain 中的通知配置格式无效', { code: 'CONFIG_ERROR', stage: 'config' });
    }
  }
}

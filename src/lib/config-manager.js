import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { AUTOMATION_ENTRY_TYPE, CONFIG_FILE } from '../constants.js';
import { JingPilotError } from './errors.js';

export const CONFIG_VERSION = 2;
export const APPLICATION_NAME = 'JingPilot';

export function getConfigDir() {
  return getDataDir();
}

export function getConfigPath() {
  return join(getConfigDir(), CONFIG_FILE);
}

export function getDataDir() {
  return join(homedir(), 'Library', 'Application Support', APPLICATION_NAME);
}

export function getLogDir() {
  return join(homedir(), 'Library', 'Logs', APPLICATION_NAME);
}

export function getLegacyConfigPath() {
  return join(homedir(), '.cross-bj', CONFIG_FILE);
}

export function getLegacyDataDir() {
  return join(homedir(), 'Library', 'Application Support', 'cross-bj');
}

export function getLegacyLogDir() {
  return join(homedir(), 'Library', 'Logs', 'cross-bj');
}

export function ensurePrivateDir(path) {
  mkdirSync(path, { recursive: true, mode: 0o700 });
  try { chmodSync(path, 0o700); } catch { /* best effort on non-POSIX test filesystems */ }
}

export function defaultConfig() {
  return {
    version: CONFIG_VERSION,
    entry_type: AUTOMATION_ENTRY_TYPE,
    preferred_vehicle: '',
    confirm_delay_ms: 5000,
    official_map_lookup_confirmed: false,
    official_map_location_fingerprint: '',
    fixed_destination_fallback: null,
    live_submit_confirmed: false,
    application_defaults: {},
  };
}

export function loadConfig({ path = getConfigPath(), allowLegacy = false } = {}) {
  if (!existsSync(path)) return null;
  const config = JSON.parse(readFileSync(path, 'utf8'));
  if (Array.isArray(config.users)) {
    if (allowLegacy) return config;
    throw new JingPilotError(
      '检测到旧版明文配置。请重新运行 jingpilot init，将凭据迁移到 macOS Keychain',
      { code: 'LEGACY_CONFIG', stage: 'config' },
    );
  }
  return { ...defaultConfig(), ...config, application_defaults: config.application_defaults || {} };
}

export function saveConfig(config, { path = getConfigPath() } = {}) {
  ensurePrivateDir(dirname(path));
  const safeConfig = { ...defaultConfig(), ...config, version: CONFIG_VERSION };
  if (safeConfig.entry_type !== AUTOMATION_ENTRY_TYPE) {
    throw new JingPilotError('JingPilot 自动化仅允许六环外进京证，拒绝保存六环内配置', {
      code: 'ENTRY_TYPE_FORBIDDEN', stage: 'config',
    });
  }
  for (const key of ['auth', 'bjt_phone', 'bjt_pwd', 'password', 'phone', 'notify_urls']) delete safeConfig[key];
  const temp = `${path}.${process.pid}.tmp`;
  writeFileSync(temp, `${JSON.stringify(safeConfig, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  chmodSync(temp, 0o600);
  renameSync(temp, path);
}

export function updateConfig(updates, options = {}) {
  const current = loadConfig(options) || defaultConfig();
  const next = { ...current, ...updates };
  saveConfig(next, options);
  return next;
}

export function validateConfig(config) {
  if (!config) throw new JingPilotError('尚未初始化，请先运行 jingpilot init', { code: 'NOT_INITIALIZED', stage: 'config' });
  if (config.entry_type !== AUTOMATION_ENTRY_TYPE) {
    throw new JingPilotError('JingPilot 自动化仅允许六环外进京证；六环内配置已被禁止', {
      code: 'ENTRY_TYPE_FORBIDDEN', stage: 'config',
    });
  }
  return config;
}

export function isInitialized(options = {}) {
  try {
    validateConfig(loadConfig(options));
    return true;
  } catch {
    return false;
  }
}

export function getUser() {
  const config = validateConfig(loadConfig());
  return {
    entry_type: config.entry_type,
    preferred_vehicle: config.preferred_vehicle,
    application_defaults: config.application_defaults,
  };
}

export function updateUser(updates) {
  const translated = { ...updates };
  for (const key of ['auth', 'bjt_phone', 'bjt_pwd', 'notify_urls']) delete translated[key];
  return updateConfig(translated);
}

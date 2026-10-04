import { validateConfig, loadConfig } from './config-manager.js';
import { KeychainStore } from './keychain.js';
import { Logger } from './logger.js';
import { AuthenticatedApi } from './auth-session.js';
import { StateStore } from './state-store.js';
import { notify } from './notifier.js';

function safeLog(logger, level, message) {
  try {
    logger?.[level]?.(message);
  } catch {
    // Notification diagnostics must never affect the business flow.
  }
}

export function createSafeNotificationSender({ keychain, logger, deliver = notify }) {
  return async (title, body, displayDetails) => {
    try {
      const urls = keychain.getNotifyUrls();
      if (urls.length === 0) return [];
      const results = await deliver(urls, title, body, displayDetails);
      const succeeded = results.filter((item) => item.status === 'fulfilled').length;
      safeLog(logger, 'info', `通知发送完成：成功=${succeeded} 失败=${results.length - succeeded}`);
      return results;
    } catch (error) {
      safeLog(logger, 'warn', `通知发送失败（不影响主流程）：${error.message}`);
      return [{ status: 'rejected', reason: error }];
    }
  };
}

export function createRuntime({ logger = new Logger(), keychain = new KeychainStore() } = {}) {
  const config = validateConfig(loadConfig());
  const api = new AuthenticatedApi({
    credentialsProvider: () => keychain.getCredentials(),
    logger,
  });
  const sendNotification = createSafeNotificationSender({ keychain, logger });
  return { config, api, logger, keychain, stateStore: new StateStore(), sendNotification };
}

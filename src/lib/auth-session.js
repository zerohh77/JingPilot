import { API_BASE_URL } from '../constants.js';
import { login } from './bjt-login.js';
import { ApiManager } from './api-manager.js';
import { AuthError } from './errors.js';

export class AuthenticatedApi {
  constructor({
    credentialsProvider,
    loginFn = login,
    apiFactory = (token) => new ApiManager(API_BASE_URL, token),
    logger,
  }) {
    this.credentialsProvider = credentialsProvider;
    this.loginFn = loginFn;
    this.apiFactory = apiFactory;
    this.logger = logger;
    this.api = null;
    this.reauthUsed = false;
  }

  async authenticate() {
    const { phone, password } = await this.credentialsProvider();
    this.logger?.info('正在登录北京通');
    const token = await this.loginFn(phone, password);
    this.api = this.apiFactory(token);
    await this.api.ensureSession();
    this.logger?.info('登录及 JTGL Session 激活成功');
  }

  async invoke(method, ...args) {
    if (!this.api) await this.authenticate();
    try {
      return await this.api[method](...args);
    } catch (error) {
      if (!(error instanceof AuthError)) throw error;
      if (this.reauthUsed) throw new AuthError('本次运行已经重新认证过一次，已停止自动操作', { cause: error });
      this.reauthUsed = true;
      this.logger?.warn('检测到 401，最多重新认证一次');
      await this.authenticate();
      try {
        return await this.api[method](...args);
      } catch (retryError) {
        if (retryError instanceof AuthError) {
          throw new AuthError('重新认证后仍然失败，已停止自动操作', { cause: retryError });
        }
        throw retryError;
      }
    }
  }

  listVehicles() { return this.invoke('listVehicles'); }
  getUserInfo() { return this.invoke('getUserInfo'); }
  getApplicationDetail(applyId, applyTime) { return this.invoke('getApplicationDetail', applyId, applyTime); }
  queryDictionary(type, extra) { return this.invoke('queryDictionary', type, extra); }
  getStateData() { return this.invoke('getStateData'); }
  submitApply(payload) { return this.invoke('submitApply', payload); }
  addVehicle(payload) { return this.invoke('addVehicle', payload); }
  deleteVehicle(vId) { return this.invoke('deleteVehicle', vId); }
}

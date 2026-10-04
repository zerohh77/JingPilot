import { AUTOMATION_ENTRY_TYPE_CODE, SOURCE } from '../constants.js';
import { ApiError, AuthError, SafetyError, TransportError } from './errors.js';

const DEFAULT_TIMEOUT_MS = 20_000;

export class ApiManager {
  constructor(baseUrl, token, { fetchImpl = globalThis.fetch, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.token = token;
    this.fetchImpl = fetchImpl;
    this.timeoutMs = timeoutMs;
    this._sessionReady = false;
  }

  async _fetchJson(path, data = {}, {
    method = 'POST',
    uncertainOnTransport = false,
    omitAuthorization = false,
  } = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const url = `${this.baseUrl}/${path}`;
    try {
      const headers = {
        'Content-Type': 'application/json',
        Source: SOURCE,
      };
      if (!omitAuthorization) headers.Authorization = this.token;
      const options = {
        method,
        signal: controller.signal,
        headers,
      };
      if (method !== 'GET') options.body = JSON.stringify(data);
      const response = await this.fetchImpl(url, options);
      let result;
      try {
        result = await response.json();
      } catch (cause) {
        throw new TransportError(`接口返回了非 JSON 响应: ${path}`, { path, uncertain: uncertainOnTransport, cause });
      }
      if (response.status === 401 || Number(result?.code) === 401) {
        throw new AuthError(`认证失效: ${result?.msg || result?.message || 'HTTP 401'}`);
      }
      if (!response.ok || Number(result?.code) !== 200) {
        throw new ApiError(`接口拒绝请求: ${result?.msg || result?.message || `HTTP ${response.status}`}`, {
          apiCode: result?.code,
          httpStatus: response.status,
          path,
        });
      }
      return result;
    } catch (error) {
      if (error instanceof AuthError || error instanceof ApiError || error instanceof TransportError) throw error;
      const timedOut = error?.name === 'AbortError';
      throw new TransportError(timedOut ? `接口请求超时: ${path}` : `接口网络错误: ${path}`, {
        path,
        uncertain: uncertainOnTransport,
        cause: error,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  async ensureSession() {
    if (this._sessionReady) return;
    const result = await this._fetchJson(
      'auth/userController/loginUserByUserCenter?state=101000004071',
      { token: this.token, state: '101000004071' },
      { omitAuthorization: true },
    );
    const accessToken = result?.data?.accessToken;
    if (!accessToken) {
      throw new ApiError('用户中心 Session 激活响应缺少 accessToken', {
        apiCode: result?.code,
        path: 'auth/userController/loginUserByUserCenter',
      });
    }
    this.token = accessToken;
    this._sessionReady = true;
  }

  async callApi(path, data = {}, _extraHeaders = {}, method = 'POST', options = {}) {
    if (!path.includes('loginUser')) await this.ensureSession();
    return this._fetchJson(path, data, { method, ...options });
  }

  async listVehicles() {
    return (await this.callApi('pro/vehicleController/getUserIdInfo', {})).data;
  }

  async addVehicle(vehicleDict) {
    return this.callApi('pro/relationController/add', { relation: {}, vehicle: vehicleDict });
  }

  async deleteVehicle(vId) {
    return this.callApi('pro/relationController/deleteRelation', { vId });
  }

  async getUserInfo() {
    return (await this.callApi('pro/applyRecordController/getJsrxx', {})).data;
  }

  async getApplicationDetail(applyId, applyTime) {
    return (await this.callApi('pro/applyRecordController/applyDetail', {
      applyId,
      sqsj: applyTime,
    })).data;
  }

  async queryDictionary(type, extra = {}) {
    return (await this.callApi('pro/ucDicController/queryDic', {
      type,
      ...extra,
    })).data;
  }

  async getUserDetailInfo() {
    await this.ensureSession();
    return null;
  }

  async getStateData() {
    return (await this.callApi('pro/applyRecordController/stateList', {})).data;
  }

  async submitApply(payload) {
    if (String(payload?.jjzzl || '') !== AUTOMATION_ENTRY_TYPE_CODE) {
      throw new SafetyError('最终提交边界拒绝六环内申请：jjzzl 必须为 02（六环外）', {
        code: 'ENTRY_TYPE_FORBIDDEN', stage: 'pre-submit',
      });
    }
    return this.callApi(
      'pro/applyRecordController/insertApplyRecord',
      payload,
      {},
      'POST',
      { uncertainOnTransport: true },
    );
  }
}

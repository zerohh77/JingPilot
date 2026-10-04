/**
 * Beijing Tong (北京通) login module.
 *
 * Handles the full OAuth login flow:
 * 1. Fetch login page to get RSA public key + cookies
 * 2. Fetch and OCR captcha image
 * 3. Encrypt credentials and submit login
 * 4. Follow redirect to obtain authorization token
 */

import { md5, rsaEncrypt } from './crypto-utils.js';
import { recognizeCaptcha } from './ocr.js';

const SSP_HOST = 'ssp.jtgl.beijing.gov.cn';
const SSP_CALLBACK_URL = `https://${SSP_HOST}/sso/callback/userauth`;
const LOGIN_PAGE_URL =
  `https://bjt.beijing.gov.cn/renzheng/open/m/login/goUserLogin?client_id=100100001423&redirect_uri=${SSP_CALLBACK_URL}&response_type=code&scope=user_info&state=100009`;
const CAPTCHA_URL = 'https://bjt.beijing.gov.cn/renzheng/common/generateCaptcha';
const LOGIN_URL = 'https://bjt.beijing.gov.cn/renzheng/inner/m/login/doUserLoginByPwd';
const SSP_APP_LOGIN_URL = `https://${SSP_HOST}/auth/appLogin`;
const SSP_SSO_TOKEN_URL = `https://${SSP_HOST}/auth/getSsoUserToken`;

const MAX_ATTEMPTS = 3;
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_CALLBACK_HOPS = 5;

export function getLoginRedirect(loginJson) {
  const code = String(loginJson?.meta?.code ?? '');
  const message = String(loginJson?.meta?.message || '');
  const credentialRisk = /密码.*(错误|不正确)|账号.*(锁定|冻结)|剩余\s*\d+\s*次|还有\s*\d+\s*次机会/.test(message);
  if (code === '5019' || credentialRisk) {
    const error = new Error(message || '密码错误');
    error.noRetry = true;
    error.authRisk = true;
    throw error;
  }
  if (code === '5016' || /验证码.*(错误|不正确)/.test(message)) {
    const error = new Error(message || '验证码错误');
    error.retryable = true;
    throw error;
  }
  const redirectUrl = loginJson?.data?.redirectUrl;
  if (!redirectUrl) {
    const error = new Error(message || `北京通登录响应未知（code=${code || '空'}）`);
    error.noRetry = true;
    throw error;
  }
  return redirectUrl;
}

function nestedErrorCode(error) {
  let current = error;
  for (let i = 0; i < 4 && current; i += 1, current = current.cause) {
    if (current.code) return current.code;
  }
  return '';
}

async function fetchWithTimeout(fetchImpl, url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS, stage = '请求') {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...options, signal: controller.signal });
  } catch (cause) {
    const code = nestedErrorCode(cause);
    const message = cause?.name === 'AbortError'
      ? `${stage}超时`
      : `${stage}网络请求失败${code ? ` (${code})` : ''}`;
    throw new Error(message, { cause });
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Extract a query/hash parameter from a URL string.
 */
function getUrlParam(url, key) {
  // Must NOT url-decode values — Python version returns raw params.
  // URLSearchParams.get() decodes, which corrupts base64 (+ → space).
  try {
    const parsed = new URL(url);
    for (const param of parsed.search.slice(1).split('&')) {
      const eqIdx = param.indexOf('=');
      if (eqIdx > 0 && param.substring(0, eqIdx) === key) {
        return param.substring(eqIdx + 1);
      }
    }
    if (parsed.hash) {
      for (const param of parsed.hash.slice(1).split('&')) {
        const eqIdx = param.indexOf('=');
        if (eqIdx > 0 && param.substring(0, eqIdx) === key) {
          return param.substring(eqIdx + 1);
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

function decodeUrlValue(value) {
  if (value == null) return null;
  try {
    // decodeURIComponent preserves literal '+', unlike URLSearchParams.
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function jsonStringField(text, key) {
  const match = text.match(new RegExp(`['"]${key}['"]\\s*:\\s*['"]((?:\\\\.|[^'"\\\\])*)['"]`));
  if (!match) return null;
  try {
    return JSON.parse(`"${match[1].replaceAll('"', '\\"')}"`);
  } catch {
    return match[1];
  }
}

/**
 * Parse the bridge payload returned by the current SSP OAuth callback.
 * The native app receives these fields through web-view postMessage; the
 * server may expose them in a redirect URL, JSON response, or bridge HTML.
 */
export function getSspBridgePayload({ url = '', body = '', json = null } = {}) {
  let direct = json?.data ?? json;
  if (typeof direct === 'string') {
    try { direct = JSON.parse(direct); } catch { direct = null; }
  }

  let token = direct?.token ?? direct?.jtToken ?? null;
  let userType = direct?.userType ?? null;
  let redirectUrl = direct?.redirectUrl ?? null;

  if (url) {
    token ||= decodeUrlValue(getUrlParam(url, 'token'));
    userType ||= decodeUrlValue(getUrlParam(url, 'userType'));
    redirectUrl ||= decodeUrlValue(getUrlParam(url, 'redirectUrl'));
  }

  if (body) {
    token ||= jsonStringField(body, 'token') || jsonStringField(body, 'jtToken');
    userType ||= jsonStringField(body, 'userType');
    redirectUrl ||= jsonStringField(body, 'redirectUrl');
  }

  if (!token) return null;
  return {
    token: String(token),
    userType: String(userType || 'Z'),
    redirectUrl: redirectUrl ? String(redirectUrl) : '',
  };
}

function assertAllowedOAuthUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || !['bjt.beijing.gov.cn', SSP_HOST].includes(url.hostname)) {
    throw new Error('OAuth 回跳跳转到了未允许的主机');
  }
  return url;
}

async function readSspBridge(fetchImpl, redirectUrl, timeoutMs) {
  let currentUrl = assertAllowedOAuthUrl(redirectUrl).toString();
  for (let hop = 0; hop < MAX_CALLBACK_HOPS; hop += 1) {
    const response = await fetchWithTimeout(
      fetchImpl,
      currentUrl,
      { redirect: 'manual', headers: { 'User-Agent': 'JingPilot/1.1.0' } },
      timeoutMs,
      'SSP OAuth 回跳请求',
    );
    const location = response.headers.get('location');
    if (location && response.status >= 300 && response.status < 400) {
      const nextUrl = new URL(location, currentUrl).toString();
      const payload = getSspBridgePayload({ url: nextUrl });
      if (payload) return payload;
      currentUrl = assertAllowedOAuthUrl(nextUrl).toString();
      continue;
    }

    const body = await response.text();
    let json = null;
    try { json = JSON.parse(body); } catch { /* bridge HTML is expected too */ }
    const payload = getSspBridgePayload({ url: currentUrl, body, json });
    if (payload) return payload;
    const serverMessage = json?.msg || json?.message;
    throw new Error(serverMessage ? `SSP OAuth 回跳失败: ${serverMessage}` : `SSP OAuth 回跳响应无法解析 (HTTP ${response.status})`);
  }
  throw new Error('SSP OAuth 回跳次数过多');
}

async function readJsonResponse(response, stage) {
  let data;
  try {
    data = await response.json();
  } catch (cause) {
    throw new Error(`${stage}没有返回 JSON`, { cause });
  }
  if (response.status < 200 || response.status >= 300 || Number(data?.code) !== 200) {
    throw new Error(`${stage}失败: ${data?.msg || data?.message || `HTTP ${response.status}`}`);
  }
  return data;
}

async function exchangeSspToken(fetchImpl, bridge, timeoutMs) {
  const loginUrl = new URL(SSP_APP_LOGIN_URL);
  loginUrl.searchParams.set('token', bridge.token);
  loginUrl.searchParams.set('userType', bridge.userType || 'Z');
  if (bridge.redirectUrl) loginUrl.searchParams.set('redirectUrl', bridge.redirectUrl);

  const loginResponse = await fetchWithTimeout(fetchImpl, loginUrl, {}, timeoutMs, 'SSP 登录令牌兑换');
  const loginData = await readJsonResponse(loginResponse, 'SSP 登录令牌兑换');
  const accessToken = loginData?.data?.access_token;
  if (!accessToken) throw new Error('SSP 登录令牌兑换响应缺少 access_token');

  const ssoResponse = await fetchWithTimeout(fetchImpl, SSP_SSO_TOKEN_URL, {
    headers: { Authorization: accessToken },
  }, timeoutMs, 'SSP 业务令牌获取');
  const ssoData = await readJsonResponse(ssoResponse, 'SSP 业务令牌获取');
  const token = typeof ssoData.data === 'string'
    ? ssoData.data
    : ssoData?.data?.token || ssoData?.data?.access_token;
  if (!token) throw new Error('SSP 业务令牌响应缺少 token');
  return token;
}

/**
 * Minimal cookie jar that accumulates Set-Cookie headers.
 */
class CookieJar {
  constructor() {
    this.cookies = new Map();
  }

  /**
   * Parse a single Set-Cookie header value and store name=value.
   */
  add(setCookieHeader) {
    if (!setCookieHeader) return;
    // First segment before ';' is name=value
    const pair = setCookieHeader.split(';')[0].trim();
    const eqIdx = pair.indexOf('=');
    if (eqIdx > 0) {
      const name = pair.substring(0, eqIdx).trim();
      const value = pair.substring(eqIdx + 1).trim();
      this.cookies.set(name, value);
    }
  }

  /**
   * Add all Set-Cookie headers from a fetch Response.
   */
  addFromResponse(resp) {
    const setCookies =
      resp.headers.getSetCookie?.() ||
      resp.headers.raw?.()?.['set-cookie'] ||
      [];
    for (const header of setCookies) {
      this.add(header);
    }
  }

  toString() {
    return [...this.cookies.entries()]
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
  }
}

/**
 * Perform a single login attempt.
 *
 * @returns {string} Authorization token
 * @throws on non-retryable errors (bad credentials, etc.)
 */
async function attemptLogin(phone, password, { fetchImpl = globalThis.fetch, timeoutMs = REQUEST_TIMEOUT_MS } = {}) {
  const jar = new CookieJar();

  // Step 1: GET login page (expect 302)
  const resp1 = await fetchWithTimeout(fetchImpl, LOGIN_PAGE_URL, { redirect: 'manual' }, timeoutMs, '登录入口');
  if (resp1.status !== 302) {
    throw new Error(`Expected 302 from login page, got ${resp1.status}`);
  }
  jar.addFromResponse(resp1);
  const location1 = resp1.headers.get('location');
  const pubKey = getUrlParam(location1, 'pubKey');
  if (!pubKey) {
    throw new Error('Failed to extract pubKey from login redirect');
  }

  // Step 2: GET captcha image
  const captchaResp = await fetchWithTimeout(fetchImpl, `${CAPTCHA_URL}?${Date.now()}`, {
    headers: { Cookie: jar.toString() },
  }, timeoutMs, '验证码');
  jar.addFromResponse(captchaResp);
  const imageBuffer = Buffer.from(await captchaResp.arrayBuffer());
  const captcha = await recognizeCaptcha(imageBuffer);

  // Step 3: Encrypt credentials
  const encryptData = rsaEncrypt(
    { userIdentity: phone, resetFlag: false, encryptedPwd: md5(password) },
    pubKey,
  );

  // Step 4: POST login
  const loginResp = await fetchWithTimeout(fetchImpl, LOGIN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: jar.toString(),
    },
    body: `encryptData=${encodeURIComponent(encryptData)}&captcha=${encodeURIComponent(captcha)}`,
  }, timeoutMs, '密码提交');
  jar.addFromResponse(loginResp);
  const loginJson = await loginResp.json();

  const redirectUrl = getLoginRedirect(loginJson);

  // Step 5: Complete the current SSP web-view bridge and exchange its token
  // for the downstream SSO token used by the permit application.
  const bridge = await readSspBridge(fetchImpl, redirectUrl, timeoutMs);
  return exchangeSspToken(fetchImpl, bridge, timeoutMs);
}

/**
 * Login to Beijing Tong and obtain an authorization token.
 *
 * Retries up to 3 times (captcha OCR may fail).
 *
 * @param {string} phone - User's phone number
 * @param {string} password - User's password
 * @returns {Promise<string>} Authorization token
 */
export async function login(phone, password, options = {}) {
  let lastError;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await attemptLogin(phone, password, options);
    } catch (err) {
      lastError = err;
      // Only an explicit captcha error is safe to retry. A network error after
      // POST may already have reached the server, and a credential error can
      // lock the account, so both stop immediately.
      if (err.noRetry || !err.retryable) throw err;
      if (attempt < MAX_ATTEMPTS) {
        continue;
      }
    }
  }
  throw lastError;
}

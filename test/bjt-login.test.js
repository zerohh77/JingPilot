import test from 'node:test';
import assert from 'node:assert/strict';
import { getLoginRedirect, getSspBridgePayload } from '../src/lib/bjt-login.js';

test('数字 5019 密码错误立即停止，不允许重试', () => {
  assert.throws(
    () => getLoginRedirect({ meta: { code: 5019, message: '密码输入错误，您还有2次机会' } }),
    (error) => error.noRetry === true && error.authRisk === true,
  );
});

test('字符串 5019 密码错误立即停止', () => {
  assert.throws(
    () => getLoginRedirect({ meta: { code: '5019', message: '密码错误' } }),
    (error) => error.noRetry === true,
  );
});

test('未知错误码但包含锁定风险提示时立即停止', () => {
  assert.throws(
    () => getLoginRedirect({ meta: { code: 5000, message: '连续错误5次，账号将被锁定1小时' } }),
    (error) => error.noRetry === true && error.authRisk === true,
  );
});

test('只有明确验证码错误允许重试', () => {
  assert.throws(
    () => getLoginRedirect({ meta: { code: 5016, message: '验证码错误' } }),
    (error) => error.retryable === true && !error.noRetry,
  );
});

test('成功响应返回动态 redirectUrl', () => {
  assert.equal(
    getLoginRedirect({ meta: { code: 200 }, data: { redirectUrl: 'https://example.test/callback' } }),
    'https://example.test/callback',
  );
});

test('解析 SSP 回跳 URL，并保留 token 中的加号', () => {
  assert.deepEqual(
    getSspBridgePayload({
      url: 'https://ssp.jtgl.beijing.gov.cn/bridge?token=abc+def%2Bghi&userType=Z&redirectUrl=https%3A%2F%2Fssp.jtgl.beijing.gov.cn%2Fhome',
    }),
    {
      token: 'abc+def+ghi',
      userType: 'Z',
      redirectUrl: 'https://ssp.jtgl.beijing.gov.cn/home',
    },
  );
});

test('解析 SSP web-view bridge HTML', () => {
  assert.deepEqual(
    getSspBridgePayload({
      body: '<script>uni.postMessage({data:[{"token":"raw-token","userType":"Z","redirectUrl":"/home"}]})</script>',
    }),
    { token: 'raw-token', userType: 'Z', redirectUrl: '/home' },
  );
});

test('SSP bridge 没有 token 时拒绝继续', () => {
  assert.equal(getSspBridgePayload({ json: { code: 500, msg: 'invalid' } }), null);
});

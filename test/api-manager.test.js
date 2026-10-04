import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiManager } from '../src/lib/api-manager.js';
import { SOURCE } from '../src/constants.js';

function jsonResponse(data, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  };
}

test('新版用户中心 Session 激活后切换为 accessToken', async () => {
  const calls = [];
  const api = new ApiManager('https://example.test', 'sso-token', {
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      if (url.includes('loginUserByUserCenter')) {
        return jsonResponse({ code: 200, data: { accessToken: 'business-token' } });
      }
      return jsonResponse({ code: 200, data: { bzclxx: [] } });
    },
  });

  await api.getStateData();

  assert.equal(calls.length, 2);
  assert.match(calls[0].url, /loginUserByUserCenter\?state=101000004071$/);
  assert.equal(calls[0].options.headers.Authorization, undefined);
  assert.equal(calls[0].options.headers.Source, SOURCE);
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    token: 'sso-token',
    state: '101000004071',
  });
  assert.equal(calls[1].options.headers.Authorization, 'business-token');
  assert.match(calls[1].url, /pro\/applyRecordController\/stateList$/);
});

test('用户中心响应缺少 accessToken 时停止', async () => {
  const api = new ApiManager('https://example.test', 'sso-token', {
    fetchImpl: async () => jsonResponse({ code: 200, data: {} }),
  });
  await assert.rejects(() => api.ensureSession(), /缺少 accessToken/);
});

test('字典查询使用当前 pro 接口并透传附加字段', async () => {
  const calls = [];
  const api = new ApiManager('https://example.test', 'sso-token', {
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      if (url.includes('loginUserByUserCenter')) {
        return jsonResponse({ code: 200, data: { accessToken: 'business-token' } });
      }
      return jsonResponse({ code: 200, data: [{ zdbm: 'road-1', zdz: '测试道路' }] });
    },
  });

  const result = await api.queryDictionary('jjlk', { vId: 'vehicle-1' });
  assert.equal(result[0].zdbm, 'road-1');
  assert.match(calls[1].url, /pro\/ucDicController\/queryDic$/);
  assert.deepEqual(JSON.parse(calls[1].options.body), { type: 'jjlk', vId: 'vehicle-1' });
});

test('最终 API 边界在任何网络请求前拒绝六环内 payload', async () => {
  let fetchCount = 0;
  const api = new ApiManager('https://example.test', 'sso-token', {
    fetchImpl: async () => {
      fetchCount += 1;
      return jsonResponse({ code: 200, data: {} });
    },
  });
  await assert.rejects(
    () => api.submitApply({ jjzzl: '01' }),
    /最终提交边界拒绝六环内申请/,
  );
  assert.equal(fetchCount, 0);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { fingerprintOfficialMapLocation, resolveOfficialLocation } from '../src/lib/official-map.js';

function response(data) {
  return { ok: true, status: 200, json: async () => data };
}

test('只接受与旧证完整地址完全一致的官方地图 POI', async () => {
  const urls = [];
  const fetchImpl = async (url) => {
    urls.push(url);
    if (url.pathname === '/as/search/poi') {
      return response({
        status: '0',
        results: [
          { name: '目的地', address: '北京市海淀区测试路', location: { lng: 116.1, lat: 39.2 } },
          { name: '目的地分店', address: '北京市朝阳区', location: { lng: 116.3, lat: 39.4 } },
        ],
      });
    }
    return response({ status: '0', result: [{ addressComponent: { district: '海淀区' } }] });
  };

  const result = await resolveOfficialLocation('北京市海淀区测试路目的地', {
    fetchImpl, accessKeyProvider: () => 'TEST-MAP-KEY-NOT-REAL',
  });
  assert.deepEqual(result, { area: '海淀区', jjdzgdjd: '116.1', jjdzgdwd: '39.2' });
  assert.equal(urls.length, 2);
  assert.equal(urls[0].hostname, 'wfcl.jtgl.beijing.gov.cn');
  assert.equal(urls[0].searchParams.get('region'), '北京市');
});

test('没有唯一完整地址匹配时停止', async () => {
  const fetchImpl = async () => response({
    status: '0',
    results: [{ name: '同名地点', address: '北京市其他区', location: { lng: 116.1, lat: 39.2 } }],
  });
  await assert.rejects(
    () => resolveOfficialLocation('北京市海淀区目标地点', {
      fetchImpl, accessKeyProvider: () => 'TEST-MAP-KEY-NOT-REAL',
    }),
    /无法唯一还原/,
  );
});

test('同名地点按用户确认的坐标指纹精确选择', async () => {
  const fetchImpl = async (url) => {
    if (url.pathname === '/as/search/poi') {
      return response({
        status: '0',
        results: [
          { name: '同名地点', address: '', location: { lng: 116.1, lat: 39.2 } },
          { name: '同名地点', address: '', location: { lng: 116.1, lat: 39.2 } },
          { name: '同名地点', address: '', location: { lng: 116.3, lat: 39.4 } },
        ],
      });
    }
    return response({ status: '0', result: [{ addressComponent: { district: '西城区' } }] });
  };
  const selectionFingerprint = fingerprintOfficialMapLocation(116.1, 39.2);
  const result = await resolveOfficialLocation('同名地点', {
    fetchImpl, selectionFingerprint, accessKeyProvider: () => 'TEST-MAP-KEY-NOT-REAL',
  });
  assert.equal(result.jjdzgdjd, '116.1');
  assert.equal(result.jjdzgdwd, '39.2');
});

test('地图凭据缺失时在网络请求前安全停止', async () => {
  let fetched = false;
  await assert.rejects(
    () => resolveOfficialLocation('测试地点', {
      fetchImpl: async () => { fetched = true; throw new Error('不应请求网络'); },
      accessKeyProvider: () => '',
    }),
    /地图访问凭据未配置/,
  );
  assert.equal(fetched, false);
  await assert.rejects(
    () => resolveOfficialLocation('测试地点', {
      fetchImpl: async () => { fetched = true; throw new Error('不应请求网络'); },
      accessKeyProvider: () => { throw Object.assign(new Error('unavailable'), { code: 'KEYCHAIN_ERROR' }); },
    }),
    (error) => error.code === 'MAP_ACCESS_KEY_MISSING',
  );
  assert.equal(fetched, false);
});

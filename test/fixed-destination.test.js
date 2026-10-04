import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveConfirmedFixedDestination } from '../src/lib/fixed-destination.js';
import { fingerprintOfficialMapLocation } from '../src/lib/official-map.js';
import { SafetyError, TransportError } from '../src/lib/errors.js';

const fallback = {
  confirmed: true,
  name: '测试地铁站',
  area: '海淀区',
  longitude: '11.111111',
  latitude: '22.222222',
  fingerprint: fingerprintOfficialMapLocation(11.111111, 22.222222),
};
const ambiguous = new SafetyError('官方地图无法唯一还原上一张证的目的地', {
  code: 'MAP_LOCATION_AMBIGUOUS', stage: 'payload',
});

test('地图无法还原任何旧证地点时使用已确认的固定目的地', () => {
  assert.deepEqual(resolveConfirmedFixedDestination(fallback, ambiguous), {
    name: '测试地铁站', area: '海淀区', jjdzgdjd: '11.111111', jjdzgdwd: '22.222222',
  });
  const mapTimeout = new TransportError('官方地图地点解析超时', { path: '/as/search/poi' });
  assert.equal(resolveConfirmedFixedDestination(fallback, mapTimeout).jjdzgdjd, '11.111111');
  const missingKey = new SafetyError('官方地图访问凭据未配置', { code: 'MAP_ACCESS_KEY_MISSING' });
  assert.equal(resolveConfirmedFixedDestination(fallback, missingKey).jjdzgdjd, '11.111111');
});

test('未确认或非地图错误均不能触发固定地点回退', () => {
  assert.throws(() => resolveConfirmedFixedDestination({ ...fallback, confirmed: false }, ambiguous), (error) => error === ambiguous);
  const unrelated = new SafetyError('车辆不唯一', { code: 'VEHICLE_AMBIGUOUS' });
  assert.throws(() => resolveConfirmedFixedDestination(fallback, unrelated), (error) => error === unrelated);
});

test('固定地点坐标与已确认指纹不一致时安全停止', () => {
  assert.throws(
    () => resolveConfirmedFixedDestination({ ...fallback, longitude: '11.111121' }, ambiguous),
    (error) => error.code === 'FIXED_DESTINATION_INVALID',
  );
});

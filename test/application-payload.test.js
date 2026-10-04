import test from 'node:test';
import assert from 'node:assert/strict';
import { buildInheritedApplyPayload, resolvePreviousApplication } from '../src/lib/application-payload.js';
import { parseRecord, parseVehicle, parseUserInfo } from '../src/lib/models.js';
import { record, vehicleDetail } from './fixtures.js';

const base = {
  vehicle: parseVehicle(vehicleDetail()),
  userInfo: parseUserInfo({ jsrxm: '测试用户', jszh: 'TEST-ID-NOT-REAL' }),
  previousRecord: parseRecord(record('审核通过(生效中)')),
  applyDate: '2026-09-23',
};

test('payload 从上一张证继承 applyId 和地点字段', () => {
  const payload = buildInheritedApplyPayload({ ...base, entryType: '六环外' });
  assert.equal(payload.applyIdOld, 'apply-old');
  assert.equal(payload.jjdq, '010');
  assert.equal(payload.jjlk, '00606');
  assert.equal(payload.xxdz, '虚构测试地点');
});

test('payload 只允许六环外，严禁生成六环内类型码', () => {
  assert.throws(
    () => buildInheritedApplyPayload({ ...base, entryType: '六环内' }),
    /严禁生成六环内/,
  );
  assert.equal(buildInheritedApplyPayload({ ...base, entryType: '六环外' }).jjzzl, '02');
});

test('缺少旧 applyId 时禁止提交', () => {
  assert.throws(() => buildInheritedApplyPayload({ ...base, previousRecord: null, entryType: '六环外' }), /applyId/);
});

test('缺少不可猜测地点字段时禁止提交', () => {
  const incomplete = parseRecord(record('审核通过(生效中)', { jjlk: '' }));
  assert.throws(
    () => buildInheritedApplyPayload({ ...base, previousRecord: incomplete, entryType: '六环外' }),
    /jjlk/,
  );
});

test('从官方字典和地图结果精确恢复旧证代码', () => {
  const previousRecord = parseRecord(record('审核通过(生效中)', {
    sfzj: '',
    area: '',
    jjdq: '',
    jjmd: '',
    jjmdmc: '探亲访友',
    jjlk: '',
    jjlkmc: 'X210（测试站）',
    jjdzgdjd: '',
    jjdzgdwd: '',
  }));
  const resolved = resolvePreviousApplication({
    previousRecord,
    purposeItems: [{ zdbm: '03', zdz: '探亲访友' }],
    roadItems: [{
      zdbm: 'area-1',
      zdz: '测试分区',
      zdzj: [{ zdbm: '210', zdz: 'X210（测试站）', jjlkgdjd: '116.2', jjlkgdwd: '39.8' }],
    }],
    districtItems: [{ zdbm: '006', zdz: '海淀区' }],
    location: { area: '海淀区', jjdzgdjd: '116.1', jjdzgdwd: '39.9' },
  });
  assert.equal(resolved.raw.jjmd, '03');
  assert.equal(resolved.raw.jjlk, '210');
  assert.equal(resolved.raw.jjdq, '006');
  assert.equal(resolved.raw.sfzj, '0');
  assert.equal(resolved.raw.jjdzgdjd, '116.1');
});

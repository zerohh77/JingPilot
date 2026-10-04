import { createHash } from 'node:crypto';
import { SafetyError } from './errors.js';
import { AUTOMATION_ENTRY_TYPE, AUTOMATION_ENTRY_TYPE_CODE } from '../constants.js';

const INHERITED_FIELDS = [
  'sfzj',
  'sqdzgdjd', 'sqdzgdwd', 'sqdzbdjd', 'sqdzbdwd',
  'jjdzgdjd', 'jjdzgdwd',
  'jjlkgdjd', 'jjlkgdwd',
  'zjxxdzgdjd', 'zjxxdzgdwd', 'zjxxdzbdjd', 'zjxxdzbdwd',
  'zjxxdz', 'xxdz', 'area',
  'jjdq', 'jjmd', 'jjmdmc', 'jjlk', 'jjlkmc',
];

const REQUIRED_COMMON_FIELDS = [
  'sfzj', 'xxdz', 'area', 'jjdq', 'jjmd', 'jjmdmc',
  'jjdzgdjd', 'jjdzgdwd',
];

function missingFields(source) {
  const required = [...REQUIRED_COMMON_FIELDS];
  if (String(source.sfzj) === '1') {
    required.push('zjxxdz', 'zjxxdzgdjd', 'zjxxdzgdwd');
  } else if (String(source.sfzj) === '0') {
    required.push('jjlk', 'jjlkmc');
  } else {
    return ['sfzj'];
  }
  return required.filter((key) => source[key] === undefined || source[key] === null || source[key] === '');
}

function exactDictionaryItem(items, name, type) {
  if (!Array.isArray(items)) {
    throw new SafetyError(`${type} 字典响应结构未知`, {
      code: 'DICTIONARY_RESPONSE_UNKNOWN', stage: 'payload', details: { type },
    });
  }
  const flattened = [];
  const visit = (item) => {
    flattened.push(item);
    if (Array.isArray(item?.zdzj)) item.zdzj.forEach(visit);
  };
  items.forEach(visit);
  const matchesByCode = new Map();
  for (const item of flattened) {
    if (item?.zdz === name && item?.zdbm !== undefined && item?.zdbm !== null && item?.zdbm !== '') {
      matchesByCode.set(String(item.zdbm), item);
    }
  }
  const matches = [...matchesByCode.values()];
  if (matches.length !== 1) {
    throw new SafetyError(`${type} 字典无法唯一匹配: ${name}`, {
      code: 'DICTIONARY_MATCH_AMBIGUOUS', stage: 'payload', details: { type, matchCount: matches.length },
    });
  }
  return matches[0];
}

function resolvePurpose(raw, purposeItems) {
  if (raw.jjmd || !raw.jjmdmc) return;
  const names = String(raw.jjmdmc).split(',').map((name) => name.trim()).filter(Boolean);
  const items = names.map((name) => exactDictionaryItem(purposeItems, name, 'jjmd'));
  raw.jjmd = items.map((item) => item.zdbm).join(',');
}

function resolveDistrict(raw, districtItems) {
  if (raw.area && raw.jjdq) return;
  if (!Array.isArray(districtItems)) {
    throw new SafetyError('qjxz 字典响应结构未知', {
      code: 'DICTIONARY_RESPONSE_UNKNOWN', stage: 'payload', details: { type: 'qjxz' },
    });
  }
  if (raw.area) {
    const district = exactDictionaryItem(districtItems, raw.area, 'qjxz');
    raw.jjdq = district.zdbm;
    return;
  }
  if (raw.jjdq) {
    const matches = districtItems.filter((item) => String(item?.zdbm) === String(raw.jjdq) && item?.zdz);
    if (matches.length !== 1) {
      throw new SafetyError('qjxz 字典无法由区县代码唯一匹配', {
        code: 'DICTIONARY_MATCH_AMBIGUOUS', stage: 'payload', details: { type: 'qjxz', matchCount: matches.length },
      });
    }
    raw.area = matches[0].zdz;
    return;
  }
  if (!raw.xxdz) return;
  const matches = districtItems.filter((item) => item?.zdz && String(raw.xxdz).includes(item.zdz));
  if (matches.length !== 1) {
    throw new SafetyError('无法从上一张证的目的地唯一确定北京区县', {
      code: 'DISTRICT_MATCH_AMBIGUOUS', stage: 'payload', details: { matchCount: matches.length },
    });
  }
  raw.area = matches[0].zdz;
  raw.jjdq = matches[0].zdbm;
}

export function resolvePreviousApplication({ previousRecord, purposeItems, roadItems, districtItems, location }) {
  const raw = { ...(previousRecord?.raw || {}) };
  if (location) {
    raw.area ||= location.area;
    raw.jjdzgdjd ||= location.jjdzgdjd;
    raw.jjdzgdwd ||= location.jjdzgdwd;
  }
  resolvePurpose(raw, purposeItems);
  resolveDistrict(raw, districtItems);

  if (!raw.jjlk && raw.jjlkmc) {
    const road = exactDictionaryItem(roadItems, raw.jjlkmc, 'jjlk');
    raw.jjlk = road.zdbm;
    if (!raw.jjlkgdjd && road.jjlkgdjd) raw.jjlkgdjd = road.jjlkgdjd;
    if (!raw.jjlkgdwd && road.jjlkgdwd) raw.jjlkgdwd = road.jjlkgdwd;
  }
  if ((raw.sfzj === undefined || raw.sfzj === null || raw.sfzj === '') && raw.jjlk && raw.jjlkmc) {
    // The official H5 clears jjlk/jjlkmc whenever sfzj === "1".
    raw.sfzj = '0';
  }
  return { ...previousRecord, raw };
}

export function buildInheritedApplyPayload({
  vehicle,
  userInfo,
  previousRecord,
  applyDate,
  entryType,
  defaults = {},
}) {
  if (entryType !== AUTOMATION_ENTRY_TYPE) {
    throw new SafetyError('JingPilot 自动化严禁生成六环内申请 payload', {
      code: 'ENTRY_TYPE_FORBIDDEN', stage: 'payload',
    });
  }
  if (!previousRecord?.applyId) {
    throw new SafetyError('找不到上一张证的 applyId，禁止自动提交', { code: 'MISSING_OLD_APPLY_ID', stage: 'payload' });
  }
  const source = { ...defaults };
  for (const [key, value] of Object.entries(previousRecord.raw || {})) {
    if (value !== undefined && value !== null && value !== '') source[key] = value;
  }
  const missing = missingFields(source);
  if (missing.length > 0) {
    throw new SafetyError(`上一张申请缺少不可猜测的字段: ${missing.join(', ')}`, {
      code: 'MISSING_APPLICATION_FIELDS',
      stage: 'payload',
      details: { missing },
    });
  }
  if (!vehicle?.licenseNumber || !vehicle?.licensePlateType || !vehicle?.vehicleType || !vehicle?.vehicleId) {
    throw new SafetyError('车辆详情字段不完整', { code: 'VEHICLE_DATA_INCOMPLETE', stage: 'payload' });
  }
  if (!userInfo?.name || !userInfo?.idNumber) {
    throw new SafetyError('申请人信息不完整', { code: 'USER_DATA_INCOMPLETE', stage: 'payload' });
  }

  const payload = {};
  for (const key of INHERITED_FIELDS) {
    if (source[key] !== undefined && source[key] !== null && source[key] !== '') payload[key] = source[key];
  }
  payload.sfzj = String(source.sfzj);
  payload.sqdzgdjd = source.sqdzgdjd || '';
  payload.sqdzgdwd = source.sqdzgdwd || '';
  if (payload.sfzj === '1') {
    payload.jjlk = '';
    payload.jjlkmc = '';
    payload.jjlkgdjd = '';
    payload.jjlkgdwd = '';
  } else {
    payload.zjxxdz = '';
    payload.zjxxdzgdjd = '';
    payload.zjxxdzgdwd = '';
  }
  payload.applyIdOld = previousRecord.applyId;
  payload.jjrq = applyDate;
  payload.jsrxm = userInfo.name;
  payload.jszh = userInfo.idNumber;
  payload.jjzzl = AUTOMATION_ENTRY_TYPE_CODE;
  payload.txrxx = Array.isArray(source.txrxx) ? source.txrxx : [];
  payload.hphm = vehicle.licenseNumber;
  payload.hpzl = vehicle.licensePlateType;
  payload.cllx = vehicle.vehicleType;
  payload.vId = vehicle.vehicleId;
  return payload;
}

export function fingerprintPayload(payload) {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

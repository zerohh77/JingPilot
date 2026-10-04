import { SafetyError } from './errors.js';
import { calcRemainingDays, formatDate, getAllRecords, getFutureDate } from './models.js';
import { AUTOMATION_ENTRY_TYPE, AUTOMATION_ENTRY_TYPE_CODE } from '../constants.js';

export const STATUS = Object.freeze({
  ACTIVE: '审核通过(生效中)',
  REVIEWING: '审核中',
  APPROVED_PENDING: '审核通过(待生效)',
  CANCELLED: '已取消',
  REJECTED: '失败(审核不通过)',
  EXPIRED: '已失效',
  APPROVED_EXPIRED: '审核通过(已失效)',
});

const BLOCKING_STATUSES = new Set([STATUS.REVIEWING, STATUS.APPROVED_PENDING]);
const TERMINAL_STATUSES = new Set([
  STATUS.CANCELLED,
  STATUS.REJECTED,
  STATUS.EXPIRED,
  STATUS.APPROVED_EXPIRED,
]);
const KNOWN_STATUSES = new Set([STATUS.ACTIVE, ...BLOCKING_STATUSES, ...TERMINAL_STATUSES]);

export function selectStateVehicle(state, { plate = '', preferredPlate = '' } = {}) {
  const vehicles = state?.vehicles || [];
  if (vehicles.length === 0) throw new SafetyError('stateList 未返回绑定车辆', { code: 'NO_VEHICLE' });
  const target = plate || preferredPlate;
  if (target) {
    const matches = vehicles.filter((vehicle) => vehicle.licenseNumber === target);
    if (matches.length !== 1) throw new SafetyError('指定车辆未找到或匹配不唯一', { code: 'VEHICLE_AMBIGUOUS' });
    return matches[0];
  }
  if (vehicles.length !== 1) {
    throw new SafetyError('存在多辆车但未明确指定 preferred_vehicle，已停止自动操作', { code: 'VEHICLE_AMBIGUOUS' });
  }
  return vehicles[0];
}

function ensureCanApply(vehicle, entryType) {
  if (entryType !== AUTOMATION_ENTRY_TYPE) {
    throw new SafetyError('JingPilot 自动化严禁申请六环内进京证', {
      code: 'ENTRY_TYPE_FORBIDDEN', stage: 'decision',
    });
  }
  const allowed = vehicle.canApplyType2;
  if (allowed !== true) {
    throw new SafetyError(
      vehicle.cannotApplyReason || `API 未明确允许办理${entryType}`,
      { code: 'API_NOT_ALLOWED' },
    );
  }
  if (String(vehicle.remainingTimes) === '0' && String(vehicle.remainingDays) === '0') {
    throw new SafetyError('剩余次数和天数均为 0，配额已用完', { code: 'QUOTA_EXHAUSTED' });
  }
}

export function decideRenewal(vehicle, entryType, { today = formatDate(new Date()) } = {}) {
  if (entryType !== AUTOMATION_ENTRY_TYPE) {
    throw new SafetyError('JingPilot 自动化严禁申请六环内进京证', {
      code: 'ENTRY_TYPE_FORBIDDEN', stage: 'decision',
    });
  }
  const records = getAllRecords(vehicle);
  for (const record of records) {
    if (!record.statusName || !KNOWN_STATUSES.has(record.statusName)) {
      throw new SafetyError(`发现未知办理状态: ${record.statusName || '(空)'}`, { code: 'UNKNOWN_STATUS' });
    }
  }

  const blocker = records.find((record) => BLOCKING_STATUSES.has(record.statusName));
  if (blocker) {
    return { action: 'none', reason: blocker.statusName, record: blocker, applyDate: '' };
  }

  const active = records.filter((record) => record.statusName === STATUS.ACTIVE);
  if (active.length > 1) throw new SafetyError('发现多条生效中记录，无法安全判断', { code: 'STATE_AMBIGUOUS' });
  if (active.length === 1) {
    const record = active[0];
    const remainingDays = calcRemainingDaysAt(record, today);
    if (remainingDays > 1) {
      return { action: 'none', reason: `当前证件剩余 ${remainingDays} 天`, record, remainingDays, applyDate: '' };
    }
    ensureCanApply(vehicle, entryType);
    return {
      action: 'apply',
      reason: `当前证件剩余 ${remainingDays} 天`,
      record,
      remainingDays,
      applyDate: getFutureDate(today, 1),
    };
  }

  if (records.length === 0) {
    ensureCanApply(vehicle, entryType);
    return { action: 'apply', reason: '无办证记录', record: null, remainingDays: 0, applyDate: today };
  }

  const latest = records[0];
  if (!TERMINAL_STATUSES.has(latest.statusName)) {
    throw new SafetyError('无法根据当前记录确定续办条件', { code: 'STATE_AMBIGUOUS' });
  }
  ensureCanApply(vehicle, entryType);
  return { action: 'apply', reason: latest.statusName, record: latest, remainingDays: 0, applyDate: today };
}

export function calcRemainingDaysAt(record, today) {
  if (!record.validTo) throw new SafetyError('生效中记录缺少到期日期', { code: 'DATE_INVALID' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today) || !/^\d{4}-\d{2}-\d{2}$/.test(record.validTo)) {
    throw new SafetyError('日期格式异常', { code: 'DATE_INVALID' });
  }
  const [y1, m1, d1] = today.split('-').map(Number);
  const [y2, m2, d2] = record.validTo.split('-').map(Number);
  if (![y1, m1, d1, y2, m2, d2].every(Number.isFinite)) {
    throw new SafetyError('日期格式异常', { code: 'DATE_INVALID' });
  }
  const remaining = Math.floor((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000) + 1;
  if (remaining < 1) throw new SafetyError('生效中状态与到期日期矛盾', { code: 'DATE_INVALID' });
  return remaining;
}

export function findNewApplication(vehicle, { previousApplyIds = [], applyDate, entryType } = {}) {
  const expectedType = entryType === AUTOMATION_ENTRY_TYPE ? AUTOMATION_ENTRY_TYPE_CODE : '';
  return getAllRecords(vehicle).find((record) => (
    record.applyId
    && !previousApplyIds.includes(record.applyId)
    && (!applyDate || record.validFrom === applyDate || record.raw?.jjrq === applyDate)
    && (!entryType || record.entryType === expectedType)
  )) || null;
}

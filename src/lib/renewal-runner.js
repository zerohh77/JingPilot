import { randomUUID } from 'node:crypto';
import { parseRecord, parseStateData, parseUserInfo, parseVehicle, formatDate, getAllRecords } from './models.js';
import { buildInheritedApplyPayload, fingerprintPayload, resolvePreviousApplication } from './application-payload.js';
import { decideRenewal, findNewApplication, selectStateVehicle, STATUS } from './renewal-policy.js';
import { SafetyError, TransportError } from './errors.js';
import { maskPlate } from './masking.js';
import { fingerprintOfficialMapLocation, resolveOfficialLocation } from './official-map.js';
import { resolveConfirmedFixedDestination } from './fixed-destination.js';

const sleepDefault = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function recordIds(vehicle) {
  return getAllRecords(vehicle).map((record) => record.applyId).filter(Boolean);
}

export class RenewalRunner {
  constructor({
    api,
    config,
    stateStore,
    logger,
    sendNotification = async () => {},
    sleep = sleepDefault,
    now = () => new Date(),
    locationResolver = resolveOfficialLocation,
  }) {
    this.api = api;
    this.config = config;
    this.stateStore = stateStore;
    this.logger = logger;
    this.sendNotification = sendNotification;
    this.sleep = sleep;
    this.now = now;
    this.locationResolver = locationResolver;
  }

  async notifyBestEffort(title, body, displayDetails) {
    try {
      return await this.sendNotification(title, body, displayDetails);
    } catch (error) {
      try {
        this.logger?.warn(`通知发送失败（不影响主流程）：${error.message}`);
      } catch {
        // Notification diagnostics must never affect the business flow.
      }
      return [{ status: 'rejected', reason: error }];
    }
  }

  async inspect({ plate = '' } = {}) {
    const raw = await this.api.getStateData();
    const state = parseStateData(raw);
    const vehicle = selectStateVehicle(state, { plate, preferredPlate: this.config.preferred_vehicle });
    const today = formatDate(this.now());
    const decision = decideRenewal(vehicle, this.config.entry_type, { today });
    this.logger?.info(
      `stateList 查询完成：车辆=${maskPlate(vehicle.licenseNumber)} 状态=${decision.record?.statusName || '无记录'} 判断=${decision.reason}`,
    );
    this.stateStore.update({ last_check: this.now().toISOString() });
    return { state, vehicle, decision, today };
  }

  async loadPayload({ vehicle, decision }, { onFixedDestination } = {}) {
    if (!decision.record?.applyId || !decision.record?.applyTime) {
      throw new SafetyError('上一张申请缺少详情查询键', { code: 'MISSING_APPLICATION_DETAIL_KEY', stage: 'payload' });
    }
    const [rawVehicles, rawUser, rawDetails] = await Promise.all([
      this.api.listVehicles(),
      this.api.getUserInfo(),
      this.api.getApplicationDetail(decision.record.applyId, decision.record.applyTime),
    ]);
    if (!Array.isArray(rawVehicles)) {
      throw new SafetyError('车辆详情接口响应结构未知', { code: 'VEHICLE_RESPONSE_UNKNOWN', stage: 'payload' });
    }
    const fullMatches = rawVehicles.map(parseVehicle).filter((item) => item.licenseNumber === vehicle.licenseNumber);
    if (fullMatches.length !== 1) {
      throw new SafetyError('车辆详情匹配不唯一', { code: 'VEHICLE_AMBIGUOUS', stage: 'payload' });
    }
    const userInfo = parseUserInfo(rawUser || {});
    if (!Array.isArray(rawDetails) || rawDetails.length !== 1) {
      throw new SafetyError('上一张申请详情响应结构未知或匹配不唯一', {
        code: 'APPLICATION_DETAIL_UNKNOWN',
        stage: 'payload',
      });
    }
    let detailedRecord = parseRecord({ ...decision.record.raw, ...rawDetails[0] });
    if (detailedRecord.applyId !== decision.record.applyId) {
      throw new SafetyError('上一张申请详情 applyId 不匹配', {
        code: 'APPLICATION_DETAIL_MISMATCH',
        stage: 'payload',
      });
    }
    const rawDetail = detailedRecord.raw;
    const needsLocation = !rawDetail.area || !rawDetail.jjdq || !rawDetail.jjdzgdjd || !rawDetail.jjdzgdwd;
    if (needsLocation && this.config.official_map_lookup_confirmed !== true) {
      throw new SafetyError('目的地解析需要向北京交管官方地图发送旧证完整地址；尚未获得明确授权', {
        code: 'OFFICIAL_MAP_CONSENT_REQUIRED', stage: 'payload',
      });
    }
    const fixed = this.config.fixed_destination_fallback;
    const sameFixedName = String(rawDetail.xxdz || '').replace(/\s+/g, '')
      === String(fixed?.name || '').replace(/\s+/g, '');
    const selectionFingerprint = fixed?.confirmed === true && !sameFixedName
      ? ''
      : this.config.official_map_location_fingerprint || '';
    const locationRequest = needsLocation
      ? Promise.resolve().then(() => this.locationResolver(rawDetail.xxdz, {
        selectionFingerprint,
      })).then((location) => ({ location, fixed: false })).catch((error) => ({
        location: resolveConfirmedFixedDestination(this.config.fixed_destination_fallback, error),
        fixed: true,
      }))
      : { location: null, fixed: false };
    const [purposeItems, roadItems, districtItems, resolvedLocation] = await Promise.all([
      this.api.queryDictionary('jjmd'),
      this.api.queryDictionary('jjlk', { vId: fullMatches[0].vehicleId }),
      this.api.queryDictionary('qjxz'),
      locationRequest,
    ]);
    if (resolvedLocation.fixed) {
      const fixed = resolvedLocation.location;
      detailedRecord.raw = {
        ...detailedRecord.raw,
        xxdz: fixed.name,
        area: fixed.area,
        jjdq: '',
        jjdzgdjd: fixed.jjdzgdjd,
        jjdzgdwd: fixed.jjdzgdwd,
      };
      this.logger?.warn('官方地图未能还原旧证目的地，改用用户确认的固定目的地');
    }
    if (resolvedLocation.fixed || (needsLocation && fixed?.confirmed === true
      && selectionFingerprint === fixed.fingerprint
      && fingerprintOfficialMapLocation(
        resolvedLocation.location?.jjdzgdjd,
        resolvedLocation.location?.jjdzgdwd,
      ) === fixed.fingerprint)) {
      onFixedDestination?.();
    }
    detailedRecord = resolvePreviousApplication({
      previousRecord: detailedRecord,
      purposeItems,
      roadItems,
      districtItems,
      location: resolvedLocation.location,
    });
    return buildInheritedApplyPayload({
      vehicle: fullMatches[0],
      userInfo,
      previousRecord: detailedRecord,
      applyDate: decision.applyDate,
      entryType: this.config.entry_type,
      defaults: this.config.application_defaults,
    });
  }

  async notifyApprovalIfNeeded(vehicle) {
    const approved = getAllRecords(vehicle).find((record) => record.statusName === STATUS.APPROVED_PENDING && record.applyId);
    if (!approved) return;
    const localState = this.stateStore.load();
    if (localState.notified_approval_ids.includes(approved.applyId)) return;
    const results = await this.notifyBestEffort(
      '进京证新证审核通过',
      `车辆：${maskPlate(vehicle.licenseNumber)}\n类型：${approved.entryTypeName || this.config.entry_type}\n状态：审核通过（待生效）`,
      { validFrom: approved.validFrom, validTo: approved.validTo },
    );
    if (Array.isArray(results) && results.some((item) => item.status === 'fulfilled')) {
      try {
        this.stateStore.update({
          notified_approval_ids: [...localState.notified_approval_ids, approved.applyId].slice(-20),
        });
      } catch (error) {
        try { this.logger?.warn(`通知状态记录失败（不影响主流程）：${error.message}`); } catch { /* best effort */ }
      }
    }
  }

  confirmPending(pending, record) {
    this.stateStore.update({
      pending_attempt: null,
      last_apply_date: pending.applyDate,
      last_apply_result: 'confirmed',
      last_apply_id: record.applyId,
    });
  }

  async reconcilePending(vehicle) {
    const localState = this.stateStore.load();
    const pending = localState.pending_attempt;
    if (!pending) return null;
    if (pending.plate !== vehicle.licenseNumber) {
      throw new SafetyError('存在另一车辆的未确认提交，禁止继续自动 POST', { code: 'PENDING_ATTEMPT' });
    }
    const found = findNewApplication(vehicle, {
      previousApplyIds: pending.previousApplyIds,
      applyDate: pending.applyDate,
      entryType: pending.entryType,
    });
    if (found) {
      this.confirmPending(pending, found);
      this.logger?.info('历史未确认提交已由 stateList 确认');
      await this.notifyBestEffort(
        '进京证自动续办已确认',
        `车辆：${maskPlate(vehicle.licenseNumber)}\n类型：${pending.entryType}\n申请日期：${pending.applyDate}\n状态：${found.statusName}`,
        {
          validFrom: found.validFrom,
          validTo: found.validTo,
          ...(pending.usedFixedDestination === true ? { usedFixedDestination: true } : {}),
        },
      );
      return { outcome: 'recovered-confirmed', record: found, usedFixedDestination: pending.usedFixedDestination === true };
    }
    throw new SafetyError(
      `存在 ${pending.outcome || 'pending'} 的历史提交，stateList 尚未发现新申请；禁止自动再次 POST`,
      { code: 'PENDING_ATTEMPT' },
    );
  }

  async run({ plate = '', dryRun = false } = {}) {
    this.logger?.info(`START${dryRun ? ' DRY-RUN' : ''}`);
    const first = await this.inspect({ plate });
    const recovered = await this.reconcilePending(first.vehicle);
    if (recovered) return recovered;
    await this.notifyApprovalIfNeeded(first.vehicle);

    this.logger?.info(`车辆 ${maskPlate(first.vehicle.licenseNumber)} 当前判断：${first.decision.reason}`);
    if (first.decision.action !== 'apply') {
      this.logger?.info('无需续办 END');
      return { outcome: 'no-action', ...first };
    }

    let firstUsedFixedDestination = false;
    const firstPayload = await this.loadPayload(first, {
      onFixedDestination: () => { firstUsedFixedDestination = true; },
    });
    const firstFingerprint = fingerprintPayload(firstPayload);
    this.logger?.info(`计划办理：车辆=${maskPlate(first.vehicle.licenseNumber)} 类型=${this.config.entry_type} 日期=${first.decision.applyDate}`);
    if (dryRun) {
      this.logger?.info('DRY-RUN 完成，未发送 insertApplyRecord');
      return {
        outcome: 'dry-run',
        applyDate: first.decision.applyDate,
        entryType: this.config.entry_type,
        vehicle: first.vehicle,
        payloadFingerprint: firstFingerprint,
        usedFixedDestination: firstUsedFixedDestination,
      };
    }

    if (this.config.live_submit_confirmed !== true) {
      throw new SafetyError('首次真实提交尚未获得人工确认；已停止且未调用 insertApplyRecord', {
        code: 'LIVE_SUBMIT_CONSENT_REQUIRED', stage: 'pre-submit',
      });
    }

    const second = await this.inspect({ plate: first.vehicle.licenseNumber });
    if (second.decision.action !== 'apply' || second.decision.applyDate !== first.decision.applyDate) {
      throw new SafetyError('提交前二次 stateList 结果已变化，已停止提交', { code: 'PRECHECK_CHANGED' });
    }
    let secondUsedFixedDestination = false;
    const secondPayload = await this.loadPayload(second, {
      onFixedDestination: () => { secondUsedFixedDestination = true; },
    });
    const secondFingerprint = fingerprintPayload(secondPayload);
    if (secondFingerprint !== firstFingerprint) {
      throw new SafetyError('提交前 payload 数据发生变化，已停止提交', { code: 'PRECHECK_CHANGED' });
    }

    const pending = {
      id: randomUUID(),
      startedAt: this.now().toISOString(),
      outcome: 'pending',
      plate: second.vehicle.licenseNumber,
      entryType: this.config.entry_type,
      applyDate: second.decision.applyDate,
      previousApplyIds: recordIds(second.vehicle),
      payloadFingerprint: secondFingerprint,
      usedFixedDestination: secondUsedFixedDestination,
    };
    this.stateStore.update({
      last_apply_attempt: pending.startedAt,
      last_apply_date: pending.applyDate,
      last_apply_result: 'pending',
      pending_attempt: pending,
    });

    this.logger?.info(`即将办理：车辆=${maskPlate(pending.plate)} 类型=${pending.entryType} 开始日期=${pending.applyDate}`);
    try {
      await this.api.submitApply(secondPayload);
    } catch (error) {
      const outcome = error instanceof TransportError && error.uncertain ? 'uncertain' : 'rejected';
      this.stateStore.update({
        last_apply_result: outcome,
        pending_attempt: { ...pending, outcome, errorCode: error.code || 'ERROR' },
      });
      if (outcome === 'uncertain') {
        this.logger?.warn('insertApplyRecord 响应不确定，禁止重试；先用 stateList 核验');
        const confirmation = await this.confirmAfterSubmit(pending, { plate: pending.plate, tolerateMissing: true });
        if (confirmation) return confirmation;
      }
      await this.notifyBestEffort(
        '进京证自动续办异常',
        `阶段：提交\n错误：${error.message}\n本轮已安全停止，未继续提交，请检查。`,
      );
      throw error;
    }

    const confirmation = await this.confirmAfterSubmit(pending, { plate: pending.plate });
    if (confirmation) return confirmation;
    throw new SafetyError('insertApplyRecord 已返回成功，但 stateList 尚未确认新申请；禁止再次 POST', {
      code: 'SUBMIT_UNCONFIRMED',
      stage: 'confirmation',
    });
  }

  async confirmAfterSubmit(pending, { plate, tolerateMissing = false } = {}) {
    await this.sleep(Number(this.config.confirm_delay_ms) || 5000);
    let checked;
    try {
      checked = await this.inspect({ plate });
    } catch (error) {
      this.stateStore.update({
        last_apply_result: 'unconfirmed',
        pending_attempt: { ...pending, outcome: 'unconfirmed', confirmationError: error.code || 'ERROR' },
      });
      if (tolerateMissing) return null;
      throw error;
    }
    const record = findNewApplication(checked.vehicle, {
      previousApplyIds: pending.previousApplyIds,
      applyDate: pending.applyDate,
      entryType: pending.entryType,
    });
    if (!record) {
      this.stateStore.update({
        last_apply_result: 'unconfirmed',
        pending_attempt: { ...pending, outcome: 'unconfirmed' },
      });
      return null;
    }
    this.confirmPending(pending, record);
    this.logger?.info(`二次确认成功：${record.statusName}`);
    await this.notifyBestEffort(
      '进京证自动续办已提交',
      `车辆：${maskPlate(checked.vehicle.licenseNumber)}\n类型：${pending.entryType}\n申请日期：${pending.applyDate}\n状态：${record.statusName}`,
      {
        validFrom: record.validFrom,
        validTo: record.validTo,
        ...(pending.usedFixedDestination === true ? { usedFixedDestination: true } : {}),
      },
    );
    this.logger?.info('END');
    return { outcome: 'submitted-confirmed', record, vehicle: checked.vehicle, usedFixedDestination: pending.usedFixedDestination === true };
  }
}

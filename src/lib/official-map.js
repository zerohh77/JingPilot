import { createHash } from 'node:crypto';
import { SafetyError, TransportError } from './errors.js';
import { KeychainStore, OFFICIAL_MAP_KEY_ACCOUNT } from './keychain.js';

const MAP_BASE_URL = 'https://wfcl.jtgl.beijing.gov.cn';
const DEFAULT_TIMEOUT_MS = 20_000;

function normalized(value) {
  return String(value || '').replace(/\s+/g, '');
}

function candidateFingerprint(item) {
  const longitude = Number(item?.location?.lng);
  const latitude = Number(item?.location?.lat);
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return '';
  const canonical = `${longitude.toFixed(6)},${latitude.toFixed(6)}`;
  return createHash('sha256').update(canonical).digest('hex');
}

export function fingerprintOfficialMapLocation(longitude, latitude) {
  return candidateFingerprint({ location: { lng: longitude, lat: latitude } });
}

async function fetchMapJson(path, params, { fetchImpl, timeoutMs, accessKey }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const url = new URL(path, MAP_BASE_URL);
    for (const [key, value] of Object.entries({ ...params, ak: accessKey })) {
      url.searchParams.set(key, String(value));
    }
    const response = await fetchImpl(url, { signal: controller.signal });
    if (!response.ok) {
      throw new TransportError(`官方地图接口 HTTP ${response.status}`, { path, uncertain: false });
    }
    const result = await response.json();
    if (String(result?.status) !== '0') {
      throw new SafetyError('官方地图接口拒绝地点解析', {
        code: 'MAP_LOOKUP_REJECTED', stage: 'payload', details: { path, status: result?.status },
      });
    }
    return result;
  } catch (error) {
    if (error instanceof SafetyError || error instanceof TransportError) throw error;
    throw new TransportError(error?.name === 'AbortError' ? '官方地图地点解析超时' : '官方地图地点解析失败', {
      path,
      uncertain: false,
      cause: error,
    });
  } finally {
    clearTimeout(timeout);
  }
}

export async function resolveOfficialLocation(address, {
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  selectionFingerprint = '',
  accessKeyProvider = () => new KeychainStore().get(OFFICIAL_MAP_KEY_ACCOUNT),
} = {}) {
  if (!address) {
    throw new SafetyError('上一张申请缺少目的地名称', {
      code: 'MISSING_DESTINATION_ADDRESS', stage: 'payload',
    });
  }
  let accessKey;
  try {
    accessKey = accessKeyProvider();
  } catch (error) {
    if (error?.code !== 'KEYCHAIN_ERROR') throw error;
  }
  if (!accessKey) {
    throw new SafetyError('官方地图访问凭据未配置，已停止地点解析', {
      code: 'MAP_ACCESS_KEY_MISSING', stage: 'payload',
    });
  }
  const search = await fetchMapJson('/as/search/poi', {
    query: address,
    scope: 1,
    region: '北京市',
    page_size: 20,
    page_num: 1,
  }, { fetchImpl, timeoutMs, accessKey });
  const exactMatches = (Array.isArray(search.results) ? search.results : []).filter((item) => (
    normalized(`${item?.address || ''}${item?.name || ''}`) === normalized(address)
    && Number.isFinite(Number(item?.location?.lng))
    && Number.isFinite(Number(item?.location?.lat))
  ));
  const uniqueMatches = [...new Map(exactMatches.map((item) => [candidateFingerprint(item), item])).values()];
  const matches = selectionFingerprint
    ? uniqueMatches.filter((item) => candidateFingerprint(item) === selectionFingerprint)
    : uniqueMatches;
  if (matches.length !== 1) {
    throw new SafetyError('官方地图无法唯一还原上一张证的目的地', {
      code: 'MAP_LOCATION_AMBIGUOUS',
      stage: 'payload',
      details: { matchCount: matches.length, uniqueCandidateCount: uniqueMatches.length },
    });
  }

  const item = matches[0];
  const longitude = String(item.location.lng);
  const latitude = String(item.location.lat);
  const geocode = await fetchMapJson('/gss/geocode/v2', {
    location: `${longitude},${latitude}`,
  }, { fetchImpl, timeoutMs, accessKey });
  const district = geocode?.result?.[0]?.addressComponent?.district;
  if (!district) {
    throw new SafetyError('官方地图未返回目的地区县', {
      code: 'MAP_DISTRICT_MISSING', stage: 'payload',
    });
  }
  return {
    area: district,
    jjdzgdjd: longitude,
    jjdzgdwd: latitude,
  };
}

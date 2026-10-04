import { SafetyError, TransportError } from './errors.js';
import { fingerprintOfficialMapLocation } from './official-map.js';

const MAP_FAILURE_CODES = new Set([
  'MAP_LOCATION_AMBIGUOUS',
  'MAP_LOOKUP_REJECTED',
  'MAP_DISTRICT_MISSING',
  'MISSING_DESTINATION_ADDRESS',
  'MAP_ACCESS_KEY_MISSING',
]);
const MAP_PATHS = new Set(['/as/search/poi', '/gss/geocode/v2']);

export function resolveConfirmedFixedDestination(fallback, error) {
  const mapFailure = MAP_FAILURE_CODES.has(error?.code)
    || (error instanceof TransportError && MAP_PATHS.has(error.path));
  if (!mapFailure || !fallback || fallback.confirmed !== true) throw error;

  const longitude = Number(fallback.longitude);
  const latitude = Number(fallback.latitude);
  if (!fallback.name || !fallback.area
    || !Number.isFinite(longitude) || !Number.isFinite(latitude)
    || longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90
    || !fallback.fingerprint
    || fingerprintOfficialMapLocation(longitude, latitude) !== fallback.fingerprint) {
    throw new SafetyError('已确认固定目的地配置无效，禁止自动使用', {
      code: 'FIXED_DESTINATION_INVALID', stage: 'payload',
    });
  }

  return {
    name: fallback.name,
    area: fallback.area,
    jjdzgdjd: String(fallback.longitude),
    jjdzgdwd: String(fallback.latitude),
  };
}

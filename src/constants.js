export const VEHICLE_TYPE_MAP = {
  '01': '客车',
  '02': '货车',
};

export const LICENSE_PLATE_TYPE_MAP = {
  '02': '小型汽车',
  '01': '大型汽车',
  '52': '小型新能源汽车',
  '51': '大型新能源汽车',
  '06': '外籍汽车',
  '13': '低速车',
};

export const SOURCE = '99c4g1a438jgf412sa3xvckd43256h7g';

export const CONFIG_FILE = 'config.json';

// Product safety invariant: automation may only submit 六环外 permits.
export const AUTOMATION_ENTRY_TYPE = '六环外';
export const AUTOMATION_ENTRY_TYPE_CODE = '02';

// API base URL (XOR-obfuscated to avoid plaintext in source)
const _k = 'jingpilot';
const _d = '021d1a17035343401e0013400d040e0041160f00040e1e0e42081b1c470d094a5b585b47';
export const API_BASE_URL = Buffer.from(_d, 'hex').map((b, i) => b ^ _k.charCodeAt(i % _k.length)).toString();

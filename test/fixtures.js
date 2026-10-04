export function record(statusName, overrides = {}) {
  return {
    vId: 'vehicle-1',
    applyId: 'apply-old',
    blzt: '1',
    blztmc: statusName,
    yxqs: '2026-09-16',
    yxqz: '2026-09-22',
    jjzzl: '02',
    jjzzlmc: '六环外',
    sqsj: '2026-09-15 09:00:00',
    hphm: 'TEST-PLATE-1',
    sfzj: '0',
    sqdzgdjd: '11.111111',
    sqdzgdwd: '22.222222',
    sqdzbdjd: '11.111112',
    sqdzbdwd: '22.222223',
    zjxxdz: '虚构测试地点',
    xxdz: '虚构测试地点',
    jjdzgdjd: '11.111111',
    jjdzgdwd: '22.222222',
    area: '昌平区',
    jjdq: '010',
    jjmd: '06',
    jjmdmc: '其它',
    jjlk: '00606',
    jjlkmc: '其他道路',
    ...overrides,
  };
}

export function stateData({ primary = [], secondary = [], canInside = true, canOutside = true } = {}) {
  return {
    sfzmhm: 'TEST-ID-NOT-REAL',
    bzclxx: [{
      vId: 'vehicle-1',
      hpzl: '02',
      hphm: 'TEST-PLATE-1',
      ybcs: 1,
      bzts: 7,
      kjts: 7,
      sycs: 10,
      syts: 84,
      ylzsfkb: canInside ? 1 : 0,
      elzsfkb: canOutside ? 1 : 0,
      bnbzyy: '',
      cllx: '01',
      bzxx: primary,
      ecbzxx: secondary,
    }],
  };
}

export function vehicleDetail() {
  return {
    hphm: 'TEST-PLATE-1',
    hpzl: '02',
    cllx: '01',
    fdjh: 'TEST-ENGINE',
    ppxh: 'TEST',
    zcsj: '2020-01-01',
    vId: 'vehicle-1',
  };
}

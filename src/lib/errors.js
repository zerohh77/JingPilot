export class JingPilotError extends Error {
  constructor(message, { code = 'JINGPILOT_ERROR', stage = 'unknown', cause } = {}) {
    super(message, { cause });
    this.name = this.constructor.name;
    this.code = code;
    this.stage = stage;
  }
}

export class AuthError extends JingPilotError {
  constructor(message = '认证失效', options = {}) {
    super(message, { code: 'AUTH_ERROR', stage: 'auth', ...options });
  }
}

export class ApiError extends JingPilotError {
  constructor(message, { apiCode, httpStatus, path, ...options } = {}) {
    super(message, { code: 'API_ERROR', stage: 'api', ...options });
    this.apiCode = apiCode;
    this.httpStatus = httpStatus;
    this.path = path;
  }
}

export class TransportError extends JingPilotError {
  constructor(message, { path, uncertain = false, ...options } = {}) {
    super(message, { code: 'TRANSPORT_ERROR', stage: 'network', ...options });
    this.path = path;
    this.uncertain = uncertain;
  }
}

export class SafetyError extends JingPilotError {
  constructor(message, { code = 'SAFETY_STOP', stage = 'decision', details, ...options } = {}) {
    super(message, { code, stage, ...options });
    this.details = details;
  }
}

export class LockError extends JingPilotError {
  constructor(message = '已有一个 JingPilot 实例正在运行') {
    super(message, { code: 'LOCKED', stage: 'lock' });
  }
}

// Deprecated compatibility export for integrations that imported the old class name.
export { JingPilotError as CrossBjError };

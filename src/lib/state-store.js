import { chmodSync, existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { ensurePrivateDir, getDataDir } from './config-manager.js';

export function emptyState() {
  return {
    version: 1,
    last_check: '',
    last_apply_attempt: '',
    last_apply_date: '',
    last_apply_result: '',
    last_apply_id: '',
    pending_attempt: null,
    notified_approval_ids: [],
  };
}

export class StateStore {
  constructor({ path = join(getDataDir(), 'state.json') } = {}) {
    this.path = path;
  }

  load() {
    if (!existsSync(this.path)) return emptyState();
    return { ...emptyState(), ...JSON.parse(readFileSync(this.path, 'utf8')) };
  }

  save(state) {
    ensurePrivateDir(dirname(this.path));
    const temp = `${this.path}.${process.pid}.tmp`;
    writeFileSync(temp, `${JSON.stringify({ ...emptyState(), ...state }, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    chmodSync(temp, 0o600);
    renameSync(temp, this.path);
  }

  update(updates) {
    const next = { ...this.load(), ...updates };
    this.save(next);
    return next;
  }
}

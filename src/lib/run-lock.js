import { closeSync, existsSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { ensurePrivateDir, getDataDir } from './config-manager.js';
import { LockError } from './errors.js';

function processExists(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

export class RunLock {
  constructor({ path = join(getDataDir(), 'run.lock'), pid = process.pid, isAlive = processExists } = {}) {
    this.path = path;
    this.pid = pid;
    this.isAlive = isAlive;
    this.fd = null;
  }

  acquire() {
    ensurePrivateDir(dirname(this.path));
    try {
      this.fd = openSync(this.path, 'wx', 0o600);
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      let existingPid = 0;
      try { existingPid = Number(JSON.parse(readFileSync(this.path, 'utf8')).pid); } catch { /* stale malformed lock */ }
      if (this.isAlive(existingPid)) throw new LockError(`已有 JingPilot 实例正在运行（PID ${existingPid}）`);
      unlinkSync(this.path);
      this.fd = openSync(this.path, 'wx', 0o600);
    }
    writeFileSync(this.fd, JSON.stringify({ pid: this.pid, startedAt: new Date().toISOString() }));
    return this;
  }

  release() {
    if (this.fd !== null) {
      closeSync(this.fd);
      this.fd = null;
    }
    if (!existsSync(this.path)) return;
    try {
      const current = JSON.parse(readFileSync(this.path, 'utf8'));
      if (current.pid === this.pid) unlinkSync(this.path);
    } catch {
      // Do not remove a lock we cannot prove belongs to this process.
    }
  }
}

export async function withRunLock(fn, options = {}) {
  const lock = new RunLock(options).acquire();
  try {
    return await fn();
  } finally {
    lock.release();
  }
}

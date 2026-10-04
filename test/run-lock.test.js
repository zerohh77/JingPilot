import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { RunLock } from '../src/lib/run-lock.js';
import { LockError } from '../src/lib/errors.js';

test('重复进程被文件锁阻止', () => {
  const dir = mkdtempSync(join(tmpdir(), 'jingpilot-lock-'));
  const path = join(dir, 'run.lock');
  const first = new RunLock({ path, pid: 101, isAlive: (pid) => pid === 101 }).acquire();
  assert.throws(() => new RunLock({ path, pid: 202, isAlive: (pid) => pid === 101 }).acquire(), LockError);
  first.release();
  rmSync(dir, { recursive: true, force: true });
});

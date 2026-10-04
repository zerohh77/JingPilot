import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { rotateSchedulerLogs } from '../src/lib/scheduler-log.js';

test('scheduler 日志超过上限时保留一份并截断当前文件', () => {
  const dir = mkdtempSync(join(tmpdir(), 'jingpilot-scheduler-log-'));
  const path = join(dir, 'scheduler.log');
  writeFileSync(path, '1234567890', { mode: 0o600 });
  rotateSchedulerLogs({ dir, maxBytes: 5 });
  assert.equal(readFileSync(`${path}.1`, 'utf8'), '1234567890');
  assert.equal(statSync(path).size, 0);
  assert.equal(statSync(`${path}.1`).mode & 0o777, 0o600);
  rmSync(dir, { recursive: true, force: true });
});

test('scheduler 小日志也会收紧为 0600', () => {
  const dir = mkdtempSync(join(tmpdir(), 'jingpilot-scheduler-mode-'));
  const path = join(dir, 'scheduler-error.log');
  writeFileSync(path, '', { mode: 0o644 });
  rotateSchedulerLogs({ dir, maxBytes: 100 });
  assert.equal(statSync(path).mode & 0o777, 0o600);
  rmSync(dir, { recursive: true, force: true });
});

import { chmodSync, copyFileSync, existsSync, mkdirSync, statSync, truncateSync } from 'node:fs';
import { join } from 'node:path';
import { getLogDir } from './config-manager.js';

const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;

export function rotateSchedulerLogs({ dir = getLogDir(), maxBytes = DEFAULT_MAX_BYTES } = {}) {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  for (const name of ['scheduler.log', 'scheduler-error.log']) {
    const path = join(dir, name);
    if (!existsSync(path)) continue;
    chmodSync(path, 0o600);
    if (statSync(path).size < maxBytes) continue;
    const rotated = `${path}.1`;
    copyFileSync(path, rotated);
    chmodSync(rotated, 0o600);
    truncateSync(path, 0);
    chmodSync(path, 0o600);
  }
}

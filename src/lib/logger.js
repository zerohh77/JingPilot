import { appendFileSync, chmodSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { getLogDir } from './config-manager.js';
import { redact } from './masking.js';

function localTimestamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export class Logger {
  constructor({ dir = getLogDir(), consoleEnabled = true, retainDays = 30 } = {}) {
    this.dir = dir;
    this.consoleEnabled = consoleEnabled;
    this.retainDays = retainDays;
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    this.rotate();
  }

  get path() {
    return join(this.dir, `${localTimestamp().slice(0, 10)}.log`);
  }

  log(level, message) {
    const safe = redact(message);
    appendFileSync(this.path, `${localTimestamp()} ${level.toUpperCase()} ${safe}\n`, { encoding: 'utf8', mode: 0o600 });
    try { chmodSync(this.path, 0o600); } catch { /* best effort */ }
    if (this.consoleEnabled) (level === 'error' ? console.error : console.log)(safe);
  }

  info(message) { this.log('info', message); }
  warn(message) { this.log('warn', message); }
  error(message) { this.log('error', message); }

  rotate(now = Date.now()) {
    if (!existsSync(this.dir)) return;
    const cutoff = now - this.retainDays * 24 * 60 * 60 * 1000;
    for (const file of readdirSync(this.dir)) {
      if (!/^\d{4}-\d{2}-\d{2}\.log$/.test(file)) continue;
      const path = join(this.dir, file);
      if (statSync(path).mtimeMs < cutoff) unlinkSync(path);
    }
  }
}

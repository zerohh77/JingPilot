import {
  chmodSync,
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, relative } from 'node:path';

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function listFiles(root) {
  if (!existsSync(root)) return [];
  const files = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      const stat = statSync(path);
      if (stat.isDirectory()) walk(path);
      else if (stat.isFile()) files.push(path);
    }
  };
  walk(root);
  return files.sort();
}

function copyVerifiedFile(source, destination, mode = 0o600) {
  mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });
  copyFileSync(source, destination);
  chmodSync(destination, mode);
  if (sha256(source) !== sha256(destination)) throw new Error(`复制校验失败: ${source}`);
}

function copyVerifiedTree(source, destination) {
  if (!existsSync(source)) return [];
  cpSync(source, destination, { recursive: true, force: false, errorOnExist: true });
  const copied = [];
  for (const sourceFile of listFiles(source)) {
    const rel = relative(source, sourceFile);
    const destinationFile = join(destination, rel);
    if (!existsSync(destinationFile) || sha256(sourceFile) !== sha256(destinationFile)) {
      throw new Error(`目录复制校验失败: ${sourceFile}`);
    }
    copied.push(rel);
  }
  return copied;
}

function parseJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function safeTimestamp(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-');
}

export function migrationPaths(home) {
  return {
    legacyConfigDir: join(home, '.cross-bj'),
    legacyConfig: join(home, '.cross-bj', 'config.json'),
    legacyDataDir: join(home, 'Library', 'Application Support', 'cross-bj'),
    legacyState: join(home, 'Library', 'Application Support', 'cross-bj', 'state.json'),
    legacyLogDir: join(home, 'Library', 'Logs', 'cross-bj'),
    olderLogDir: join(home, 'Library', 'Logs', 'jinjingzheng'),
    dataDir: join(home, 'Library', 'Application Support', 'JingPilot'),
    logDir: join(home, 'Library', 'Logs', 'JingPilot'),
    backupRoot: join(home, 'Library', 'Application Support', 'JingPilot Migration Backups'),
  };
}

export function migrateLegacyData({ home, now = new Date() }) {
  const paths = migrationPaths(home);
  if (!existsSync(paths.legacyConfig)) throw new Error(`找不到旧配置: ${paths.legacyConfig}`);
  if (!existsSync(paths.legacyState)) throw new Error(`找不到旧状态: ${paths.legacyState}`);
  if (existsSync(paths.dataDir) || existsSync(paths.logDir)) {
    throw new Error('JingPilot 目标目录已存在；为避免覆盖，迁移已停止');
  }

  const stamp = safeTimestamp(now);
  const backupDir = join(paths.backupRoot, stamp);
  const stagedData = join(dirname(paths.dataDir), `.JingPilot.migration-${process.pid}`);
  const stagedLogs = join(dirname(paths.logDir), `.JingPilot.migration-${process.pid}`);
  mkdirSync(backupDir, { recursive: true, mode: 0o700 });
  chmodSync(paths.backupRoot, 0o700);
  chmodSync(backupDir, 0o700);

  copyVerifiedTree(paths.legacyConfigDir, join(backupDir, 'legacy-config'));
  copyVerifiedTree(paths.legacyDataDir, join(backupDir, 'legacy-data'));
  copyVerifiedTree(paths.legacyLogDir, join(backupDir, 'legacy-logs-cross-bj'));
  copyVerifiedTree(paths.olderLogDir, join(backupDir, 'legacy-logs-jinjingzheng'));

  mkdirSync(stagedData, { recursive: false, mode: 0o700 });
  copyVerifiedFile(paths.legacyConfig, join(stagedData, 'config.json'));
  copyVerifiedFile(paths.legacyState, join(stagedData, 'state.json'));
  const sourceConfig = parseJson(paths.legacyConfig);
  const copiedConfig = parseJson(join(stagedData, 'config.json'));
  const sourceState = parseJson(paths.legacyState);
  const copiedState = parseJson(join(stagedData, 'state.json'));
  if (JSON.stringify(sourceConfig) !== JSON.stringify(copiedConfig)) throw new Error('config.json 语义校验失败');
  if (JSON.stringify(sourceState) !== JSON.stringify(copiedState)) throw new Error('state.json 语义校验失败');

  mkdirSync(stagedLogs, { recursive: false, mode: 0o700 });
  if (existsSync(paths.legacyLogDir)) copyVerifiedTree(paths.legacyLogDir, join(stagedLogs, 'imported-cross-bj'));
  if (existsSync(paths.olderLogDir)) copyVerifiedTree(paths.olderLogDir, join(stagedLogs, 'legacy', 'jinjingzheng'));

  renameSync(stagedData, paths.dataDir);
  renameSync(stagedLogs, paths.logDir);
  chmodSync(paths.dataDir, 0o700);
  chmodSync(paths.logDir, 0o700);

  const manifest = {
    migrated_at: now.toISOString(),
    source: {
      config_sha256: sha256(paths.legacyConfig),
      state_sha256: sha256(paths.legacyState),
    },
    destination: {
      config_sha256: sha256(join(paths.dataDir, 'config.json')),
      state_sha256: sha256(join(paths.dataDir, 'state.json')),
    },
    preserved: {
      live_submit_confirmed: copiedConfig.live_submit_confirmed,
      pending_attempt: copiedState.pending_attempt,
    },
  };
  writeFileSync(join(backupDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
  return { paths, backupDir, manifest };
}

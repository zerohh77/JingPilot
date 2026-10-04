import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { API_BASE_URL } from '../src/constants.js';

test('npm metadata 暴露 jingpilot 并保留 deprecated cross-bj alias', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.name, 'jingpilot');
  assert.equal(pkg.bin.jingpilot, 'bin/jingpilot.js');
  assert.equal(pkg.bin['cross-bj'], 'bin/cross-bj.js');
  assert.equal(pkg.license, 'SEE LICENSE IN LICENSE.md');
  assert.equal(pkg.repository.url, 'git+https://github.com/zerohh77/JingPilot.git');
});

test('品牌重编码不改变北京交警 API 地址', () => {
  assert.equal(API_BASE_URL, 'https://jjz.jtgl.beijing.gov.cn:2443');
});

test('旧 CLI alias 提示弃用但执行新 CLI', () => {
  const result = spawnSync(process.execPath, ['bin/cross-bj.js', '--help'], {
    cwd: new URL('..', import.meta.url),
    encoding: 'utf8',
  });
  assert.equal(result.status, 0);
  assert.match(result.stderr, /已弃用/);
  assert.match(result.stdout, /Usage: jingpilot/);
});

test('公开 CLI 提供隐藏输入的地图凭据配置入口', () => {
  const result = spawnSync(process.execPath, ['bin/jingpilot.js', 'auth', 'map-key', '--help'], {
    cwd: new URL('..', import.meta.url),
    encoding: 'utf8',
  });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Keychain/);
});

test('LaunchAgent 仅安排 09:30、16:30，并在启新前停旧', () => {
  const plist = readFileSync(new URL('../deploy/io.github.zerohh77.jingpilot.plist', import.meta.url), 'utf8');
  assert.match(plist, /io\.github\.zerohh77\.jingpilot/);
  assert.match(plist, /bin\/jingpilot\.js/);
  assert.match(plist, /<key>RunAtLoad<\/key>\s*<true\/>/);
  assert.equal((plist.match(/<key>Hour<\/key>/g) || []).length, 2);
  assert.match(plist, /<integer>9<\/integer>[\s\S]*<integer>30<\/integer>/);
  assert.match(plist, /<integer>16<\/integer>[\s\S]*<integer>30<\/integer>/);
  const installer = readFileSync(new URL('../scripts/install-launchd.sh', import.meta.url), 'utf8');
  assert.ok(installer.indexOf('bootout "gui/$uid/$old_label"') < installer.indexOf('bootstrap "gui/$uid" "$target"'));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function read(relative) {
  return readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8');
}

test('wakeguard 在两个任务前创建 10 分钟 idle-sleep assertion，且不点亮显示器', () => {
  const plist = read('deploy/io.github.zerohh77.jingpilot.wakeguard.plist');
  const script = read('scripts/wake-guard.sh');
  assert.match(plist, /<integer>9<\/integer>[\s\S]*<integer>25<\/integer>/);
  assert.match(plist, /<integer>16<\/integer>[\s\S]*<integer>25<\/integer>/);
  assert.match(script, /caffeinate -i -t "\$guard_seconds"/);
  assert.match(script, /JINGPILOT_GUARD_SECONDS:-600/);
  assert.doesNotMatch(script, /caffeinate[^\n]*\s-u(?:\s|$)/);
});

test('系统电源计划使用早间 repeat 和下午 one-shot，不调用 cancelall', () => {
  const installer = read('scripts/install-power-root.sh');
  const helper = read('scripts/jingpilot-power-helper.sh');
  assert.match(installer, /pmset repeat wake MTWRFSU 09:24:30/);
  assert.match(helper, /16:24:30/);
  assert.match(helper, /pmset schedule wake/);
  assert.match(helper, /io\.github\.zerohh77\.jingpilot\.power/);
  assert.doesNotMatch(`${installer}\n${helper}`, /cancelall/);
});

test('已有重复电源计划时安装 fail closed', () => {
  const installer = read('scripts/install-power-root.sh');
  assert.match(installer, /Repeating power events:/);
  assert.match(installer, /repeat_events/);
  assert.match(installer, /安装已停止/);
  assert.match(installer, /exit 65/);
});

test('卸载只取消仍匹配 JingPilot 的重复事件', () => {
  const uninstaller = read('scripts/uninstall-power-root.sh');
  assert.match(uninstaller, /wake at 9:24AM every day/);
  assert.match(uninstaller, /未取消非 JingPilot 计划/);
});

test('系统辅助任务在晨间唤醒后刷新下午事件', () => {
  const plist = read('deploy/io.github.zerohh77.jingpilot.power.plist');
  assert.match(plist, /<key>RunAtLoad<\/key>\s*<true\/>/);
  assert.match(plist, /<integer>9<\/integer>[\s\S]*<integer>27<\/integer>/);
  assert.match(plist, /<string>refresh<\/string>/);
});

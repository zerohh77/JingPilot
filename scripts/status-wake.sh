#!/bin/zsh
set -euo pipefail

guard_label="io.github.zerohh77.jingpilot.wakeguard"
power_label="io.github.zerohh77.jingpilot.power"
uid="$(id -u)"
failed=0

if launchctl print "gui/$uid/$guard_label" >/dev/null 2>&1; then
  print "保活 LaunchAgent：loaded"
else
  print "保活 LaunchAgent：not loaded"
  failed=1
fi
if launchctl print "system/$power_label" >/dev/null 2>&1; then
  print "电源 LaunchDaemon：loaded"
else
  print "电源 LaunchDaemon：not loaded"
  failed=1
fi

schedule="$(pmset -g sched)"
print -r -- "$schedule" | /usr/bin/grep -E 'Repeating power events|wake at 9:24AM every day|io\.github\.zerohh77\.jingpilot\.power' || true
if [[ "$schedule" == *"wake at 9:24AM every day"* ]]; then
  print "晨间重复唤醒：scheduled"
else
  print "晨间重复唤醒：missing"
  failed=1
fi
if [[ "$schedule" != *"io.github.zerohh77.jingpilot.power"* ]]; then
  print "下午一次性唤醒：missing"
  failed=1
else
  print "下午一次性唤醒：scheduled"
fi

exit "$failed"

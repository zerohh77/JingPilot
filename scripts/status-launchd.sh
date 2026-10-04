#!/bin/zsh
set -euo pipefail

label="io.github.zerohh77.jingpilot"
old_label="${JINGPILOT_PREVIOUS_LAUNCHD_LABEL:-}"
target="$HOME/Library/LaunchAgents/$label.plist"
uid="$(id -u)"

if [[ ! -f "$target" ]]; then
  print "plist：未安装"
  exit 1
fi

print "plist：$target"
if launchctl print "gui/$uid/$label" >/dev/null 2>&1; then
  print "launchctl：已加载"
  launchctl print "gui/$uid/$label" | /usr/bin/grep -E '^\s*(state|runs|last exit code) = ' || true
else
  print "launchctl：未加载"
  exit 1
fi

if [[ -n "$old_label" ]] && launchctl print "gui/$uid/$old_label" >/dev/null 2>&1; then
  print "旧 LaunchAgent：仍在加载（不安全：可能双调度）"
  exit 2
else
  print "旧 LaunchAgent：${old_label:+未加载}${old_label:-未指定}"
fi

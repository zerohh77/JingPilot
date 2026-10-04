#!/bin/zsh
set -euo pipefail

label="io.github.zerohh77.jingpilot"
old_label="${JINGPILOT_PREVIOUS_LAUNCHD_LABEL:?set previous LaunchAgent label}"
uid="$(id -u)"
old_target="$HOME/Library/LaunchAgents/$old_label.plist"
archive_dir="$HOME/Library/Application Support/JingPilot Migration Backups/retired-launchagents"

if ! launchctl print "gui/$uid/$label" >/dev/null 2>&1; then
  print -u2 "新 LaunchAgent 尚未加载，拒绝归档旧 plist"
  exit 1
fi
if launchctl print "gui/$uid/$old_label" >/dev/null 2>&1; then
  print -u2 "旧 LaunchAgent 仍在加载，拒绝归档 plist"
  exit 1
fi
if [[ -f "$old_target" ]]; then
  mkdir -p "$archive_dir"
  chmod 700 "$archive_dir"
  mv "$old_target" "$archive_dir/$old_label.plist.$(date +%Y%m%d%H%M%S)"
  print "旧 plist 已归档，可用于回滚"
else
  print "旧 plist 已不在 LaunchAgents 目录"
fi

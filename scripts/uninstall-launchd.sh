#!/bin/zsh
set -euo pipefail

label="io.github.zerohh77.jingpilot"
target="$HOME/Library/LaunchAgents/$label.plist"
uid="$(id -u)"
launchctl bootout "gui/$uid/$label" 2>/dev/null || true
if [[ -f "$target" ]]; then
  mkdir -p "$HOME/.Trash"
  mv "$target" "$HOME/.Trash/$label.plist.$(date +%Y%m%d%H%M%S)"
fi
print "已卸载 $label；plist 已移到废纸篓（如原先存在）"

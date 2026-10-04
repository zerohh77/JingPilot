#!/bin/zsh
set -euo pipefail

script_dir="${0:A:h}"
project_dir="${script_dir:h}"
label="io.github.zerohh77.jingpilot.wakeguard"
target="$HOME/Library/LaunchAgents/$label.plist"
uid="$(id -u)"
root_uninstaller="$project_dir/scripts/uninstall-power-root.sh"

/usr/bin/osascript - "$root_uninstaller" <<'APPLESCRIPT'
on run argv
  do shell script quoted form of (item 1 of argv) with administrator privileges
end run
APPLESCRIPT

launchctl bootout "gui/$uid/$label" >/dev/null 2>&1 || true
if [[ -f "$target" ]]; then
  mkdir -p "$HOME/.Trash"
  mv "$target" "$HOME/.Trash/$label.plist.$(date +%Y%m%d%H%M%S)"
fi
print "JingPilot 唤醒与保活任务已卸载"

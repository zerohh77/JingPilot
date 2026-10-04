#!/bin/zsh
set -euo pipefail

script_dir="${0:A:h}"
project_dir="${script_dir:h}"
label="io.github.zerohh77.jingpilot.wakeguard"
old_label="${JINGPILOT_PREVIOUS_WAKE_LABEL:-}"
old_power_label="${JINGPILOT_PREVIOUS_POWER_LABEL:-}"
template="$project_dir/deploy/$label.plist"
target="$HOME/Library/LaunchAgents/$label.plist"
old_target="$HOME/Library/LaunchAgents/$old_label.plist"
log_dir="$HOME/Library/Logs/JingPilot"
uid="$(id -u)"
temp="$(mktemp "$TMPDIR/$label.XXXXXX.plist")"
trap 'rm -f "$temp"' EXIT

mkdir -p "$HOME/Library/LaunchAgents" "$log_dir"
chmod 700 "$log_dir"
touch "$log_dir/wake-guard.log" "$log_dir/wake-guard-stdout.log" "$log_dir/wake-guard-error.log"
chmod 600 "$log_dir/wake-guard.log" "$log_dir/wake-guard-stdout.log" "$log_dir/wake-guard-error.log"
sed -e "s|__PROJECT_DIR__|$project_dir|g" -e "s|__LOG_DIR__|$log_dir|g" "$template" > "$temp"
/usr/bin/plutil -lint "$temp" >/dev/null
mv "$temp" "$target"
chmod 600 "$target"

old_was_loaded=0
if [[ -n "$old_label" ]] && launchctl print "gui/$uid/$old_label" >/dev/null 2>&1; then
  [[ -f "$old_target" ]] || { print -u2 "旧保活任务配置缺失，拒绝切换"; exit 66; }
  old_was_loaded=1
  launchctl bootout "gui/$uid/$old_label"
fi
launchctl bootout "gui/$uid/$label" >/dev/null 2>&1 || true
launchctl enable "gui/$uid/$label"
if ! launchctl bootstrap "gui/$uid" "$target"; then
  rm -f "$target"
  if (( old_was_loaded )); then launchctl bootstrap "gui/$uid" "$old_target"; fi
  exit 1
fi

root_installer="$project_dir/scripts/install-power-root.sh"
if ! /usr/bin/osascript - "$root_installer" "$project_dir" "$old_power_label" <<'APPLESCRIPT'
on run argv
  set installerPath to item 1 of argv
  set projectPath to item 2 of argv
  set oldPowerLabel to item 3 of argv
  do shell script quoted form of installerPath & " " & quoted form of projectPath & " " & quoted form of oldPowerLabel with administrator privileges
end run
APPLESCRIPT
then
  launchctl bootout "gui/$uid/$label" >/dev/null 2>&1 || true
  rm -f "$target"
  if (( old_was_loaded )); then launchctl bootstrap "gui/$uid" "$old_target"; fi
  print -u2 "系统唤醒计划安装失败；用户级保活任务已卸载"
  exit 1
fi

if (( old_was_loaded )); then
  archive_dir="$HOME/Library/Application Support/JingPilot Migration Backups/retired-launchagents"
  mkdir -p "$archive_dir"
  chmod 700 "$archive_dir"
  mv "$old_target" "$archive_dir/$old_label.plist.$(date +%Y%m%d%H%M%S)"
fi

print "唤醒计划已安装：09:24:30、16:24:30"
print "保活窗口：09:25–09:35、16:25–16:35"

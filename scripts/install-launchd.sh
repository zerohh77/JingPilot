#!/bin/zsh
set -euo pipefail

script_dir="${0:A:h}"
project_dir="${script_dir:h}"
label="io.github.zerohh77.jingpilot"
old_label="${JINGPILOT_PREVIOUS_LAUNCHD_LABEL:-}"
template="$project_dir/deploy/$label.plist"
target="$HOME/Library/LaunchAgents/$label.plist"
old_target="$HOME/Library/LaunchAgents/$old_label.plist"
log_dir="$HOME/Library/Logs/JingPilot"
node_path="$(command -v node)"
node_dir="${node_path:h}"
safe_path="$node_dir:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
uid="$(id -u)"
run_at_load="true"
[[ "${JINGPILOT_DEFER_RUN_AT_LOAD:-0}" == "1" ]] && run_at_load="false"
temp="$(mktemp "$TMPDIR/$label.XXXXXX.plist")"
trap 'rm -f "$temp"' EXIT

mkdir -p "$HOME/Library/LaunchAgents"
mkdir -p "$log_dir"
chmod 700 "$log_dir"
touch "$log_dir/scheduler.log" "$log_dir/scheduler-error.log"
chmod 600 "$log_dir/scheduler.log" "$log_dir/scheduler-error.log"
sed \
  -e "s|__NODE__|$node_path|g" \
  -e "s|__PROJECT_DIR__|$project_dir|g" \
  -e "s|__PATH__|$safe_path|g" \
  -e "s|__LOG_DIR__|$log_dir|g" \
  -e "s|<true/>|<$run_at_load/>|g" \
  "$template" > "$temp"
/usr/bin/plutil -lint "$temp" >/dev/null
mv "$temp" "$target"
chmod 600 "$target"

old_was_loaded=0
if [[ -n "$old_label" ]] && launchctl print "gui/$uid/$old_label" >/dev/null 2>&1; then
  old_was_loaded=1
  launchctl bootout "gui/$uid/$old_label"
fi
launchctl bootout "gui/$uid/$label" 2>/dev/null || true
launchctl enable "gui/$uid/$label"
if ! launchctl bootstrap "gui/$uid" "$target"; then
  print -u2 "新 LaunchAgent 加载失败，正在恢复旧任务"
  rm -f "$target"
  if (( old_was_loaded )) && [[ -f "$old_target" ]]; then
    launchctl bootstrap "gui/$uid" "$old_target"
  fi
  exit 1
fi
if [[ "$run_at_load" == "false" ]]; then
  sed \
    -e "s|__NODE__|$node_path|g" \
    -e "s|__PROJECT_DIR__|$project_dir|g" \
    -e "s|__PATH__|$safe_path|g" \
    -e "s|__LOG_DIR__|$log_dir|g" \
    "$template" > "$temp"
  /usr/bin/plutil -lint "$temp" >/dev/null
  mv "$temp" "$target"
  chmod 600 "$target"
  print "本次迁移已延后首次检查；下次登录仍按 RunAtLoad 自动检查"
fi
print "已安装 LaunchAgent：登录时及每天 09:30、16:30 运行"
print "配置：$target"
print "日志：$log_dir"
if [[ -n "$old_label" && -f "$old_target" ]]; then
  print "旧 plist 暂时保留；新任务验证成功后运行 scripts/finalize-launchd-migration.sh"
fi

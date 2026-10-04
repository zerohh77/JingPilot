#!/bin/zsh
set -euo pipefail

if (( EUID != 0 )); then
  print -u2 "此脚本必须由 macOS 管理员授权运行"
  exit 77
fi

project_dir="${1:?missing project directory}"
old_label="${2:-}"
label="io.github.zerohh77.jingpilot.power"
if [[ -n "$old_label" ]]; then
  if [[ "$old_label" == "$label" ]] || ! print -r -- "$old_label" | /usr/bin/grep -Eq '^[A-Za-z0-9.-]+$'; then
    print -u2 "旧电源任务标识无效"
    exit 64
  fi
fi
helper_source="$project_dir/scripts/jingpilot-power-helper.sh"
plist_source="$project_dir/deploy/$label.plist"
helper_target="/Library/PrivilegedHelperTools/$label"
plist_target="/Library/LaunchDaemons/$label.plist"
state_dir="/Library/Application Support/JingPilot"
marker="$state_dir/power-installed"
state_file="$state_dir/afternoon-wake.txt"
schedule_backup="$state_dir/power-schedule-before-install.txt"
retired_dir="$state_dir/retired-power-tasks"
log_dir="/Library/Logs/JingPilot"
temp="$(/usr/bin/mktemp /tmp/$label.XXXXXX.plist)"
old_was_loaded=0
old_plist="/Library/LaunchDaemons/$old_label.plist"
switch_complete=0
cleanup() {
  local status=$?
  /bin/rm -f "$temp"
  if (( status != 0 && old_was_loaded && ! switch_complete )); then
    /bin/launchctl bootout "system/$label" >/dev/null 2>&1 || true
    if [[ -f "$state_file" ]]; then
      /usr/bin/pmset schedule cancel wake "$(<"$state_file")" "$label" >/dev/null 2>&1 || true
    fi
    /bin/rm -f "$helper_target" "$plist_target"
    if [[ -f "$old_plist" ]] && ! /bin/launchctl print "system/$old_label" >/dev/null 2>&1; then
      /bin/launchctl bootstrap system "$old_plist" || true
    fi
  fi
}
trap cleanup EXIT

[[ -f "$helper_source" && -f "$plist_source" ]] || { print -u2 "JingPilot 电源辅助文件不完整"; exit 66; }
/bin/mkdir -p "/Library/PrivilegedHelperTools" "/Library/LaunchDaemons" "$state_dir" "$log_dir"
/bin/chmod 700 "$state_dir"
/bin/chmod 755 "$log_dir"
/usr/bin/touch "$log_dir/power-daemon.log" "$log_dir/power-daemon-error.log" "$log_dir/power-scheduler.log"
/bin/chmod 644 "$log_dir/power-daemon.log" "$log_dir/power-daemon-error.log" "$log_dir/power-scheduler.log"

schedule="$(/usr/bin/pmset -g sched)"
repeat_events="$(print -r -- "$schedule" | /usr/bin/sed -n '/Repeating power events:/,/Scheduled power events:/p' | /usr/bin/grep '^  ' | /usr/bin/sed 's/^[[:space:]]*//' || true)"
if [[ ! -f "$marker" && -n "$repeat_events" ]]; then
  print -u2 "检测到现有重复电源计划；为避免覆盖，安装已停止"
  exit 65
fi
if [[ -f "$marker" && -n "$repeat_events" && "$repeat_events" != "wake at 9:24AM every day" ]]; then
  print -u2 "重复电源计划已被用户修改；为避免覆盖，重新安装已停止"
  exit 65
fi
if [[ ! -f "$schedule_backup" ]]; then
  print -r -- "$schedule" > "$schedule_backup"
  /bin/chmod 600 "$schedule_backup"
fi

if [[ -n "$old_label" ]] && /bin/launchctl print "system/$old_label" >/dev/null 2>&1; then
  [[ -f "$old_plist" ]] || { print -u2 "旧电源任务配置缺失，拒绝切换"; exit 66; }
  old_was_loaded=1
fi

/usr/bin/install -o root -g wheel -m 755 "$helper_source" "$helper_target"
/usr/bin/sed -e "s|__HELPER__|$helper_target|g" "$plist_source" > "$temp"
/usr/bin/plutil -lint "$temp" >/dev/null
/usr/bin/install -o root -g wheel -m 644 "$temp" "$plist_target"

/usr/bin/pmset repeat wake MTWRFSU 09:24:30
"$helper_target" refresh

if (( old_was_loaded )); then
  /bin/launchctl bootout "system/$old_label"
fi
/bin/launchctl bootout "system/$label" >/dev/null 2>&1 || true
if ! /bin/launchctl bootstrap system "$plist_target"; then
  print -u2 "系统电源辅助任务加载失败；将恢复原任务（如存在）"
  exit 1
fi

if (( old_was_loaded )); then
  if [[ -f "$state_file" ]]; then
    /usr/bin/pmset schedule cancel wake "$(<"$state_file")" "$old_label" >/dev/null 2>&1 || true
  fi
fi

print "installed_at=$(/bin/date -u '+%Y-%m-%dT%H:%M:%SZ')" > "$marker"
print "repeat=wake MTWRFSU 09:24:30" >> "$marker"
/bin/chmod 600 "$marker"
if (( old_was_loaded )); then
  /bin/mkdir -p "$retired_dir"
  /bin/chmod 700 "$retired_dir"
  /bin/mv "$old_plist" "$retired_dir/$old_label.plist.$(/bin/date +%Y%m%d%H%M%S)"
fi
switch_complete=1
print "JingPilot 系统唤醒计划已安装"

#!/bin/zsh
set -euo pipefail

if (( EUID != 0 )); then
  print -u2 "此脚本必须由 macOS 管理员授权运行"
  exit 77
fi

label="io.github.zerohh77.jingpilot.power"
owner="$label"
helper_target="/Library/PrivilegedHelperTools/$label"
plist_target="/Library/LaunchDaemons/$label.plist"
state_dir="/Library/Application Support/JingPilot"
state_file="$state_dir/afternoon-wake.txt"
marker="$state_dir/power-installed"

/bin/launchctl bootout "system/$label" >/dev/null 2>&1 || true
if [[ -f "$state_file" ]]; then
  target="$(<"$state_file")"
  /usr/bin/pmset schedule cancel wake "$target" "$owner" >/dev/null 2>&1 || true
fi
if [[ -f "$marker" ]]; then
  schedule="$(/usr/bin/pmset -g sched)"
  if [[ "$schedule" == *"wake at 9:24AM every day"* ]]; then
    /usr/bin/pmset repeat cancel
  else
    print -u2 "当前重复电源计划已被修改；未取消非 JingPilot 计划"
  fi
fi
/bin/rm -f "$helper_target" "$plist_target" "$state_file" "$marker"
print "JingPilot 系统唤醒计划已卸载；历史日志和安装前快照已保留"

#!/bin/zsh
set -euo pipefail

owner="io.github.zerohh77.jingpilot.power"
state_dir="/Library/Application Support/JingPilot"
state_file="$state_dir/afternoon-wake.txt"
log_dir="/Library/Logs/JingPilot"
log_file="$log_dir/power-scheduler.log"

mkdir -p "$state_dir" "$log_dir"
chmod 700 "$state_dir"
chmod 755 "$log_dir"
touch "$log_file"
chmod 644 "$log_file"

log() { print "$(/bin/date '+%Y-%m-%d %H:%M:%S') $*" >> "$log_file"; }

if [[ "${1:-refresh}" != "refresh" ]]; then
  log "ERROR unsupported action=${1:-}"
  exit 64
fi

now=$(/bin/date '+%H%M%S')
if (( 10#$now < 162430 )); then
  target_date=$(/bin/date '+%m/%d/%y')
else
  target_date=$(/bin/date -v+1d '+%m/%d/%y')
fi
target="$target_date 16:24:30"
previous=""
[[ -f "$state_file" ]] && previous="$(<"$state_file")"

if [[ -n "$previous" && "$previous" != "$target" ]]; then
  /usr/bin/pmset schedule cancel wake "$previous" "$owner" >/dev/null 2>&1 || true
fi
/usr/bin/pmset schedule cancel wake "$target" "$owner" >/dev/null 2>&1 || true
/usr/bin/pmset schedule wake "$target" "$owner"

temp="$state_file.$$.tmp"
print -r -- "$target" > "$temp"
chmod 600 "$temp"
mv "$temp" "$state_file"
log "scheduled wake=$target owner=$owner"

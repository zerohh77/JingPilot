#!/bin/zsh
set -euo pipefail

log_dir="$HOME/Library/Logs/JingPilot"
log_file="$log_dir/wake-guard.log"
mkdir -p "$log_dir"
chmod 700 "$log_dir"
touch "$log_file"
chmod 600 "$log_file"

timestamp() { /bin/date '+%Y-%m-%d %H:%M:%S'; }

guard_seconds="${JINGPILOT_GUARD_SECONDS:-600}"
if [[ ! "$guard_seconds" =~ '^[0-9]+$' ]] || (( guard_seconds < 1 || guard_seconds > 900 )); then
  print -u2 "invalid JINGPILOT_GUARD_SECONDS"
  exit 64
fi

display_state="unknown"
display_power=$(/usr/sbin/ioreg -r -n IODisplayWrangler -d 1 2>/dev/null | /usr/bin/awk '/"CurrentPowerState" = / { print $3; exit }' || true)
if [[ "$display_power" == "4" ]]; then
  display_state="awake"
elif [[ -n "$display_power" ]]; then
  display_state="asleep"
fi
if [[ "$display_state" == "unknown" ]]; then
  assertions=$(/usr/bin/pmset -g assertions 2>/dev/null || true)
  [[ "$assertions" == *"Powerd - Prevent sleep while display is on"* ]] && display_state="awake"
fi

print "$(timestamp) START display=$display_state assertion=PreventUserIdleSystemSleep timeout=$guard_seconds" >> "$log_file"
/usr/bin/caffeinate -i -t "$guard_seconds"
print "$(timestamp) END assertion=released reason=timeout" >> "$log_file"

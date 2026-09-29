#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PROJECT="Yijing64.xcodeproj"
SCHEME="Yijing64"
BUNDLE_ID="com.liuzixiang.Yijing64"
DEVICE_UDID="${DEVICE_UDID:-00008030-000804100CE8802E}"
DEVELOPMENT_TEAM="${DEVELOPMENT_TEAM:-T8TG4WAR43}"
APP=".build/device/Build/Products/Debug-iphoneos/Yijing64.app"

PROFILE_DAYS_THRESHOLD="${PROFILE_DAYS_THRESHOLD:-3}"
RENEW_NUDGE_GAP="${RENEW_NUDGE_GAP:-86400}"
NOTIFY_MIN_GAP="${NOTIFY_MIN_GAP:-43200}"

STATE="$ROOT/.build/auto-renew.state"
LOG="$ROOT/.build/auto-renew.log"
LOCK="$ROOT/.build/auto-renew.lock.d"

MODE="${1:-auto}"

mkdir -p "$ROOT/.build"

if [ "$MODE" != "--status" ]; then
  if ! mkdir "$LOCK" 2>/dev/null; then
    old_pid="$(cat "$LOCK/pid" 2>/dev/null || echo 0)"
    if [ "$old_pid" -gt 0 ] 2>/dev/null && kill -0 "$old_pid" 2>/dev/null; then
      echo "已有实例在运行(pid=$old_pid)，跳过"
      exit 0
    fi
    rm -rf "$LOCK" 2>/dev/null || true
    mkdir "$LOCK" 2>/dev/null || { echo "无法获取锁，跳过"; exit 0; }
  fi
  echo $$ >"$LOCK/pid"
  trap 'rm -rf "$LOCK" 2>/dev/null || true' EXIT INT TERM
  exec >>"$LOG" 2>&1
  jitter=0
  if [ "${JITTER_MAX_SECONDS:-300}" -gt 0 ]; then
    jitter=$((RANDOM % JITTER_MAX_SECONDS))
  fi
  if [ "$jitter" -gt 0 ]; then
    echo "随机抖动 ${jitter}s（避免固定间隔与使用习惯同步）"
    sleep "$jitter"
  fi
fi

echo "===== $(date '+%Y-%m-%d %H:%M:%S') mode=$MODE ====="

notify() {
  [ "$MODE" = "--status" ] && return 0
  osascript -e "display notification \"$2\" with title \"$1\"" >/dev/null 2>&1 || true
}

read_state() {
  [ -f "$STATE" ] || return 0
  sed -n "s/^$1=//p" "$STATE" 2>/dev/null || true
  return 0
}

write_state() {
  [ "$MODE" = "--status" ] && return 0
  touch "$STATE"
  grep -v "^$1=" "$STATE" >"$STATE.tmp" 2>/dev/null || true
  mv "$STATE.tmp" "$STATE"
  echo "$1=$2" >>"$STATE"
  return 0
}

notify_once() {
  local key="$1" title="$2" msg="$3" gap="${4:-$NOTIFY_MIN_GAP}"
  local last now
  last="$(read_state "$key")"
  now=$(date +%s)
  if [ -z "$last" ] || [ $((now - last)) -ge "$gap" ]; then
    notify "$title" "$msg"
    write_state "$key" "$now"
  fi
  return 0
}

profile_expiry() {
  local f name exp
  for f in "$HOME"/Library/Developer/Xcode/UserData/Provisioning\ Profiles/*.mobileprovision; do
    [ -f "$f" ] || continue
    name="$(security cms -D -i "$f" 2>/dev/null | plutil -extract Name raw - 2>/dev/null || true)"
    case "$name" in
      *"$BUNDLE_ID"*)
        exp="$(security cms -D -i "$f" 2>/dev/null | plutil -extract ExpirationDate raw - 2>/dev/null || true)"
        if [ -n "$exp" ]; then
          echo "$exp"
          return 0
        fi
        ;;
    esac
  done
  return 1
}

EXP_RAW="$(profile_expiry || true)"
if [ -z "$EXP_RAW" ]; then
  echo "未找到 $BUNDLE_ID 的描述文件"
  notify "易经 续签异常" "未找到描述文件，请手动检查签名"
  exit 0
fi

EXP_EPOCH="$(date -j -f "%Y-%m-%dT%H:%M:%SZ" "$EXP_RAW" "+%s" 2>/dev/null || echo 0)"
NOW="$(date +%s)"
DAYS_LEFT="$(awk -v a="$EXP_EPOCH" -v b="$NOW" 'BEGIN{printf "%.2f",(a-b)/86400}')"

DEV_JSON="$(mktemp -t autorew)"
xcrun devicectl list devices --json-output "$DEV_JSON" >/dev/null 2>&1 || true
DEV_STATE="$(python3 - "$DEV_JSON" "$DEVICE_UDID" <<'PY'
import json, sys
pairing, tunnel, transport, found = "notfound", "unavailable", "none", False
try:
    with open(sys.argv[1]) as fh:
        data = json.load(fh)
    for dev in data.get("result", {}).get("devices", []):
        hw = dev.get("hardwareProperties", {})
        if hw.get("udid") == sys.argv[2] or dev.get("identifier") == sys.argv[2]:
            conn = dev.get("connectionProperties", {})
            pairing = conn.get("pairingState", "unknown")
            tunnel = conn.get("tunnelState", "unavailable")
            transport = conn.get("transportType") or "none"
            found = True
            break
except Exception:
    pass
print(pairing, tunnel if found else "notfound", transport)
PY
)"
rm -f "$DEV_JSON"
PAIRING="${DEV_STATE%% *}"
REST="${DEV_STATE#* }"
TUNNEL="${REST%% *}"
TRANSPORT="${REST##* }"

ONLINE=0
# 无线（localNetwork）或有線（wired）任一可用即视为在线；tunnel 不可靠时以 transportType 兜底
TRANSPORT_OK=0
case "$TRANSPORT" in
  ""|none|None|null) TRANSPORT_OK=0 ;;
  *) TRANSPORT_OK=1 ;;
esac
if [ "$PAIRING" = "paired" ] && { { [ "$TUNNEL" != "unavailable" ] && [ "$TUNNEL" != "notfound" ]; } || [ "$TRANSPORT_OK" -eq 1 ]; }; then
  ONLINE=1
fi

echo "描述文件: $EXP_RAW (剩余 ${DAYS_LEFT} 天)"
echo "设备: pairing=$PAIRING tunnel=$TUNNEL transport=$TRANSPORT 在线=$ONLINE"

# transportType 可能残留在本地缓存里，用真实命令复核（唯一可信的在线判据）
if [ "$ONLINE" -eq 1 ]; then
  if xcrun devicectl device info lockState --device "$DEVICE_UDID" >/dev/null 2>&1; then
    echo "实时探针: 通过（设备确实可达）"
  else
    echo "实时探针: 失败（transportType 为陈旧缓存，判定为离线）"
    ONLINE=0
    PAIRING=online-may-stale
  fi
fi

if [ "$ONLINE" -eq 1 ]; then
  if [ "$(read_state phase)" = "offline" ]; then
    echo "设备已连接（transport=$TRANSPORT）"
  fi
  write_state phase online
  write_state tunnelDownSince ""
else
  if [ "$(read_state phase)" != "offline" ]; then
    write_state phase offline
    write_state tunnelDownSince "$NOW"
  fi
  echo "设备未连接（无线需手机解锁亮屏；本机 Wi-Fi 下无线实测不通，请插数据线）"
fi

NEED_RENEW=0
if awk -v d="$DAYS_LEFT" -v t="$PROFILE_DAYS_THRESHOLD" 'BEGIN{exit !(d<=t)}'; then
  NEED_RENEW=1
fi
[ "$MODE" = "--force" ] && NEED_RENEW=1

if [ "$NEED_RENEW" -eq 0 ]; then
  echo "=> 未进入 ${PROFILE_DAYS_THRESHOLD} 天窗口，无需动作"
  exit 0
fi

if [ "$ONLINE" -eq 0 ]; then
  echo "=> 需续签但设备未连接，已提示（每 24h 最多一次）"
  notify_once renewNudgeAt "易经 需要续签" "描述文件剩 ${DAYS_LEFT} 天：本机 Wi-Fi 下无线不可用，请插一次数据线" "$RENEW_NUDGE_GAP"
  exit 0
fi

echo "==> 续签并重装真机版"
xcodebuild -project "$PROJECT" -scheme "$SCHEME" \
  -destination "id=$DEVICE_UDID" -derivedDataPath .build/device build \
  CODE_SIGN_STYLE=Automatic CODE_SIGNING_ALLOWED=YES -allowProvisioningUpdates \
  DEVELOPMENT_TEAM="$DEVELOPMENT_TEAM"

xcrun devicectl device install app --device "$DEVICE_UDID" "$APP"
xcrun devicectl device process terminate --device "$DEVICE_UDID" "$BUNDLE_ID" 2>/dev/null || true
xcrun devicectl device process launch --device "$DEVICE_UDID" "$BUNDLE_ID"

NEW_EXP="$(profile_expiry || true)"
write_state lastRenewAt "$NOW"
notify "易经 续签完成" "真机已重装，描述文件更新至 ${NEW_EXP}"
echo "==> 续签完成，新有效期 $NEW_EXP"

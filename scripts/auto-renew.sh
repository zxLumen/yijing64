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
SWITCH_RETRY_GAP="${SWITCH_RETRY_GAP:-21600}"
WIFI_INTERFACE="${WIFI_INTERFACE:-en0}"
WIFI_JOIN_TIMEOUT="${WIFI_JOIN_TIMEOUT:-20}"

# 自家 Wi-Fi（SG659HZ 的 5G 会隔离同频段客户端，故续签时需切到另一频段）。
# 密码等敏感项放在 gitignored 的 scripts/wifi.local.sh，勿写进本文件。
WIFI_LOCAL_FILE="$ROOT/scripts/wifi.local.sh"
if [ -f "$WIFI_LOCAL_FILE" ]; then
  # shellcheck disable=SC1090
  source "$WIFI_LOCAL_FILE"
fi
WIFI_PRIMARY_SSID="${WIFI_PRIMARY_SSID:-CU_77qd_5G}"
WIFI_ALT_SSID="${WIFI_ALT_SSID:-CU_77qd}"
WIFI_PASSWORD="${WIFI_PASSWORD:-}"

# 通知通道：osascript 在 launchd / VS Code 环境下没有 App 身份，通知会被系统静默丢弃；
# terminal-notifier 有独立 bundle id（已授权），可靠得多。找不到时退回 osascript。
TERMINAL_NOTIFIER="${TERMINAL_NOTIFIER:-}"
if [ -z "$TERMINAL_NOTIFIER" ]; then
  for cand in \
    "$HOME/Library/Application Support/Yijing64/terminal-notifier.app/Contents/MacOS/terminal-notifier" \
    "$HOME/.cache/opencode/packages/opencode-smart-voice-notify@latest/node_modules/node-notifier/vendor/mac.noindex/terminal-notifier.app/Contents/MacOS/terminal-notifier" \
    "/opt/homebrew/bin/terminal-notifier" \
    "/usr/local/bin/terminal-notifier"; do
    if [ -x "$cand" ]; then TERMINAL_NOTIFIER="$cand"; break; fi
  done
fi

STATE="$ROOT/.build/auto-renew.state"
LOG="$ROOT/.build/auto-renew.log"
LOCK="$ROOT/.build/auto-renew.lock.d"

MODE="${1:-auto}"

mkdir -p "$ROOT/.build"

# ===== 辅助函数（定义在最前，保证 EXIT trap 退出时可用）=====

notify() {
  [ "$MODE" = "--status" ] && return 0
  local title="$1" msg="$2"
  if [ -n "$TERMINAL_NOTIFIER" ] && [ -x "$TERMINAL_NOTIFIER" ]; then
    if "$TERMINAL_NOTIFIER" -title "$title" -message "$msg" >/dev/null 2>&1; then
      return 0
    fi
  fi
  osascript -e "display notification \"$msg\" with title \"$title\"" >/dev/null 2>&1 || true
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

# 当前接入的 SSID（networksetup -getairportnetwork 在本机不可靠，改用 ipconfig）
current_ssid() {
  ipconfig getsummary "$WIFI_INTERFACE" 2>/dev/null | awk -F': ' '/ SSID /{print $2; exit}'
}

# 切到指定 SSID 并等待接口拿到 IP（成功 0 / 失败 1）
wifi_join() {
  local ssid="$1" i cur
  [ -n "$ssid" ] || return 1
  networksetup -setairportnetwork "$WIFI_INTERFACE" "$ssid" "$WIFI_PASSWORD" >/dev/null 2>&1 || true
  i=0
  while [ "$i" -lt "$WIFI_JOIN_TIMEOUT" ]; do
    cur="$(current_ssid || true)"
    if [ "$cur" = "$ssid" ] && ifconfig "$WIFI_INTERFACE" 2>/dev/null | grep -q 'inet '; then
      return 0
    fi
    sleep 1
    i=$((i + 1))
  done
  return 1
}

# 唯一可信的设备可达性判据（devicectl list 的 transportType 会陈旧）
probe_device() {
  xcrun devicectl device info lockState --device "$DEVICE_UDID" >/dev/null 2>&1
}

# 刚切完频段隧道需约 1~2s 才建立，且偶有抖动，故带重试
probe_device_retry() {
  local tries="${1:-6}" i
  for i in $(seq 1 "$tries"); do
    if probe_device; then return 0; fi
    sleep 2
  done
  return 1
}

# App 是否在手机上运行（含后台挂起）。续签要重装 App，若它正在运行会被强制关闭：
# 为做到"手机端零动作"，运行中就本轮跳过、等下个周期（需已可达才能查）。
# 注意：不能写成 `devicectl … | grep -q`——grep 命中即退出会让 devicectl 收到 SIGPIPE，
# 叠加 set -o pipefail 后即使命中也会返回非零（恒为"未运行"）。
app_is_running() {
  local out
  out="$(xcrun devicectl device info processes --device "$DEVICE_UDID" 2>/dev/null || true)"
  grep -q "/Yijing64\.app/" <<<"$out"
}

ORIG_SSID=""
RESTORE_ON_EXIT=0

restore_network() {
  if [ "${RESTORE_ON_EXIT:-0}" = "1" ] && [ -n "${ORIG_SSID:-}" ]; then
    echo "==> 切回原网络 $ORIG_SSID"
    wifi_join "$ORIG_SSID" || echo "!! 切回 $ORIG_SSID 失败，请手动检查"
    RESTORE_ON_EXIT=0
  fi
}

on_exit() {
  restore_network || true
  rm -rf "$LOCK" 2>/dev/null || true
}

# Xcode 本地缓存描述文件的目录（Apple 文档写 MobileDevice，新版实际在 UserData）
profile_cache_dirs() {
  printf '%s\n' \
    "$HOME/Library/Developer/Xcode/UserData/Provisioning Profiles" \
    "$HOME/Library/MobileDevice/Provisioning Profiles"
}

# 列出本 bundle 的缓存描述文件路径
cached_profiles() {
  local dir f name
  while IFS= read -r dir; do
    [ -d "$dir" ] || continue
    for f in "$dir"/*.mobileprovision; do
      [ -f "$f" ] || continue
      name="$(security cms -D -i "$f" 2>/dev/null | plutil -extract Name raw - 2>/dev/null || true)"
      case "$name" in
        *"$BUNDLE_ID"*) echo "$f" ;;
      esac
    done
  done < <(profile_cache_dirs)
}

# 构建前清掉本 bundle 的缓存描述文件：否则有效期内 Xcode 只会复用旧 profile（不会 +7 天），
# 删掉后 Xcode 找不到本地可用 profile，才会重新向 Apple 申请一份全新的 7 天。
# 返回：0 有删除动作或无需删除；失败时由调用方还原备份。
purge_cached_profiles() {
  local bk="$1" f
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    cp -p "$f" "$bk"/ 2>/dev/null || true
    echo "移除缓存描述文件以强制续期: $(basename "$f")"
    rm -f "$f" 2>/dev/null || true
  done < <(cached_profiles)
}

restore_cached_profiles() {
  local bk="$1" d f
  while IFS= read -r d; do
    [ -d "$d" ] || mkdir -p "$d" 2>/dev/null || continue
    for f in "$bk"/*.mobileprovision; do
      [ -f "$f" ] || continue
      cp -p "$f" "$d"/ 2>/dev/null || true
    done
  done < <(profile_cache_dirs)
}

do_renew() {
  local bk="$ROOT/.build/profile-backup" new_exp now
  rm -rf "$bk"; mkdir -p "$bk"
  purge_cached_profiles "$bk"

  echo "==> 续签并重装真机版"
  if ! xcodebuild -project "$PROJECT" -scheme "$SCHEME" \
      -destination "id=$DEVICE_UDID" -derivedDataPath .build/device build \
      CODE_SIGN_STYLE=Automatic CODE_SIGNING_ALLOWED=YES -allowProvisioningUpdates \
      DEVELOPMENT_TEAM="$DEVELOPMENT_TEAM"; then
    echo "!! 构建失败，还原缓存描述文件"
    restore_cached_profiles "$bk"
    return 1
  fi

  # 只重装、不启动：续签只需带新描述文件重装 App（后台静默）。
  # 不 launch 是刻意的——避免续签时手机自动打开 App（用户要求"手机端零动作"）。
  xcrun devicectl device install app --device "$DEVICE_UDID" "$APP"

  new_exp="$(profile_expiry || true)"
  now="$(date +%s)"
  write_state lastRenewAt "$now"
  notify "易经 续签完成" "真机已重装，描述文件更新至 ${new_exp}"
  echo "==> 续签完成，新有效期 $new_exp"
}

# ===== 锁 + 抖动（--status / --test-notify 不加锁、不抖动）=====

if [ "$MODE" != "--status" ] && [ "$MODE" != "--test-notify" ]; then
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
  trap on_exit EXIT INT TERM
  exec >>"$LOG" 2>&1
  jitter=0
  if [ "${JITTER_MAX_SECONDS:-300}" -gt 0 ]; then
    jitter=$((RANDOM % ${JITTER_MAX_SECONDS:-300}))
  fi
  if [ "$jitter" -gt 0 ]; then
    echo "随机抖动 ${jitter}s（避免固定间隔与使用习惯同步）"
    sleep "$jitter"
  fi
fi

echo "===== $(date '+%Y-%m-%d %H:%M:%S') mode=$MODE ====="

if [ "$MODE" = "--test-notify" ]; then
  echo "通知通道: ${TERMINAL_NOTIFIER:-osascript（回退）}"
  notify "易经 测试通知" "如果你能看到这条，说明续签提醒通道正常（$(date '+%H:%M:%S')）"
  echo "已发送测试通知"
  exit 0
fi

# ===== 1) 计算是否需要续签 =====

EXP_RAW="$(profile_expiry || true)"
if [ -z "$EXP_RAW" ]; then
  echo "未找到 $BUNDLE_ID 的描述文件"
  notify "易经 续签异常" "未找到描述文件，请手动检查签名"
  exit 0
fi

EXP_EPOCH="$(date -j -f "%Y-%m-%dT%H:%M:%SZ" "$EXP_RAW" "+%s" 2>/dev/null || echo 0)"
NOW="$(date +%s)"
DAYS_LEFT="$(awk -v a="$EXP_EPOCH" -v b="$NOW" 'BEGIN{printf "%.2f",(a-b)/86400}')"

NEED_RENEW=0
if awk -v d="$DAYS_LEFT" -v t="$PROFILE_DAYS_THRESHOLD" 'BEGIN{exit !(d<=t)}'; then
  NEED_RENEW=1
fi
[ "$MODE" = "--force" ] && NEED_RENEW=1

echo "描述文件: $EXP_RAW (剩余 ${DAYS_LEFT} 天)"

# 描述文件已过期 / 显式 --force 时，不再因"App 正在运行"而顺延：
# 此时 App 本来就用不了，续签优先级最高（安装会替换掉运行中的实例）。
PROFILE_EXPIRED=0
awk -v d="$DAYS_LEFT" 'BEGIN{exit !(d<=0)}' && PROFILE_EXPIRED=1
SKIP_IF_APP_RUNNING=1
[ "$PROFILE_EXPIRED" -eq 1 ] && SKIP_IF_APP_RUNNING=0
[ "$MODE" = "--force" ] && SKIP_IF_APP_RUNNING=0

# --status：只报告，绝不切网
if [ "$MODE" = "--status" ]; then
  cur_ssid="$(current_ssid || true)"
  if probe_device_retry 3; then dev_reach="可达"; else dev_reach="不可达"; fi
  echo "设备: ${dev_reach}（当前 SSID=${cur_ssid:-未知}）"
  if [ "$NEED_RENEW" -eq 1 ]; then
    echo "=> 已进入续签窗口（${PROFILE_DAYS_THRESHOLD} 天）"
  else
    echo "=> 未进入续签窗口（${PROFILE_DAYS_THRESHOLD} 天）"
  fi
  exit 0
fi

if [ "$NEED_RENEW" -eq 0 ]; then
  echo "=> 未进入 ${PROFILE_DAYS_THRESHOLD} 天窗口，无需动作"
  exit 0
fi

# ===== 2) 需要续签：先试当前频段，再按需切频段 =====

if probe_device_retry 3; then
  if [ "$SKIP_IF_APP_RUNNING" -eq 1 ] && app_is_running; then
    echo "当前频段可达，但 App 正在运行，本轮跳过（不安装、手机端零动作）"
    notify_once appRunningNudgeAt "易经 暂缓续签" "易经 App 正在运行，为避免打扰已顺延，退出 App 后将自动续签" "$RENEW_NUDGE_GAP"
    exit 0
  fi
  [ "$SKIP_IF_APP_RUNNING" -eq 0 ] && echo "（描述文件已过期/--force：忽略 App 运行状态，直接续签）"
  echo "当前频段可达（SSID=$(current_ssid)），直接续签"
  do_renew
  exit 0
fi

ORIG_SSID="$(current_ssid || true)"
echo "当前频段不可达（SSID=${ORIG_SSID:-未知}）"

case "$ORIG_SSID" in
  "$WIFI_PRIMARY_SSID") ALT_SSID="$WIFI_ALT_SSID" ;;
  "$WIFI_ALT_SSID")     ALT_SSID="$WIFI_PRIMARY_SSID" ;;
  *)                    ALT_SSID="" ;;
esac

if [ -n "$ALT_SSID" ] && [ -z "$WIFI_PASSWORD" ]; then
  echo "=> 未配置 Wi-Fi 密码（${WIFI_LOCAL_FILE}），跳过自动切换"
  ALT_SSID=""
fi

if [ -z "$ALT_SSID" ]; then
  echo "=> 无法自动切换（不在自家网络或缺密码），仅提示"
  notify_once renewNudgeAt "易经 需要续签" "描述文件剩 ${DAYS_LEFT} 天：请连自家 2.4G 并解锁手机后重试" "$RENEW_NUDGE_GAP"
  exit 0
fi

# 防抖：手机长时间锁屏时，避免每 30 分钟反复切网（--force 时不限）
last_switch="$(read_state lastSwitchAttemptAt)"
if [ "$MODE" != "--force" ] && [ -n "$last_switch" ] && [ $((NOW - last_switch)) -lt "$SWITCH_RETRY_GAP" ]; then
  echo "=> 距上次切网尝试不足 ${SWITCH_RETRY_GAP}s，本次不切换，仅提示"
  notify_once renewNudgeAt "易经 需要续签" "描述文件剩 ${DAYS_LEFT} 天：请在自家网络下解锁手机（会自动重试）" "$RENEW_NUDGE_GAP"
  exit 0
fi

echo "==> 切到 $ALT_SSID 尝试无线续签"
write_state lastSwitchAttemptAt "$NOW"
RESTORE_ON_EXIT=1
if wifi_join "$ALT_SSID"; then
  echo "已切到 $ALT_SSID (IP=$(ifconfig "$WIFI_INTERFACE" 2>/dev/null | awk '/inet /{print $2; exit}'))"
  if probe_device_retry 8; then
    if [ "$SKIP_IF_APP_RUNNING" -eq 1 ] && app_is_running; then
      echo "已切到 ${ALT_SSID}，但 App 正在运行，本轮跳过（立即切回，手机端零动作）"
      notify_once appRunningNudgeAt "易经 暂缓续签" "易经 App 正在运行，为避免打扰已顺延，退出 App 后将自动续签" "$RENEW_NUDGE_GAP"
    else
      [ "$SKIP_IF_APP_RUNNING" -eq 0 ] && echo "（描述文件已过期/--force：忽略 App 运行状态，直接续签）"
      do_renew
    fi
  else
    echo "=> 切换后仍不可达（手机可能锁屏或未连 Wi-Fi）"
    notify_once renewNudgeAt "易经 需要续签" "描述文件剩 ${DAYS_LEFT} 天：已切到 ${ALT_SSID} 仍不可达，请解锁手机" "$RENEW_NUDGE_GAP"
  fi
else
  echo "=> 切换到 $ALT_SSID 失败"
  notify_once renewNudgeAt "易经 需要续签" "描述文件剩 ${DAYS_LEFT} 天：切换 ${ALT_SSID} 失败，请手动处理" "$RENEW_NUDGE_GAP"
fi
# 无论成败，回切原网络由 EXIT trap restore_network 完成

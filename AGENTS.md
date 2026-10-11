# AGENTS.md

## 构建与安装（重要）

每次改完代码需要验证时，**必须同时同步模拟器与真机**，不要只装其中一个。

一键脚本：

```
bash scripts/sync.sh
```

脚本会先构建并安装到模拟器，再构建并安装到真机（含启动）。可用环境变量覆盖：`SIM_UDID`、`DEVICE_UDID`、`DEVELOPMENT_TEAM`。

## macOS App

- 原生 macOS 版复用同一套 `Yijing64` 源码 + `YijingCore`（target：`YijingCoreMac` / `Yijing64Mac`），界面保持 TabView
- 构建并启动：`bash scripts/mac.sh`（构建目录 `.build/mac`，Bundle ID `com.liuzixiang.Yijing64Mac`）
- 本地使用 **ad-hoc 签名**（`CODE_SIGN_IDENTITY: "-"`），无需开发者账号 / 描述文件，也没有 7 天续签问题
- **Mac 版独立维护，不随 iOS 同步**：日常改代码 / 验证只跑 `sync.sh`（iOS），无需构建或打开 Mac 版；需要时才单独跑 `mac.sh`
- iOS 专有 API（`UIKit`、`navigationBarTitleDisplayMode`、`keyboardType` 等）统一收敛在 `Yijing64/Views/Components/PlatformCompat.swift`，新增代码请使用其中的兼容扩展

## 桌面启动器（模拟器）

- 安装 / 更新：`bash scripts/install-simulator-launcher.sh` → 生成 `/Applications/易经模拟器.app`（复用 App 图标，ad-hoc 签名）
- 双击图标：按需构建模拟器版（缺失才构建）→ 启动模拟器 → 安装并打开「易经六十四卦」
- 强制重建：`bash scripts/simulator-launch.sh --build`；运行日志：`.build/sim-launcher.log`

## 环境信息

- 模拟器 UDID：`AEA49BA7-D3EB-4EDC-9497-546D596E1FDE`（iPhone 16 Pro Max），构建目录 `.build/dd`
- 真机 UDID：`00008030-000804100CE8802E`，构建目录 `.build/device`
- 真机 Team ID：`T8TG4WAR43`（个人/免费 Team）
- Bundle ID：`com.liuzixiang.Yijing64`
- `project.yml` 中 `CODE_SIGNING_ALLOWED/REQUIRED` 为 NO，真机构建需命令行覆盖

## 签名与续签（免费个人账号）

- 签名证书：`Apple Development: lzx422206217@icloud.com (38LST5PD3Q)`，个人证书通常约 1 年有效（过期的是描述文件，不是它）
- 描述文件：`iOS Team Provisioning Profile: com.liuzixiang.Yijing64`，**免费账号 7 天过期**
- 查看方式（只读）：
  ```
  security find-identity -v -p codesigning
  security cms -D -i ~/Library/Developer/Xcode/UserData/Provisioning\ Profiles/*.mobileprovision | grep -A1 ExpirationDate
  ```
- **续签**：运行 `bash scripts/sync.sh`（或 `auto-renew.sh`）即可。脚本带 `CODE_SIGN_STYLE=Automatic` 与 `-allowProvisioningUpdates`，构建时会联网向 Apple 刷新描述文件，再经 `devicectl` 安装；证书未过期则无需重新「信任开发者」
- ⚠️ **有效期内 Xcode 不会主动换新描述文件**：只要本地缓存里还有一份满足要求的 profile，Xcode 就一直复用它（Apple 官方原文：*only request a new provisioning profile when it can't find one locally that satisfies the known requirements*）。**要提前续签必须先删缓存 profile 再构建**，Xcode 找不到本地可用的才会向 Apple 申请一份全新的 7 天（实测：删除后重建，`ExpirationDate` 会重置为「现在+7 天」）
  - 缓存目录：`~/Library/Developer/Xcode/UserData/Provisioning Profiles/`（Apple 文档写的是 `~/Library/MobileDevice/Provisioning Profiles/`，本机不存在；两处都可能出现，都要处理）
  - `auto-renew.sh` 的 `do_renew()` 已自动执行「备份 → 删除本 bundle 的缓存 profile → 构建 → 失败则还原」
- **无线更新（可行：Mac 与 iPhone 需处于不同频段）**
  - 根因：本网络的光猫 **SG659HZ（10G EPON ONU）的 5G 射频会隔离同频段客户端** —— `5G↔5G` 互访被挡（`devicectl` 实时命令报 `device not found`、`tunnelState=unavailable`），而 **`2.4G↔5G` 互通**（实测 Mac 连 2.4G 可达 5G 上的 iPhone：`Acquired tunnel connection`）
  - 现象佐证：`user` 账号里 `SSIDIsolationEnable`/`VapIsolationEnable` 均为 `0`，但 Mac 仍协商成 `802.11ax`（5G 那条 BSSID 不受该开关约束）；关隔离 / 重启 / 160→80MHz / 关 11ax（`11axMode=0`）**均无效**
  - **结论：不是 iPhone 端问题**（早期「iPhone 丢弃入站单播」的判断有误）；是光猫 5G 的同频段隔离，需超管 / 固件才能关掉
  - **可用姿势**：让 Mac 与 iPhone **不同频段**即可无线续签（Mac 2.4G ↔ iPhone 5G）。`auto-renew.sh` 已自动化该切换
  - ⚠️ 端口是**动态**的，不要按固定 `49152` 探测；唯一可信探针是 `xcrun devicectl device info lockState --device <UDID>`
  - ⚠️ **不要用 ping 判断连通性**：iOS 在有线/无线下都不响应 ICMP（实测有线正常时 `ping` 仍 100% 丢包），唯一可信探针同上
  - ⚠️ **ARP 能解析 ≠ 单播互通**：ARP 请求是广播、回复才是单播；macOS 的 ARP 表还会残留**失效条目**（状态位 `I`），不可作为设备在线的证据
  - ⚠️ **不要动 Xcode 的「Connects via Network when wired connection is not available」开关**：它只决定「未插线时是否启用无线」，与连不通无关，反复开关只会扰乱状态
  - 只读探针：
    ```
    dns-sd -B _remotepairing._tcp local    # 手机解锁后应立刻出现
    xcrun devicectl device info lockState --device <UDID>
    ```
  - iPhone 个人热点下天然可用（`172.20.10.x`、`transportType=localNetwork`）；⚠️ 热点在 macOS Wi‑Fi 列表里就是个普通网络名（实测 `Zixiang的iPhone`），实测前用 `ifconfig en0 | grep 'inet '` 确认网段
  - 描述文件过期后重新 provision 并重装真机版**可能**触发配对失效（`tunnelState` 恒 `unavailable`），此时 `unpair` + `pair` 可恢复（需数据线）：
    ```
    xcrun devicectl manage unpair --device <UDID>   # 需插数据线
    xcrun devicectl manage pair --device <UDID>     # 手机解锁亮屏，弹「信任此电脑」要信任
    ```
  - 注意 `connectionProperties` 里**顶层 `identifier` 是隧道 ID（UUID），不是 UDID**；UDID 在 `hardwareProperties.udid`，脚本匹配时别搞混
- **自动续签（推荐）**：`scripts/auto-renew.sh` + launchd 任务，每 30 分钟自动检查并续签
  ```
  bash scripts/auto-renew.sh            # 手动跑一次（行为同 launchd）
  bash scripts/auto-renew.sh --status   # 只报告状态，不动作、不发通知、不写状态
  bash scripts/auto-renew.sh --force    # 忽略剩余天数阈值，强制续签
  launchctl kickstart -k gui/$(id -u)/com.liuzixiang.yijing64.autorenew   # 立即触发一次
  launchctl print gui/$(id -u)/com.liuzixiang.yijing64.autorenew          # 查看状态
  ```
  逻辑：剩余 > 3 天直接退出（不构建、不切网）；进入 3 天窗口后，先在当前频段用 `devicectl device info lockState` 探测：可达则直接续签；不可达（如 Mac 在 5G、iPhone 也在 5G 被隔离）则**自动切到另一频段**（仅限自家 SSID 白名单），探测通过后 `xcodebuild -allowProvisioningUpdates` + 重装真机，**结束后自动切回原频段**（EXIT trap 兜底）；无法切换（在外网 / 缺密码）时每 24h 最多提示一次，不轰炸
  - 续签前会**清掉本 bundle 的缓存 profile**（`do_renew()`），否则 Xcode 复用旧 profile、有效期不会 +7 天；构建失败则自动还原备份
  - **手机端零动作**：`do_renew()` 只 `devicectl device install app`（后台静默重装），**不再 `process launch` / `terminate`**——续签不会自动打开 App。重装是必须的（描述文件嵌在 App 签名里），若续签瞬间 App 正开着会被系统关闭（iOS 行为，无法避免）
  - 可达后若检测到 App 正在运行（`devicectl device info processes` 匹配 `/Yijing64.app/`），本轮**跳过不安装**、顺延到下个周期（避免"关掉你正在用的 App"）；已切频段的会立即切回；提示 `appRunningNudgeAt`，间隔同 `RENEW_NUDGE_GAP`
  - 可达性探测带重试（切频段后隧道约需 1~2s 才建立，且偶有抖动）：切换后最多探 8 次、每次间隔 2s；当前频段探测也重试 3 次，避免误切
  - 能切断网的只有"进入 3 天窗口且当前频段探不到"这一条路径；`--status` 与"剩余 > 3 天"的周期检查**绝不切网**。因 5G↔5G 被隔离，无法"先确认可续签再切"——**切过去本身就是探测**，不通/App 在跑则秒回原频段
  - 每轮检查前随机 `sleep 0~300s`（`JITTER_MAX_SECONDS`），避免固定 30 分钟网格与使用习惯锁相
  - 自家 Wi-Fi 的 `WIFI_PRIMARY_SSID` / `WIFI_ALT_SSID` / `WIFI_PASSWORD` 放在 **gitignored** 的 `scripts/wifi.local.sh`；缺失则跳过自动切换、降级为提示
  - 日志 `.build/auto-renew.log`，状态 `.build/auto-renew.state`（记录 `renewNudgeAt` / `appRunningNudgeAt` / `lastRenewAt` / `lastSwitchAttemptAt`）
  - 切网防抖 `SWITCH_RETRY_GAP`（默认 6h）：距上次切网尝试不足该间隔则只提示不切，避免手机长期锁屏时反复切网；`--force` 不受限
  - plist 在 `~/Library/LaunchAgents/com.liuzixiang.yijing64.autorenew.plist`（**不入库**，含绝对路径）
  - 后台跑 `codesign` 时系统可能弹一次钥匙串授权，需点「始终允许」
- 需要插线或重新信任的情况：证书被吊销 / 换电脑 / 重装系统、设备配对失效、换新设备首次安装；以及无线中途失效时按上面的「无线更新」小节排查。需要重新信任时在 iPhone「设置 → 通用 → VPN 与设备管理」操作
- 免费账号额度：每 7 天约可创建 10 个 App ID 等（本项目复用同一 App ID，一般不会触发）

## 发版流程

1. 更新 `project.yml`：`MARKETING_VERSION` 改为新版本号；`CURRENT_PROJECT_VERSION`（build 号）**递增 +1**
2. 运行 `xcodegen generate` 重新生成工程（版本写入 pbxproj / Info.plist）
3. 更新 `CHANGELOG.md`：新增对应版本条目（Keep a Changelog 风格）
4. 验证：`cd YijingCore && swift test` → `bash scripts/sync.sh`（「关于」页应显示新版本号）。Mac 版独立维护，无需一并构建/打开
5. 提交推送后**打标签**：`git tag -a vX.Y.Z -m "X.Y.Z"` → `git push origin vX.Y.Z`

版本号遵循语义化版本；App 内「关于」页版本由 Info.plist 动态读取，无需手改 UI。

## 其他

- 新增 `YijingCore` 源文件后需先运行 `xcodegen generate` 重新生成工程
- `YijingCore` 同时作为 xcodegen target（iOS：`YijingCore`、macOS：`YijingCoreMac`，模块名均为 `YijingCore`）与本地 Swift Package（`cd YijingCore && swift test`）
- 测试：`cd YijingCore && swift test`
- 提交信息使用中文，风格：`Add <主题>：<要点>`

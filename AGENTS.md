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
- **续签**：描述文件过期后直接运行 `bash scripts/sync.sh` 即可。脚本带 `CODE_SIGN_STYLE=Automatic` 与 `-allowProvisioningUpdates`，构建时会联网向 Apple 自动刷新描述文件，再经 `devicectl` 安装；证书未过期则无需重新「信任开发者」
- **无线更新**：真机已与本机配对（`xcrun devicectl list devices` 显示 `available (paired)`）。只要 iPhone 与本机在同一 Wi‑Fi（且手机解锁亮屏）即可构建/安装/续签，无需数据线。实测 `transportType=localNetwork` 时 `devicectl device info lockState` 可实时返回、`tunnelState=connected`
  - **前提条件**：iPhone 必须**解锁亮屏**。锁屏时 iOS 停掉 `_remotepairing` 广播、也不回 ICMP，此时 `tunnelState=unavailable`
  - ⚠️ **不要用 ping 判断连通性**：iOS 在有线/无线下都不响应 ICMP（实测有线连接正常时 `ping 192.168.1.2` 依然 100% 丢包），唯一可信的探针是 `xcrun devicectl device info lockState --device <UDID>`
  - ⚠️ **不要动 Xcode 的「Connects via Network when wired connection is not available」开关**：它只决定「未插线时是否启用无线」，与连不通无关，反复开关只会扰乱状态
  - **无线不通时的排查顺序**：
    ```
    # 1) 手机是否解锁亮屏、是否真在同一个 SSID（iPhone：设置 → 无线局域网 看 SSID 和 IP）
    # 2) 手机是否广播（手机解锁后应立刻出现）
    dns-sd -B _remotepairing._tcp local
    # 3) 路由器是否拦截客户端间单播（ARP/组播通但 TCP 不通 = 典型被拦）
    nc -z -G 3 <手机IP> 49152
    # 4) 终极对照：iPhone 开个人热点、Mac 连上去（172.20.10.x），再测 1)/3)
    #    热点通 + 家里不通 = 路由器问题；热点也不通 = 配对问题，走 unpair/pair
    ```
  - **配对失效（症状：手机解锁同网段、`_remotepairing` 在广播，但 `tunnelState` 恒为 `unavailable`、所有实时命令报 `device not found`）**：直接重新配对
    ```
    xcrun devicectl manage unpair --device <UDID>   # 需插数据线
    xcrun devicectl manage pair --device <UDID>     # 手机解锁亮屏，弹「信任此电脑」要信任
    ```
    常见触发时机：**描述文件过期后重新 provision 并重装真机版**（本项目实际踩过：续签成功后无线就断了，`unpair`+`pair` 立即恢复）
  - 注意 `connectionProperties` 里**顶层 `identifier` 是隧道 ID（UUID），不是 UDID**；UDID 在 `hardwareProperties.udid`，脚本匹配时别搞混
- **自动续签（推荐）**：`scripts/auto-renew.sh` + launchd 任务，每 30 分钟自动检查并续签
  ```
  bash scripts/auto-renew.sh            # 手动跑一次（行为同 launchd）
  bash scripts/auto-renew.sh --status   # 只报告状态，不动作、不发通知、不写状态
  bash scripts/auto-renew.sh --force    # 忽略剩余天数阈值，强制续签
  launchctl kickstart -k gui/$(id -u)/com.liuzixiang.yijing64.autorenew   # 立即触发一次
  launchctl print gui/$(id -u)/com.liuzixiang.yijing64.autorenew          # 查看状态
  ```
  逻辑：剩余 > 3 天直接退出（不构建）；进入 3 天窗口且设备已连接（`pairingState=paired` 且 `transportType` 非空，**无线 `localNetwork` 优先、有线 `wired` 兜底**）则自动 `xcodebuild -allowProvisioningUpdates` + 重装真机；设备未连接则**每 24h 最多提示一次「解锁手机同 Wi-Fi 即可，不行就插线」**，不轰炸
  - 每轮检查前随机 `sleep 0~300s`（`JITTER_MAX_SECONDS`），避免固定 30 分钟网格与使用习惯锁相
  - 日志 `.build/auto-renew.log`，状态 `.build/auto-renew.state`（记录 `phase` / `tunnelDownSince` / `renewNudgeAt` / `lastRenewAt`）
  - plist 在 `~/Library/LaunchAgents/com.liuzixiang.yijing64.autorenew.plist`（**不入库**，含绝对路径）
  - 后台跑 `codesign` 时系统可能弹一次钥匙串授权，需点「始终允许」
- 需要插线或重新信任的情况：证书被吊销 / 换电脑 / 重装系统、设备配对失效、换新设备首次安装；以及无线中途失效时按上面的「无线不通时的排查顺序」处理。需要重新信任时在 iPhone「设置 → 通用 → VPN 与设备管理」操作
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

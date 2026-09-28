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
- **无线更新（本项目当前网络下不可用）**：真机已与本机配对（曾见 `available (paired)`，主机名 `<UDID>.coredevice.local`），但**日常使用的那张 Wi‑Fi（`CU_77qd_5G`）开启了客户端隔离**：
  - 实测 Mac `ping 192.168.1.2`（手机）100% 丢包、`nc -z 192.168.1.2 49152` 不可达；反向在 Mac 开 `python3 -m http.server 8080`，手机 Safari 打不开 `http://192.168.1.4:8080`，日志里零请求 → **双向都被路由器隔离**
  - 但 mDNS 仍能看到手机的 `_remotepairing._tcp`（`ZixiangtekiiPhone.local → 192.168.1.2`），容易误判为「无线可用」；`devicectl` 的 `tunnelState` 也**不可靠**（可能 `unavailable` 而设备实际可达，或反之），因此所有实时命令（`device info lockState/apps/processes`）都报 `device not found`
  - 结论：**要无线调试，必须先关掉路由器的「客户端隔离 / AP Isolation」**；否则无线续签物理上不可能，只能插线
  - 若哪天换到无隔离的网络，可用只读探针确认：`dns-sd -B _companion-link._tcp local` 里能看到 iPhone，且 `xcrun devicectl device info lockState --device <UDID>` 能实时返回
  - 有线排查：`system_profiler SPUSBDataType | grep -i iphone` 无输出 = 线有问题（**纯充电线不会有输出**，实测踩过）
  - 注意 `connectionProperties` 里**顶层 `identifier` 是隧道 ID（UUID），不是 UDID**；UDID 在 `hardwareProperties.udid`，脚本匹配时别搞混
- **自动续签（推荐）**：`scripts/auto-renew.sh` + launchd 任务，每 30 分钟自动检查并续签
  ```
  bash scripts/auto-renew.sh            # 手动跑一次（行为同 launchd）
  bash scripts/auto-renew.sh --status   # 只报告状态，不动作、不发通知、不写状态
  bash scripts/auto-renew.sh --force    # 忽略剩余天数阈值，强制续签
  launchctl kickstart -k gui/$(id -u)/com.liuzixiang.yijing64.autorenew   # 立即触发一次
  launchctl print gui/$(id -u)/com.liuzixiang.yijing64.autorenew          # 查看状态
  ```
  逻辑：剩余 > 3 天直接退出（不构建）；进入 3 天窗口且设备已连接（`pairingState=paired` 且 `transportType` 非空，有线/无线均可）则自动 `xcodebuild -allowProvisioningUpdates` + 重装真机；设备未连接则**每 24h 最多提示一次「插一次数据线即可自动续签」**，不轰炸
  - 每轮检查前随机 `sleep 0~300s`（`JITTER_MAX_SECONDS`），避免固定 30 分钟网格与使用习惯锁相
  - 日志 `.build/auto-renew.log`，状态 `.build/auto-renew.state`（记录 `phase` / `tunnelDownSince` / `renewNudgeAt` / `lastRenewAt`）
  - plist 在 `~/Library/LaunchAgents/com.liuzixiang.yijing64.autorenew.plist`（**不入库**，含绝对路径）
  - 后台跑 `codesign` 时系统可能弹一次钥匙串授权，需点「始终允许」
- 需要插线或重新信任的情况：证书被吊销 / 换电脑 / 重装系统、设备配对失效、换新设备首次安装、以及**当前需求下的每周续签（本机 Wi‑Fi 有客户端隔离，无线不可用，只能插线；脚本会在到期前 3 天提醒）**。需要重新信任时在 iPhone「设置 → 通用 → VPN 与设备管理」操作
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

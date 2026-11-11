© 2026 刘子祥 · 原创作品，转载请注明出处

> **定位**：易经六十四卦 App：SwiftUI 编写，含排卦、起卦、卦辞白话查询与大模型解卦。 使用许可见 [LICENSE](./LICENSE)。

# 易经六十四卦 (Yijing64)

当前版本：**2.8.0**（详见 [CHANGELOG.md](CHANGELOG.md)）

SwiftUI 编写的《周易》六十四卦 App，含线下排卦、多种起卦方式、卦辞白话查询，以及基于大模型的 AI 解卦；同时提供 iOS 与原生 macOS 版本。

## 演示

| 线下排卦 | 起卦 | 卦库 |
| --- | --- | --- |
| ![线下排卦](docs/gifs/manual-cast.gif) | ![起卦](docs/gifs/cast-plum.gif) | ![卦库](docs/gifs/library.gif) |

| AI 解卦 | 起卦记录 | 模型 / Token 用量 |
| --- | --- | --- |
| ![AI 解卦](docs/gifs/ai-interpretation.gif) | ![起卦记录](docs/gifs/history.gif) | ![模型与用量](docs/gifs/models-usage.gif) |

## 功能

- **线下排卦**：手动录入线下摇卦结果，逐爻点击设置阴阳，可勾选动爻（存在则四态循环切换，否则仅在少阴/少阳间切换）；实时推断本卦/变卦/互卦/动爻/体用并展示卦辞。
- **起卦**：支持三枚铜钱（六爻摇钱法）、梅花易数时间起卦 / 报数起卦 / 随机起卦，逐爻演示动爻（老阳 ○ / 老阴 ×）；起卦完成后自动滚动到底端展示结果。
- **卦库**：文王卦序、八宫分组浏览六十四卦；支持关键词搜索（卦名、卦序、上下卦、宫名、卦辞、爻辞、白话译文），命中片段高亮，搜索结果按宫分组。
- **卦辞查询**：每卦含卦辞、六爻爻辞、用九/用六（乾坤）及白话译文；起卦结果中点击卦象可跳转到对应卦辞。
- **AI 解卦**：多轮对话式解卦，流式输出与思考过程展示（打字机平滑揭示）；思考过程随记录持久化，历史回放可展开。摘要卡中的卦象/卦名与变卦可点击跳转卦库对应卦。
  - 直问直答：先给出明确吉凶判词，判别不利时不软化。
  - 空白发送 = 默认解卦：严格只看卦象，不结合历史对话。
  - 卦库每卦详情页可直接进入该卦的 AI 解读（同样写入起卦记录，标记为「卦库·单卦解读」）。
- **模型服务**：关于页可切换 DeepSeek / 智谱 / opencode Zen / opencode Go / 自定义，各服务商独立记忆 API Key 与连接配置；模型从服务商的 `/models` 接口自动拉取，弹出可搜索列表选择（支持刷新与手动输入，结果缓存 24 小时）；按所填模型自动匹配计费单价。
- **Token 用量**：统计请求次数、输入/输出 tokens、缓存命中率与估算费用，并按模型拆分（关于页 / 记录 / 解卦页三处展示，附所用模型名）。

## 项目结构

```
Yijing64.xcodeproj     Xcode 工程（xcodegen 生成，见 project.yml）
Yijing64/              App Target
  Views/                各 Tab 与组件（RootTab、Divination、Library、AI、History、About、Components）
  ViewModels/           起卦状态、AI 解卦会话、路由
YijingCore/            Swift Package：模型与业务逻辑
  Sources/YijingCore/
    Models/             Hexagram、Trigram、Palace、LineType、CastResult、卦象内容表
    Services/           起卦器（CoinCaster、PlumBlossomCaster）、卦库搜索、
                        AI 提示词与客户端（HexagramInterpretation、LLMClient）、
                        配置与计费（LLMSettings、TokenUsage/TokenUsageStore）、起卦记录
  Tests/                XCTest 单元测试
scripts/                构建同步脚本（sync.sh、mac.sh）、Python 抓取与内容生成脚本
```

## 构建 / 测试

```bash
# 重新生成工程（新增 Swift 文件或修改 project.yml 后需要）
brew install xcodegen && xcodegen generate

# 单测（YijingCore）
cd YijingCore && swift test

# 一键构建并安装到模拟器与真机（含启动）
bash scripts/sync.sh

# 构建并启动原生 macOS App（独立于 iOS，按需运行；本地 ad-hoc 签名，无需开发者账号）
bash scripts/mac.sh

# 安装桌面启动器「易经模拟器」到 /Applications（双击即可在模拟器中打开）
bash scripts/install-simulator-launcher.sh

# 仅构建 App（模拟器）
xcodebuild build -project Yijing64.xcodeproj -scheme Yijing64 \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -derivedDataPath .build/dd
```

## 内容来源

- 卦辞 / 爻辞原文：中文维基文库（公有领域），简体转写见 `scripts/fetch_yijing.py`。
- 白话译文：南怀瑾《白话易经》（此部分版式与文意由《白话易经》整理，见 `scripts/gen_content_data.py`；如需替换，调整该脚本即可重新生成 `HexagramContentData.swift`）。

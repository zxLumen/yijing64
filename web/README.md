# 易经六十四卦 · 网页版

原生 SwiftUI `yijing64` 的全功能网页版:起卦逻辑与原生共用同一套算法,把「本地
存储 + 本地 Key」换成「服务端按数据域隔离」。

## 结构

```
web/
  src/core/     起卦与卦库核心逻辑(纯 ESM + JSDoc,浏览器与 Node 共用)
  src/data/     hexagrams.json / contents.json(由 scripts/export_web_data.py 导出)
  src/views/    五个 Tab:线下排卦 / 起卦 / 记录 / 卦库 / 关于
  src/lib/      前端 API 客户端、流式对话 hook、AI 状态上报
  lib/          服务端模块(store / scope / records / settings / llm)
  server.js     HTTP + SSE + 静态资源(零运行期依赖)
  test/         node --test 单元 + 端到端
```

**为什么 `src/core` 同时被服务端引用**:`server.js` 只用 Node 内置模块,但要用同一份
起卦/卦库逻辑,所以 `lib/*.js` 直接 `import '../src/core/*.js'`。运行镜像因此也
`COPY` 了 `web/src/core` 与 `web/src/data`。

## 开发

```bash
cd web
npm install
npm run dev        # 同时起 API(8788)+ vite dev server(/api 代理到 8788)
npm start          # 只起服务端(dist/ 存在时同时发静态资源)
npm run typecheck  # tsc --noEmit(含 JSDoc 校验的 core)
npm test           # node --test(63 项)
npm run build      # vite build → dist/,server.js 负责发静态资源
```

### 环境变量

见 `.env.example`。要点:

| 变量 | 说明 |
| --- | --- |
| `YIJING_PORT` / `YIJING_HOST` | 监听地址,默认 `0.0.0.0:8788` |
| `YIJING_DATA_DIR` | 运行期数据目录(记录 / 配置 / Key / owner token) |
| `YIJING_DIST` | 前端产物目录,默认 `dist`(测试用临时目录) |
| `YIJING_VISITOR_AI` | `0` 关闭访客使用 AI |
| `SESSION_SECRET` | 与博客一致则已登录博客即视为站长(SSO) |
| `YIJING_OWNER_TOKEN` | 站长兜底 token;留空则首启生成 `owner.token` 并打印调试链接 |

### 数据域(scope)

| 数据域 | cookie | 说明 |
| --- | --- | --- |
| `owner` | `yijing_owner` | 站长;已登录博客(`zx_admin` + 同一 `SESSION_SECRET`)或 owner token |
| 访客 | `yijing_cid` | 16 位十六进制,首次访问下发 |
| 只读查看 | `yijing_view` | 站长切到某访客数据域,**禁止写入** |

记录落在 `<DATA_DIR>/records/<scopeKey>.json`;Key 与 owner token 为 `0600`。

## 部署

```bash
# 在仓库根:构建上下文是根目录(镜像只含 web/)
docker build -f web/Dockerfile -t ghcr.io/zxlumen/yijing64-web:<tag> .
```

`.github/workflows/docker-publish.yml` 在 `main` 推送后构建并推 GHCR
(`ghcr.io/zxlumen/yijing64-web:<sha>` 与 `:latest`,公开 → 服务器匿名 pull)。

站点侧(博客仓库 `zxLumen-Blog`):

- `docker/docker-compose.yml` 已有 `yijing` 服务(镜像 `YIJING_TAG`,卷 `yijing-data`),
  `SESSION_SECRET` 与博客同源;
- `docker/Caddyfile` 已有 `yijing.{$DOMAIN}` → `yijing:8788`,保留
  `frame-ancestors 'self' https://{$DOMAIN}` 以便主站 iframe 内嵌;
- `docker/deploy.sh` 会 `pull yijing`(拉不到不阻断)。

⚠️ **上线前**需先把 `yijing.zxlumen.cn` 的 DNS A 记录指向服务器,否则 Caddy
签不出证书。

## 与原生版的差异

- **时间起卦的年支已修正**:原生把公历年直接当年支用,既错了干支年的分界
  (春节前应属上一干支年),甲子年还会算出 0。网页版按干支年取年支序
  (1984 甲子 = 子 = 1),年界以春节为准,闰月取本月月号。本次**只改网页版**,
  所以同一时刻两端的时间起卦结果可能不同。
- **AI 配置在服务端**:原生存本地 Key,网页版由站长在「关于」页配置,访客直接用
  (可关);Key 绝不下发到浏览器,只回传掩码。

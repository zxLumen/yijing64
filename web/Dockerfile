# yijing64 网页版 —— 运行镜像。
# 构建上下文 = 仓库根(镜像只含 web/)。
#
#   docker build -f web/Dockerfile -t yijing64-web .
#
# 运行时零 npm 依赖:server.js 与 lib/*.js 只用 Node 内置模块
# (含 node:test 之外无第三方包);前端由 vite 构建成静态 dist/,由 server.js 发。

FROM node:22-alpine AS build
WORKDIR /app/web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM node:22-alpine
WORKDIR /app/web
ENV NODE_ENV=production \
    YIJING_PORT=8788 \
    YIJING_HOST=0.0.0.0 \
    YIJING_DATA_DIR=/data
# 服务端(纯 Node,无 node_modules)
COPY web/server.js ./
COPY web/lib/ ./lib/
# 服务端复用的前端核心逻辑(零依赖,仅 JSON import)
COPY web/src/core/ ./src/core/
COPY web/src/data/ ./src/data/
# 前端产物
COPY --from=build /app/web/dist ./dist
# 运行期数据(访客记录 / AI 配置 / Key / owner token)—— compose 挂命名卷到 /data
RUN mkdir -p /data
EXPOSE 8788
CMD ["node", "server.js"]

# 阶段1：构建
FROM node:22-alpine AS builder

WORKDIR /src

# 复制依赖声明文件
COPY package*.json ./
COPY apps/api/package*.json ./apps/api/
COPY apps/web/package*.json ./apps/web/
COPY tsconfig.base.json ./

# 安装全部依赖（包含 devDependencies 以获取 tsc、vite 等构建工具）
RUN npm install --include=dev

# 复制源代码
COPY . .

# 构建 API 和前端
RUN npm run build

# 阶段2：生产镜像
FROM node:22-alpine

WORKDIR /src

# 仅复制运行时需要的文件
COPY package*.json ./
COPY apps/api/package*.json ./apps/api/
COPY apps/web/package*.json ./apps/web/

# 仅安装生产依赖
RUN npm install --omit=dev

# 从构建阶段复制编译产物
COPY --from=builder /src/apps/api/dist ./apps/api/dist
COPY --from=builder /src/apps/web/dist ./apps/web/dist

EXPOSE 8080

ENV NODE_ENV=production
ENV PORT=8080

CMD ["node", "apps/api/dist/server.js"]

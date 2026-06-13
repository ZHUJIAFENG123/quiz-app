FROM node:22-alpine

# 安装 sql.js 需要的依赖
RUN apk add --no-cache python3 make g++

WORKDIR /app

# 复制所有文件
COPY . .

# 构建前端
WORKDIR /app/frontend
RUN npm install && npm run build

# 安装后端依赖
WORKDIR /app/backend
RUN npm install

# 生产模式
ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080
CMD ["node", "server.js"]

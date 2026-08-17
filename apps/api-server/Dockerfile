FROM node:20-alpine

WORKDIR /app

# 1. Copy file quản lý workspaces ở Root
COPY package*.json ./

# 2. Copy package.json của API Server và toàn bộ thư mục thư viện dùng chung (packages/)
COPY apps/api-server/package.json ./apps/api-server/
COPY packages/ ./packages/

# 3. Cài đặt dependencies chuyên biệt cho workspace api-server
RUN npm ci --omit=dev --workspace=api-server

# 4. Copy mã nguồn của backend vào container
COPY apps/api-server/ ./apps/api-server/

# 5. Chuyển con trỏ làm việc vào thư mục backend
WORKDIR /app/apps/api-server

EXPOSE 5000

# FIX BUG: Chạy server.js thay vì index.js
CMD ["node", "server.js"]

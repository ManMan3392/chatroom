# API 服务层使用指南

## 概述

已为项目创建了统一的 API 服务层，自动根据环境（开发/生产）切换 API 地址。

## 文件说明

### `.env` - 开发环境配置

```env
VITE_API_SERVER=http://localhost:3000
VITE_WS_SERVER=ws://localhost:3000
```

### `.env.production` - 生产环境配置

```env
VITE_API_SERVER=https://your-production-server.com
VITE_WS_SERVER=wss://your-production-server.com
```

**需要修改为实际的线上服务器地址**

### `src/services/api.ts` - API 服务层实现

提供以下方法：

- `get<T>(url)` - GET 请求
- `post<T>(url, data)` - POST 请求
- `uploadFile<T>(url, file)` - 文件上传
- `getWebSocketUrl()` - 获取 WebSocket URL
- `getFullApiServer()` - 获取完整 API 地址

### `vite.config.ts` - Vite 代理配置

在开发环境自动代理：

- `/api/*` → `http://localhost:3000`
- `/upload/*` → `http://localhost:3000`

## 使用示例

### 改造后的 App.jsx

```typescript
import { get } from "./services/api";

// 替代原来的 fetch 代码
const data = await get<MessageType[]>("/api/messages?limit=20");
```

### 改造后的 InputArea.jsx

```typescript
import { uploadFile } from "./services/api";

// 替代原来的 fetch + FormData
const result = await uploadFile<{ url: string }>("/upload", file);
```

## 环境切换

- **开发环境**：`npm run dev` 或端口为 5173

  - API 请求自动走 Vite 代理
  - WebSocket 连接到本地开发服务器

- **生产环境**：`npm run build` 后部署
  - API 请求直接发送到 `.env.production` 配置的线上地址
  - 需要提前修改 `.env.production` 中的实际服务器地址

## WebSocket 迁移（可选）

如需使用服务层中的 `getWebSocketUrl()`：

```typescript
import { getWebSocketUrl } from "./services/api";

const wsUrl = getWebSocketUrl();
socket = new WebSocket(wsUrl);
```

当前 App.jsx 中的 WebSocket 连接逻辑已经支持开发和生产环境的自动切换，可以保持不变或使用服务层方法。

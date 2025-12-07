/**
 * API 服务层
 * 统一管理所有 HTTP 请求
 * 自动根据环境（开发/生产）调整 API 地址
 */

// 判断是否为开发环境
const isDev = import.meta.env.DEV;
const isViteDev = window.location.port === "5173";

// 获取 API 服务器地址
function getApiServer(): string {
  if (isDev || isViteDev) {
    // 开发环境：使用 Vite 代理，直接请求相对路径
    // Vite 会将 /api 请求代理到真实服务器
    return "";
  } else {
    // 生产环境：请求配置的线上地址
    return import.meta.env.VITE_API_SERVER || "";
  }
}

// 获取 WebSocket 服务器地址
function getWsServer(): string {
  if (isDev || isViteDev) {
    // 开发环境：WebSocket 直接连接到后端服务器
    const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${wsProtocol}//${window.location.hostname}:3000`;
  } else {
    // 生产环境：请求配置的线上地址
    return import.meta.env.VITE_WS_SERVER || "";
  }
}

/**
 * 发送 GET 请求
 * @param url API 路径（相对路径，如 /api/messages）
 */
export async function get<T = unknown>(url: string): Promise<T> {
  const apiServer = getApiServer();
  const fullUrl = apiServer ? `${apiServer}${url}` : url;

  const response = await fetch(fullUrl);
  if (!response.ok) {
    throw new Error(`API Error: ${response.status}`);
  }
  return response.json();
}

/**
 * 发送 POST 请求
 * @param url API 路径
 * @param data 请求体数据
 */
export async function post<T = unknown>(
  url: string,
  data?: unknown
): Promise<T> {
  const apiServer = getApiServer();
  const fullUrl = apiServer ? `${apiServer}${url}` : url;

  const response = await fetch(fullUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: data ? JSON.stringify(data) : undefined,
  });

  if (!response.ok) {
    throw new Error(`API Error: ${response.status}`);
  }
  return response.json();
}

/**
 * Admin API: clear persisted messages and uploaded files.
 * If the server requires an admin token, include it as `x-admin-token` header.
 */
export async function adminClear(
  adminToken?: string
): Promise<Record<string, unknown>> {
  const apiServer = getApiServer();
  const fullUrl = apiServer
    ? `${apiServer}/api/admin/clear`
    : "/api/admin/clear";

  const headers: Record<string, string> = {};
  if (adminToken) headers["x-admin-token"] = adminToken;

  const response = await fetch(fullUrl, {
    method: "POST",
    headers,
  });
  if (!response.ok) {
    throw new Error(`Admin API Error: ${response.status}`);
  }
  return response.json();
}

/**
 * 上传文件
 * @param url API 路径
 * @param file 文件对象
 */
export async function uploadFile<T = unknown>(
  url: string,
  file: File
): Promise<T> {
  const apiServer = getApiServer();
  const fullUrl = apiServer ? `${apiServer}${url}` : url;

  const formData = new FormData();
  formData.append("file", file, file.name);

  const response = await fetch(fullUrl, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Upload Error: ${response.status}`);
  }
  return response.json();
}

/**
 * 获取 WebSocket 连接 URL
 */
export function getWebSocketUrl(): string {
  return getWsServer();
}

/**
 * 获取完整的 API 服务器地址（用于 WebSocket 等需要完整 URL 的场景）
 */
export function getFullApiServer(): string {
  if (isDev || isViteDev) {
    const protocol = window.location.protocol === "https:" ? "https:" : "http:";
    return `${protocol}//${window.location.hostname}:${
      window.location.port || (protocol === "https:" ? 443 : 80)
    }`;
  }
  return import.meta.env.VITE_API_SERVER;
}

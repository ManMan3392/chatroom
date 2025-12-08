const isDev = import.meta.env.DEV;
const isViteDev = window.location.port === "5173";

function getWsServer(): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  if (isDev || isViteDev) {
    return `${protocol}//${window.location.hostname}:3000`;
  }
  return `${protocol}//${window.location.host}`;
}

export async function get<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`API Error: ${response.status}`);
  }
  return response.json();
}

export async function post<T>(
  url: string,
  data?: unknown
): Promise<T> {
  const response = await fetch(url, {
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

export async function adminClear(
  adminToken?: string
): Promise<Record<string, unknown>> {
  const fullUrl = "/api/admin/clear";

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

export async function uploadFile<T = unknown>(
  url: string,
  file: File
): Promise<T> {
  const formData = new FormData();
  formData.append("file", file, file.name);

  const response = await fetch(url, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Upload Error: ${response.status}`);
  }
  return response.json();
}

export function getWebSocketUrl(): string {
  return getWsServer();
}

export function getFullApiServer(): string {
  if (isDev || isViteDev) {
    const protocol = window.location.protocol === "https:" ? "https:" : "http:";
    return `${protocol}//${window.location.hostname}:${
      window.location.port || (protocol === "https:" ? 443 : 80)
    }`;
  }
  return import.meta.env.VITE_API_SERVER;
}

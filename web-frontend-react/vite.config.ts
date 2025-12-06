import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: "./",
  server: {
    host: "0.0.0.0",
    proxy: {
      // 代理 /api 请求到本地开发服务器
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
      // 代理 /upload 请求到本地开发服务器
      "/upload": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
});

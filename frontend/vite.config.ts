import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// В Docker фронт проксирует на сервис `api:8000`; локально — на localhost:8000.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const proxyTarget =
    process.env.VITE_PROXY_API || env.VITE_PROXY_API || "http://localhost:8000";

  return {
    plugins: [react()],
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes("node_modules")) return;
            if (id.includes("@monaco-editor") || id.includes("monaco-editor")) return "vendor-monaco";
            if (id.includes("react-markdown") || id.includes("remark-gfm")) return "vendor-markdown";
            if (id.includes("react-router-dom")) return "vendor-router";
            if (id.includes("lucide-react")) return "vendor-icons";
            if (id.includes("react") || id.includes("scheduler")) return "vendor-react";
          },
        },
      },
    },
    server: {
      port: 5173,
      host: "0.0.0.0",
      proxy: {
        "/api": {
          target: proxyTarget,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ""),
        },
        "/stats": {
          target: proxyTarget,
          changeOrigin: true,
        },
        "/activity": {
          target: proxyTarget,
          changeOrigin: true,
        },
        "/webhooks": {
          target: proxyTarget,
          changeOrigin: true,
        },
        "/ws": {
          target: proxyTarget,
          changeOrigin: true,
          ws: true,
        },
      },
    },
  };
});


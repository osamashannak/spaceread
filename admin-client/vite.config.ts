import {defineConfig, loadEnv} from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, process.cwd());
  const productionBase = env.VITE_ADMIN_ASSETS_URL && env.VITE_ADMIN_APP_VERSION
      ? `${env.VITE_ADMIN_ASSETS_URL}/${env.VITE_ADMIN_APP_VERSION}/`
      : "/";
  const proxyConfig = (prefix: string, target: string) => ({
    target,
    changeOrigin: true,
    secure: false,
    rewrite: (requestPath: string) => requestPath.replace(new RegExp(`^${prefix}`), ""),
  });
  const proxy = {
    ...(env.VITE_COURSE_PROXY_TARGET ? {"/api/course": proxyConfig("/api/course", env.VITE_COURSE_PROXY_TARGET)} : {}),
    ...(env.VITE_AUTH_PROXY_TARGET ? {"/api/auth": proxyConfig("/api/auth", env.VITE_AUTH_PROXY_TARGET)} : {}),
    ...(env.VITE_ADMIN_PROXY_TARGET ? {"/api/admin": proxyConfig("/api/admin", env.VITE_ADMIN_PROXY_TARGET)} : {}),
  };

  return {
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    server: {
      watch: {
        usePolling: true,
        interval: 100,
      },
      proxy,
    },
    build: {
      emptyOutDir: true,
      cssCodeSplit: true,
      assetsDir: "assets",
      rollupOptions: {
        output: {
          manualChunks(id: string) {
            if (id.includes("node_modules")) return "vendor";
          },
          assetFileNames: "assets/[name].[hash].[ext]",
          chunkFileNames: "assets/[name].[hash].js",
          entryFileNames: "assets/[name].[hash].js",
          format: "es",
        },
      },
    },
    base: mode === "production" ? productionBase : "/",
  };
});

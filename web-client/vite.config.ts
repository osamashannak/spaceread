import {defineConfig, loadEnv} from 'vite'
import legacy from '@vitejs/plugin-legacy'
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig(({ mode}) => {
  const env = loadEnv(mode, process.cwd());
  const professorProxyTarget = env.VITE_PROFESSOR_PROXY_TARGET || 'https://professor.api.spaceread.net';
  const courseProxyTarget = env.VITE_COURSE_PROXY_TARGET || 'https://course.api.spaceread.net';
  const authProxyTarget = env.VITE_AUTH_PROXY_TARGET || 'https://auth.api.spaceread.net';
  const assetBase = (() => {
    if (mode !== 'production') {
      return '/';
    }

    const assetsUrl = env.VITE_ASSETS_URL?.replace(/\/+$/, '');
    const appVersion = env.VITE_APP_VERSION?.replace(/^\/+|\/+$/g, '');
    if (!assetsUrl) {
      return '/';
    }

    return appVersion ? `${assetsUrl}/${appVersion}/` : `${assetsUrl}/`;
  })();

  return {
    plugins: [react(),
      legacy({
        targets: ['defaults', 'not IE 11', 'iOS >= 11'],
      }),
      {
        name: 'module-preload',
        enforce: 'post',
        apply: 'build',
        transformIndexHtml(html) {
          return html
              .replace(/<link rel="modulepreload" crossorigin href="(.*)">/g, '<link rel="preload" as="script" crossorigin href="$1">')
        }
      },

    ],
    resolve: {
      alias: {
        '@': path.resolve(process.cwd(), 'src'),
      },
    },
    server: {
      watch: {
        usePolling: true,
        interval: 100,
      },
      proxy: {
        // Proxy for the Professor API
        '/api/professor': {
          target: professorProxyTarget,
          changeOrigin: true,
          secure: false, // often needed for HTTPS targets
          rewrite: (path) => path.replace(/^\/api\/professor/, ''),
        },

        // Proxy for the Course API
        '/api/course': {
          target: courseProxyTarget,
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/api\/course/, ''),
        },

        '/api/auth': {
          target: authProxyTarget,
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/api\/auth/, ''),
        },
      },
    },
    esbuild: {
      // Work around an esbuild/Vite chunk transpile issue during production builds.
      // All configured modern targets already support destructuring syntax.
      supported: {
        destructuring: true,
      },
    },
    build: {
      emptyOutDir: true,
      cssCodeSplit: true,
      assetsDir: "",
      rollupOptions: {
        output: {
          manualChunks: (id) => {
            if (id.includes('node_modules')) {
              return 'vendor';
            }
          },
          assetFileNames: "assets/[name].[hash].[ext]",
          chunkFileNames: "assets/[name].[hash].js",
          entryFileNames: "assets/[name].[hash].js",
          format: "es",
        }
      },
      modulePreload: true,
    },
    base: assetBase,
  }
})

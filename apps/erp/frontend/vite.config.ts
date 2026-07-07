import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  plugins: [react()],
  define: {
    global: 'globalThis',
  },
  assetsInclude: ['**/*.wasm'],
  build: {
    // Não gerar source maps em produção — o código compilado fica ilegível sem eles
    sourcemap: false,
    // Minificação máxima
    minify: 'esbuild',
  },
  server: {
    port: 5173,
    proxy: {
      // Espelha Nginx: /api/auth → backend /auth (sem prefixo global no Nest)
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      '/uploads': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/uploads-protegido': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  resolve: {
    alias: {
      canvg: resolve(__dirname, 'src/utils/canvg-stub.ts'),
      buffer: 'buffer',
    },
  },
  optimizeDeps: {
    include: [
      '@js-preview/excel',
      '@react-pdf/renderer',
      'buffer',
      'pptx-preview',
      'docx-preview',
      'three',
      'occt-import-js',
      'react-markdown',
      'remark-gfm',
      'pdfjs-dist',
    ],
    exclude: ['canvg'],
    esbuildOptions: {
      define: {
        global: 'globalThis',
      },
    },
  },
});

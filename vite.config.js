import { defineConfig } from 'vite';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(__filename, '..');

export default defineConfig({
  base: '/static-menu-qr/',
  root: __dirname,
  build: {
    outDir: resolve(__dirname, 'dist'),
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        menu: resolve(__dirname, 'menu.html'),
        v2: resolve(__dirname, 'v2.html'),
      },
    },
  },
  server: {
    open: '/static-menu-qr/index.html',
  },
});

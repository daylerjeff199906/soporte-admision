import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  vite: {
    plugins: [tailwindcss()],
    // En desarrollo, /api se reenvía a la API local; en Docker lo hace nginx.
    server: { proxy: { '/api': { target: 'http://127.0.0.1:4351', changeOrigin: true } } },
  },
});

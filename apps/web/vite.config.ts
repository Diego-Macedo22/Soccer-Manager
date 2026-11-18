import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

export default defineConfig({
  plugins: [preact()],
  worker: { format: 'es' },
  server: { port: 5173 },
  build: { target: 'es2023', sourcemap: true },
});

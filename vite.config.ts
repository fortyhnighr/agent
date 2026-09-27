import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: 5173,
    // The Arena live preview is proxied through a generated *.e2b.app host.
    allowedHosts: true,
  },
  preview: { host: '0.0.0.0', port: 4173, allowedHosts: true },
  build: { target: 'es2022', sourcemap: true },
});

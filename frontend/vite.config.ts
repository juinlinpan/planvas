import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  clearScreen: false,
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    watch: {
      ignored: (p: string) => {
        const normalized = p.replace(/\\/g, '/');
        return (
          normalized.includes('/.pv_project/') ||
          normalized.includes('/.planvas/') ||
          normalized.endsWith('.semantic.xml') ||
          normalized.endsWith('.presentation.xml') ||
          normalized.endsWith('.md')
        );
      },
    },
  },
});

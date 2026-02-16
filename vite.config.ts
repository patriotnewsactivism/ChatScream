import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
      proxy: {
        '/api': {
          target: env.VITE_API_PROXY_TARGET || 'http://localhost:8787',
          changeOrigin: true,
        },
      },
    },
    plugins: [react()],
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return;
            if (id.includes('react-dom') || id.includes('react-router') || id.includes('react'))
              return 'react';
            if (id.includes('lucide-react')) return 'icons';
            return 'vendor';
          },
        },
      },
    },
    define: {
      // Legacy Gemini API support
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      // Claude API
      'import.meta.env.VITE_CLAUDE_API_KEY': JSON.stringify(env.VITE_CLAUDE_API_KEY || ''),
      // Backend API
      'import.meta.env.VITE_API_BASE_URL': JSON.stringify(env.VITE_API_BASE_URL || ''),
      'import.meta.env.VITE_FUNCTIONS_BASE_URL': JSON.stringify(env.VITE_FUNCTIONS_BASE_URL || ''),
      // Stripe
      'import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY': JSON.stringify(
        env.VITE_STRIPE_PUBLISHABLE_KEY || '',
      ),
      // Canonical plan naming: free, starter, creator, pro
      'import.meta.env.VITE_STRIPE_STARTER_PRICE_ID': JSON.stringify(
        env.VITE_STRIPE_STARTER_PRICE_ID || '',
      ),
      'import.meta.env.VITE_STRIPE_CREATOR_PRICE_ID': JSON.stringify(
        env.VITE_STRIPE_CREATOR_PRICE_ID || '',
      ),
      'import.meta.env.VITE_STRIPE_PRO_PRICE_ID': JSON.stringify(
        env.VITE_STRIPE_PRO_PRICE_ID || '',
      ),
      // Back-compat (older env names)
      'import.meta.env.VITE_STRIPE_EXPERT_PRICE_ID': JSON.stringify(
        env.VITE_STRIPE_EXPERT_PRICE_ID || '',
      ),
      'import.meta.env.VITE_STRIPE_ENTERPRISE_PRICE_ID': JSON.stringify(
        env.VITE_STRIPE_ENTERPRISE_PRICE_ID || '',
      ),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: './vitest.setup.ts',
      exclude: ['tests/e2e/**', '**/node_modules/**', 'payments/node_modules/**', 'dist/**'],
    },
  };
});

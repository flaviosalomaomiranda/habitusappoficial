import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    const geminiApiKey = env.GEMINI_API_KEY || process.env.GEMINI_API_KEY || '';
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      build: {
        rollupOptions: {
          output: {
            manualChunks(id) {
              if (!id.includes('node_modules')) return;
              if (
                id.includes('node_modules/firebase/firestore') ||
                id.includes('node_modules/@firebase/firestore')
              ) {
                return 'firebase-firestore';
              }
              if (
                id.includes('node_modules/firebase/auth') ||
                id.includes('node_modules/@firebase/auth')
              ) {
                return 'firebase-auth';
              }
              if (
                id.includes('node_modules/firebase/storage') ||
                id.includes('node_modules/@firebase/storage')
              ) {
                return 'firebase-storage';
              }
              if (id.includes('node_modules/firebase') || id.includes('node_modules/@firebase')) {
                return 'firebase-core';
              }
              if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) {
                return 'react-vendor';
              }
              return 'vendor';
            },
          },
        },
      },
      define: {
        'process.env.API_KEY': JSON.stringify(geminiApiKey),
        'process.env.GEMINI_API_KEY': JSON.stringify(geminiApiKey)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});

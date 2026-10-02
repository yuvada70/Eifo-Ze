import { fileURLToPath, URL } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * תצורת Vite.
 *
 * • החבילה המשותפת נטענת מהמקור (ולא מ-dist) כדי שעריכה בה תעדכן
 *   מיד גם את הלקוח בזמן פיתוח.
 * • בפיתוח, בקשות ה-WebSocket מנותבות לשרת המשחק, כך שהלקוח
 *   והשרת מתנהגים כאילו הם באותו מקור — בדיוק כמו בייצור.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@eifo/shared': fileURLToPath(new URL('../shared/src/index.ts', import.meta.url)),
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    // מאפשר בדיקה ממכשירים אחרים ברשת המקומית (סריקת QR מהטלפון).
    host: true,
    proxy: {
      '/socket.io': { target: 'http://localhost:3000', ws: true },
      '/healthz': { target: 'http://localhost:3000' },
    },
  },
  build: {
    target: 'es2020',
    sourcemap: true,
    rollupOptions: {
      output: {
        // הפרדת ספריות הצד השלישי משפרת מטמון בין גרסאות.
        manualChunks: {
          react: ['react', 'react-dom'],
          motion: ['framer-motion'],
          realtime: ['socket.io-client'],
        },
      },
    },
  },
});

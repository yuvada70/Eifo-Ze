/**
 * שכבת ה-HTTP: הגשת אפליקציית הלקוח, בדיקות תקינות ומדדים.
 *
 * השרת מגיש גם את הלקוח וגם את ה-WebSocket מאותו מקור. זו החלטה
 * מכוונת: אין בעיות CORS, קישור ההצטרפות תמיד תקף, והפריסה היא
 * שירות אחד במקום שניים.
 */

import { timingSafeEqual } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';

import compression from 'compression';
import express, { type Express, type Request, type Response } from 'express';
import helmet from 'helmet';
import { countPools } from '@eifo/shared';

import type { ServerConfig } from '../config.js';
import type { PlacesStore } from '../content/placesStore.js';
import { logger } from '../logger.js';

/** מידע שהשרת חושף לצורך ניטור. */
export interface HealthProvider {
  activeRooms(): number;
}

/** בונה את אפליקציית ה-Express. */
export function createApp(config: ServerConfig, health: HealthProvider, places: PlacesStore): Express {
  const app = express();

  if (config.trustProxy) app.set('trust proxy', true);
  app.disable('x-powered-by');

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          // הלקוח נבנה עם Vite ומזריק סגנונות בזמן ריצה (אנימציות).
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
          // תמונות המקומות מ-Wikimedia Commons (Special:FilePath מפנה
          // ל-upload.wikimedia.org) ואריחי המפה מ-OpenStreetMap.
          imgSrc: [
            "'self'",
            'data:',
            'blob:',
            'https://commons.wikimedia.org',
            'https://upload.wikimedia.org',
            'https://tile.openstreetmap.org',
          ],
          scriptSrc: ["'self'"],
          // WebSocket לאותו מקור.
          // מסך הניהול שולף קרדיט תמונה מה-API הציבורי של Commons.
          connectSrc: ["'self'", 'ws:', 'wss:', 'https://commons.wikimedia.org'],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
        },
      },
      // נדרש כדי לאפשר הורדת קובץ התוצאות מהדפדפן.
      crossOriginResourcePolicy: { policy: 'same-origin' },
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(compression());

  /** בדיקת תקינות לשירותי תשתית (load balancer, Kubernetes). */
  app.get('/healthz', (_request: Request, response: Response) => {
    response.json({
      status: 'ok',
      uptimeSeconds: Math.round(process.uptime()),
      activeRooms: health.activeRooms(),
      version: process.env['npm_package_version'] ?? '1.0.0',
    });
  });

  /** כמות המקומות לכל צירוף קטגוריה × דרגה — למסך יצירת החדר. */
  const poolCounts = countPools(places.all());
  app.get('/api/pools', (_request: Request, response: Response) => {
    response.json(poolCounts);
  });

  app.use('/api/admin', express.json({ limit: '16kb' }));
  registerAdminRoutes(app, config, places);

  if (config.serveClient) {
    const clientDir = path.resolve(process.cwd(), config.clientDir);

    if (!existsSync(clientDir)) {
      logger.warn('client.dist_missing', {
        clientDir,
        hint: 'הריצו npm run build כדי לבנות את הלקוח, או הגדירו SERVE_CLIENT=false בפיתוח',
      });
    } else {
      // קבצי הנכסים מקבלים שם ייחודי (hash) מ-Vite ולכן ניתן לשמור אותם לנצח.
      app.use(
        '/assets',
        express.static(path.join(clientDir, 'assets'), {
          immutable: true,
          maxAge: '1y',
        }),
      );
      app.use(express.static(clientDir, { index: false, maxAge: '1h' }));

      // כל נתיב אחר מוגש כ-SPA: /host, /join/ABCDE וכן הלאה.
      app.get('*', (_request: Request, response: Response) => {
        response.sendFile(path.join(clientDir, 'index.html'));
      });
    }
  }

  return app;
}

/** ניסיונות כניסה למסך הניהול לפי כתובת IP — הגנה בסיסית מפני ניחוש. */
const loginAttempts = new Map<string, { count: number; windowStart: number }>();
const LOGIN_WINDOW_MS = 60_000;
const LOGIN_MAX_ATTEMPTS = 10;

function passwordMatches(expected: string, given: unknown): boolean {
  if (typeof given !== 'string') return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * ממשק מסך הניהול.
 *
 * מסך הניהול עצמו הוא נתיב בלקוח (/admin); השרת רק מאמת סיסמה ומגיש
 * את קובץ המאגר המלא, כדי שאפשר יהיה לערוך אותו ולייצא גרסה מעודכנת.
 * שום דבר לא נכתב לדיסק — ב-Render Free ה-filesystem אינו קבוע,
 * ומקור האמת הוא data/places.json ב-repo.
 */
function registerAdminRoutes(app: Express, config: ServerConfig, places: PlacesStore): void {
  const authorize = (request: Request, response: Response): boolean => {
    if (!config.adminPassword) {
      response.status(503).json({ error: 'מסך הניהול כבוי — הגדירו את משתנה הסביבה ADMIN_PASSWORD' });
      return false;
    }

    const ip = request.ip ?? 'unknown';
    const now = Date.now();
    const entry = loginAttempts.get(ip);
    if (entry && now - entry.windowStart < LOGIN_WINDOW_MS && entry.count >= LOGIN_MAX_ATTEMPTS) {
      response.status(429).json({ error: 'יותר מדי ניסיונות — נסו שוב בעוד דקה' });
      return false;
    }

    if (!passwordMatches(config.adminPassword, request.get('x-admin-password'))) {
      if (!entry || now - entry.windowStart >= LOGIN_WINDOW_MS) loginAttempts.set(ip, { count: 1, windowStart: now });
      else entry.count += 1;
      response.status(401).json({ error: 'סיסמה שגויה' });
      return false;
    }
    return true;
  };

  app.post('/api/admin/login', (request: Request, response: Response) => {
    if (!authorize(request, response)) return;
    response.json({ ok: true });
  });

  app.get('/api/admin/places', (request: Request, response: Response) => {
    if (!authorize(request, response)) return;
    response.set('Cache-Control', 'no-store');
    response.json(places.raw());
  });

  app.all('/api/*', (_request: Request, response: Response) => {
    response.status(404).json({ error: 'לא נמצא' });
  });
}

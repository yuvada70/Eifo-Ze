/**
 * בדיקות התצורה.
 *
 * הדגש הוא על כתובת הבסיס הציבורית: זו ההגדרה שקובעת לאן מוביל
 * קוד ה-QR, ולכן טעות בה שוברת את המשחק בשקט.
 */

import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { loadConfig } from './config.js';

/** משתני הסביבה שהבדיקות משנות; מאופסים אחרי כל בדיקה. */
const MANAGED_KEYS = [
  'PUBLIC_BASE_URL',
  'RENDER_EXTERNAL_URL',
  'RAILWAY_PUBLIC_DOMAIN',
  'PORT',
  'ROOM_TTL_MINUTES',
  'CORS_ORIGINS',
  'SERVE_CLIENT',
] as const;

const original = new Map(MANAGED_KEYS.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of MANAGED_KEYS) {
    const value = original.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('כתובת הבסיס הציבורית', () => {
  it('נגזרת מהבקשה כשלא הוגדר דבר', () => {
    delete process.env['PUBLIC_BASE_URL'];
    delete process.env['RENDER_EXTERNAL_URL'];
    delete process.env['RAILWAY_PUBLIC_DOMAIN'];
    assert.equal(loadConfig().publicBaseUrl, null);
  });

  it('נבנית אוטומטית מהכתובת של Render', () => {
    delete process.env['PUBLIC_BASE_URL'];
    delete process.env['RAILWAY_PUBLIC_DOMAIN'];
    process.env['RENDER_EXTERNAL_URL'] = 'https://eifo-ze.onrender.com';

    assert.equal(loadConfig().publicBaseUrl, 'https://eifo-ze.onrender.com');
  });

  it('גוזרת קו נטוי עוקב מהכתובת של Render', () => {
    delete process.env['PUBLIC_BASE_URL'];
    delete process.env['RAILWAY_PUBLIC_DOMAIN'];
    process.env['RENDER_EXTERNAL_URL'] = 'https://eifo-ze.onrender.com//';

    assert.equal(loadConfig().publicBaseUrl, 'https://eifo-ze.onrender.com');
  });

  it('נבנית אוטומטית מהדומיין של Railway', () => {
    delete process.env['PUBLIC_BASE_URL'];
    delete process.env['RENDER_EXTERNAL_URL'];
    process.env['RAILWAY_PUBLIC_DOMAIN'] = 'eifo-ze-production.up.railway.app';

    assert.equal(loadConfig().publicBaseUrl, 'https://eifo-ze-production.up.railway.app');
  });

  it('מתעלמת מסכימה כפולה בדומיין של Railway', () => {
    delete process.env['PUBLIC_BASE_URL'];
    delete process.env['RENDER_EXTERNAL_URL'];
    process.env['RAILWAY_PUBLIC_DOMAIN'] = 'https://eifo.up.railway.app';

    assert.equal(loadConfig().publicBaseUrl, 'https://eifo.up.railway.app');
  });

  it('Render גובר על Railway כששניהם מוגדרים (מצב שלא אמור לקרות בפועל)', () => {
    delete process.env['PUBLIC_BASE_URL'];
    process.env['RENDER_EXTERNAL_URL'] = 'https://eifo-ze.onrender.com';
    process.env['RAILWAY_PUBLIC_DOMAIN'] = 'eifo.up.railway.app';

    assert.equal(loadConfig().publicBaseUrl, 'https://eifo-ze.onrender.com');
  });

  it('הגדרה מפורשת גוברת על Render ועל Railway', () => {
    process.env['PUBLIC_BASE_URL'] = 'https://mapat.example.com';
    process.env['RENDER_EXTERNAL_URL'] = 'https://eifo-ze.onrender.com';
    process.env['RAILWAY_PUBLIC_DOMAIN'] = 'eifo.up.railway.app';

    assert.equal(loadConfig().publicBaseUrl, 'https://mapat.example.com');
  });

  it('גוזרת קו נטוי עוקב מהגדרה מפורשת', () => {
    process.env['PUBLIC_BASE_URL'] = 'https://mapat.example.com//';
    delete process.env['RENDER_EXTERNAL_URL'];
    delete process.env['RAILWAY_PUBLIC_DOMAIN'];

    assert.equal(loadConfig().publicBaseUrl, 'https://mapat.example.com');
  });

  it('נכשלת מיד על כתובת לא חוקית, במקום לפרוס משחק שבור', () => {
    process.env['PUBLIC_BASE_URL'] = 'לא-כתובת';
    assert.throws(() => loadConfig(), /PUBLIC_BASE_URL/);
  });
});

describe('ערכי תצורה', () => {
  it('ברירות מחדל סבירות', () => {
    delete process.env['PORT'];
    delete process.env['ROOM_TTL_MINUTES'];

    const config = loadConfig();
    assert.equal(config.port, 3000);
    assert.equal(config.host, '0.0.0.0');
    assert.equal(config.roomTtlMs, 240 * 60_000);
    assert.equal(config.corsOrigins, '*');
  });

  it('קורא פורט ממשתנה הסביבה (Railway מזריק אותו)', () => {
    process.env['PORT'] = '8080';
    assert.equal(loadConfig().port, 8080);
  });

  it('דוחה פורט שאינו מספר', () => {
    process.env['PORT'] = 'שמונים';
    assert.throws(() => loadConfig(), /PORT/);
  });

  it('דוחה ערך מחוץ לטווח', () => {
    process.env['ROOM_TTL_MINUTES'] = '99999';
    assert.throws(() => loadConfig(), /ROOM_TTL_MINUTES/);
  });

  it('מפצל רשימת מקורות CORS', () => {
    process.env['CORS_ORIGINS'] = 'https://a.com, https://b.com';
    assert.deepEqual(loadConfig().corsOrigins, ['https://a.com', 'https://b.com']);
  });
});

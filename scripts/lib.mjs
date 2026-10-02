/**
 * עזרים משותפים לסקריפטים של מאגר המקומות.
 * הסקריפטים משתמשים בקוד המשותף הבנוי (shared/dist), כך שהאימות כאן
 * זהה בדיוק לאימות בשרת ובמסך הניהול.
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PLACES_FILE = path.join(ROOT, 'data', 'places.json');

/** מדיניות Wikimedia מחייבת User-Agent מזהה. */
export const USER_AGENT = 'EifoZeBot/1.0 (https://github.com/yuvada70/Eifo-Ze; content checks for a free trivia game)';

export async function loadShared() {
  const entry = path.join(ROOT, 'shared', 'dist', 'index.js');
  if (!existsSync(entry)) {
    throw new Error('shared/dist חסר — הריצו קודם: npm run build --workspace @eifo/shared');
  }
  return import(entry);
}

export function readPlaces(file = PLACES_FILE) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** fetch עם ניסיונות חוזרים (429/5xx) והמתנה הולכת וגדלה. */
export async function fetchWithRetry(url, init = {}, attempts = 5) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...init,
        headers: { 'User-Agent': USER_AGENT, 'Api-User-Agent': USER_AGENT, ...(init.headers ?? {}) },
      });
      if (response.status === 429 || response.status >= 500) {
        lastError = new Error(`HTTP ${response.status}`);
        const retryAfter = Number(response.headers.get('retry-after')) || 0;
        await sleep(Math.max(retryAfter * 1000, 1000 * 2 ** attempt));
        continue;
      }
      return response;
    } catch (error) {
      lastError = error;
      await sleep(1000 * 2 ** attempt);
    }
  }
  throw lastError;
}

export async function fetchJson(url) {
  const response = await fetchWithRetry(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return response.json();
}

/** מריץ משימות במקביל מוגבל. */
export async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}

export function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** HTML של extmetadata → טקסט נקי. */
export function stripHtml(html = '') {
  return String(html)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

/** שליפת imageinfo (רישיון, יוצר, גודל) מ-Commons, במנות של 50. */
export async function commonsImageInfo(files) {
  const result = new Map();
  for (const group of chunk([...new Set(files)], 50)) {
    const titles = group.map((file) => `File:${file}`).join('|');
    const url =
      'https://commons.wikimedia.org/w/api.php?action=query&format=json&formatversion=2&prop=imageinfo' +
      '&iiprop=extmetadata|size|mime|url&iiextmetadatafilter=LicenseShortName|Artist|Credit|UsageTerms|Restrictions' +
      `&titles=${encodeURIComponent(titles)}`;
    const data = await fetchJson(url);
    const normalized = new Map((data.query?.normalized ?? []).map((n) => [n.to, n.from]));
    for (const page of data.query?.pages ?? []) {
      const original = (normalized.get(page.title) ?? page.title).replace(/^File:/, '');
      const info = page.imageinfo?.[0];
      result.set(original, {
        exists: !page.missing && Boolean(info),
        title: page.title,
        width: info?.width ?? 0,
        height: info?.height ?? 0,
        mime: info?.mime ?? '',
        license: stripHtml(info?.extmetadata?.LicenseShortName?.value),
        artist: stripHtml(info?.extmetadata?.Artist?.value),
        credit: stripHtml(info?.extmetadata?.Credit?.value),
        restrictions: stripHtml(info?.extmetadata?.Restrictions?.value),
      });
    }
    await sleep(200);
  }
  return result;
}

/** מרחק בק"מ (Haversine) — עותק קטן כדי שהסקריפטים לא יהיו תלויים בבנייה. */
export function haversine(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371.0088 * Math.asin(Math.min(1, Math.sqrt(h)));
}

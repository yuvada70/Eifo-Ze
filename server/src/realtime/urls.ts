/**
 * בניית הקישור הציבורי להצטרפות.
 *
 * הקישור חייב להיות נכון גם בפיתוח מקומי (localhost), גם ברשת מקומית
 * (כשמארחים משחק בכיתה מהמחשב המקומי), וגם בפריסה מאחורי פרוקסי.
 * לכן: אם הוגדרה כתובת ציבורית מפורשת — היא מנצחת; אחרת נגזרת מהכותרות.
 */

import type { IncomingHttpHeaders } from 'node:http';

/** מחלץ את הערך הראשון מכותרת שעשויה להופיע כמערך. */
function firstHeaderValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  if (typeof value === 'string') return value.split(',')[0]?.trim() ?? null;
  return null;
}

/**
 * קובע את כתובת הבסיס הציבורית של השרת.
 *
 * @param configuredBaseUrl כתובת מפורשת מהתצורה, אם קיימת.
 * @param headers כותרות הבקשה / ה-handshake.
 * @param secureConnection האם החיבור הגיע ב-TLS.
 */
export function resolvePublicBaseUrl(
  configuredBaseUrl: string | null,
  headers: IncomingHttpHeaders,
  secureConnection = false,
): string {
  if (configuredBaseUrl) return configuredBaseUrl;

  const forwardedHost = firstHeaderValue(headers['x-forwarded-host']);
  const host = forwardedHost ?? firstHeaderValue(headers.host) ?? 'localhost';
  const forwardedProto = firstHeaderValue(headers['x-forwarded-proto']);
  const protocol = forwardedProto ?? (secureConnection ? 'https' : 'http');

  return `${protocol}://${host}`;
}

/** בונה את קישור ההצטרפות המלא למשחק. */
export function buildJoinUrl(baseUrl: string, code: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/join/${code}`;
}

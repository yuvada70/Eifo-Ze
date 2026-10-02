/**
 * טיפוסים ופעולות בסיסיות על קואורדינטות גיאוגרפיות.
 *
 * כל המערכת עובדת ב-WGS84 (אותה מערכת ייחוס של GPS ושל Google Maps),
 * כך שניתן להזין קואורדינטות ישירות ממקורות חיצוניים ללא המרה.
 */

/** נקודה גיאוגרפית: קו רוחב (lat) וקו אורך (lng) במעלות עשרוניות. */
export interface LatLng {
  /** קו רוחב, בין 90- ל-90. */
  readonly lat: number;
  /** קו אורך, בין 180- ל-180. */
  readonly lng: number;
}

/** תיבה תוחמת גיאוגרפית. */
export interface GeoBounds {
  readonly minLat: number;
  readonly minLng: number;
  readonly maxLat: number;
  readonly maxLng: number;
}

/** רדיוס כדור הארץ הממוצע בקילומטרים (IUGG mean radius). */
export const EARTH_RADIUS_KM = 6371.0088;

const DEG_TO_RAD = Math.PI / 180;

/**
 * מרחק גיאודזי בין שתי נקודות בקילומטרים, בנוסחת Haversine.
 *
 * הדיוק בסדר גודל של מטרים בטווחים הרלוונטיים למשחק (עד ~500 ק"מ),
 * ולכן מספיק בהחלט לחישוב ניקוד.
 */
export function haversineDistanceKm(a: LatLng, b: LatLng): number {
  const dLat = (b.lat - a.lat) * DEG_TO_RAD;
  const dLng = (b.lng - a.lng) * DEG_TO_RAD;
  const lat1 = a.lat * DEG_TO_RAD;
  const lat2 = b.lat * DEG_TO_RAD;

  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** אזימוט (מעלות, 0 = צפון) מנקודה אחת לשנייה — משמש לחיצי הכיוון במסך הסיכום. */
export function bearingDegrees(from: LatLng, to: LatLng): number {
  const lat1 = from.lat * DEG_TO_RAD;
  const lat2 = to.lat * DEG_TO_RAD;
  const dLng = (to.lng - from.lng) * DEG_TO_RAD;

  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);

  return (Math.atan2(y, x) / DEG_TO_RAD + 360) % 360;
}

/** בדיקה שהערך הוא נקודה גיאוגרפית תקינה — שכבת הגנה מפני קלט זדוני. */
export function isValidLatLng(value: unknown): value is LatLng {
  if (typeof value !== 'object' || value === null) return false;
  const { lat, lng } = value as Record<string, unknown>;
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

/** האם הנקודה נמצאת בתוך התיבה התוחמת (כולל הגבולות). */
export function isWithinBounds(point: LatLng, bounds: GeoBounds): boolean {
  return (
    point.lat >= bounds.minLat &&
    point.lat <= bounds.maxLat &&
    point.lng >= bounds.minLng &&
    point.lng <= bounds.maxLng
  );
}

/** הצמדת נקודה לתוך תיבה תוחמת. */
export function clampToBounds(point: LatLng, bounds: GeoBounds): LatLng {
  return {
    lat: Math.min(bounds.maxLat, Math.max(bounds.minLat, point.lat)),
    lng: Math.min(bounds.maxLng, Math.max(bounds.minLng, point.lng)),
  };
}

/** עיגול קואורדינטה ל-5 ספרות אחרי הנקודה (~1 מטר) — מקטין תעבורה ורעש. */
export function roundLatLng(point: LatLng): LatLng {
  return {
    lat: Math.round(point.lat * 1e5) / 1e5,
    lng: Math.round(point.lng * 1e5) / 1e5,
  };
}

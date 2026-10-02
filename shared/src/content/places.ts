/**
 * מאגר המקומות — טיפוסים, אימות ובחירה.
 *
 * מקור האמת הוא הקובץ data/places.json ב-repo. השרת קורא אותו בעלייה,
 * מסך הניהול עורך עותק שלו ומייצא קובץ מעודכן, וסקריפט הבדיקה עובר
 * עליו ומוודא שכל תמונה נטענת. שלושתם משתמשים באותו אימות שמוגדר כאן,
 * כך שקובץ שעבר אימות במסך הניהול תמיד ייטען גם בשרת.
 */

import { isValidLatLng, type LatLng } from '../geo/coordinates.js';

/** אזור גיאוגרפי — הקטגוריה של מקום במאגר. */
export type Region = 'israel' | 'europe' | 'asia' | 'americas' | 'africa-oceania';

/** הקטגוריה שהמארח בוחר: אזור ספציפי, או "מעורב" מכל האזורים. */
export type ContentCategory = Region | 'mixed';

/** דרגת קושי — קובעת אך ורק אילו מקומות נשלפים, לא את הניקוד. */
export type Difficulty = 'easy' | 'medium' | 'pro';

export const REGIONS: readonly Region[] = ['israel', 'europe', 'asia', 'americas', 'africa-oceania'];
export const CONTENT_CATEGORIES: readonly ContentCategory[] = [...REGIONS, 'mixed'];
export const DIFFICULTIES: readonly Difficulty[] = ['easy', 'medium', 'pro'];

export const CATEGORY_LABELS: Readonly<Record<ContentCategory, string>> = {
  israel: 'ישראל',
  europe: 'אירופה',
  asia: 'אסיה',
  americas: 'אמריקה',
  'africa-oceania': 'אפריקה ואוקיאניה',
  mixed: 'מעורב',
};

export const CATEGORY_ICONS: Readonly<Record<ContentCategory, string>> = {
  israel: '🇮🇱',
  europe: '🏰',
  asia: '🏯',
  americas: '🗽',
  'africa-oceania': '🦒',
  mixed: '🌍',
};

export const DIFFICULTY_LABELS: Readonly<Record<Difficulty, string>> = {
  easy: 'קל',
  medium: 'בינוני',
  pro: 'מקצוענים',
};

export const DIFFICULTY_DESCRIPTIONS: Readonly<Record<Difficulty, string>> = {
  easy: 'מקומות מפורסמים מאוד',
  medium: 'מוכרים, אבל פחות מובנים מאליהם',
  pro: 'מאתגרים, או מזווית לא שגרתית',
};

/** רישיונות חופשיים שמותר להשתמש בהם. */
export const ALLOWED_LICENSE_PATTERN = /^(public domain|pd\b|pd-|cc0|cc[ -]by(-sa)?[ -]?\d(\.\d)?)/i;

/** קרדיט לתמונה מ-Wikimedia Commons. */
export interface ImageCredit {
  /** שם הקובץ ב-Commons, ללא הקידומת "File:". */
  readonly file: string;
  /** שם הצלם/היוצר. */
  readonly author: string;
  /** שם הרישיון המקוצר, למשל "CC BY-SA 4.0" או "Public domain". */
  readonly license: string;
}

/** מקום במאגר. */
export interface Place {
  /** מזהה יציב וייחודי (kebab-case). */
  readonly id: string;
  /** שם המקום בעברית. */
  readonly name: string;
  readonly city: string;
  readonly country: string;
  readonly category: Region;
  readonly difficulty: Difficulty;
  /** קואורדינטות WGS84. */
  readonly lat: number;
  readonly lng: number;
  readonly image: ImageCredit;
  /** שורת מידע קצרה ומעניינת. */
  readonly fact: string;
  /** הערת אימות — קיימת רק כשיש ספק שכדאי לבדוק ידנית. */
  readonly note?: string;
}

/** מבנה הקובץ data/places.json. */
export interface PlacesFile {
  readonly version: 1;
  readonly places: readonly Place[];
}

/** הנתונים שהלקוח מקבל כדי להציג תמונה בסיבוב — בלי שום רמז לתשובה. */
export interface PlaceImage {
  /** כתובת התמונה בגודל המבוקש. */
  readonly url: string;
  /** קישור לדף הקובץ ב-Commons. */
  readonly pageUrl: string;
  readonly author: string;
  readonly license: string;
}

/** רוחב ברירת המחדל לתמונת סיבוב. */
export const ROUND_IMAGE_WIDTH = 1280;

/** מנרמל שם קובץ Commons: מסיר "File:"/"קובץ:" ומחליף קווים תחתונים ברווחים. */
export function normalizeCommonsFileName(raw: string): string {
  let name = raw.trim();
  try {
    if (/^https?:\/\//i.test(name)) {
      const url = new URL(name);
      const fromPath = decodeURIComponent(url.pathname.split('/').pop() ?? '');
      name = fromPath;
    }
  } catch {
    /* לא כתובת — ממשיכים עם המחרוזת כפי שהיא */
  }
  return name.replace(/^(file|image|קובץ|תמונה):/i, '').replace(/_/g, ' ').trim();
}

function encodeFileTitle(file: string): string {
  return encodeURIComponent(normalizeCommonsFileName(file).replace(/ /g, '_'));
}

/** כתובת התמונה דרך Special:FilePath, עם רוחב מבוקש. */
export function commonsImageUrl(file: string, width: number = ROUND_IMAGE_WIDTH): string {
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeFileTitle(file)}?width=${width}`;
}

/** קישור לדף הקובץ ב-Commons (לקרדיט). */
export function commonsPageUrl(file: string): string {
  return `https://commons.wikimedia.org/wiki/File:${encodeFileTitle(file)}`;
}

/** בונה את נתוני התמונה לתצוגה. */
export function placeImage(place: Place, width: number = ROUND_IMAGE_WIDTH): PlaceImage {
  return {
    url: commonsImageUrl(place.image.file, width),
    pageUrl: commonsPageUrl(place.image.file),
    author: place.image.author,
    license: place.image.license,
  };
}

export function placePosition(place: Place): LatLng {
  return { lat: place.lat, lng: place.lng };
}

/** האם הרישיון חופשי ומותר לשימוש. */
export function isAllowedLicense(license: string): boolean {
  return ALLOWED_LICENSE_PATTERN.test(license.trim());
}

const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function nonEmptyString(value: unknown, max = 300): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max;
}

/**
 * מאמת מקום בודד ומחזיר רשימת בעיות בעברית (ריקה = תקין).
 * משמש את השרת, את מסך הניהול ואת סקריפט הבדיקה.
 */
export function validatePlace(value: unknown): string[] {
  const problems: string[] = [];
  if (typeof value !== 'object' || value === null) return ['הרשומה אינה אובייקט'];
  const place = value as Record<string, unknown>;

  if (typeof place['id'] !== 'string' || !ID_PATTERN.test(place['id'])) problems.push('מזהה לא תקין (אותיות לטיניות קטנות, ספרות ומקפים)');
  if (!nonEmptyString(place['name'], 80)) problems.push('חסר שם');
  if (!nonEmptyString(place['city'], 80)) problems.push('חסרה עיר');
  if (!nonEmptyString(place['country'], 80)) problems.push('חסרה מדינה');
  if (typeof place['category'] !== 'string' || !(REGIONS as readonly string[]).includes(place['category'])) problems.push('קטגוריה לא תקינה');
  if (typeof place['difficulty'] !== 'string' || !(DIFFICULTIES as readonly string[]).includes(place['difficulty'])) problems.push('דרגה לא תקינה');
  if (!isValidLatLng({ lat: place['lat'], lng: place['lng'] })) problems.push('קואורדינטות לא תקינות');
  if (!nonEmptyString(place['fact'], 400)) problems.push('חסרה שורת מידע');

  const image = place['image'] as Record<string, unknown> | undefined;
  if (typeof image !== 'object' || image === null) {
    problems.push('חסרים פרטי תמונה');
  } else {
    if (!nonEmptyString(image['file'], 250)) problems.push('חסר שם קובץ ב-Commons');
    else if (!/\.(jpe?g|png|webp|tiff?)$/i.test(image['file'])) problems.push('שם הקובץ צריך להסתיים בסיומת תמונה');
    if (!nonEmptyString(image['author'], 200)) problems.push('חסר שם הצלם');
    if (!nonEmptyString(image['license'], 60)) problems.push('חסר רישיון');
    else if (!isAllowedLicense(image['license'])) problems.push(`רישיון לא מותר: ${image['license']}`);
  }
  if (place['note'] !== undefined && typeof place['note'] !== 'string') problems.push('הערה חייבת להיות טקסט');
  return problems;
}

/** תוצאת אימות של קובץ שלם. */
export interface PlacesValidation {
  readonly ok: boolean;
  readonly places: Place[];
  /** בעיות לפי אינדקס/מזהה. */
  readonly errors: string[];
}

/** מאמת קובץ מאגר שלם (כולל ייחודיות מזהים). */
export function validatePlacesFile(value: unknown): PlacesValidation {
  const errors: string[] = [];
  const raw = Array.isArray(value) ? value : (value as { places?: unknown } | null)?.places;
  if (!Array.isArray(raw)) return { ok: false, places: [], errors: ['הקובץ חייב להכיל מערך places'] };

  const seen = new Set<string>();
  const places: Place[] = [];
  raw.forEach((entry, index) => {
    const problems = validatePlace(entry);
    const id = (entry as { id?: unknown })?.id;
    const label = typeof id === 'string' ? id : `#${index + 1}`;
    if (typeof id === 'string') {
      if (seen.has(id)) problems.push('מזהה כפול');
      seen.add(id);
    }
    if (problems.length > 0) errors.push(`${label}: ${problems.join(', ')}`);
    else places.push(entry as Place);
  });

  return { ok: errors.length === 0, places, errors };
}

/** מסנן את המאגר לפי קטגוריה ודרגה. */
export function selectPlacePool(
  places: readonly Place[],
  category: ContentCategory,
  difficulty: Difficulty,
): Place[] {
  return places.filter(
    (place) => place.difficulty === difficulty && (category === 'mixed' || place.category === category),
  );
}

/** סיכום כמויות לכל צירוף — לתצוגה במסך היצירה ובמסך הניהול. */
export type PoolCounts = Record<ContentCategory, Record<Difficulty, number>>;

export function countPools(places: readonly Place[]): PoolCounts {
  const counts = {} as PoolCounts;
  for (const category of CONTENT_CATEGORIES) {
    counts[category] = { easy: 0, medium: 0, pro: 0 };
    for (const difficulty of DIFFICULTIES) {
      counts[category][difficulty] = selectPlacePool(places, category, difficulty).length;
    }
  }
  return counts;
}

/** יוצר מזהה kebab-case משם לטיני/עברי + מספר אקראי קצר. */
export function suggestPlaceId(seed: string, existing: ReadonlySet<string>): string {
  const base =
    seed
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'place';
  let candidate = base;
  let counter = 2;
  while (existing.has(candidate)) {
    candidate = `${base}-${counter}`;
    counter += 1;
  }
  return candidate;
}

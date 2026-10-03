/**
 * מאגר המקומות — טיפוסים, אימות ובחירה.
 *
 * מקור האמת הוא הקובץ data/places.json ב-repo. השרת קורא אותו בעלייה,
 * מסך הניהול עורך עותק שלו ומייצא קובץ מעודכן, וסקריפט הבדיקה עובר
 * עליו ומוודא שכל תמונה נטענת. שלושתם משתמשים באותו אימות שמוגדר כאן,
 * כך שקובץ שעבר אימות במסך הניהול תמיד ייטען גם בשרת.
 */

import { haversineDistanceKm, isValidLatLng, type LatLng } from '../geo/coordinates.js';

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
  easy: 'מקומות מפורסמים מאוד, ומסיחים מיבשות אחרות',
  medium: 'מקומות מוכרים פחות, ומסיחים מעורבים',
  pro: 'מקומות מאתגרים, ומסיחים מאותה מדינה או מאותו אזור',
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
  /**
   * הטקסט שמוצג כתשובה באפשרויות הבחירה: "עיר, מדינה", או "אזור, מדינה"
   * במקומות טבע; בישראל — שם היישוב או האזור בלבד.
   */
  readonly answerLabel: string;
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
  if (!nonEmptyString(place['answerLabel'], 60)) problems.push('חסר טקסט תשובה (answerLabel)');
  else if (place['category'] === 'israel' && /ישראל\s*$/.test(String(place['answerLabel'])))
    problems.push('בקטגוריית ישראל טקסט התשובה הוא שם היישוב או האזור בלבד, בלי "ישראל"');
  else if (place['category'] !== 'israel' && !String(place['answerLabel']).includes(',') && place['answerLabel'] !== place['country'])
    problems.push('טקסט התשובה צריך להיות בפורמט "עיר, מדינה"');
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

/* ──────────────────────────── טקסט התשובה ──────────────────────────── */

/** קיצורי שמות מדינות לטקסט התשובה. */
const COUNTRY_SHORT: Readonly<Record<string, string>> = {
  'ארצות הברית': 'ארה״ב',
  'הרפובליקה הדמוקרטית של קונגו': 'קונגו',
};

/** מחליף גרש ASCII בגרש עברי, ומכווץ רווחים. */
function tidyLabel(text: string): string {
  return text.replace(/'/g, '׳').replace(/\s+/g, ' ').trim();
}

/** הצעה לטקסט התשובה לפי העיר והמדינה (משמש את מסך הניהול). */
export function suggestAnswerLabel(city: string, country: string, category: Region): string {
  const cleanCity = tidyLabel(city);
  if (category === 'israel') return cleanCity;
  const cleanCountry = tidyLabel(COUNTRY_SHORT[country.trim()] ?? country);
  if (!cleanCity) return cleanCountry;
  if (!cleanCountry || cleanCity === cleanCountry) return cleanCity;
  return `${cleanCity}, ${cleanCountry}`;
}

/** מפתח השוואה בין טקסטים של תשובות (רווחים, גרשיים וסימני פיסוק). */
export function labelKey(label: string): string {
  return tidyLabel(label).replace(/[״"]/g, '"').replace(/[–-]/g, '-').toLocaleLowerCase('he');
}

/**
 * הטקסט שמוצג לשחקן. מקום בישראל שמופיע במשחק שאינו בקטגוריית ישראל
 * (למשל "מעורב") מקבל ", ישראל" — כדי שכל האפשרויות יהיו באותו פורמט.
 */
export function displayLabel(place: Place, category: ContentCategory): string {
  if (place.category === 'israel' && category !== 'israel') return `${place.answerLabel}, ישראל`;
  return place.answerLabel;
}

/* ──────────────────────────── מסיחים ──────────────────────────── */

/** יבשת — לצורך דרגות הקושי של המסיחים. */
export type Continent = 'europe' | 'asia' | 'americas' | 'africa' | 'oceania';

const OCEANIA_COUNTRIES = new Set(['אוסטרליה', 'ניו זילנד', 'פולינזיה הצרפתית', 'פלאו', 'ונואטו', 'מיקרונזיה']);

export function continentOf(place: Place): Continent {
  if (place.category === 'israel') return 'asia';
  if (place.category === 'africa-oceania') return OCEANIA_COUNTRIES.has(place.country) ? 'oceania' : 'africa';
  return place.category;
}

/** מספר האפשרויות בכל סיבוב. */
export const OPTION_COUNT = 4;

export interface RoundOptions {
  /** ארבעת הטקסטים, בסדר אקראי. */
  readonly options: readonly string[];
  /** האינדקס של התשובה הנכונה. */
  readonly correctIndex: number;
}

type Rng = () => number;

function shuffled<T>(items: readonly T[], rng: Rng): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i]!;
    out[i] = out[j]!;
    out[j] = tmp;
  }
  return out;
}

function distanceKm(a: Place, b: Place): number {
  return haversineDistanceKm({ lat: a.lat, lng: a.lng }, { lat: b.lat, lng: b.lng });
}

/**
 * בונה את ארבע האפשרויות לסיבוב: התשובה הנכונה ושלושה מסיחים מהמאגר.
 *
 * כללים קבועים: מסיח לעולם אינו זהה לתשובה (מקומות שחולקים את אותו
 * טקסט תשובה — למשל מגדל אייפל והלובר — לא משמשים מסיחים זה לזה),
 * ואין שתי אפשרויות זהות באותו סיבוב.
 *
 * לפי דרגה:
 *  • קל — מסיחים מיבשות אחרות; בישראל: מקומות רחוקים.
 *  • בינוני — תערובת: אחד-שניים מאותה יבשת והשאר ממקומות אחרים.
 *  • מקצוענים — מאותה מדינה, ואחר כך מהקרובים ביותר באותה יבשת;
 *    בישראל: היישובים והאזורים הקרובים ביותר.
 */
export function buildRoundOptions(
  answer: Place,
  allPlaces: readonly Place[],
  difficulty: Difficulty,
  category: ContentCategory,
  rng: Rng = Math.random,
): RoundOptions {
  const correct = displayLabel(answer, category);
  const used = new Set([labelKey(correct)]);

  // מועמדים: מקום אחד לכל טקסט תשובה, בלי הטקסט הנכון.
  const israelOnly = category === 'israel';
  const byLabel = new Map<string, { place: Place; label: string }>();
  for (const place of shuffled(allPlaces, rng)) {
    if (israelOnly && place.category !== 'israel') continue;
    const label = displayLabel(place, category);
    const key = labelKey(label);
    if (used.has(key) || byLabel.has(key)) continue;
    byLabel.set(key, { place, label });
  }
  const candidates = [...byLabel.values()];
  const picked: { place: Place; label: string }[] = [];
  const take = (list: readonly { place: Place; label: string }[], count: number) => {
    for (const item of list) {
      if (picked.length >= OPTION_COUNT - 1 || count <= 0) return;
      const key = labelKey(item.label);
      if (used.has(key)) continue;
      used.add(key);
      picked.push(item);
      count -= 1;
    }
  };
  const nearestFirst = (list: readonly { place: Place; label: string }[]) =>
    [...list].sort((a, b) => distanceKm(answer, a.place) - distanceKm(answer, b.place));

  if (israelOnly) {
    if (difficulty === 'easy') take(candidates.filter((c) => distanceKm(answer, c.place) >= 50), 3);
    else if (difficulty === 'pro') take(shuffled(nearestFirst(candidates).slice(0, 6), rng), 3);
    else take(candidates, 3);
  } else {
    const continent = continentOf(answer);
    const sameContinent = candidates.filter((c) => continentOf(c.place) === continent);
    const otherContinent = candidates.filter((c) => continentOf(c.place) !== continent);
    if (difficulty === 'easy') {
      take(otherContinent, 3);
    } else if (difficulty === 'medium') {
      const near = rng() < 0.5 ? 1 : 2;
      take(sameContinent.filter((c) => c.place.country !== answer.country), near);
      take(otherContinent, 3);
    } else {
      take(candidates.filter((c) => c.place.country === answer.country), 3);
      take(shuffled(nearestFirst(sameContinent).slice(0, 8), rng), 3);
    }
  }
  // גיבוי: אם הכללים לא הספיקו (מאגר קטן) — משלימים מכל השאר.
  take(candidates, 3);

  const options = shuffled([correct, ...picked.map((item) => item.label)], rng);
  return { options, correctIndex: options.indexOf(correct) };
}

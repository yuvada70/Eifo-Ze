/**
 * כללי זהות השחקן: אימות שם, ניקוי קלט ויצירת אווטאר.
 *
 * הלוגיקה משותפת לשרת (אכיפה) וללקוח (משוב מיידי בטופס), כך שאין
 * סיכון שהשניים ייפרדו זה מזה.
 */

/** אורך מזערי ומרבי לשם שחקן. */
export const NAME_LIMITS = { min: 2, max: 20 } as const;

/** מספר השחקנים המרבי בחדר. */
export const MAX_PLAYERS_PER_ROOM = 200;

/** תווי בקרה ותווי כיווניות בלתי נראים שעלולים לשבש תצוגת RTL. */
const UNSAFE_CHARACTERS = /[\u0000-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g;

/**
 * מנקה שם שהוזן על ידי משתמש: מסיר תווי בקרה, מכווץ רווחים וגוזר לאורך המרבי.
 * אינו זורק שגיאה — מחזיר תמיד מחרוזת בטוחה להצגה.
 */
export function sanitizePlayerName(rawName: unknown): string {
  if (typeof rawName !== 'string') return '';
  return rawName
    .replace(UNSAFE_CHARACTERS, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NAME_LIMITS.max);
}

/** האם השם עומד בכללים לאחר ניקוי. */
export function isValidPlayerName(name: string): boolean {
  return name.length >= NAME_LIMITS.min && name.length <= NAME_LIMITS.max;
}

/** השוואת שמות לזיהוי כפילויות — מתעלמת מרישיות ומרווחים. */
export function normalizeNameForComparison(name: string): string {
  return name.toLocaleLowerCase('he').replace(/\s+/g, '');
}

/** מאגר האווטארים. נבחר דטרמיניסטית לפי מזהה השחקן. */
const AVATAR_EMOJIS = [
  '🦊', '🐼', '🦁', '🐨', '🐯', '🦉', '🐬', '🦄', '🐙', '🦋',
  '🐢', '🦩', '🐝', '🦔', '🐳', '🦕', '🐧', '🦚', '🐘', '🦓',
] as const;

/** גוונים מפוזרים היטב על גלגל הצבעים כדי שכל שחקן יהיה מובחן. */
const AVATAR_HUES = [12, 32, 48, 96, 140, 168, 190, 212, 236, 262, 286, 312, 336] as const;

/** גיבוב FNV-1a — יציב, מהיר, וזהה בשרת ובלקוח. */
function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** אווטאר דטרמיניסטי — אותו מזהה תמיד מקבל את אותו מראה. */
export function createAvatar(seed: string): { emoji: string; hue: number } {
  const hash = hashString(seed);
  const emoji = AVATAR_EMOJIS[hash % AVATAR_EMOJIS.length] ?? '🎯';
  const hue = AVATAR_HUES[(hash >>> 8) % AVATAR_HUES.length] ?? 210;
  return { emoji, hue };
}

/** האלפבית של קוד המשחק — ללא תווים שקל להתבלבל ביניהם (0/O, 1/I/L). */
export const GAME_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** אורך קוד המשחק. */
export const GAME_CODE_LENGTH = 5;

/** האם המחרוזת נראית כמו קוד משחק תקין. */
export function isValidGameCode(code: string): boolean {
  if (code.length !== GAME_CODE_LENGTH) return false;
  for (const character of code) {
    if (!GAME_CODE_ALPHABET.includes(character)) return false;
  }
  return true;
}

/** מנרמל קוד שהוזן ידנית: אותיות גדולות, ללא רווחים ומקפים. */
export function normalizeGameCode(rawCode: unknown): string {
  if (typeof rawCode !== 'string') return '';
  return rawCode.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, GAME_CODE_LENGTH);
}

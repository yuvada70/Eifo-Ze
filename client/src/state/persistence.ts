/**
 * שמירה מקומית של הפעלות (sessions).
 *
 * מאפשרת לשחקן לרענן את הדף, לנעול את המסך או לאבד רשת לרגע —
 * ולחזור בדיוק לאותו מקום, עם אותו ניקוד. אותו דבר עבור המנהל,
 * שלא יאבד שליטה על משחק פעיל בגלל רענון בטעות.
 *
 * הנתונים נשמרים ב-localStorage בלבד ואינם מכילים מידע אישי מעבר
 * לשם שהמשתמש בחר.
 */

/** הפעלת מנהל שמורה. */
export interface StoredHostSession {
  readonly code: string;
  readonly hostToken: string;
  readonly savedAt: number;
}

/** הפעלת שחקן שמורה. */
export interface StoredPlayerSession {
  readonly code: string;
  readonly playerId: string;
  readonly playerToken: string;
  readonly name: string;
  readonly savedAt: number;
}

const HOST_KEY = 'eifo:host-session';
const PLAYER_KEY = 'eifo:player-session';
const NAME_KEY = 'eifo:last-name';
const PREFS_KEY = 'eifo:preferences';

/** תוקף הפעלה שמורה — מעבר לכך המשחק כבר לא רלוונטי. */
const SESSION_TTL_MS = 6 * 60 * 60 * 1_000;

/** קריאה בטוחה מ-localStorage (עשוי להיות חסום במצב פרטי). */
function readJson<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

/** כתיבה בטוחה ל-localStorage. */
function writeJson(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* אחסון חסום — המשחק ימשיך לעבוד, רק בלי שחזור אוטומטי. */
  }
}

function remove(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* מתעלמים */
  }
}

/** האם ההפעלה עדיין בתוקף. */
function isFresh(savedAt: number | undefined): boolean {
  return typeof savedAt === 'number' && Date.now() - savedAt < SESSION_TTL_MS;
}

export const hostSessionStorage = {
  load(): StoredHostSession | null {
    const session = readJson<StoredHostSession>(HOST_KEY);
    if (!session || !isFresh(session.savedAt) || !session.code || !session.hostToken) {
      return null;
    }
    return session;
  },
  save(session: Omit<StoredHostSession, 'savedAt'>): void {
    writeJson(HOST_KEY, { ...session, savedAt: Date.now() });
  },
  clear(): void {
    remove(HOST_KEY);
  },
};

export const playerSessionStorage = {
  load(): StoredPlayerSession | null {
    const session = readJson<StoredPlayerSession>(PLAYER_KEY);
    if (!session || !isFresh(session.savedAt) || !session.code || !session.playerToken) {
      return null;
    }
    return session;
  },
  save(session: Omit<StoredPlayerSession, 'savedAt'>): void {
    writeJson(PLAYER_KEY, { ...session, savedAt: Date.now() });
  },
  clear(): void {
    remove(PLAYER_KEY);
  },
};

/** השם האחרון שהמשתמש הזין — כדי לא להקליד אותו שוב בכל משחק. */
export const lastNameStorage = {
  load(): string {
    try {
      return window.localStorage.getItem(NAME_KEY) ?? '';
    } catch {
      return '';
    }
  },
  save(name: string): void {
    try {
      window.localStorage.setItem(NAME_KEY, name);
    } catch {
      /* מתעלמים */
    }
  },
};

/** העדפות תצוגה של המשתמש. */
export interface Preferences {
  /** האם אפקטי הקול פעילים. */
  readonly soundEnabled: boolean;
  /** מצב תצוגה: רגיל או מקרן (טקסט מוגדל). */
  readonly display: 'normal' | 'projector';
}

const DEFAULT_PREFERENCES: Preferences = { soundEnabled: true, display: 'normal' };

export const preferencesStorage = {
  load(): Preferences {
    return { ...DEFAULT_PREFERENCES, ...(readJson<Partial<Preferences>>(PREFS_KEY) ?? {}) };
  },
  save(preferences: Preferences): void {
    writeJson(PREFS_KEY, preferences);
  },
};

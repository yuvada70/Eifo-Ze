/**
 * טיפוסי הליבה של המשחק — שפה משותפת לשרת וללקוח.
 *
 * עיקרון מנחה: מה שנשלח ללקוח בזמן שסיבוב פתוח לעולם אינו מכיל את
 * שם המקום, את המיקום האמיתי או ניחושים של שחקנים אחרים — רק את
 * התמונה והקרדיט שלה. כל אלה נחשפים במבנה {@link RoundResult} רק
 * אחרי שהסיבוב נסגר.
 */

import type { ContentCategory, Difficulty, Place, PlaceImage } from '../content/places.js';

/** שלבי מכונת המצבים של המשחק. */
export type GamePhase =
  /** ממתינים לשחקנים; המארח טרם התחיל. */
  | 'lobby'
  /** ספירה לאחור לפני הסיבוב הראשון. */
  | 'countdown'
  /** סיבוב פעיל — הטיימר רץ והשחקנים מנחשים. */
  | 'question'
  /** חשיפת התשובה של הסיבוב שהסתיים. */
  | 'reveal'
  /** המשחק הופסק זמנית על ידי המארח. */
  | 'paused'
  /** המשחק הסתיים — טבלת הניצחון זמינה. */
  | 'finished';

/** אפשרויות מספר הסיבובים. */
export const ROUND_COUNT_OPTIONS = [5, 10, 15, 20] as const;

/** אפשרויות זמן לסיבוב (שניות). */
export const ROUND_DURATION_OPTIONS = [20, 30, 45, 60] as const;

/** הגדרות משחק הנקבעות על ידי המארח. */
export interface GameSettings {
  readonly category: ContentCategory;
  /** דרגת הקושי — קובעת אילו מקומות נשלפים, אינה משפיעה על הניקוד. */
  readonly difficulty: Difficulty;
  /** מספר הסיבובים המבוקש. */
  readonly roundCount: number;
  /** משך סיבוב במילישניות. */
  readonly roundDurationMs: number;
  /** משך מסך החשיפה בין סיבובים במילישניות. */
  readonly revealMs: number;
  /** משך הספירה לאחור לפני הסיבוב הראשון במילישניות. */
  readonly countdownMs: number;
  /** האם להציג לשחקן את מיקומו בדירוג במהלך המשחק. */
  readonly showLiveRank: boolean;
}

export const DEFAULT_SETTINGS: GameSettings = {
  category: 'mixed',
  difficulty: 'easy',
  roundCount: 10,
  roundDurationMs: 30_000,
  revealMs: 15_000,
  countdownMs: 3_000,
  showLiveRank: true,
};

/** גבולות תקינות להגדרות — נאכפים בשרת. */
export const SETTINGS_LIMITS = {
  roundCount: { min: 1, max: 20 },
  roundDurationMs: { min: 10_000, max: 120_000 },
  revealMs: { min: 3_000, max: 60_000 },
  countdownMs: { min: 0, max: 10_000 },
} as const;

/** תצוגת הפתיחה של מפה (מפת החשיפה ומסך הניהול). */
export type MapView = 'israel' | 'world';

export function mapViewForCategory(category: ContentCategory): MapView {
  return category === 'israel' ? 'israel' : 'world';
}

/** אווטאר שנגזר דטרמיניסטית ממזהה השחקן. */
export interface Avatar {
  readonly emoji: string;
  /** גוון בסיס במעלות (HSL) לצביעת הכרטיס והסמן במפה. */
  readonly hue: number;
}

/** ייצוג ציבורי של שחקן — נשלח לכל המשתתפים. */
export interface PlayerPublic {
  readonly id: string;
  readonly name: string;
  readonly avatar: Avatar;
  readonly connected: boolean;
  readonly score: number;
  readonly joinedAt: number;
}

/** תיאור הסיבוב הפעיל — תמונה, קרדיט וארבע אפשרויות, בלי לסמן את הנכונה. */
export interface RoundPrompt {
  /** אינדקס מבוסס-0. */
  readonly index: number;
  readonly total: number;
  readonly image: PlaceImage;
  /** ארבע האפשרויות, בסדר אקראי. */
  readonly options: readonly string[];
  readonly startsAt: number;
  readonly endsAt: number;
}

/** תשובה של שחקן בסיבוב. */
export interface PlayerAnswerResult {
  readonly playerId: string;
  /** האינדקס שנבחר, או null אם לא ענה. */
  readonly choice: number | null;
  readonly correct: boolean;
  readonly points: number;
  /** הזמן מתחילת הסיבוב ועד הבחירה (מ"ש), או null. */
  readonly elapsedMs: number | null;
}

/** סיכום מלא של סיבוב — המקום, האפשרויות, התשובה הנכונה וכל הבחירות. */
export interface RoundResult {
  readonly index: number;
  readonly place: Place;
  readonly image: PlaceImage;
  readonly options: readonly string[];
  readonly correctIndex: number;
  readonly answers: readonly PlayerAnswerResult[];
}

/**
 * תמונת מצב ציבורית של החדר — המבנה היחיד שמשודר לכולם.
 */
export interface PublicGameState {
  readonly code: string;
  readonly phase: GamePhase;
  readonly settings: GameSettings;
  /** הסיבוב הפעיל (בזמן question, או paused מתוך question). */
  readonly round: RoundPrompt | null;
  /** תוצאות הסיבוב האחרון (בזמן reveal, או paused מתוך reveal). */
  readonly reveal: RoundResult | null;
  readonly players: readonly PlayerPublic[];
  /** כמה שחקנים כבר ענו בסיבוב הנוכחי. */
  readonly answeredCount: number;
  readonly completedRounds: number;
  /** מספר הסיבובים בפועל במשחק (אחרי בחירת המקומות). */
  readonly totalRounds: number;
  /** כמה מקומות זמינים במאגר שנבחר. */
  readonly poolSize: number;
  /** חותמת זמן שבה יסתיים השלב הנוכחי (ספירה לאחור / חשיפה). */
  readonly phaseEndsAt: number | null;
  readonly hostConnected: boolean;
}

/** שורה בטבלת הדירוג הסופית. */
export interface LeaderboardEntry {
  /** דירוג מבוסס-1; שוויון מקבל את אותו דירוג. */
  readonly rank: number;
  readonly player: PlayerPublic;
  readonly totalPoints: number;
  /** מספר התשובות הנכונות. */
  readonly correctAnswers: number;
  readonly answeredRounds: number;
  /** זמן ממוצע לתשובה נכונה (מ"ש), או null. */
  readonly averageCorrectMs: number | null;
  readonly bestRoundIndex: number | null;
}

/** התוצאות המלאות — נשלח בסיום המשחק. */
export interface GameResults {
  readonly code: string;
  readonly finishedAt: number;
  readonly settings: GameSettings;
  readonly rounds: readonly RoundResult[];
  readonly leaderboard: readonly LeaderboardEntry[];
  readonly endedEarly: boolean;
}

/** מצב פרטי המוחזר לשחקן בלבד. */
export interface PlayerPrivateState {
  readonly playerId: string;
  readonly score: number;
  readonly rank: number | null;
  readonly playerCount: number;
  /** האם השחקן כבר בחר תשובה בסיבוב הנוכחי. */
  readonly hasAnswered: boolean;
  /** האינדקס שנבחר בסיבוב הנוכחי (נעול). */
  readonly choice: number | null;
}

/**
 * חוזה התקשורת בזמן אמת בין הלקוח לשרת (Socket.IO).
 *
 * הטיפוסים כאן משמשים את שני הצדדים, כך שכל שינוי בחוזה נתפס בזמן
 * הידור ולא בזמן ריצה. כל פעולה של הלקוח מחזירה Ack מפורש עם הצלחה
 * או שגיאה מתורגמת לעברית — אין "שגיאות שקטות".
 */

import type {
  GameResults,
  GameSettings,
  PlayerPrivateState,
  PublicGameState,
} from './types.js';

/** גרסת הפרוטוקול — הלקוח והשרת חייבים להסכים עליה. */
export const PROTOCOL_VERSION = 1;

/** קודי שגיאה יציבים שהלקוח יכול לטפל בהם. */
export type ErrorCode =
  | 'ROOM_NOT_FOUND'
  | 'ROOM_FULL'
  | 'NAME_TAKEN'
  | 'INVALID_NAME'
  | 'INVALID_INPUT'
  | 'GAME_ALREADY_STARTED'
  | 'NOT_ENOUGH_PLAYERS'
  | 'NOT_AUTHORIZED'
  | 'ROUND_CLOSED'
  | 'ALREADY_ANSWERED'
  | 'NO_PLACES'
  | 'RATE_LIMITED'
  | 'SERVER_ERROR';

/** תשובת Ack אחידה לכל פעולה. */
export type Ack<T> = { readonly ok: true; readonly data: T } | { readonly ok: false; readonly error: ErrorCode; readonly message: string };

/** תשובת השרת ליצירת משחק. */
export interface CreateGameResponse {
  readonly code: string;
  /** אסימון סודי המזהה את המנהל; נשמר מקומית ומאפשר חיבור מחדש. */
  readonly hostToken: string;
  /** הקישור המלא להצטרפות. */
  readonly joinUrl: string;
  readonly state: PublicGameState;
}

/** תשובת השרת להצטרפות שחקן. */
export interface JoinGameResponse {
  readonly playerId: string;
  /** אסימון סודי לחיבור מחדש לאחר ניתוק או רענון. */
  readonly playerToken: string;
  readonly state: PublicGameState;
  readonly self: PlayerPrivateState;
  /** התוצאות, אם השחקן הצטרף מחדש למשחק שכבר הסתיים. */
  readonly results: GameResults | null;
}

/** אירועים שהלקוח שולח לשרת. */
export interface ClientToServerEvents {
  /** סנכרון שעונים — הלקוח שולח את זמנו, השרת מחזיר את זמנו. */
  'time:sync': (clientSentAt: number, ack: (serverTime: number) => void) => void;

  'host:create': (
    payload: { readonly settings: Partial<GameSettings> },
    ack: (response: Ack<CreateGameResponse>) => void,
  ) => void;
  'host:attach': (
    payload: { readonly code: string; readonly hostToken: string },
    ack: (response: Ack<{ readonly state: PublicGameState; readonly results: GameResults | null; readonly joinUrl: string }>) => void,
  ) => void;
  'host:updateSettings': (
    payload: { readonly settings: Partial<GameSettings> },
    ack: (response: Ack<{ readonly state: PublicGameState }>) => void,
  ) => void;
  'host:start': (ack: (response: Ack<null>) => void) => void;
  'host:pause': (ack: (response: Ack<null>) => void) => void;
  'host:resume': (ack: (response: Ack<null>) => void) => void;
  /** סגירת הסיבוב מיד / מעבר לסיבוב הבא מתוך מסך החשיפה. */
  'host:skip': (ack: (response: Ack<null>) => void) => void;
  /** עצירת המשחק ומעבר מיידי למסך התוצאות. */
  'host:stop': (ack: (response: Ack<null>) => void) => void;
  /** פתיחת משחק חדש באותו חדר, עם אותם שחקנים. */
  'host:restart': (ack: (response: Ack<{ readonly state: PublicGameState }>) => void) => void;
  'host:kick': (payload: { readonly playerId: string }, ack: (response: Ack<null>) => void) => void;

  'player:join': (
    payload: { readonly code: string; readonly name: string },
    ack: (response: Ack<JoinGameResponse>) => void,
  ) => void;
  'player:attach': (
    payload: { readonly code: string; readonly playerToken: string },
    ack: (response: Ack<JoinGameResponse>) => void,
  ) => void;
  /** בחירת אחת מארבע האפשרויות. ננעלת מיד — אי אפשר לשנות. */
  'player:answer': (
    payload: { readonly roundIndex: number; readonly choice: number },
    ack: (response: Ack<{ readonly accepted: true }>) => void,
  ) => void;
  'player:leave': (ack: (response: Ack<null>) => void) => void;
}

/** אירועים שהשרת משדר ללקוחות. */
export interface ServerToClientEvents {
  /** תמונת מצב מלאה — משודרת בכל שינוי משמעותי. */
  'room:state': (state: PublicGameState) => void;
  /** מצב פרטי של השחקן המקבל בלבד. */
  'player:self': (self: PlayerPrivateState) => void;
  /** התוצאות המלאות בסיום המשחק. */
  'game:results': (results: GameResults) => void;
  /** החדר נסגר (המנהל עזב או שפג תוקפו). */
  'room:closed': (payload: { readonly reason: 'host_left' | 'expired' | 'kicked' }) => void;
  /** הודעה קצרה להצגה כטוסט. */
  'notice': (payload: { readonly level: 'info' | 'warn'; readonly message: string }) => void;
}

/** ניסוח ברירת מחדל בעברית לכל קוד שגיאה. */
export const ERROR_MESSAGES: Readonly<Record<ErrorCode, string>> = {
  ROOM_NOT_FOUND: 'לא נמצא חדר עם הקוד הזה',
  ROOM_FULL: 'המשחק מלא',
  NAME_TAKEN: 'השם הזה כבר תפוס — בחרו שם אחר',
  INVALID_NAME: 'השם חייב להכיל בין 2 ל-20 תווים',
  INVALID_INPUT: 'הנתונים שנשלחו אינם תקינים',
  GAME_ALREADY_STARTED: 'המשחק כבר התחיל',
  NOT_ENOUGH_PLAYERS: 'צריך לפחות שחקן אחד כדי להתחיל',
  NOT_AUTHORIZED: 'אין הרשאה לפעולה הזו',
  ROUND_CLOSED: 'הזמן נגמר — התשובה לא נקלטה',
  ALREADY_ANSWERED: 'כבר בחרת תשובה בסיבוב הזה',
  NO_PLACES: 'אין מקומות במאגר לשילוב שנבחר',
  RATE_LIMITED: 'יותר מדי בקשות, נסו שוב בעוד רגע',
  SERVER_ERROR: 'אירעה שגיאה בשרת',
};

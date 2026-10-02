/**
 * לקוח הזמן-אמת.
 *
 * שתי אחריויות:
 *  1. חיבור Socket.IO יחיד ומשותף, עם טיפוסים מהחוזה המשותף.
 *  2. סנכרון שעונים מול השרת — קריטי, כי כל הטיימרים במשחק מבוססים
 *     על חותמות זמן של השרת. בלי הסנכרון, שעון מקומי שסוטה בשניות
 *     יגרום לטיימר שגוי אצל חלק מהשחקנים.
 */

import { io, type Socket } from 'socket.io-client';
import type { Ack, ClientToServerEvents, ServerToClientEvents } from '@eifo/shared';

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/** זמן מרבי להמתנה לתשובת שרת. */
const ACK_TIMEOUT_MS = 8_000;

/** מספר מדידות לסנכרון שעונים; נבחרת המדידה עם ההשהיה הנמוכה ביותר. */
const CLOCK_SAMPLES = 5;

let socket: GameSocket | null = null;
let clockOffsetMs = 0;

/**
 * מחזיר את החיבור המשותף, ויוצר אותו בפעם הראשונה.
 * החיבור נוצר לאותו מקור שממנו נטען הדף, ולכן אין צורך בתצורה.
 */
export function getSocket(): GameSocket {
  if (socket) return socket;

  socket = io({
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 400,
    reconnectionDelayMax: 4_000,
    // אינסוף ניסיונות: מכשיר שיצא לרגע מטווח ה-Wi-Fi חייב לחזור למשחק.
    reconnectionAttempts: Number.POSITIVE_INFINITY,
    timeout: 10_000,
  });

  socket.on('connect', () => {
    void synchronizeClock();
  });

  return socket;
}

/**
 * שולח אירוע וממתין לתשובת Ack, עם פסק זמן.
 * מחזיר תמיד תשובה מובנית — גם כשל רשת מתורגם ל-Ack של שגיאה,
 * כך שקוד הקריאה אינו צריך try/catch.
 */
export function request<TResponse>(
  event: keyof ClientToServerEvents,
  ...args: unknown[]
): Promise<Ack<TResponse>> {
  return new Promise((resolve) => {
    const connection = getSocket();
    let settled = false;

    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve({ ok: false, error: 'SERVER_ERROR', message: 'השרת לא הגיב — בדקו את החיבור' });
    }, ACK_TIMEOUT_MS);

    const done = (response: Ack<TResponse>) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve(response);
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (connection as any).emit(event, ...args, done);
  });
}

/**
 * מודד את הפרש השעונים מול השרת בשיטת Cristian:
 * offset = serverTime − (clientSent + rtt/2).
 * נבחרת המדידה עם זמן הלוך-ושוב הקצר ביותר, כי היא המדויקת ביותר.
 */
export async function synchronizeClock(): Promise<number> {
  const connection = getSocket();
  let bestRoundTrip = Number.POSITIVE_INFINITY;
  let bestOffset = clockOffsetMs;

  for (let sample = 0; sample < CLOCK_SAMPLES; sample += 1) {
    const sentAt = Date.now();
    const serverTime = await new Promise<number | null>((resolve) => {
      const timer = window.setTimeout(() => resolve(null), 2_000);
      connection.emit('time:sync', sentAt, (value: number) => {
        window.clearTimeout(timer);
        resolve(value);
      });
    });

    if (serverTime === null) break;

    const roundTrip = Date.now() - sentAt;
    if (roundTrip < bestRoundTrip) {
      bestRoundTrip = roundTrip;
      bestOffset = serverTime - (sentAt + roundTrip / 2);
    }
  }

  clockOffsetMs = bestOffset;
  return clockOffsetMs;
}

/** הזמן הנוכחי לפי שעון השרת (מילישניות). */
export function serverNow(): number {
  return Date.now() + clockOffsetMs;
}

/** הפרש השעונים הנוכחי — לצורכי אבחון. */
export function getClockOffset(): number {
  return clockOffsetMs;
}

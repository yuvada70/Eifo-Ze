/**
 * מגביל קצב פשוט (token bucket) לכל חיבור.
 *
 * מגן על השרת מפני הצפה — בין אם מלקוח פגום ובין אם מניסיון זדוני —
 * בלי לפגוע בשימוש רגיל: סימון נקודה במפה הוא פעולה תכופה ולגיטימית,
 * ולכן הדלי מכויל להיות סלחני לפרצים קצרים.
 */

/** הגדרת דלי אסימונים. */
export interface BucketConfig {
  /** קיבולת מרבית (פרץ מותר). */
  readonly capacity: number;
  /** קצב מילוי, אסימונים לשנייה. */
  readonly refillPerSecond: number;
}

interface BucketState {
  tokens: number;
  lastRefillAt: number;
}

/** מגבלות ברירת מחדל לפי סוג פעולה. */
export const RATE_LIMITS = {
  /** יצירת משחק — פעולה כבדה, נדירה. */
  create: { capacity: 5, refillPerSecond: 0.1 },
  /** הצטרפות / חיבור מחדש. */
  join: { capacity: 10, refillPerSecond: 0.5 },
  /**
   * אישור ניחוש — פעם אחת בסיבוב. גרירה וזום של המפה הם מקומיים
   * בלבד ואינם שולחים דבר לשרת, ולכן הסף כאן נמוך.
   */
  guess: { capacity: 6, refillPerSecond: 1 },
  /** פקודות מנהל. */
  host: { capacity: 30, refillPerSecond: 4 },
} as const satisfies Record<string, BucketConfig>;

export type RateLimitKind = keyof typeof RATE_LIMITS;

/** מגביל קצב עבור חיבור יחיד, עם דלי נפרד לכל סוג פעולה. */
export class ConnectionRateLimiter {
  private readonly buckets = new Map<string, BucketState>();

  constructor(private readonly now: () => number = Date.now) {}

  /**
   * מנסה לצרוך אסימון אחד.
   * @returns true אם הפעולה מותרת, false אם יש לדחות אותה.
   */
  tryConsume(kind: RateLimitKind): boolean {
    const config = RATE_LIMITS[kind];
    const now = this.now();

    let bucket = this.buckets.get(kind);
    if (!bucket) {
      bucket = { tokens: config.capacity, lastRefillAt: now };
      this.buckets.set(kind, bucket);
    }

    const elapsedSeconds = (now - bucket.lastRefillAt) / 1000;
    bucket.tokens = Math.min(config.capacity, bucket.tokens + elapsedSeconds * config.refillPerSecond);
    bucket.lastRefillAt = now;

    if (bucket.tokens < 1) return false;

    bucket.tokens -= 1;
    return true;
  }
}

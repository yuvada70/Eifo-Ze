/**
 * ספירה לאחור המבוססת על שעון השרת.
 *
 * העדכון נעשה ב-requestAnimationFrame ולא ב-setInterval: כך הטבעת
 * זזה חלק (60 פריימים לשנייה) ולא "קופצת", והדפדפן מקפיא אותה
 * אוטומטית כשהלשונית ברקע — חיסכון בסוללה במובייל.
 */

import { useEffect, useRef, useState } from 'react';

import { serverNow } from '../net/socket';

export interface CountdownState {
  /** הזמן שנותר במילישניות (לעולם לא שלילי). */
  readonly remainingMs: number;
  /** התקדמות מ-1 (התחלה) ל-0 (סוף) — מתאים ישירות ל-stroke-dashoffset. */
  readonly progress: number;
  /** האם הזמן נגמר. */
  readonly finished: boolean;
}

/**
 * @param startsAt חותמת זמן שרת של תחילת השלב.
 * @param endsAt   חותמת זמן שרת של סוף השלב.
 * @param paused   כשהוא דולק, הספירה קופאת על ערכה האחרון.
 */
export function useCountdown(startsAt: number, endsAt: number, paused = false): CountdownState {
  const totalMs = Math.max(1, endsAt - startsAt);
  const [remainingMs, setRemainingMs] = useState(() => Math.max(0, endsAt - serverNow()));
  const frameRef = useRef<number>();

  useEffect(() => {
    if (paused) return;

    const tick = () => {
      setRemainingMs(Math.max(0, endsAt - serverNow()));
      frameRef.current = window.requestAnimationFrame(tick);
    };

    frameRef.current = window.requestAnimationFrame(tick);
    return () => {
      if (frameRef.current !== undefined) window.cancelAnimationFrame(frameRef.current);
    };
  }, [endsAt, paused]);

  return {
    remainingMs,
    progress: Math.min(1, Math.max(0, remainingMs / totalMs)),
    finished: remainingMs <= 0,
  };
}

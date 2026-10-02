/**
 * throttle — מגביל קריאות לפונקציה לפעם אחת לכל `waitMs`, עם קריאה
 * אחרונה מובטחת בסוף הרצף (trailing). משמש לאירועי גרירה/תזוזה/זום
 * של המפה, שנורים עשרות פעמים בשנייה.
 */
export function throttle<A extends unknown[]>(fn: (...args: A) => void, waitMs: number) {
  let lastCall = 0;
  let timer: number | null = null;
  let lastArgs: A | null = null;

  const invoke = () => {
    timer = null;
    lastCall = Date.now();
    if (lastArgs) fn(...lastArgs);
    lastArgs = null;
  };

  const throttled = (...args: A) => {
    lastArgs = args;
    const remaining = waitMs - (Date.now() - lastCall);
    if (remaining <= 0) {
      if (timer !== null) window.clearTimeout(timer);
      invoke();
    } else if (timer === null) {
      timer = window.setTimeout(invoke, remaining);
    }
  };

  throttled.cancel = () => {
    if (timer !== null) window.clearTimeout(timer);
    timer = null;
    lastArgs = null;
  };

  return throttled;
}

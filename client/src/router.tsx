/**
 * ניתוב מינימלי מבוסס History API.
 *
 * לאפליקציה שלושה מסלולים בלבד, ולכן ספריית ניתוב מלאה הייתה מוסיפה
 * משקל ומורכבות ללא תמורה. המימוש כאן תומך בכל מה שנדרש: ניווט
 * תכנותי, כפתור "אחורי" של הדפדפן, וקישורים עמוקים (deep links)
 * מסריקת QR.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { normalizeGameCode } from '@eifo/shared';

/** המסלולים האפשריים באפליקציה. */
export type Route =
  | { readonly name: 'landing' }
  | { readonly name: 'host' }
  | { readonly name: 'admin' }
  | { readonly name: 'join'; readonly code: string };

interface RouterValue {
  readonly route: Route;
  /** ניווט למסלול, עם הוספה להיסטוריית הדפדפן. */
  navigate(path: string, options?: { replace?: boolean }): void;
}

const RouterContext = createContext<RouterValue | null>(null);

/** ממיר נתיב URL למסלול מוכר. */
export function parsePath(pathname: string): Route {
  const segments = pathname.split('/').filter(Boolean);

  if (segments[0] === 'host') return { name: 'host' };
  if (segments[0] === 'admin') return { name: 'admin' };

  if (segments[0] === 'join') {
    return { name: 'join', code: normalizeGameCode(segments[1] ?? '') };
  }

  return { name: 'landing' };
}

/** בונה נתיב למסלול — מרוכז כאן כדי שלא יהיו מחרוזות קשיחות בקוד. */
export const paths = {
  landing: () => '/',
  host: () => '/host',
  admin: () => '/admin',
  join: (code?: string) => (code ? `/join/${code}` : '/join'),
} as const;

export function RouterProvider({ children }: { children: ReactNode }): JSX.Element {
  const [route, setRoute] = useState<Route>(() => parsePath(window.location.pathname));

  useEffect(() => {
    const onPopState = () => setRoute(parsePath(window.location.pathname));
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigate = useCallback((path: string, options?: { replace?: boolean }) => {
    if (options?.replace) window.history.replaceState({}, '', path);
    else window.history.pushState({}, '', path);

    setRoute(parsePath(path));
  }, []);

  const value = useMemo<RouterValue>(() => ({ route, navigate }), [navigate, route]);

  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

/** גישה למסלול הנוכחי ולפונקציית הניווט. */
export function useRouter(): RouterValue {
  const value = useContext(RouterContext);
  if (!value) throw new Error('useRouter חייב לרוץ בתוך RouterProvider');
  return value;
}

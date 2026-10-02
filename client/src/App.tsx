/**
 * שורש האפליקציה.
 *
 * אחראי על שלושה דברים בלבד: אתחול החיבור לשרת, בחירת המסך לפי
 * המסלול, והצגת שכבות-על גלובליות (הודעות, מחוון חיבור, הגדרות).
 */

import { useEffect } from 'react';

import { ConnectionBadge } from './components/ui/misc';
import { ToastHost } from './components/ui/ToastHost';
import { Landing } from './screens/Landing';
import { AdminScreen } from './screens/admin/AdminScreen';
import { HostScreen } from './screens/host/HostScreen';
import { PlayerScreen } from './screens/player/PlayerScreen';
import { useGameStore } from './state/gameStore';
import { useRouter } from './router';
import styles from './App.module.css';

export function App(): JSX.Element {
  const initialize = useGameStore((store) => store.initialize);
  const connection = useGameStore((store) => store.connection);
  const preferences = useGameStore((store) => store.preferences);
  const setPreferences = useGameStore((store) => store.setPreferences);
  const { route } = useRouter();

  useEffect(() => {
    initialize();
  }, [initialize]);

  // מצב מקרן מוחל על שורש המסמך כדי שכל אסימוני הגודל יגדלו יחד.
  useEffect(() => {
    document.documentElement.dataset['display'] = preferences.display;
  }, [preferences.display]);

  return (
    <>
      <div className={styles.app}>
        {route.name === 'landing' ? <Landing /> : null}
        {route.name === 'host' ? <HostScreen /> : null}
        {route.name === 'join' ? <PlayerScreen code={route.code} /> : null}
        {route.name === 'admin' ? <AdminScreen /> : null}
      </div>

      <div className={`${styles.overlay} ${route.name === 'join' ? styles.overlayTop : ''}`}>
        <ConnectionBadge status={connection} />

        <div className={styles.preferences}>
          <button
            className={styles.preferenceButton}
            onClick={() => setPreferences({ soundEnabled: !preferences.soundEnabled })}
            aria-pressed={preferences.soundEnabled}
            title={preferences.soundEnabled ? 'כיבוי צלילים' : 'הפעלת צלילים'}
          >
            {preferences.soundEnabled ? '🔊' : '🔇'}
            <span className="visually-hidden">
              {preferences.soundEnabled ? 'כיבוי צלילים' : 'הפעלת צלילים'}
            </span>
          </button>

          {route.name === 'host' ? (
            <button
              className={styles.preferenceButton}
              onClick={() =>
                setPreferences({ display: preferences.display === 'projector' ? 'normal' : 'projector' })
              }
              aria-pressed={preferences.display === 'projector'}
              title={preferences.display === 'projector' ? 'חזרה לתצוגה רגילה' : 'מצב מקרן (טקסט מוגדל)'}
            >
              {preferences.display === 'projector' ? '🖥️' : '📽️'}
              <span className="visually-hidden">מצב מקרן</span>
            </button>
          ) : null}
        </div>
      </div>

      <ToastHost />
    </>
  );
}

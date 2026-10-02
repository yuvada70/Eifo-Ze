/**
 * לובי המנהל.
 *
 * המסך הזה מוקרן בדרך כלל על מסך גדול מול הקהל, ולכן הוא בנוי סביב
 * שני דברים שחייבים להיקרא מרחוק: קוד המשחק וה-QR. רשימת המשתתפים
 * מתעדכנת בזמן אמת ומספקת את ה"פידבק" שגורם לאנשים להצטרף.
 */

import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CATEGORY_LABELS, DIFFICULTY_LABELS } from '@eifo/shared';

import { Button } from '../../components/ui/Button';
import { JoinQrCode } from '../../components/ui/JoinQrCode';
import { AvatarBadge, Card, EmptyState } from '../../components/ui/misc';
import { useGameStore } from '../../state/gameStore';
import styles from './HostLobby.module.css';

export function HostLobby(): JSX.Element {
  const room = useGameStore((store) => store.room)!;
  const joinUrl = useGameStore((store) => store.joinUrl);
  const startGame = useGameStore((store) => store.startGame);
  const kickPlayer = useGameStore((store) => store.kickPlayer);
  const pushToast = useGameStore((store) => store.pushToast);
  const endHostSession = useGameStore((store) => store.endHostSession);

  const [starting, setStarting] = useState(false);

  /** הקישור המוצג — נופל בחזרה לכתובת הנוכחית אם השרת לא סיפק אחת. */
  const shareUrl = useMemo(
    () => joinUrl ?? `${window.location.origin}/join/${room.code}`,
    [joinUrl, room.code],
  );

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      pushToast('success', `${label} הועתק`);
    } catch {
      pushToast('warn', 'ההעתקה נחסמה על ידי הדפדפן');
    }
  };

  const handleStart = async () => {
    setStarting(true);
    await startGame();
    setStarting(false);
  };

  const playerCount = room.players.length;

  return (
    <div className={styles.page}>
      <section className={styles.joinPane}>
        <Card className={styles.codeCard} highlighted>
          <span className={styles.codeLabel}>קוד המשחק</span>
          <button
            className={`${styles.code} tabular`}
            onClick={() => void copy(room.code, 'הקוד')}
            title="לחצו להעתקה"
          >
            {room.code}
          </button>

          <JoinQrCode url={shareUrl} size={200} />

          <div className={styles.urlRow}>
            <span className={styles.url} dir="ltr">
              {shareUrl.replace(/^https?:\/\//, '')}
            </span>
            <Button size="sm" variant="secondary" onClick={() => void copy(shareUrl, 'הקישור')}>
              העתקה
            </Button>
          </div>

          <p className={styles.instructions}>
            סרקו את הקוד או היכנסו לקישור, הזינו שם — וזהו.
          </p>
          <a className={styles.playToo} href={shareUrl} target="_blank" rel="noopener noreferrer">
            🎮 רוצים לשחק גם? פתחו את הקישור בטלפון או בלשונית נוספת
          </a>
        </Card>
      </section>

      <section className={styles.playersPane}>
        <header className={styles.playersHeader}>
          <div>
            <h1 className={styles.playersTitle}>
              משתתפים
              <span className={`${styles.playersCount} tabular`}>{playerCount}</span>
            </h1>
            <p className={styles.playersHint}>
              {CATEGORY_LABELS[room.settings.category]} · {DIFFICULTY_LABELS[room.settings.difficulty]} ·{' '}
              {room.totalRounds} סיבובים · {room.settings.roundDurationMs / 1000} שניות לכל סיבוב
            </p>
            {room.poolSize < room.settings.roundCount ? (
              <p className={styles.poolWarning} role="status">
                ⚠️ במאגר יש רק {room.poolSize} מקומות לשילוב הזה — המשחק יכלול {room.totalRounds} סיבובים.
              </p>
            ) : null}
          </div>

          <div className={styles.headerActions}>
            <Button variant="ghost" size="sm" onClick={endHostSession}>
              סגירת החדר
            </Button>
            <Button
              size="lg"
              icon="▶"
              disabled={playerCount === 0}
              loading={starting}
              onClick={handleStart}
              data-testid="start-game"
            >
              התחלת משחק
            </Button>
          </div>
        </header>

        {playerCount === 0 ? (
          <EmptyState
            icon="📡"
            title="אף אחד עדיין לא הצטרף"
            description="ברגע שמישהו יסרוק את הקוד — הוא יופיע כאן."
          />
        ) : (
          <ul className={styles.playersGrid}>
            <AnimatePresence initial={false}>
              {room.players.map((player) => (
                <motion.li
                  key={player.id}
                  className={styles.playerCard}
                  data-testid="lobby-player"
                  layout
                  initial={{ opacity: 0, scale: 0.85 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.85 }}
                  transition={{ type: 'spring', stiffness: 320, damping: 24 }}
                >
                  <AvatarBadge avatar={player.avatar} size={48} dimmed={!player.connected} />
                  <span className={styles.playerName}>{player.name}</span>
                  <button
                    className={styles.kick}
                    onClick={() => void kickPlayer(player.id)}
                    aria-label={`הסרת ${player.name} מהמשחק`}
                    title="הסרה מהמשחק"
                  >
                    ✕
                  </button>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </section>
    </div>
  );
}

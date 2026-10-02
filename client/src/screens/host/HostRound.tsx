/**
 * מסך המארח במהלך המשחק — מתאים להקרנה על מסך גדול.
 *
 * בזמן סיבוב: התמונה בגדול, טיימר, וכמה שחקנים כבר אישרו. שם המקום
 * והמיקום שלו אינם מגיעים לדפדפן בשלב הזה כלל.
 * בזמן חשיפה: המפה עם המיקום האמיתי וכל הניחושים, המרחקים, ופרטי המקום.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

import { RoundReveal } from '../../components/results/RoundReveal';
import { PlacePhoto } from '../../components/place/PlacePhoto';
import { Button } from '../../components/ui/Button';
import { TimerRing } from '../../components/ui/TimerRing';
import { AvatarBadge } from '../../components/ui/misc';
import { useCountdown } from '../../hooks/useCountdown';
import { useSound } from '../../hooks/useSound';
import { useGameStore } from '../../state/gameStore';
import styles from './HostRound.module.css';

export function HostRound(): JSX.Element {
  const room = useGameStore((store) => store.room)!;
  const pauseGame = useGameStore((store) => store.pauseGame);
  const resumeGame = useGameStore((store) => store.resumeGame);
  const skipRound = useGameStore((store) => store.skipRound);
  const stopGame = useGameStore((store) => store.stopGame);

  const playSound = useSound();
  const [confirmingStop, setConfirmingStop] = useState(false);

  const round = room.round;
  const reveal = room.reveal;
  const isPaused = room.phase === 'paused';
  const answered = room.answeredCount;
  const total = room.players.filter((player) => player.connected).length;

  /* צליל בתחילת כל סיבוב ובכל חשיפה. */
  const lastEventRef = useRef<string | null>(null);
  useEffect(() => {
    const key = round && room.phase === 'question' ? `q${round.index}` : reveal ? `r${reveal.index}` : null;
    if (!key || lastEventRef.current === key) return;
    lastEventRef.current = key;
    playSound(key.startsWith('q') ? 'roundStart' : 'reveal');
  }, [playSound, reveal, room.phase, round]);

  const ranked = useMemo(
    () => [...room.players].sort((a, b) => b.score - a.score).slice(0, 10),
    [room.players],
  );

  const roundNumber = (round?.index ?? reveal?.index ?? room.completedRounds) + 1;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.progress}>
          <span className={styles.progressLabel}>סיבוב</span>
          <span className={`${styles.progressValue} tabular`}>
            {Math.min(roundNumber, room.totalRounds)}
            <span className={styles.progressTotal}>/{room.totalRounds}</span>
          </span>
        </div>

        <div className={styles.controls}>
          {room.phase !== 'countdown' ? (
            <Button variant={reveal ? 'primary' : 'ghost'} size="sm" onClick={() => void skipRound()} icon="⏭" data-testid="host-skip">
              {reveal ? (roundNumber >= room.totalRounds ? 'לטבלת הניצחון' : 'לסיבוב הבא') : 'סגירת הסיבוב'}
            </Button>
          ) : null}
          {isPaused ? (
            <Button variant="secondary" size="sm" onClick={() => void resumeGame()} icon="▶">
              המשך
            </Button>
          ) : (
            <Button variant="secondary" size="sm" onClick={() => void pauseGame()} icon="⏸">
              עצירה זמנית
            </Button>
          )}
          {confirmingStop ? (
            <div className={styles.confirm}>
              <span className={styles.confirmText}>לסיים ולעבור לטבלת הניצחון?</span>
              <Button variant="danger" size="sm" onClick={() => void stopGame()}>
                כן, סיים
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirmingStop(false)}>
                ביטול
              </Button>
            </div>
          ) : (
            <Button variant="danger" size="sm" onClick={() => setConfirmingStop(true)} icon="⏹">
              סיום משחק
            </Button>
          )}
        </div>
      </header>

      <main className={styles.stage}>
        <AnimatePresence mode="wait">
          {room.phase === 'countdown' ? (
            <Countdown key="countdown" endsAt={room.phaseEndsAt ?? 0} />
          ) : round ? (
            <motion.div
              key={`round-${round.index}`}
              className={styles.question}
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              <div className={styles.photo}>
                <PlacePhoto image={round.image} />
              </div>
              <div className={styles.questionBar}>
                <span className={styles.prompt}>איפה זה? 🤔</span>
                <TimerRing
                  startsAt={round.startsAt}
                  endsAt={round.endsAt}
                  size={96}
                  paused={isPaused}
                  label={isPaused ? 'מוקפא' : 'שניות'}
                />
                <div className={styles.answered}>
                  <div className={styles.answeredBar}>
                    <motion.div
                      className={styles.answeredFill}
                      animate={{ width: total > 0 ? `${(answered / total) * 100}%` : '0%' }}
                      transition={{ duration: 0.3 }}
                    />
                  </div>
                  <span className={`${styles.answeredText} tabular`} data-testid="answered-count">
                    {answered} מתוך {total} אישרו
                  </span>
                </div>
              </div>
            </motion.div>
          ) : reveal ? (
            <motion.div
              key={`reveal-${reveal.index}`}
              className={styles.revealPane}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <RoundReveal
                round={reveal}
                players={room.players}
                view={room.mapView}
                category={room.settings.category}
                showPhoto
              />
              {!isPaused && room.phaseEndsAt ? <NextIn endsAt={room.phaseEndsAt} last={roundNumber >= room.totalRounds} /> : null}
            </motion.div>
          ) : (
            <motion.p key="wait" className={styles.prompt} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              המשחק מושהה
            </motion.p>
          )}
        </AnimatePresence>
      </main>

      <aside className={styles.scoreboard}>
        <h2 className={styles.scoreboardTitle}>ניקוד מצטבר</h2>
        <ul className={styles.scoreList}>
          {ranked.map((player, index) => (
            <motion.li key={player.id} className={styles.scoreRow} layout transition={{ duration: 0.4 }}>
              <span className={`${styles.scoreRank} tabular`}>{index + 1}</span>
              <AvatarBadge avatar={player.avatar} size={28} dimmed={!player.connected} />
              <span className={styles.scoreName}>{player.name}</span>
              <span className={`${styles.scoreValue} tabular`}>{player.score.toLocaleString('he-IL')}</span>
            </motion.li>
          ))}
        </ul>
      </aside>
    </div>
  );
}

/** "הסיבוב הבא בעוד X שניות". */
function NextIn({ endsAt, last }: { endsAt: number; last: boolean }): JSX.Element {
  const { remainingMs } = useCountdown(endsAt - 15_000, endsAt);
  return (
    <p className={styles.nextIn}>
      {last ? 'טבלת הניצחון' : 'הסיבוב הבא'} בעוד <span className="tabular">{Math.ceil(remainingMs / 1000)}</span> שניות
    </p>
  );
}

/** ספירה לאחור גדולה לפני הסיבוב הראשון. */
function Countdown({ endsAt }: { endsAt: number }): JSX.Element {
  const { remainingMs } = useCountdown(endsAt - 3_000, endsAt);
  const seconds = Math.max(1, Math.ceil(remainingMs / 1_000));

  return (
    <motion.div className={styles.countdown} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 1.1 }}>
      <span className={styles.countdownLabel}>מתחילים בעוד</span>
      <AnimatePresence mode="popLayout">
        <motion.span
          key={seconds}
          className={`${styles.countdownNumber} tabular`}
          initial={{ scale: 0.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 1.8, opacity: 0 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        >
          {seconds}
        </motion.span>
      </AnimatePresence>
    </motion.div>
  );
}

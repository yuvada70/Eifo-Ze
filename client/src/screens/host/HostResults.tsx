/**
 * טבלת הניצחון בסוף המשחק: פודיום, טבלת דירוג מלאה, וסיכום קצר של
 * המקומות ששוחקו (מי היה הכי קרוב בכל סיבוב).
 */

import { useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { formatDistance } from '@eifo/shared';

import { Leaderboard } from '../../components/results/Leaderboard';
import { Podium } from '../../components/results/Podium';
import { Button } from '../../components/ui/Button';
import { Confetti } from '../../components/ui/Confetti';
import { Stat } from '../../components/ui/misc';
import { useSound } from '../../hooks/useSound';
import { useGameStore } from '../../state/gameStore';
import styles from './HostResults.module.css';

export function HostResults(): JSX.Element {
  const results = useGameStore((store) => store.results);
  const room = useGameStore((store) => store.room);
  const restartGame = useGameStore((store) => store.restartGame);
  const endHostSession = useGameStore((store) => store.endHostSession);
  const playSound = useSound();

  useEffect(() => {
    if (results) playSound('fanfare');
  }, [playSound, results]);

  const players = useMemo(
    () => room?.players ?? results?.leaderboard.map((entry) => entry.player) ?? [],
    [results, room],
  );
  const playersById = useMemo(() => new Map(players.map((player) => [player.id, player])), [players]);

  if (!results) {
    return (
      <div className={styles.page}>
        <p className={styles.loading}>מחשבים תוצאות…</p>
      </div>
    );
  }

  const winner = results.leaderboard[0];
  const distances = results.rounds.flatMap((round) =>
    round.guesses.map((guess) => guess.distanceKm).filter((value): value is number => value !== null),
  );
  const average = distances.length > 0 ? distances.reduce((sum, value) => sum + value, 0) / distances.length : null;

  return (
    <div className={styles.page}>
      <Confetti active />

      <header className={styles.header}>
        <div className={styles.headerInfo}>
          <h1 className={styles.title}>🏆 טבלת הניצחון</h1>
          {results.endedEarly ? <span className={styles.earlyTag}>המשחק הופסק מוקדם</span> : null}
        </div>
      </header>

      <main className={styles.stage}>
        <div className={`${styles.actPane} ${styles.podiumPane}`}>
          <motion.p
            className={styles.winnerLine}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.5 }}
            data-testid="winner-line"
          >
            🎉 {winner ? `${winner.player.name} יודע/ת הכי טוב איפה זה!` : 'כל הכבוד לכולם!'}
          </motion.p>
          <Podium entries={results.leaderboard.slice(0, 3)} />
        </div>

        <div className={`${styles.actPane} ${styles.leaderboardPane}`}>
          <div className={styles.summaryStats}>
            <Stat label="שחקנים" value={results.leaderboard.length} />
            <Stat label="סיבובים" value={results.rounds.length} />
            <Stat label="מרחק ממוצע" value={average === null ? '—' : formatDistance(average)} tone="primary" />
          </div>
          <Leaderboard entries={results.leaderboard} />

          <h2 className={styles.roundsTitle}>המקומות במשחק</h2>
          <ol className={styles.rounds}>
            {results.rounds.map((round) => {
              const best = [...round.guesses]
                .filter((guess) => guess.distanceKm !== null)
                .sort((a, b) => a.distanceKm! - b.distanceKm!)[0];
              return (
                <li key={round.index} className={styles.roundRow}>
                  <span className={styles.roundName}>
                    {round.place.name}
                    <small>
                      {' '}
                      · {round.place.city}, {round.place.country}
                    </small>
                  </span>
                  {best ? (
                    <span className={styles.roundBest}>
                      הכי קרוב: {playersById.get(best.playerId)?.name ?? 'שחקן'} ({formatDistance(best.distanceKm!)})
                    </span>
                  ) : (
                    <span className={styles.roundBest}>אף אחד לא ניחש</span>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      </main>

      <footer className={styles.footer}>
        <Button variant="ghost" onClick={endHostSession}>
          סגירת החדר
        </Button>
        <Button size="lg" icon="🔄" onClick={() => void restartGame()} data-testid="restart-game">
          משחק חדש עם אותם שחקנים
        </Button>
      </footer>
    </div>
  );
}

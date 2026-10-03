/**
 * טבלת הניצחון בסוף המשחק: פודיום, טבלת דירוג מלאה, וסיכום קצר של
 * המקומות ששוחקו (מי היה הכי קרוב בכל סיבוב).
 */

import { useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { formatSeconds } from '@eifo/shared';

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
  const allAnswers = results.rounds.flatMap((round) => round.answers);
  const correctShare =
    allAnswers.length > 0 ? Math.round((100 * allAnswers.filter((answer) => answer.correct).length) / allAnswers.length) : 0;

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
            <Stat label="תשובות נכונות" value={`${correctShare}%`} tone="primary" />
          </div>
          <Leaderboard entries={results.leaderboard} />

          <h2 className={styles.roundsTitle}>המקומות במשחק</h2>
          <ol className={styles.rounds}>
            {results.rounds.map((round) => {
              const fastest = round.answers
                .filter((answer) => answer.correct && answer.elapsedMs !== null)
                .sort((a, b) => a.elapsedMs! - b.elapsedMs!)[0];
              return (
                <li key={round.index} className={styles.roundRow}>
                  <span className={styles.roundName}>
                    {round.place.name}
                    <small> · {round.options[round.correctIndex]}</small>
                  </span>
                  {fastest ? (
                    <span className={styles.roundBest}>
                      הכי מהיר/ה: {playersById.get(fastest.playerId)?.name ?? 'שחקן'} ({formatSeconds(fastest.elapsedMs!)})
                    </span>
                  ) : (
                    <span className={styles.roundBest}>אף אחד לא צדק</span>
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

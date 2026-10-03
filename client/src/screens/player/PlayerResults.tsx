/**
 * מסך הסיום של השחקן: המקום שלי, טבלת הניצחון, ופירוט התשובות שלי
 * בכל סיבוב.
 */

import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { formatSeconds, medalFor } from '@eifo/shared';

import { Leaderboard } from '../../components/results/Leaderboard';
import { Podium } from '../../components/results/Podium';
import { Button } from '../../components/ui/Button';
import { Confetti } from '../../components/ui/Confetti';
import { Stat } from '../../components/ui/misc';
import { useGameStore } from '../../state/gameStore';
import styles from './PlayerResults.module.css';

type Tab = 'board' | 'me';

export function PlayerResults(): JSX.Element {
  const results = useGameStore((store) => store.results);
  const playerId = useGameStore((store) => store.playerId);
  const leaveGame = useGameStore((store) => store.leaveGame);
  const [tab, setTab] = useState<Tab>('board');

  const myEntry = useMemo(
    () => results?.leaderboard.find((entry) => entry.player.id === playerId) ?? null,
    [playerId, results],
  );

  if (!results) {
    return (
      <main className={styles.page}>
        <p className={styles.loading}>מחשבים תוצאות…</p>
      </main>
    );
  }

  const medal = myEntry ? medalFor(myEntry.rank) : null;

  return (
    <main className={styles.page}>
      <Confetti active={(myEntry?.rank ?? 99) <= 3} durationMs={3_500} count={90} />

      <motion.header
        className={styles.hero}
        initial={{ opacity: 0, scale: 0.94 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.45, ease: [0.34, 1.56, 0.64, 1] }}
      >
        <span className={styles.heroMedal} aria-hidden="true">
          {medal ?? '🌍'}
        </span>
        <h1 className={styles.heroTitle} data-testid="my-rank">
          {myEntry ? `מקום ${myEntry.rank} מתוך ${results.leaderboard.length}` : 'המשחק הסתיים'}
        </h1>
        {myEntry ? (
          <div className={styles.heroStats}>
            <Stat label="נקודות" value={myEntry.totalPoints.toLocaleString('he-IL')} tone="primary" />
            <Stat label="תשובות נכונות" value={`${myEntry.correctAnswers}/${results.rounds.length}`} tone="accent" />
            <Stat
              label="זמן ממוצע"
              value={myEntry.averageCorrectMs === null ? '—' : formatSeconds(myEntry.averageCorrectMs)}
            />
          </div>
        ) : null}
      </motion.header>

      <div className={styles.tabs} role="tablist">
        <button className={`${styles.tab} ${tab === 'board' ? styles.tabActive : ''}`} onClick={() => setTab('board')} role="tab" aria-selected={tab === 'board'}>
          טבלת הניצחון
        </button>
        <button className={`${styles.tab} ${tab === 'me' ? styles.tabActive : ''}`} onClick={() => setTab('me')} role="tab" aria-selected={tab === 'me'}>
          התשובות שלי
        </button>
      </div>

      {tab === 'board' ? (
        <section className={styles.panel}>
          <Podium entries={results.leaderboard.slice(0, 3)} highlightPlayerId={playerId} />
          <Leaderboard entries={results.leaderboard} highlightPlayerId={playerId} />
        </section>
      ) : (
        <section className={styles.panel}>
          {results.rounds.map((round) => {
            const mine = round.answers.find((answer) => answer.playerId === playerId);
            const picked = mine?.choice != null ? round.options[mine.choice] : null;
            return (
              <div key={round.index} className={styles.roundCard}>
                <div className={styles.roundHead}>
                  <h2 className={styles.roundName}>
                    {round.index + 1}. {round.place.name}
                  </h2>
                  <span className={`${styles.tier} ${mine?.correct ? styles.tier_bullseye : picked ? styles.tier_far : styles.tier_none}`}>
                    {mine?.correct ? '✓ נכון' : picked ? '✗ טעות' : 'לא ענית'}
                  </span>
                </div>
                <p className={styles.fact}>
                  {round.options[round.correctIndex]}
                  {picked && !mine?.correct ? ` · בחרת: ${picked}` : ''} · +{(mine?.points ?? 0).toLocaleString('he-IL')}
                </p>
              </div>
            );
          })}
        </section>
      )}

      <footer className={styles.footer}>
        <Button variant="ghost" onClick={() => void leaveGame()}>
          יציאה
        </Button>
      </footer>
      <p className={styles.waitNote}>אם המארח יתחיל משחק חדש — תצורפו אליו אוטומטית.</p>
    </main>
  );
}

/**
 * מסך השחקן.
 *
 * מנתב בין הצטרפות, לובי, משחק וסיום. כמו אצל המנהל — מסך אחד
 * שמחליף תוכן, כדי שרענון או ניתוק לא יוציאו את השחקן מהמשחק.
 */

import { AnimatePresence, motion } from 'framer-motion';

import { FullScreenLoader } from '../../components/ui/misc';
import { useGameStore } from '../../state/gameStore';
import { PlayerJoin } from './PlayerJoin';
import { PlayerLobby } from './PlayerLobby';
import { PlayerResults } from './PlayerResults';
import { PlayerRound } from './PlayerRound';
import styles from './PlayerScreen.module.css';

export interface PlayerScreenProps {
  /** קוד המשחק מתוך הקישור. */
  readonly code: string;
}

export function PlayerScreen({ code }: PlayerScreenProps): JSX.Element {
  const room = useGameStore((store) => store.room);
  const role = useGameStore((store) => store.role);
  const restoring = useGameStore((store) => store.restoring);

  if (restoring) return <FullScreenLoader message="מתחברים למשחק…" />;

  if (!room || role !== 'player') {
    return (
      <div className={styles.screen}>
        <PlayerJoin initialCode={code} />
      </div>
    );
  }

  const stage = resolveStage(room.phase);

  return (
    <div className={styles.screen}>
      <AnimatePresence mode="wait">
        <motion.div
          key={stage}
          className={styles.stage}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
        >
          {stage === 'lobby' ? <PlayerLobby /> : null}
          {stage === 'playing' ? <PlayerRound /> : null}
          {stage === 'results' ? <PlayerResults /> : null}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function resolveStage(phase: string): 'lobby' | 'playing' | 'results' {
  if (phase === 'lobby') return 'lobby';
  if (phase === 'finished') return 'results';
  return 'playing';
}

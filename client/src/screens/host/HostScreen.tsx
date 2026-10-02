/**
 * מסך המנהל.
 *
 * מסך יחיד שמחליף תצוגה לפי שלב המשחק, במקום ניווט בין דפים:
 * המנהל לעולם לא "מאבד" את המשחק, וכפתור הרענון או ניתוק רשת
 * מחזירים אותו בדיוק לאותו מקום.
 */

import { AnimatePresence, motion } from 'framer-motion';

import { FullScreenLoader } from '../../components/ui/misc';
import { useGameStore } from '../../state/gameStore';
import { HostLobby } from './HostLobby';
import { HostResults } from './HostResults';
import { HostRound } from './HostRound';
import { HostSetup } from './HostSetup';
import styles from './HostScreen.module.css';

/** מעבר אחיד בין שלבים. */
const transition = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
  transition: { duration: 0.28, ease: [0.22, 1, 0.36, 1] as const },
};

export function HostScreen(): JSX.Element {
  const room = useGameStore((store) => store.room);
  const role = useGameStore((store) => store.role);
  const restoring = useGameStore((store) => store.restoring);

  if (restoring) return <FullScreenLoader message="מחפשים משחק פעיל…" />;

  // אין משחק פעיל — מסך יצירה.
  if (!room || role !== 'host') {
    return (
      <div className={styles.screen}>
        <HostSetup />
      </div>
    );
  }

  const stage = resolveStage(room.phase);

  return (
    <div className={styles.screen}>
      <AnimatePresence mode="wait">
        <motion.div key={stage} className={styles.stage} {...transition}>
          {stage === 'lobby' ? <HostLobby /> : null}
          {stage === 'playing' ? <HostRound /> : null}
          {stage === 'results' ? <HostResults /> : null}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/** ממפה את שלב המשחק לתצוגה המתאימה. */
function resolveStage(phase: string): 'lobby' | 'playing' | 'results' {
  if (phase === 'lobby') return 'lobby';
  if (phase === 'finished') return 'results';
  return 'playing';
}

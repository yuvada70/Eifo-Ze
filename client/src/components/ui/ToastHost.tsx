/**
 * שכבת ההודעות הקופצות.
 *
 * ההודעות מוצגות בתחתית המסך במובייל ובפינה במסכים גדולים, מוכרזות
 * לקוראי מסך, ונעלמות מעצמן. הן לעולם אינן חוסמות אינטראקציה.
 */

import { AnimatePresence, motion } from 'framer-motion';

import { useGameStore } from '../../state/gameStore';
import styles from './ToastHost.module.css';

const ICONS = {
  info: 'ℹ️',
  success: '✅',
  warn: '⚠️',
  error: '⛔',
} as const;

export function ToastHost(): JSX.Element {
  const toasts = useGameStore((store) => store.toasts);
  const dismiss = useGameStore((store) => store.dismissToast);

  return (
    <div className={styles.host} role="region" aria-label="הודעות מערכת">
      <AnimatePresence initial={false}>
        {toasts.map((toast) => (
          <motion.output
            key={toast.id}
            className={`${styles.toast} ${styles[toast.level]}`}
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            onClick={() => dismiss(toast.id)}
          >
            <span aria-hidden="true">{ICONS[toast.level]}</span>
            <span>{toast.message}</span>
          </motion.output>
        ))}
      </AnimatePresence>
    </div>
  );
}

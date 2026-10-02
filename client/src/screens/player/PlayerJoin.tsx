/**
 * מסך ההצטרפות של השחקן.
 *
 * החיכוך כאן חייב להיות מינימלי: מי שסרק QR מגיע עם הקוד ממולא
 * מראש, השם האחרון נשמר מהמשחק הקודם, והמקלדת נפתחת מיד. כל שדה
 * נוסף היה עולה לנו במשתתפים.
 */

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { motion } from 'framer-motion';
import {
  GAME_CODE_LENGTH,
  NAME_LIMITS,
  isValidGameCode,
  isValidPlayerName,
  normalizeGameCode,
  sanitizePlayerName,
} from '@eifo/shared';

import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/misc';
import { useGameStore } from '../../state/gameStore';
import styles from './PlayerJoin.module.css';

export interface PlayerJoinProps {
  readonly initialCode: string;
}

export function PlayerJoin({ initialCode }: PlayerJoinProps): JSX.Element {
  const joinGame = useGameStore((store) => store.joinGame);
  const lastName = useGameStore((store) => store.playerName);

  const [code, setCode] = useState(() => normalizeGameCode(initialCode));
  const [name, setName] = useState(lastName);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  const nameRef = useRef<HTMLInputElement>(null);

  // כשהקוד כבר ידוע (הגעה מ-QR) — הפוקוס עובר ישר לשדה השם.
  useEffect(() => {
    if (isValidGameCode(code)) nameRef.current?.focus();
  }, [code]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    const normalizedCode = normalizeGameCode(code);
    if (!isValidGameCode(normalizedCode)) {
      setError(`קוד המשחק מורכב מ-${GAME_CODE_LENGTH} תווים`);
      return;
    }

    const cleanName = sanitizePlayerName(name);
    if (!isValidPlayerName(cleanName)) {
      setError(`השם צריך להיות באורך ${NAME_LIMITS.min}–${NAME_LIMITS.max} תווים`);
      return;
    }

    setJoining(true);
    const result = await joinGame(normalizedCode, cleanName);
    setJoining(false);

    if (!result.ok) setError(result.message);
  };

  return (
    <main className={styles.page}>
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className={styles.wrapper}
      >
        <header className={styles.header}>
          <span className={styles.logo} aria-hidden="true">
            🌍
          </span>
          <h1 className={styles.title}>איפה זה?</h1>
          <p className={styles.subtitle}>הצטרפות למשחק</p>
        </header>

        <Card className={styles.card}>
          <form className={styles.form} onSubmit={submit} noValidate>
            <label className={styles.field}>
              <span className={styles.label}>קוד המשחק</span>
              <input
                className={`${styles.input} ${styles.codeInput} tabular`}
                value={code}
                onChange={(event) => setCode(normalizeGameCode(event.target.value))}
                placeholder="ABCDE"
                inputMode="text"
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                maxLength={GAME_CODE_LENGTH}
                dir="ltr"
                required
              />
            </label>

            <label className={styles.field}>
              <span className={styles.label}>איך קוראים לך?</span>
              <input
                ref={nameRef}
                className={styles.input}
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="השם שיוצג לכולם"
                autoComplete="nickname"
                maxLength={NAME_LIMITS.max}
                enterKeyHint="go"
                required
              />
            </label>

            {error ? (
              <p className={styles.error} role="alert">
                {error}
              </p>
            ) : null}

            <Button type="submit" size="lg" block loading={joining} icon="🎮" data-testid="join-submit">
              הצטרפות למשחק
            </Button>
          </form>
        </Card>

        <p className={styles.footnote}>
          אין צורך בהתקנה או בהרשמה. השם משמש לתצוגה בלבד.
        </p>
      </motion.div>
    </main>
  );
}

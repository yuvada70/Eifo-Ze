/**
 * מסך הפתיחה.
 *
 * שתי דרכי כניסה בלבד — לארח או להצטרף — כי כל בחירה נוספת בשלב
 * הזה רק מאטה את המשתמש. הזנת קוד ידנית זמינה למי שאין לו QR.
 */

import { useState, type FormEvent } from 'react';
import { motion } from 'framer-motion';
import { GAME_CODE_LENGTH, isValidGameCode, normalizeGameCode } from '@eifo/shared';

import { Button } from '../components/ui/Button';
import { paths, useRouter } from '../router';
import styles from './Landing.module.css';

export function Landing(): JSX.Element {
  const { navigate } = useRouter();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submitCode = (event: FormEvent) => {
    event.preventDefault();

    const normalized = normalizeGameCode(code);
    if (!isValidGameCode(normalized)) {
      setError(`קוד המשחק מורכב מ-${GAME_CODE_LENGTH} תווים`);
      return;
    }

    navigate(paths.join(normalized));
  };

  return (
    <main className={styles.page}>
      <motion.div
        className={styles.hero}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className={styles.content}>
          <span className={styles.eyebrow}>טריוויה גיאוגרפית מרובת משתתפים</span>
          <h1 className={styles.title}>
            רואים תמונה.
            <br />
            <span className={styles.titleAccent}>איפה זה?</span>
          </h1>
          <p className={styles.subtitle}>
            עיר, מונומנט או פלא טבע — מסמנים על מפת העולם איפה לדעתכם צולמה התמונה, ומקבלים
            נקודות לפי המרחק מהמקום האמיתי. ככל שקרוב יותר — כך יותר נקודות.
          </p>

          <div className={styles.actions}>
            <Button size="lg" icon="🎬" onClick={() => navigate(paths.host())} data-testid="go-host">
              יצירת חדר חדש
            </Button>
          </div>

          <form className={styles.joinForm} onSubmit={submitCode}>
            <label className={styles.joinLabel} htmlFor="game-code">
              יש לכם קוד משחק?
            </label>
            <div className={styles.joinRow}>
              <input
                id="game-code"
                className={`${styles.codeInput} tabular`}
                value={code}
                onChange={(event) => {
                  setCode(normalizeGameCode(event.target.value));
                  setError(null);
                }}
                placeholder="ABCDE"
                inputMode="text"
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                maxLength={GAME_CODE_LENGTH}
                dir="ltr"
                aria-invalid={error !== null}
              />
              <Button type="submit" variant="secondary" size="lg">
                הצטרפות
              </Button>
            </div>
            {error ? (
              <p className={styles.error} role="alert">
                {error}
              </p>
            ) : null}
          </form>
        </div>

        <div className={styles.globe} aria-hidden="true">
          🌍
        </div>
      </motion.div>

      <section className={styles.features}>
        {[
          { icon: '📱', title: 'הצטרפות בסריקה', text: 'סורקים QR, מזינים שם, ומשחקים. בלי התקנה ובלי הרשמה.' },
          { icon: '🗺️', title: 'מפה אמיתית', text: 'מפת עולם עם זום וגרירה — ובקטגוריית ישראל, המפה נפתחת על הארץ.' },
          { icon: '🎯', title: 'ניקוד לפי מרחק', text: 'אחרי כל סיבוב: המקום האמיתי, הניחושים של כולם והמרחק של כל אחד.' },
          { icon: '📷', title: 'תמונות חופשיות', text: 'כל התמונות מ-Wikimedia Commons ברישיון חופשי, עם קרדיט לצלם.' },
        ].map((feature) => (
          <div key={feature.title} className={styles.feature}>
            <span className={styles.featureIcon} aria-hidden="true">
              {feature.icon}
            </span>
            <h2 className={styles.featureTitle}>{feature.title}</h2>
            <p className={styles.featureText}>{feature.text}</p>
          </div>
        ))}
      </section>
    </main>
  );
}

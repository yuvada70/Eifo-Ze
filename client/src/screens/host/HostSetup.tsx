/**
 * יצירת חדר חדש: קטגוריה, דרגת קושי, מספר סיבובים וזמן לסיבוב.
 *
 * ברירות המחדל: מעורב · קל · 10 סיבובים · 30 שניות. ליד כל בחירה
 * מוצג כמה מקומות יש במאגר, ואם יש פחות מהמבוקש — מופיעה הודעה
 * שהמשחק יכלול רק את מה שיש.
 */

import { useEffect, useState } from 'react';
import {
  CATEGORY_ICONS,
  CATEGORY_LABELS,
  CONTENT_CATEGORIES,
  DEFAULT_SETTINGS,
  DIFFICULTIES,
  DIFFICULTY_DESCRIPTIONS,
  DIFFICULTY_LABELS,
  ROUND_COUNT_OPTIONS,
  ROUND_DURATION_OPTIONS,
  type GameSettings,
  type PoolCounts,
} from '@eifo/shared';

import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/misc';
import { useGameStore } from '../../state/gameStore';
import { paths, useRouter } from '../../router';
import styles from './HostSetup.module.css';

export function HostSetup(): JSX.Element {
  const createGame = useGameStore((store) => store.createGame);
  const { navigate } = useRouter();

  const [settings, setSettings] = useState<GameSettings>(DEFAULT_SETTINGS);
  const [pools, setPools] = useState<PoolCounts | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/pools')
      .then((response) => (response.ok ? response.json() : null))
      .then((data: PoolCounts | null) => !cancelled && setPools(data))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const update = <K extends keyof GameSettings>(key: K, value: GameSettings[K]) =>
    setSettings((current) => ({ ...current, [key]: value }));

  const available = pools?.[settings.category]?.[settings.difficulty] ?? null;
  const shortage = available !== null && available < settings.roundCount;

  const handleCreate = async () => {
    setCreating(true);
    await createGame(settings);
    setCreating(false);
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button className={styles.back} onClick={() => navigate(paths.landing())}>
          → חזרה
        </button>
        <h1 className={styles.title}>חדר חדש</h1>
        <p className={styles.subtitle}>בחרו קטגוריה ודרגת קושי, ואז שתפו את הקוד עם השחקנים.</p>
      </header>

      <Card className={styles.card}>
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>קטגוריה</h2>
          <div className={styles.packs}>
            {CONTENT_CATEGORIES.map((category) => (
              <button
                key={category}
                className={`${styles.pack} ${settings.category === category ? styles.packActive : ''}`}
                onClick={() => update('category', category)}
                aria-pressed={settings.category === category}
                data-testid={`category-${category}`}
              >
                <span className={styles.packName}>
                  {CATEGORY_ICONS[category]} {CATEGORY_LABELS[category]}
                </span>
                {pools ? (
                  <span className={styles.packCount}>
                    {pools[category][settings.difficulty]} מקומות ב{DIFFICULTY_LABELS[settings.difficulty]}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>דרגת קושי</h2>
          <div className={styles.chips}>
            {DIFFICULTIES.map((difficulty) => (
              <button
                key={difficulty}
                className={`${styles.chip} ${settings.difficulty === difficulty ? styles.chipActive : ''}`}
                onClick={() => update('difficulty', difficulty)}
                aria-pressed={settings.difficulty === difficulty}
                data-testid={`difficulty-${difficulty}`}
              >
                {DIFFICULTY_LABELS[difficulty]}
              </button>
            ))}
          </div>
          <p className={styles.packDescription}>{DIFFICULTY_DESCRIPTIONS[settings.difficulty]}. הדרגה משפיעה רק על בחירת המקומות, לא על הניקוד.</p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>מספר סיבובים</h2>
          <div className={styles.chips}>
            {ROUND_COUNT_OPTIONS.map((count) => (
              <button
                key={count}
                className={`${styles.chip} ${settings.roundCount === count ? styles.chipActive : ''}`}
                onClick={() => update('roundCount', count)}
                aria-pressed={settings.roundCount === count}
                data-testid={`rounds-${count}`}
              >
                {count}
              </button>
            ))}
          </div>
          {shortage ? (
            <p className={styles.warning} role="status">
              ⚠️ במאגר יש רק {available} מקומות לשילוב הזה — המשחק יכלול {available} סיבובים.
            </p>
          ) : null}
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>זמן לכל סיבוב</h2>
          <div className={styles.chips}>
            {ROUND_DURATION_OPTIONS.map((seconds) => (
              <button
                key={seconds}
                className={`${styles.chip} ${settings.roundDurationMs === seconds * 1_000 ? styles.chipActive : ''}`}
                onClick={() => update('roundDurationMs', seconds * 1_000)}
                aria-pressed={settings.roundDurationMs === seconds * 1_000}
              >
                {seconds} שנ׳
              </button>
            ))}
          </div>
        </section>
      </Card>

      <Button
        size="lg"
        block
        loading={creating}
        onClick={handleCreate}
        icon="🚀"
        disabled={available === 0}
        data-testid="create-room"
      >
        יצירת חדר
      </Button>
    </div>
  );
}

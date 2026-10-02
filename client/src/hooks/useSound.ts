/**
 * אפקטי קול מסונתזים.
 *
 * הצלילים נוצרים ב-Web Audio API ולא מקובצי שמע: אפס בקשות רשת,
 * אפס משקל בחבילה, והשהיה אפסית — קריטי לטיימר של 5 שניות שבו
 * צליל שמאחר בחצי שנייה מרגיש שבור.
 *
 * הקול תמיד ניתן לכיבוי, ומופעל רק לאחר אינטראקציה של המשתמש
 * (כפי שדורשים דפדפני מובייל).
 */

import { useCallback, useEffect, useRef } from 'react';

import { useGameStore } from '../state/gameStore';

/** סוגי הצלילים במשחק. */
export type SoundName =
  /** תחילת סיבוב. */
  | 'roundStart'
  /** תקתוק בשלוש השניות האחרונות. */
  | 'tick'
  /** נקלט סימון. */
  | 'place'
  /** סיום סיבוב. */
  | 'roundEnd'
  /** חשיפת תוצאה במסך הסיכום. */
  | 'reveal'
  /** חגיגת סיום. */
  | 'fanfare';

/** תיאור צליל: תדרים, משך ועוצמה. */
interface SoundRecipe {
  readonly notes: readonly { readonly frequency: number; readonly at: number; readonly duration: number }[];
  readonly type: OscillatorType;
  readonly gain: number;
}

const RECIPES: Record<SoundName, SoundRecipe> = {
  roundStart: {
    type: 'triangle',
    gain: 0.16,
    notes: [
      { frequency: 660, at: 0, duration: 0.09 },
      { frequency: 880, at: 0.08, duration: 0.14 },
    ],
  },
  tick: {
    type: 'square',
    gain: 0.07,
    notes: [{ frequency: 1_180, at: 0, duration: 0.045 }],
  },
  place: {
    type: 'sine',
    gain: 0.13,
    notes: [
      { frequency: 520, at: 0, duration: 0.06 },
      { frequency: 780, at: 0.05, duration: 0.09 },
    ],
  },
  roundEnd: {
    type: 'sawtooth',
    gain: 0.11,
    notes: [
      { frequency: 420, at: 0, duration: 0.1 },
      { frequency: 300, at: 0.09, duration: 0.16 },
    ],
  },
  reveal: {
    type: 'triangle',
    gain: 0.14,
    notes: [
      { frequency: 587, at: 0, duration: 0.08 },
      { frequency: 784, at: 0.07, duration: 0.12 },
    ],
  },
  fanfare: {
    type: 'triangle',
    gain: 0.18,
    notes: [
      { frequency: 523, at: 0, duration: 0.14 },
      { frequency: 659, at: 0.13, duration: 0.14 },
      { frequency: 784, at: 0.26, duration: 0.16 },
      { frequency: 1_047, at: 0.42, duration: 0.34 },
    ],
  },
};

/** ההקשר משותף לכל הרכיבים — הדפדפן מגביל את מספר ההקשרים. */
let audioContext: AudioContext | null = null;

function ensureContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;

  const AudioContextClass =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return null;

  audioContext ??= new AudioContextClass();
  if (audioContext.state === 'suspended') void audioContext.resume();
  return audioContext;
}

/**
 * מחזיר פונקציית ניגון המכבדת את העדפת הקול של המשתמש.
 */
export function useSound(): (name: SoundName) => void {
  const soundEnabled = useGameStore((store) => store.preferences.soundEnabled);
  const enabledRef = useRef(soundEnabled);
  enabledRef.current = soundEnabled;

  // דפדפני מובייל דורשים מחווה של המשתמש כדי לאפשר שמע.
  useEffect(() => {
    const unlock = () => void ensureContext();
    window.addEventListener('pointerdown', unlock, { once: true, passive: true });
    return () => window.removeEventListener('pointerdown', unlock);
  }, []);

  return useCallback((name: SoundName) => {
    if (!enabledRef.current) return;

    const context = ensureContext();
    if (!context) return;

    const recipe = RECIPES[name];
    const startAt = context.currentTime;

    for (const note of recipe.notes) {
      const oscillator = context.createOscillator();
      const amplifier = context.createGain();

      oscillator.type = recipe.type;
      oscillator.frequency.setValueAtTime(note.frequency, startAt + note.at);

      // מעטפת קצרה — מונעת "קליק" בתחילת ובסוף הצליל.
      amplifier.gain.setValueAtTime(0.0001, startAt + note.at);
      amplifier.gain.exponentialRampToValueAtTime(recipe.gain, startAt + note.at + 0.012);
      amplifier.gain.exponentialRampToValueAtTime(0.0001, startAt + note.at + note.duration);

      oscillator.connect(amplifier).connect(context.destination);
      oscillator.start(startAt + note.at);
      oscillator.stop(startAt + note.at + note.duration + 0.02);
    }
  }, []);
}

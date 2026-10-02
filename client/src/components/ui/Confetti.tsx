/**
 * אפקט קונפטי לרגעי החגיגה (פודיום וסיום משחק).
 *
 * מימוש עצמאי על גבי Canvas, ללא ספריית צד שלישי: כמה עשרות שורות
 * מול עוד חבילה בחבילת ההפצה. החלקיקים מצוירים ב-requestAnimationFrame
 * ומפסיקים מעצמם, ולכן אין דליפת משאבים.
 *
 * הרכיב מכבד את ההעדפה prefers-reduced-motion ולא מצייר כלל כשהיא פעילה.
 */

import { useEffect, useRef } from 'react';

import styles from './Confetti.module.css';

export interface ConfettiProps {
  /** האם להריץ את האפקט. */
  readonly active: boolean;
  /** משך הפיזור במילישניות. */
  readonly durationMs?: number;
  /** מספר החלקיקים. */
  readonly count?: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  spin: number;
  width: number;
  height: number;
  color: string;
}

const COLORS = ['#21d4b4', '#ffc247', '#ff6b6b', '#66aaff', '#ffd257', '#ffffff'];

export function Confetti({ active, durationMs = 4_500, count = 140 }: ConfettiProps): JSX.Element | null {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!active) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;

    const pixelRatio = Math.min(2, window.devicePixelRatio || 1);
    const resize = () => {
      canvas.width = window.innerWidth * pixelRatio;
      canvas.height = window.innerHeight * pixelRatio;
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const width = () => canvas.width / pixelRatio;
    const height = () => canvas.height / pixelRatio;

    const particles: Particle[] = Array.from({ length: count }, () => ({
      x: Math.random() * width(),
      y: -20 - Math.random() * height() * 0.6,
      vx: (Math.random() - 0.5) * 1.6,
      vy: 1.6 + Math.random() * 2.8,
      rotation: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 0.22,
      width: 6 + Math.random() * 7,
      height: 9 + Math.random() * 9,
      color: COLORS[Math.floor(Math.random() * COLORS.length)]!,
    }));

    const startedAt = performance.now();
    let frame = 0;

    const draw = (now: number) => {
      const elapsed = now - startedAt;
      // דעיכה הדרגתית בשליש האחרון, כדי שהאפקט ייעלם בעדינות.
      const fade = elapsed > durationMs * 0.66 ? Math.max(0, 1 - (elapsed - durationMs * 0.66) / (durationMs * 0.34)) : 1;

      context.clearRect(0, 0, width(), height());
      context.globalAlpha = fade;

      for (const particle of particles) {
        particle.x += particle.vx;
        particle.y += particle.vy;
        particle.rotation += particle.spin;
        // התנגדות אוויר קלה + כוח משיכה.
        particle.vy = Math.min(6, particle.vy + 0.014);
        particle.vx *= 0.998;

        if (particle.y > height() + 30) {
          particle.y = -20;
          particle.x = Math.random() * width();
        }

        context.save();
        context.translate(particle.x, particle.y);
        context.rotate(particle.rotation);
        context.fillStyle = particle.color;
        context.fillRect(-particle.width / 2, -particle.height / 2, particle.width, particle.height);
        context.restore();
      }

      if (elapsed < durationMs) {
        frame = window.requestAnimationFrame(draw);
      } else {
        context.clearRect(0, 0, width(), height());
      }
    };

    frame = window.requestAnimationFrame(draw);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
    };
  }, [active, count, durationMs]);

  if (!active) return null;

  return <canvas ref={canvasRef} className={styles.canvas} aria-hidden="true" />;
}

/**
 * מרשם החדרים הפעילים.
 *
 * המימוש הנוכחי מחזיק את החדרים בזיכרון התהליך — הבחירה הנכונה
 * למשחק חי קצר-מועד: אפס תלות תפעולית ואפס השהיה. המנשק
 * {@link RoomStore} מפריד בין הלוגיקה לאחסון, כך שמעבר עתידי
 * ל-Redis (למשל לצורך ריצה על כמה מכונות) הוא החלפת מימוש בלבד.
 */

import { randomInt } from 'node:crypto';

import { GAME_CODE_ALPHABET, GAME_CODE_LENGTH, type GameSettings } from '@eifo/shared';

import type { PlacesStore } from '../content/placesStore.js';
import { logger } from '../logger.js';
import { GameError, GameRoom, type RoomListeners, type Scheduler, systemScheduler } from './GameRoom.js';

/** מנשק אחסון חדרים. */
export interface RoomStore {
  get(code: string): GameRoom | undefined;
  set(code: string, room: GameRoom): void;
  delete(code: string): void;
  values(): Iterable<GameRoom>;
  readonly size: number;
}

/** אחסון בזיכרון התהליך. */
class InMemoryRoomStore implements RoomStore {
  private readonly rooms = new Map<string, GameRoom>();

  get(code: string): GameRoom | undefined {
    return this.rooms.get(code);
  }

  set(code: string, room: GameRoom): void {
    this.rooms.set(code, room);
  }

  delete(code: string): void {
    this.rooms.delete(code);
  }

  values(): Iterable<GameRoom> {
    return this.rooms.values();
  }

  get size(): number {
    return this.rooms.size;
  }
}

/** אפשרויות המרשם. */
export interface RoomRegistryOptions {
  /** משך חוסר פעילות שאחריו החדר נסגר. */
  readonly roomTtlMs: number;
  /** מספר החדרים המרבי. */
  readonly maxRooms: number;
  /** מאגר המקומות שממנו נבחרים הסיבובים. */
  readonly places: PlacesStore;
  readonly scheduler?: Scheduler;
}

/** מרשם החדרים: יצירה, איתור, וניקוי אוטומטי. */
export class RoomRegistry {
  private readonly store: RoomStore = new InMemoryRoomStore();
  private readonly scheduler: Scheduler;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly listeners: RoomListeners,
    private readonly options: RoomRegistryOptions,
  ) {
    this.scheduler = options.scheduler ?? systemScheduler;
  }

  /**
   * יוצר חדר חדש עם קוד ייחודי.
   * @throws {GameError} כשהשרת הגיע למספר החדרים המרבי.
   */
  create(settings: Partial<GameSettings>): GameRoom {
    if (this.store.size >= this.options.maxRooms) {
      // ניקוי מיידי לפני דחייה — ייתכן שיש חדרים נטושים שפג תוקפם.
      this.cleanupExpired();
      if (this.store.size >= this.options.maxRooms) {
        throw new GameError('SERVER_ERROR', 'השרת עמוס — נסו שוב בעוד רגע');
      }
    }

    const code = this.generateUniqueCode();
    const room = new GameRoom(code, settings, this.listeners, this.options.places, this.scheduler);
    this.store.set(code, room);

    logger.info('room.created', { code, activeRooms: this.store.size });
    return room;
  }

  /** מאתר חדר לפי קוד. */
  find(code: string): GameRoom | undefined {
    return this.store.get(code);
  }

  /** סוגר חדר ומשחרר את משאביו. */
  close(code: string, reason: string): void {
    const room = this.store.get(code);
    if (!room) return;

    room.dispose();
    this.store.delete(code);
    logger.info('room.closed', { code, reason, activeRooms: this.store.size });
  }

  /** מספר החדרים הפעילים — לניטור. */
  get activeRooms(): number {
    return this.store.size;
  }

  /** מפעיל את מנגנון הניקוי התקופתי. */
  startCleanup(intervalMs: number): void {
    if (this.cleanupTimer) return;
    this.cleanupTimer = setInterval(() => this.cleanupExpired(), intervalMs);
    this.cleanupTimer.unref?.();
  }

  /** עוצר את מנגנון הניקוי (בכיבוי מסודר). */
  stopCleanup(): void {
    if (!this.cleanupTimer) return;
    clearInterval(this.cleanupTimer);
    this.cleanupTimer = null;
  }

  /** מסיר חדרים נטושים שחלף זמן חוסר הפעילות שלהם. */
  cleanupExpired(): number {
    const now = this.scheduler.now();
    let removed = 0;

    for (const room of this.store.values()) {
      const idleMs = now - room.lastActivityAt;
      if (room.isDormant && idleMs > this.options.roomTtlMs) {
        this.close(room.code, 'expired');
        removed += 1;
      }
    }

    return removed;
  }

  /** משחרר את כל החדרים (כיבוי התהליך). */
  disposeAll(): void {
    this.stopCleanup();
    for (const room of [...this.store.values()]) {
      this.close(room.code, 'shutdown');
    }
  }

  /**
   * מייצר קוד ייחודי מהאלפבית הלא-דו-משמעי.
   * משתמש ב-randomInt הקריפטוגרפי כדי שלא ניתן יהיה לנחש קודים של
   * משחקים פעילים ולהצטרף אליהם.
   */
  private generateUniqueCode(): string {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      let code = '';
      for (let i = 0; i < GAME_CODE_LENGTH; i += 1) {
        code += GAME_CODE_ALPHABET[randomInt(GAME_CODE_ALPHABET.length)];
      }
      if (!this.store.get(code)) return code;
    }

    throw new GameError('SERVER_ERROR', 'לא הצלחנו לייצר קוד משחק פנוי');
  }
}

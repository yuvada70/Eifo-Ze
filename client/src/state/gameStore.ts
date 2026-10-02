/**
 * מאגר המצב הגלובלי של הלקוח.
 *
 * המאגר הוא ההשתקפות של מצב השרת בצד הלקוח, ולא מקור אמת נוסף:
 * כל שינוי מגיע מאירועי השרת, וכל פעולת משתמש עוברת דרך השרת
 * וממתינה לאישור. כך אין מצב שבו שני מסכים מציגים דברים שונים.
 */

import { create } from 'zustand';
import type {
  GameResults,
  GameSettings,
  LatLng,
  PlayerPrivateState,
  PublicGameState,
} from '@eifo/shared';

import { getSocket, request, synchronizeClock } from '../net/socket';
import {
  hostSessionStorage,
  lastNameStorage,
  playerSessionStorage,
  preferencesStorage,
  type Preferences,
} from './persistence';

/** מצב החיבור לשרת, לתצוגת מחוון בממשק. */
export type ConnectionStatus = 'connecting' | 'online' | 'reconnecting' | 'offline';

/** הודעה קופצת. */
export interface Toast {
  readonly id: number;
  readonly level: 'info' | 'success' | 'warn' | 'error';
  readonly message: string;
}

/** תוצאת פעולה שהוחזרה לרכיב הקורא. */
export type ActionResult = { ok: true } | { ok: false; message: string };

interface GameStoreState {
  /* ── מצב כללי ── */
  connection: ConnectionStatus;
  role: 'host' | 'player' | null;
  room: PublicGameState | null;
  self: PlayerPrivateState | null;
  results: GameResults | null;
  toasts: Toast[];
  preferences: Preferences;

  /* ── הפעלת מנהל ── */
  hostCode: string | null;
  joinUrl: string | null;

  /* ── הפעלת שחקן ── */
  playerId: string | null;
  playerName: string;

  /** האם מתבצע כרגע ניסיון שחזור הפעלה. */
  restoring: boolean;
}

interface GameStoreActions {
  /** מתחבר לשרת ורושם את מאזיני האירועים. נקרא פעם אחת בעליית האפליקציה. */
  initialize(): void;

  /* ── פעולות מנהל ── */
  createGame(settings: Partial<GameSettings>): Promise<ActionResult>;
  restoreHostSession(): Promise<boolean>;
  updateSettings(settings: Partial<GameSettings>): Promise<ActionResult>;
  startGame(): Promise<ActionResult>;
  pauseGame(): Promise<ActionResult>;
  resumeGame(): Promise<ActionResult>;
  skipRound(): Promise<ActionResult>;
  stopGame(): Promise<ActionResult>;
  restartGame(): Promise<ActionResult>;
  kickPlayer(playerId: string): Promise<ActionResult>;
  endHostSession(): void;

  /* ── פעולות שחקן ── */
  joinGame(code: string, name: string): Promise<ActionResult>;
  restorePlayerSession(): Promise<boolean>;
  submitGuess(point: LatLng): Promise<ActionResult>;
  leaveGame(): Promise<void>;

  /* ── ממשק ── */
  pushToast(level: Toast['level'], message: string): void;
  dismissToast(id: number): void;
  setPreferences(preferences: Partial<Preferences>): void;
}

export type GameStore = GameStoreState & GameStoreActions;

let toastSequence = 0;
let initialized = false;

export const useGameStore = create<GameStore>((set, get) => ({
  connection: 'connecting',
  role: null,
  room: null,
  self: null,
  results: null,
  toasts: [],
  preferences: preferencesStorage.load(),
  hostCode: null,
  joinUrl: null,
  playerId: null,
  playerName: lastNameStorage.load(),
  restoring: true,

  initialize() {
    if (initialized) return;
    initialized = true;

    const socket = getSocket();

    socket.on('connect', () => {
      set({ connection: 'online' });
      void synchronizeClock();

      // חיבור מחדש אוטומטי לאחר נפילת רשת — השחקן לא צריך לעשות דבר.
      const { role } = get();
      if (role === 'host') void get().restoreHostSession();
      else if (role === 'player') void get().restorePlayerSession();
    });

    socket.io.on('reconnect_attempt', () => set({ connection: 'reconnecting' }));
    socket.on('disconnect', () => set({ connection: 'offline' }));
    socket.io.on('error', () => set({ connection: 'offline' }));

    socket.on('room:state', (room) => set({ room }));
    socket.on('player:self', (self) => set({ self }));
    socket.on('game:results', (results) => set({ results }));

    socket.on('notice', ({ level, message }) => {
      get().pushToast(level === 'warn' ? 'warn' : 'info', message);
    });

    socket.on('room:closed', ({ reason }) => {
      const messages: Record<typeof reason, string> = {
        host_left: 'המארח סגר את החדר',
        expired: 'המשחק הסתיים עקב חוסר פעילות',
        kicked: 'הוצאת מהחדר על ידי המארח',
      };
      get().pushToast('warn', messages[reason]);

      playerSessionStorage.clear();
      set({ role: null, room: null, self: null, results: null, playerId: null });
    });

    // ניסיון שחזור הפעלה קודמת מיד עם העלייה.
    void (async () => {
      const restoredHost = await get().restoreHostSession();
      if (!restoredHost) await get().restorePlayerSession();
      set({ restoring: false });
    })();
  },

  /* ────────────────────────────── מנהל ────────────────────────────── */

  async createGame(settings) {
    const response = await request<{
      code: string;
      hostToken: string;
      joinUrl: string;
      state: PublicGameState;
    }>('host:create', { settings });

    if (!response.ok) {
      get().pushToast('error', response.message);
      return { ok: false, message: response.message };
    }

    hostSessionStorage.save({ code: response.data.code, hostToken: response.data.hostToken });
    set({
      role: 'host',
      hostCode: response.data.code,
      joinUrl: response.data.joinUrl,
      room: response.data.state,
      results: null,
    });
    return { ok: true };
  },

  async restoreHostSession() {
    const session = hostSessionStorage.load();
    if (!session) return false;

    const response = await request<{
      state: PublicGameState;
      results: GameResults | null;
      joinUrl: string;
    }>('host:attach', { code: session.code, hostToken: session.hostToken });

    if (!response.ok) {
      hostSessionStorage.clear();
      return false;
    }

    set({
      role: 'host',
      hostCode: session.code,
      joinUrl: response.data.joinUrl,
      room: response.data.state,
      results: response.data.results,
    });
    return true;
  },

  async updateSettings(settings) {
    return runHostCommand(get, 'host:updateSettings', { settings });
  },
  async startGame() {
    return runHostCommand(get, 'host:start');
  },
  async pauseGame() {
    return runHostCommand(get, 'host:pause');
  },
  async resumeGame() {
    return runHostCommand(get, 'host:resume');
  },
  async skipRound() {
    return runHostCommand(get, 'host:skip');
  },
  async stopGame() {
    return runHostCommand(get, 'host:stop');
  },

  async restartGame() {
    const result = await runHostCommand(get, 'host:restart');
    if (result.ok) set({ results: null });
    return result;
  },

  async kickPlayer(playerId) {
    return runHostCommand(get, 'host:kick', { playerId });
  },

  endHostSession() {
    hostSessionStorage.clear();
    set({ role: null, hostCode: null, joinUrl: null, room: null, results: null });
  },

  /* ────────────────────────────── שחקן ────────────────────────────── */

  async joinGame(code, name) {
    const response = await request<{
      playerId: string;
      playerToken: string;
      state: PublicGameState;
      self: PlayerPrivateState;
      results: GameResults | null;
    }>('player:join', { code, name });

    if (!response.ok) return { ok: false, message: response.message };

    lastNameStorage.save(name);
    playerSessionStorage.save({
      code,
      playerId: response.data.playerId,
      playerToken: response.data.playerToken,
      name,
    });

    set({
      role: 'player',
      playerId: response.data.playerId,
      playerName: name,
      room: response.data.state,
      self: response.data.self,
      results: response.data.results,
    });
    return { ok: true };
  },

  async restorePlayerSession() {
    const session = playerSessionStorage.load();
    if (!session) return false;

    const response = await request<{
      playerId: string;
      playerToken: string;
      state: PublicGameState;
      self: PlayerPrivateState;
      results: GameResults | null;
    }>('player:attach', { code: session.code, playerToken: session.playerToken });

    if (!response.ok) {
      playerSessionStorage.clear();
      return false;
    }

    set({
      role: 'player',
      playerId: response.data.playerId,
      playerName: session.name,
      room: response.data.state,
      self: response.data.self,
      results: response.data.results,
    });
    return true;
  },

  async submitGuess(point) {
    const { room } = get();
    if (!room?.round) return { ok: false, message: 'אין סיבוב פעיל' };

    // עדכון אופטימי: הסמן מופיע מיד, בלי להמתין לרשת.
    set((current) =>
      current.self ? { self: { ...current.self, hasAnswered: true, currentGuess: point } } : current,
    );

    const response = await request<{ accepted: true }>('player:guess', {
      roundIndex: room.round.index,
      point,
    });

    if (!response.ok) {
      if (response.error !== 'ALREADY_ANSWERED') {
        // הניחוש לא נקלט — מחזירים את המסך למצב "טרם אושר".
        set((current) =>
          current.self ? { self: { ...current.self, hasAnswered: false, currentGuess: null } } : current,
        );
      }
      get().pushToast('error', response.message);
      return { ok: false, message: response.message };
    }
    return { ok: true };
  },

  async leaveGame() {
    await request('player:leave');
    playerSessionStorage.clear();
    set({ role: null, room: null, self: null, results: null, playerId: null });
  },

  /* ────────────────────────────── ממשק ────────────────────────────── */

  pushToast(level, message) {
    // מונע ערימת הודעות זהות (למשל בקשות חוזרות שנדחות זו אחר זו) —
    // אם ההודעה כבר מוצגת, לא מציגים עוד עותק ומשאירים את הקיימת.
    if (get().toasts.some((toast) => toast.level === level && toast.message === message)) return;

    const toast: Toast = { id: (toastSequence += 1), level, message };
    set((current) => ({ toasts: [...current.toasts, toast] }));

    window.setTimeout(() => get().dismissToast(toast.id), 4_000);
  },

  dismissToast(id) {
    set((current) => ({ toasts: current.toasts.filter((toast) => toast.id !== id) }));
  },

  setPreferences(partial) {
    const preferences = { ...get().preferences, ...partial };
    preferencesStorage.save(preferences);
    set({ preferences });
  },
}));

/** מריץ פקודת מנהל ומציג טוסט במקרה של כישלון. */
async function runHostCommand(
  get: () => GameStore,
  event: Parameters<typeof request>[0],
  payload?: unknown,
): Promise<ActionResult> {
  const response =
    payload === undefined ? await request(event) : await request(event, payload);

  if (!response.ok) {
    get().pushToast('error', response.message);
    return { ok: false, message: response.message };
  }
  return { ok: true };
}

/* ────────────────────────── בוררים (selectors) ────────────────────────── */

/** האם המשחק בשלב שבו השחקן אמור לסמן על המפה. */
export const selectIsRoundActive = (store: GameStore): boolean =>
  store.room?.phase === 'question' && store.room.round !== null;

/** השחקן הנוכחי מתוך רשימת השחקנים הציבורית. */
export const selectMe = (store: GameStore) =>
  store.room?.players.find((player) => player.id === store.playerId) ?? null;

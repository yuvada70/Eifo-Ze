/**
 * שכבת התקשורת בזמן אמת (Socket.IO).
 *
 * אחריותה מצומצמת בכוונה: אימות קלט, בדיקת הרשאות, הגבלת קצב, ותרגום
 * בין אירועי הרשת לפקודות של {@link GameRoom}. כל לוגיקת המשחק נמצאת
 * בחדר עצמו — כך שהיא נבדקת ומתוחזקת בנפרד מהרשת.
 */

import type { Server as HttpServer } from 'node:http';

import { Server, type Socket } from 'socket.io';
import {
  ERROR_MESSAGES,
  isValidGameCode,
  normalizeGameCode,
  type Ack,
  type ClientToServerEvents,
  type ErrorCode,
  type GameResults,
  type GameSettings,
  type ServerToClientEvents,
} from '@eifo/shared';

import type { ServerConfig } from '../config.js';
import type { PlacesStore } from '../content/placesStore.js';
import { GameError, type GameRoom, type RoomListeners } from '../game/GameRoom.js';
import { RoomRegistry } from '../game/RoomRegistry.js';
import { logger } from '../logger.js';
import { ConnectionRateLimiter, type RateLimitKind } from './rateLimiter.js';
import { buildJoinUrl, resolvePublicBaseUrl } from './urls.js';

/** נתונים הנשמרים לכל חיבור. */
interface SocketSession {
  role: 'host' | 'player' | null;
  code: string | null;
  playerId: string | null;
  limiter: ConnectionRateLimiter;
}

type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketSession>;

/** שם חדר ה-Socket.IO שאליו משודר המצב הציבורי. */
const roomChannel = (code: string) => `room:${code}`;

/** השהיה קצרה לאיחוד שידורי מצב תכופים (למשל בזמן קליטת ניחושים). */
const STATE_BROADCAST_DEBOUNCE_MS = 50;

/**
 * מקים ומחווט את שרת הזמן-אמת.
 *
 * @returns אובייקט עם המרשם ופונקציית כיבוי מסודר.
 */
export function createGateway(httpServer: HttpServer, config: ServerConfig, places: PlacesStore) {
  const io: Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketSession> =
    new Server(httpServer, {
      cors: { origin: config.corsOrigins, methods: ['GET', 'POST'] },
      // המשחק רגיש לזמן; ניתוק מהיר יחסית מאפשר זיהוי מיידי של נשירה.
      pingInterval: 10_000,
      pingTimeout: 12_000,
      // גודל מטען קטן — אין סיבה לקבל הודעות גדולות בפרוטוקול הזה.
      maxHttpBufferSize: 8_192,
    });

  /** דגלי "יש שינוי לשדר", לכל חדר, לאיחוד שידורים. */
  const pendingBroadcasts = new Map<string, ReturnType<typeof setTimeout>>();

  /**
   * אינדקס חיבורים: "קוד:מזהה-שחקן" → מזהה Socket.
   * מאפשר שליחת מצב פרטי בזמן קבוע במקום סריקת כל החיבורים.
   */
  const playerSockets = new Map<string, string>();
  const playerKey = (code: string, playerId: string) => `${code}:${playerId}`;

  const flushState = (room: GameRoom): void => {
    io.to(roomChannel(room.code)).emit('room:state', room.getPublicState());
  };

  const listeners: RoomListeners = {
    onStateChanged(room) {
      if (pendingBroadcasts.has(room.code)) return;

      const timer = setTimeout(() => {
        pendingBroadcasts.delete(room.code);
        flushState(room);
      }, STATE_BROADCAST_DEBOUNCE_MS);
      timer.unref?.();
      pendingBroadcasts.set(room.code, timer);
    },

    onResults(room, results: GameResults) {
      // התוצאות נשלחות רק כאן — זו הפעם הראשונה שבה המיקומים האמיתיים
      // והמרחקים עוזבים את השרת.
      flushState(room);
      io.to(roomChannel(room.code)).emit('game:results', results);
      logger.info('game.finished', {
        code: room.code,
        players: room.playerCount,
        rounds: results.rounds.length,
        endedEarly: results.endedEarly,
      });
    },

    onNotice(room, message) {
      io.to(roomChannel(room.code)).emit('notice', { level: 'warn', message });
    },

    onPlayerStateChanged(room, playerId) {
      const state = room.getPlayerState(playerId);
      if (!state) return;

      const socketId = playerSockets.get(playerKey(room.code, playerId));
      if (socketId) io.to(socketId).emit('player:self', state);
    },
  };

  const registry = new RoomRegistry(listeners, {
    roomTtlMs: config.roomTtlMs,
    maxRooms: config.maxRooms,
    places,
  });
  registry.startCleanup(config.cleanupIntervalMs);

  io.on('connection', (socket: GameSocket) => {
    socket.data.role = null;
    socket.data.code = null;
    socket.data.playerId = null;
    socket.data.limiter = new ConnectionRateLimiter();

    const baseUrl = resolvePublicBaseUrl(
      config.publicBaseUrl,
      socket.handshake.headers,
      socket.handshake.secure,
    );

    /** עוטף מטפל אירוע: הגבלת קצב, תרגום שגיאות ותשובת Ack אחידה. */
    const handle = <T>(kind: RateLimitKind, ack: unknown, run: () => T): void => {
      const respond = typeof ack === 'function' ? (ack as (response: Ack<T>) => void) : () => {};

      if (!socket.data.limiter.tryConsume(kind)) {
        respond(fail('RATE_LIMITED'));
        return;
      }

      try {
        respond({ ok: true, data: run() });
      } catch (error) {
        if (error instanceof GameError) {
          respond(fail(error.code, error.message === error.code ? undefined : error.message));
          return;
        }
        logger.error('socket.handler_failed', { error, event: kind, code: socket.data.code });
        respond(fail('SERVER_ERROR'));
      }
    };

    /** מאתר את החדר של החיבור ומוודא שהוא המנהל. */
    const requireHostRoom = (): GameRoom => {
      const { role, code } = socket.data;
      if (role !== 'host' || !code) throw new GameError('NOT_AUTHORIZED');

      const room = registry.find(code);
      if (!room) throw new GameError('ROOM_NOT_FOUND');
      return room;
    };

    // ── סנכרון שעונים ──────────────────────────────────────────
    socket.on('time:sync', (_clientSentAt, ack) => {
      if (typeof ack === 'function') ack(Date.now());
    });

    // ── מנהל ───────────────────────────────────────────────────
    socket.on('host:create', (payload, ack) => {
      handle('create', ack, () => {
        const room = registry.create((payload?.settings ?? {}) as Partial<GameSettings>);

        socket.data.role = 'host';
        socket.data.code = room.code;
        void socket.join(roomChannel(room.code));
        room.attachHost(socket.id);

        return {
          code: room.code,
          hostToken: room.hostToken,
          joinUrl: buildJoinUrl(baseUrl, room.code),
          state: room.getPublicState(),
        };
      });
    });

    socket.on('host:attach', (payload, ack) => {
      handle('join', ack, () => {
        const room = requireRoom(registry, payload?.code);
        if (typeof payload?.hostToken !== 'string' || !room.verifyHostToken(payload.hostToken)) {
          throw new GameError('NOT_AUTHORIZED');
        }

        socket.data.role = 'host';
        socket.data.code = room.code;
        void socket.join(roomChannel(room.code));
        room.attachHost(socket.id);

        return {
          state: room.getPublicState(),
          results: room.getResults(),
          joinUrl: buildJoinUrl(baseUrl, room.code),
        };
      });
    });

    socket.on('host:updateSettings', (payload, ack) => {
      handle('host', ack, () => {
        const room = requireHostRoom();
        room.updateSettings((payload?.settings ?? {}) as Partial<GameSettings>);
        return { state: room.getPublicState() };
      });
    });

    socket.on('host:start', (ack) => {
      handle('host', ack, () => {
        const room = requireHostRoom();
        room.start();
        logger.info('game.started', { code: room.code, players: room.playerCount });
        return null;
      });
    });

    socket.on('host:pause', (ack) => handle('host', ack, () => (requireHostRoom().pause(), null)));
    socket.on('host:resume', (ack) => handle('host', ack, () => (requireHostRoom().resume(), null)));
    socket.on('host:skip', (ack) => handle('host', ack, () => (requireHostRoom().skip(), null)));
    socket.on('host:stop', (ack) => handle('host', ack, () => (requireHostRoom().stop(), null)));

    socket.on('host:restart', (ack) => {
      handle('host', ack, () => {
        const room = requireHostRoom();
        room.restart();
        return { state: room.getPublicState() };
      });
    });

    socket.on('host:kick', (payload, ack) => {
      handle('host', ack, () => {
        const room = requireHostRoom();
        if (typeof payload?.playerId !== 'string') throw new GameError('INVALID_INPUT');

        const socketId = playerSockets.get(playerKey(room.code, payload.playerId));
        playerSockets.delete(playerKey(room.code, payload.playerId));
        room.removePlayer(payload.playerId);

        if (socketId) {
          io.to(socketId).emit('room:closed', { reason: 'kicked' });
          io.sockets.sockets.get(socketId)?.leave(roomChannel(room.code));
        }
        return null;
      });
    });

    // ── שחקן ───────────────────────────────────────────────────
    socket.on('player:join', (payload, ack) => {
      handle('join', ack, () => {
        const room = requireRoom(registry, payload?.code);
        const player = room.addPlayer(payload?.name ?? '', socket.id);

        socket.data.role = 'player';
        socket.data.code = room.code;
        socket.data.playerId = player.id;
        playerSockets.set(playerKey(room.code, player.id), socket.id);
        void socket.join(roomChannel(room.code));

        logger.info('player.joined', { code: room.code, players: room.playerCount });

        return {
          playerId: player.id,
          playerToken: player.token,
          state: room.getPublicState(),
          self: room.getPlayerState(player.id)!,
          results: room.getResults(),
        };
      });
    });

    socket.on('player:attach', (payload, ack) => {
      handle('join', ack, () => {
        const room = requireRoom(registry, payload?.code);
        if (typeof payload?.playerToken !== 'string') throw new GameError('INVALID_INPUT');

        const existing = room.findPlayerByToken(payload.playerToken);
        if (!existing) throw new GameError('NOT_AUTHORIZED');

        const player = room.reattachPlayer(existing.id, socket.id);
        socket.data.role = 'player';
        socket.data.code = room.code;
        socket.data.playerId = player.id;
        playerSockets.set(playerKey(room.code, player.id), socket.id);
        void socket.join(roomChannel(room.code));

        return {
          playerId: player.id,
          playerToken: player.token,
          state: room.getPublicState(),
          self: room.getPlayerState(player.id)!,
          results: room.getResults(),
        };
      });
    });

    socket.on('player:guess', (payload, ack) => {
      handle('guess', ack, () => {
        const { code, playerId } = socket.data;
        if (!code || !playerId) throw new GameError('NOT_AUTHORIZED');

        const room = registry.find(code);
        if (!room) throw new GameError('ROOM_NOT_FOUND');

        room.submitGuess(playerId, Number(payload?.roundIndex), payload?.point);
        return { accepted: true as const };
      });
    });

    socket.on('player:leave', (ack) => {
      handle('join', ack, () => {
        const { code, playerId } = socket.data;
        if (code && playerId) {
          registry.find(code)?.removePlayer(playerId);
          playerSockets.delete(playerKey(code, playerId));
          void socket.leave(roomChannel(code));
        }
        socket.data.role = null;
        socket.data.code = null;
        socket.data.playerId = null;
        return null;
      });
    });

    // ── ניתוק ──────────────────────────────────────────────────
    socket.on('disconnect', (reason) => {
      const { code, role, playerId } = socket.data;
      if (!code) return;

      // מסירים רק אם החיבור הזה הוא עדיין החיבור הרשום — כדי לא למחוק
      // רישום חדש שנוצר בעקבות חיבור מחדש מהיר של אותו שחקן.
      if (playerId && playerSockets.get(playerKey(code, playerId)) === socket.id) {
        playerSockets.delete(playerKey(code, playerId));
      }

      const room = registry.find(code);
      if (!room) return;

      if (role === 'host') room.detachHost(socket.id);
      else room.markPlayerDisconnected(socket.id);

      logger.debug('socket.disconnected', { code, role, reason });
    });
  });

  return {
    io,
    registry,
    /** כיבוי מסודר: סוגר חדרים, מנקה טיימרים ומנתק חיבורים. */
    async shutdown(): Promise<void> {
      for (const timer of pendingBroadcasts.values()) clearTimeout(timer);
      pendingBroadcasts.clear();
      playerSockets.clear();
      registry.disposeAll();
      await io.close();
    },
  };
}

/** מאתר חדר לפי קוד שהתקבל מהלקוח, כולל נרמול ואימות. */
function requireRoom(registry: RoomRegistry, rawCode: unknown): GameRoom {
  const code = normalizeGameCode(rawCode);
  if (!isValidGameCode(code)) throw new GameError('ROOM_NOT_FOUND');

  const room = registry.find(code);
  if (!room) throw new GameError('ROOM_NOT_FOUND');
  return room;
}

/** בונה תשובת Ack של כישלון עם הודעה בעברית. */
function fail(code: ErrorCode, message?: string): { ok: false; error: ErrorCode; message: string } {
  return { ok: false, error: code, message: message ?? ERROR_MESSAGES[code] };
}

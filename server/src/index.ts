/**
 * נקודת הכניסה של השרת.
 *
 * מרכיבה את שלוש השכבות — HTTP, זמן אמת, ומנוע המשחק — ודואגת
 * לכיבוי מסודר כדי שמשחק פעיל לא ייקטע באמצע פריסה.
 */

import { createServer } from 'node:http';

import { loadConfig } from './config.js';
import { loadPlaces } from './content/placesStore.js';
import { createApp } from './http/app.js';
import { logger } from './logger.js';
import { createGateway } from './realtime/gateway.js';

function main(): void {
  const config = loadConfig();

  const places = loadPlaces(config.placesFile);

  const httpServer = createServer();
  const gateway = createGateway(httpServer, config, places);
  const app = createApp(config, { activeRooms: () => gateway.registry.activeRooms }, places);

  httpServer.on('request', app);

  httpServer.listen(config.port, config.host, () => {
    logger.info('server.listening', {
      port: config.port,
      host: config.host,
      env: config.nodeEnv,
      publicBaseUrl: config.publicBaseUrl ?? '(נגזר מהבקשה)',
    });
  });

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;

    logger.info('server.shutting_down', { signal });
    const forceExit = setTimeout(() => process.exit(1), 10_000);
    forceExit.unref();

    try {
      await gateway.shutdown();
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
      logger.info('server.stopped');
      process.exit(0);
    } catch (error) {
      logger.error('server.shutdown_failed', { error });
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    logger.error('process.unhandled_rejection', { error: reason });
  });
  process.on('uncaughtException', (error) => {
    logger.error('process.uncaught_exception', { error });
    void shutdown('uncaughtException');
  });
}

main();

import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { describe, it } from 'node:test';

import { commonsImageUrl } from '@eifo/shared';

import { loadConfig } from '../config.js';
import { inMemoryPlaces } from '../content/placesStore.js';
import { createApp } from './app.js';

/** בודק אם כתובת מותרת לפי רשימת מקורות CSP (כולל תווים כלליים). */
function allowed(sources: string[], url: string): boolean {
  const { protocol, host } = new URL(url);
  return sources.some((source) => {
    if (!source.startsWith('https://')) return false;
    const pattern = source.slice('https://'.length);
    if (protocol !== 'https:') return false;
    if (pattern.startsWith('*.')) return host.endsWith(pattern.slice(1));
    return host === pattern;
  });
}

describe('CSP', () => {
  it('allows every host Wikimedia uses for Special:FilePath redirects and OSM tiles', async () => {
    const app = createApp({ ...loadConfig(), serveClient: false }, { activeRooms: () => 0 }, inMemoryPlaces([]));
    const server = app.listen(0);
    try {
      const { port } = server.address() as AddressInfo;
      const response = await fetch(`http://127.0.0.1:${port}/healthz`);
      const csp = response.headers.get('content-security-policy') ?? '';
      const imgSrc = csp.split(';').find((d) => d.trim().startsWith('img-src'))!.trim().split(/\s+/).slice(1);

      for (const url of [
        commonsImageUrl('Tour Eiffel Wikimedia Commons.jpg'),
        'https://commons.wikimedia.org/w/index.php?title=Special:Redirect/file/X.jpg&width=1280',
        'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/X.jpg/1280px-X.jpg',
        // מאז 2026 Wikimedia מפנה לכאן — זה מה ששבר את התמונות במשחק הפרוס.
        'https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/X.jpg/1280px-X.jpg',
        'https://tile.openstreetmap.org/3/4/2.png',
      ]) {
        assert.ok(allowed(imgSrc, url), `CSP img-src חוסם: ${url}`);
      }
      assert.ok(!allowed(imgSrc, 'https://evil.example.com/x.jpg'));
    } finally {
      server.close();
    }
  });
});

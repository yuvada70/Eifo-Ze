#!/usr/bin/env node
/**
 * אבחון המשחק הפרוס בדפדפן אמיתי: יוצר חדר, מצרף שחקן, מתחיל משחק,
 * ומתעד כל בקשת תמונה (סטטוס, כותרות, הפניות), שגיאות CSP וקונסול,
 * וצילומי מסך. רץ ב-GitHub Actions (workflow "Diagnose live").
 *
 * שימוש: node scripts/diagnose-live.mjs https://eifo-ze.onrender.com out-dir
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium, devices } from 'playwright';

const BASE = (process.argv[2] || 'https://eifo-ze.onrender.com').replace(/\/+$/, '');
const OUT = process.argv[3] || 'diagnose';
mkdirSync(OUT, { recursive: true });
const log = [];
const note = (...a) => { const line = a.join(' '); console.log(line); log.push(line); };

const browser = await chromium.launch();
const hostCtx = await browser.newContext({ viewport: { width: 1366, height: 820 } });
const playerCtx = await browser.newContext({ ...devices['iPhone 13'] });
const pages = [];
for (const [ctx, who] of [[hostCtx, 'host'], [playerCtx, 'player']]) {
  ctx.on('request', (r) => { if (/wikimedia|wikipedia/.test(r.url())) note(`[${who}] REQ ${r.url()}`); });
  ctx.on('response', async (r) => {
    if (!/wikimedia|wikipedia/.test(r.url())) return;
    const h = r.headers();
    note(`[${who}] RES ${r.status()} ${r.url()} type=${h['content-type'] ?? ''} loc=${h['location'] ?? ''} xcache=${h['x-cache'] ?? ''}`);
  });
  ctx.on('requestfailed', (r) => note(`[${who}] FAILED ${r.url()} ${r.failure()?.errorText}`));
}

try {
  note('BASE', BASE);
  const health = await fetch(`${BASE}/healthz`).then((r) => `${r.status} ${r.headers.get('content-security-policy') ?? ''}`).catch((e) => `ERR ${e}`);
  note('healthz', health);
  const home = await fetch(`${BASE}/`);
  note('CSP', home.headers.get('content-security-policy'));

  const host = await hostCtx.newPage();
  pages.push(host);
  host.on('console', (m) => note(`[host console ${m.type()}] ${m.text()}`));
  await host.goto(BASE, { timeout: 120000 });
  await host.getByTestId('go-host').click();
  await host.getByTestId('rounds-5').click();
  await host.getByTestId('create-room').click();
  const codeButton = host.locator('button[title="לחצו להעתקה"]');
  await codeButton.waitFor({ timeout: 60000 });
  const code = (await codeButton.innerText()).trim();
  note('room', code);

  const player = await playerCtx.newPage();
  pages.push(player);
  player.on('console', (m) => note(`[player console ${m.type()}] ${m.text()}`));
  await player.goto(`${BASE}/join/${code}`);
  await player.getByPlaceholder('השם שיוצג לכולם').fill('בודק');
  await player.getByTestId('join-submit').click();
  await host.getByTestId('lobby-player').first().waitFor();
  await host.getByTestId('start-game').click();

  for (let round = 1; round <= 3; round += 1) {
    await player.getByTestId('option-0').waitFor({ timeout: 30000 });
    await player.waitForTimeout(8000);
    const img = await player.evaluate(() => {
      const el = document.querySelector('figure img');
      const err = document.body.innerText.includes('התמונה לא נטענה');
      return { src: el?.currentSrc ?? el?.src ?? null, complete: el?.complete, w: el?.naturalWidth ?? 0, errorShown: err };
    });
    note(`ROUND ${round} player image`, JSON.stringify(img));
    const timer = await player.evaluate(() => document.querySelector('header')?.innerText.replace(/\s+/g, ' '));
    note(`ROUND ${round} header`, timer);
    await player.screenshot({ path: `${OUT}/player-round-${round}.png` });
    await host.screenshot({ path: `${OUT}/host-round-${round}.png` });
    await player.getByTestId('option-0').click();
    await player.getByTestId('reveal-name').waitFor({ timeout: 40000 });
    await player.screenshot({ path: `${OUT}/player-reveal-${round}.png` });
    await host.getByTestId('host-skip').click();
  }
} catch (error) {
  note('ERROR', error.message.split('\n')[0]);
  for (const [i, p] of pages.entries()) await p.screenshot({ path: `${OUT}/error-${i}.png` }).catch(() => {});
}

// בדיקה ישירה של כמה כתובות תמונה מהמאגר, כמו שדפדפן מבקש אותן.
const direct = await browser.newPage();
for (const file of ['Tour Eiffel Wikimedia Commons.jpg']) {
  const url = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file.replace(/ /g, '_'))}?width=1280`;
  const r = await direct.goto(url).catch((e) => ({ status: () => `ERR ${e.message}` }));
  note('DIRECT', url, r?.status?.());
}
writeFileSync(`${OUT}/log.txt`, `${log.join('\n')}\n`);
await browser.close();

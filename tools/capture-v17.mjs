import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { launchInstalledBrowser, startStaticServer } from './golden-browser.mjs';

const OUTPUT = path.resolve('docs/screenshots/v1.7');

async function openStage(browser, baseUrl, {
  viewport,
  deviceScaleFactor = 1,
  query = '',
  minX,
  reducedMotion = false,
}) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor,
    isMobile: query.includes('touch'),
    hasTouch: query.includes('touch'),
    serviceWorkers: 'block',
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto(`${baseUrl}/index.html?dev&autoplay&capture&level=16${query}`, {
    waitUntil: 'load',
    timeout: 15_000,
  });
  await page.waitForFunction(() => window.__moto?.G?.levelIdx === 15
    && window.__moto.G.state === 'playing', undefined, { timeout: 15_000 });
  const stage = await page.evaluate(({ targetX, useReducedMotion, cameraLead }) => {
    const api = window.__moto;
    api.SETTINGS.reducedMotion = useReducedMotion;
    api.startLevel(15);
    while (api.G.state === 'playing' && api.G.bike.x < targetX) api.stepTicks(1);
    api.G.popupPool.clear();
    api.G.cpFlash = 0;
    let found = false;
    let ticks = 0;
    for (; ticks < 1_000 && api.G.state === 'playing'; ticks++) {
      api.stepTicks(1);
      if (api.G.bike.x < targetX) continue;
      api.G.popupPool.forEachActive(popup => {
        if (popup.text === 'VECTOR LOCK!') found = true;
      });
      if (found) break;
    }
    for (let settle = 0; settle < 8 && api.G.state === 'playing'; settle++) api.stepTicks(1);
    api.G.popupPool.clear();
    api.G.cpFlash = 0;
    api.G.cam.x = api.G.bike.x + cameraLead;
    api.G.cam.y = api.G.bike.y - 50;
    api.G.cam.viewH = 560;
    api.G.cam.roll = 0;
    api.G.cam.kickX = 0;
    api.G.cam.kickY = 0;
    api.G.hitstop = 1_000;
    return {
      ticks,
      found,
      bikeX: api.G.bike.x,
      bikeY: api.G.bike.y,
      runTick: api.G.run.tick,
      state: api.G.state,
      zones: api.G.forceZones.zones.map(zone => zone.id),
    };
  }, { targetX: minX, useReducedMotion: reducedMotion,
    cameraLead: viewport.width < 600 ? 30 : 100 });
  await page.waitForTimeout(100);
  if (errors.length) throw new Error(errors.join(' | '));
  return { context, page, stage };
}

async function capture(browser, server, name, options) {
  const { context, page, stage } = await openStage(browser, server.baseUrl, options);
  try {
    const filename = path.join(OUTPUT, name);
    // Reading the Canvas directly avoids Chromium screenshot tile artifacts on
    // the additive Loom ribbons while retaining the exact device-pixel output.
    const dataUrl = await page.evaluate(() => document.getElementById('c').toDataURL('image/png'));
    await writeFile(filename, Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64'));
    console.log(`  ${name}: tick ${stage.runTick}, bike (${stage.bikeX.toFixed(1)}, ${stage.bikeY.toFixed(1)}), popup=${stage.found}`);
  } finally {
    await context.close();
  }
}

async function main() {
  await mkdir(OUTPUT, { recursive: true });
  const server = await startStaticServer(path.resolve('public'));
  let browser;
  try {
    const launched = await launchInstalledBrowser();
    browser = launched.browser;
    console.log(`v1.7 capture: ${launched.source}`);
    await capture(browser, server, 'update-v17-vector-weave-hero.png', {
      viewport: { width: 1280, height: 720 }, minX: 820,
    });
    await capture(browser, server, 'update-v17-collision-looms.png', {
      viewport: { width: 1280, height: 720 }, minX: 820, query: '&debug=collisions',
    });
    await capture(browser, server, 'update-v17-mobile-loom.png', {
      viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, minX: 350, query: '&touch',
    });
    await capture(browser, server, 'update-v17-reduced-motion.png', {
      viewport: { width: 1280, height: 720 }, minX: 820, reducedMotion: true,
    });
  } finally {
    await browser?.close().catch(() => {});
    await server.close().catch(() => {});
  }
}

main().catch(error => {
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
});

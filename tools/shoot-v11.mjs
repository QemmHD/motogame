import { chromium } from 'playwright-core';
import { existsSync } from 'fs';
const exe = ['/opt/pw-browsers/chromium/chrome-linux/chrome', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(existsSync);
const base = process.env.BASE || 'http://localhost:8080';
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--use-gl=swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error' && !/favicon|music_|\.m4a/.test(m.text())) errors.push('CONSOLE ' + m.text()); });
page.on('pageerror', e => errors.push('PAGEERROR ' + e.message));

await page.goto(base + '/index.html?dev=1', { waitUntil: 'load' });
await page.waitForFunction(() => window.__moto && window.__moto.G.state === 'menu', { timeout: 8000 }).catch(() => {});
await page.waitForTimeout(400);
await page.screenshot({ path: 'raw/v11_menu.png' });

// open settings
await page.evaluate(() => { window.__moto.G.settingsOpen = true; });
await page.waitForTimeout(200);
await page.screenshot({ path: 'raw/v11_settings.png' });
await page.evaluate(() => { window.__moto.G.settingsOpen = false; });

// play + do a flip to build combo/score
await page.evaluate(() => window.__moto.startLevel(1)); // Air Time (big jumps)
await page.waitForTimeout(120);
await page.keyboard.down('ArrowUp');
let lean = null;
const setLean = async d => { if (lean === d) return; if (lean) await page.keyboard.up(lean); lean = d; if (d) await page.keyboard.down(d); };
let shotDone = false;
for (let i = 0; i < 120; i++) {
  const s = await page.evaluate(() => { const b = window.__moto.G.bike; let a = b.angle % (2 * Math.PI); if (a > Math.PI) a -= 2 * Math.PI; if (a <= -Math.PI) a += 2 * Math.PI; return { g: b.grounded, a: +a.toFixed(2), score: window.__moto.G.score, combo: window.__moto.G.combo, st: window.__moto.G.state }; });
  if (!s.g) { if (s.a > -2.6 && s.a < 0.15) await setLean('ArrowLeft'); else await setLean(null); } else await setLean(null);
  if (!shotDone && s.score > 0) { await page.screenshot({ path: 'raw/v11_play.png' }); shotDone = true; }
  await page.waitForTimeout(100);
}
if (!shotDone) await page.screenshot({ path: 'raw/v11_play.png' });
const fin = await page.evaluate(() => ({ score: window.__moto.G.score, combo: window.__moto.G.combo, st: window.__moto.G.state, music: window.__moto.SETTINGS.music }));
console.log('FINAL', JSON.stringify(fin));
console.log('ERRORS', errors.length ? errors.join('\n') : 'none');
await browser.close();

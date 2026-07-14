import { chromium } from 'playwright-core';
import { existsSync } from 'fs';

const exe = ['/opt/pw-browsers/chromium/chrome-linux/chrome',
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome']
  .find(existsSync);
const base = process.env.BASE || 'http://localhost:8080';
const shot = process.argv[2] || 'shot';
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--use-gl=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 960, height: 600 }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errors.push('CONSOLE ' + m.text()); });
page.on('pageerror', e => errors.push('PAGEERROR ' + e.message));

await page.goto(base + '/index.html?dev=1', { waitUntil: 'load' });
await page.waitForFunction(() => window.__moto && window.__moto.G.state === 'menu', { timeout: 8000 }).catch(() => {});
await page.waitForTimeout(300);
await page.screenshot({ path: `raw/${shot}_menu.png` });

await page.evaluate(() => window.__moto.startLevel(0));
await page.waitForTimeout(120);

const state = () => page.evaluate(() => {
  const b = window.__moto.G.bike; let a = b.angle % (2 * Math.PI); if (a > Math.PI) a -= 2 * Math.PI; if (a <= -Math.PI) a += 2 * Math.PI;
  return { st: window.__moto.G.state, x: Math.round(b.x), grounded: b.grounded, air: b.airborne, ang: +a.toFixed(2),
    t: +window.__moto.G.elapsed.toFixed(1), fb: window.__moto.G.flipBonus, fe: b.flipEventId };
});
let gas = false, lean = null, flipShot = false, minX = 0, stuckT = 0, lastX = 0;
async function setLean(dir) { if (lean === dir) return; if (lean) await page.keyboard.up(lean); lean = dir; if (dir) await page.keyboard.down(dir); }
await page.keyboard.down('ArrowUp'); gas = true;

for (let i = 0; i < 300; i++) {          // ~30s max
  const s = await state();
  if (s.st === 'finished') { await page.screenshot({ path: `raw/${shot}_finish.png` }); break; }
  // autopilot: airborne -> flip if safe, else level for landing
  if (!s.grounded) {
    if (s.ang > -2.6 && s.ang < 0.2) await setLean('ArrowLeft'); else await setLean(null);
    if (!flipShot && s.ang < -1.4) { await page.screenshot({ path: `raw/${shot}_flip.png` }); flipShot = true; }
  } else await setLean(null);
  if (s.x - lastX < 2) { stuckT++; } else stuckT = 0; lastX = s.x;
  if (stuckT > 40) { console.log('STUCK at x=' + s.x); break; }
  if (i === 60) await page.screenshot({ path: `raw/${shot}_ride.png` });
  await page.waitForTimeout(100);
}
const final = await state();
console.log('FINAL', JSON.stringify(final));
console.log('ERRORS', errors.length ? errors.join('\n') : 'none');
await browser.close();

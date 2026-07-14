import { chromium } from 'playwright-core';
import { existsSync } from 'fs';
const exe = ['/opt/pw-browsers/chromium/chrome-linux/chrome', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(existsSync);
const base = process.env.BASE || 'http://localhost:8080';
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--use-gl=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
const errs = [];
page.on('pageerror', e => errs.push(e.message));
await page.goto(base + '/index.html', { waitUntil: 'load' });
await page.waitForFunction(() => window.__moto, { timeout: 8000 });
const only = process.argv[2] != null ? [Number(process.argv[2])] : [0, 1, 2, 3];

const st = () => page.evaluate(() => {
  const G = window.__moto.G, b = G.bike; let a = b.angle % (2 * Math.PI); if (a > Math.PI) a -= 2 * Math.PI; if (a <= -Math.PI) a += 2 * Math.PI;
  return { st: G.state, x: Math.round(b.x), grounded: b.grounded, ang: +a.toFixed(2), t: +G.elapsed.toFixed(1), fb: G.flipBonus, fin: Math.round(G.level.course.finishX) };
});

for (const lvl of only) {
  await page.evaluate(i => window.__moto.startLevel(i), lvl);
  await page.waitForTimeout(100);
  let lean = null, crashes = 0, wasCrashed = false, lastX = 0, stuck = 0, maxX = 0, res = null;
  const setLean = async d => { if (lean === d) return; if (lean) await page.keyboard.up(lean); lean = d; if (d) await page.keyboard.down(d); };
  await page.keyboard.down('ArrowUp');
  for (let i = 0; i < 550; i++) { // ~55s cap
    const s = await st();
    maxX = Math.max(maxX, s.x);
    if (s.st === 'finished') { res = { finished: true, time: (s.t - s.fb).toFixed(2), fb: s.fb, crashes }; break; }
    if (s.st === 'crashed') { if (!wasCrashed) { crashes++; wasCrashed = true; } await setLean(null); }
    else { wasCrashed = false;
      // LEVEL toward horizontal for a safe landing (a competent-player proxy)
      if (!s.grounded) {
        if (s.ang > 0.18) await setLean('ArrowLeft');       // nose down -> lean back
        else if (s.ang < -0.18) await setLean('ArrowRight'); // nose up -> lean forward
        else await setLean(null);
      } else await setLean(null);
    }
    if (Math.abs(s.x - lastX) < 2) stuck++; else stuck = 0; lastX = s.x;
    if (stuck > 60) { res = { finished: false, stuckAt: s.x, of: s.fin, crashes }; break; }
    await page.waitForTimeout(100);
  }
  await page.keyboard.up('ArrowUp'); await setLean(null);
  if (!res) { const s = await st(); res = { finished: false, timeout: true, maxX, of: s.fin, crashes }; }
  console.log('L' + (lvl + 1), JSON.stringify(res));
}
console.log('ERRORS', errs.length ? errs.join(' | ') : 'none');
await browser.close();

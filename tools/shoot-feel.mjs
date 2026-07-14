import { chromium } from 'playwright-core';
import { existsSync } from 'fs';
const exe = ['/opt/pw-browsers/chromium/chrome-linux/chrome', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(existsSync);
const b = process.env.BASE || 'http://localhost:8080';
const br = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--use-gl=swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const p = await br.newPage({ viewport: { width: 960, height: 600 } });
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto(b + '/index.html?dev=1', { waitUntil: 'load' });
await p.waitForFunction(() => window.__moto, { timeout: 8000 });
await p.evaluate(() => window.__moto.startLevel(1));
await p.waitForTimeout(120);
await p.keyboard.down('ArrowUp');
let lean = null, maxSusp = 0, landShot = false;
const setLean = async d => { if (lean === d) return; if (lean) await p.keyboard.up(lean); lean = d; if (d) await p.keyboard.down(d); };
for (let i = 0; i < 140; i++) {
  const s = await p.evaluate(() => { const G = window.__moto.G, k = G.bike; let a = k.angle % (2 * Math.PI); if (a > Math.PI) a -= 2 * Math.PI; if (a <= -Math.PI) a += 2 * Math.PI;
    return { g: k.grounded, a: +a.toFixed(2), susp: +G.susp.toFixed(2), air: k.airborne }; });
  if (Math.abs(s.susp) > Math.abs(maxSusp)) maxSusp = s.susp;
  if (!s.g) { if (s.a > -2.6 && s.a < 0.15) await setLean('ArrowLeft'); else await setLean(null); } else await setLean(null);
  if (!landShot && s.g && s.susp > 0.35) { await p.screenshot({ path: 'raw/feel_land.png' }); landShot = true; }
  if (i === 40) await p.screenshot({ path: 'raw/feel_ride.png' });
  await p.waitForTimeout(90);
}
if (!landShot) await p.screenshot({ path: 'raw/feel_land.png' });
console.log('maxSusp seen:', maxSusp.toFixed(2), '| landShot:', landShot, '| errors:', errs.length ? errs.join('|') : 'none');
await br.close();

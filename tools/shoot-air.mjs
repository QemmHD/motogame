import { chromium } from 'playwright-core';
import { existsSync } from 'fs';
const exe = ['/opt/pw-browsers/chromium/chrome-linux/chrome', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(existsSync);
const b = process.env.BASE || 'http://localhost:8080';
const br = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--use-gl=swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const p = await br.newPage({ viewport: { width: 960, height: 600 } });
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto(b + '/index.html?dev=1', { waitUntil: 'load' });
await p.waitForFunction(() => window.__moto, { timeout: 8000 });
await p.evaluate(() => window.__moto.startLevel(4)); // Cliffhanger — big air
await p.waitForTimeout(120);
await p.keyboard.down('ArrowUp');
let shots = 0, airShot = false, landShot = false, tiltShot = false;
for (let i = 0; i < 200; i++) {
  const s = await p.evaluate(() => { const G = window.__moto.G, k = G.bike; let a = k.angle % (2*Math.PI); if (a>Math.PI) a-=2*Math.PI; if(a<=-Math.PI)a+=2*Math.PI;
    return { g: k.grounded, air: k.airborne, a: +a.toFixed(2), rc: +k.rearComp.toFixed(2), fc: +k.frontComp.toFixed(2) }; });
  // in air with a clear tilt
  if (!airShot && s.air && Math.abs(s.a) > 0.3) { await p.screenshot({ path: 'raw/air_tilt.png' }); airShot = true; }
  // compressed landing
  if (!landShot && s.g && (s.rc > 0.6 || s.fc > 0.6)) { await p.screenshot({ path: 'raw/air_land.png' }); landShot = true; }
  if (i === 30) await p.screenshot({ path: 'raw/air_ride.png' });
  await p.waitForTimeout(80);
}
console.log('airShot', airShot, 'landShot', landShot, 'errors', errs.length ? errs.join('|') : 'none');
await br.close();

// levels.js — course builder + level definitions for Moto Rush X3.
// Turtle-style builder emits a ground polyline (wheels roll on top), hazards,
// checkpoints and a finish marker. Geometry is sized to the measured jump
// physics: ~300px runway -> ramp -> gap(<=300) -> landing slope. Ground hazards
// (spikes, barrels) sit at pit bottoms so a cleared jump flies over them; saws
// hang overhead above the racing line. So hazards punish mistimed play rather
// than being unavoidable walls — and the courses stay completable.

const STEP = 10;

class Course {
  constructor(startX, startY) {
    this.x = startX; this.y = startY;
    this.startX = startX; this.startY = startY;
    this.ground = [{ x: startX - 240, y: startY }, { x: startX, y: startY }];
    this.chains = [this.ground];
    this.render = [{ type: 'ground', pts: this.ground }];
    this.hazards = []; this.checkpoints = []; this.decos = [];
    this.finishX = null; this.finishPt = null;
    this.minY = startY; this.maxY = startY;
  }
  _push(x, y) {
    this.ground.push({ x, y }); this.x = x; this.y = y;
    if (y < this.minY) this.minY = y; if (y > this.maxY) this.maxY = y;
  }
  _curve(w, fn) {
    const x0 = this.x, y0 = this.y, n = Math.max(2, Math.round(w / STEP));
    for (let i = 1; i <= n; i++) { const t = i / n, p = fn(t); this._push(x0 + p.dx, y0 + p.dy); }
    return this;
  }
  flat(w) { this._push(this.x + w, this.y); return this; }
  slope(w, dy) { this._push(this.x + w, this.y + dy); return this; }
  hill(w, h) { return this._curve(w, t => ({ dx: t * w, dy: -h * 0.5 * (1 - Math.cos(2 * Math.PI * t)) })); }
  dip(w, d) { return this._curve(w, t => ({ dx: t * w, dy: d * 0.5 * (1 - Math.cos(2 * Math.PI * t)) })); }
  rise(w, h) { return this._curve(w, t => ({ dx: t * w, dy: -h * t * (2 - t) })); }
  fall(w, h) { return this._curve(w, t => ({ dx: t * w, dy: h * t * (2 - t) })); }
  ramp(w, h) { return this._curve(w, t => ({ dx: t * w, dy: -h * t * t })); }
  landing(w, h) { return this._curve(w, t => ({ dx: t * w, dy: h * (1 - (1 - t) * (1 - t)) })); }
  bumps(n, w, h) { for (let i = 0; i < n; i++) this.hill(w, h); return this; }
  // tight whoops that work the suspension — smooth (zero-slope) ends so the
  // wheels never catch a kink. Clamped to the proven-rollable envelope
  // (>=142 wide, <=25 tall) so they buck the bike without bucking you off.
  whoops(n, w, h) { const W = Math.max(w, 142), H = Math.min(h, 25);
    for (let i = 0; i < n; i++) this._curve(W, t => ({ dx: t * W, dy: -H * 0.5 * (1 - Math.cos(2 * Math.PI * t)) })); return this; }
  gap(w, dropH = 0) {
    this.ground = [{ x: this.x + w, y: this.y + dropH }];
    this.chains.push(this.ground); this.render.push({ type: 'ground', pts: this.ground });
    this.x += w; this.y += dropH; if (this.y > this.maxY) this.maxY = this.y;
    return this;
  }
  // runway -> ramp up -> pit gap (optional hazard at the bottom) -> landing down
  jump(run, rw, rh, gap, land, { landDrop = 0, pit = null, nPit = 1 } = {}) {
    this.flat(run);
    const pitX = this.x, pitY = this.y;
    this.ramp(rw, rh);
    if (pit) for (let i = 0; i < nPit; i++)
      this.hazards.push({ type: pit, x: pitX + rw + gap * (0.35 + 0.3 * i), y: pitY + rh * 0.5 + 6,
        r: pit === 'barrel' ? 26 : 27, spin: 0 });
    this.gap(gap, rh + landDrop);
    this.landing(land, Math.min(60, rh));
    return this;
  }
  saw(dx, height) { this.hazards.push({ type: 'saw', x: this.x + dx, y: this.y - height, r: 36, spin: 0 }); return this; }
  hazard(type, opts = {}) {
    const r = opts.r ?? (type === 'saw' ? 36 : type === 'barrel' ? 26 : 27);
    this.hazards.push({ type, x: this.x + (opts.dx || 0), y: (opts.y != null ? opts.y : this.y) + (opts.dy || 0), r, spin: 0 });
    return this;
  }
  deco(type, opts = {}) { this.decos.push({ type, x: this.x + (opts.dx || 0), y: this.y + (opts.dy || 0) }); return this; }
  checkpoint() { this.checkpoints.push({ x: this.x, y: this.y }); this.deco('checkpoint', {}); return this; }
  finish() { this.flat(170); this.finishX = this.x; this.finishPt = { x: this.x, y: this.y }; this.flat(360); return this; }
  bounds() {
    let maxX = this.startX;
    for (const c of this.chains) for (const p of c) if (p.x > maxX) maxX = p.x;
    return { minX: this.startX - 240, maxX, minY: this.minY, maxY: this.maxY };
  }
}

// ---- levels ---------------------------------------------------------------

function level1() { // Warm-Up: gas, small jumps, land — teaches the basics
  const c = new Course(180, 330);
  c.flat(240).checkpoint();
  c.hill(300, 58).hill(280, 46);
  c.jump(300, 190, 56, 220, 200);
  c.flat(100).checkpoint();
  c.whoops(3, 120, 30);                 // first taste of bucking whoops
  c.dip(280, 78).hill(300, 64);
  c.jump(320, 200, 60, 240, 210, { landDrop: 30 });
  c.flat(120).checkpoint();
  c.hill(300, 66).jump(280, 190, 58, 220, 200);
  c.flat(180).hill(260, 52).finish();
  return { name: 'Warm-Up', course: c, star: [18, 25, 34] };
}

function level2() { // Air Time: bigger ramps for flips, spikes in the pits
  const c = new Course(180, 320);
  c.flat(280);
  c.jump(60, 200, 72, 250, 210, { pit: 'spikes' });
  c.flat(110).checkpoint();
  c.hill(300, 74).dip(260, 64);
  c.jump(300, 220, 80, 270, 220, { landDrop: 24, pit: 'spikes' });
  c.flat(90).checkpoint();
  c.bumps(3, 150, 30);
  c.jump(280, 210, 74, 260, 210);       // double: land then straight into...
  c.jump(150, 200, 70, 240, 210, { landDrop: 20 });
  c.flat(110).checkpoint();
  c.hill(300, 84);
  c.jump(300, 230, 84, 285, 225, { pit: 'spikes' });
  c.flat(120).whoops(4, 118, 30);
  c.jump(240, 210, 76, 250, 210, { pit: 'spikes' });
  c.flat(160).hill(300, 64).finish();
  return { name: 'Air Time', course: c, star: [26, 36, 50] };
}

function level3() { // Whoops & Woes: rhythm terrain that works the suspension
  const c = new Course(180, 324);
  c.flat(340).checkpoint();              // long run-up to build speed
  c.whoops(4, 132, 28);                  // first whoop gauntlet (gentle)
  c.jump(240, 200, 66, 240, 205);
  c.flat(120).checkpoint();
  c.hill(300, 70).dip(280, 74).hill(280, 66);
  c.whoops(4, 130, 30);
  c.jump(260, 210, 74, 260, 210, { landDrop: 24 });
  c.flat(120).checkpoint();
  c.flat(70).saw(0, 150).flat(140);      // saw over the flat — only a threat if you hop
  c.whoops(5, 128, 30);
  c.jump(280, 210, 72, 255, 210);
  c.flat(120).checkpoint();
  c.dip(300, 84).hill(300, 76);
  c.whoops(4, 130, 30);
  c.jump(300, 220, 78, 275, 220, { landDrop: 20 });
  c.flat(160).hill(280, 60).finish();
  return { name: 'Whoops & Woes', course: c, star: [30, 42, 56] };
}

function level4() { // Danger Zone: saws, barrels, spikes — timing gauntlet
  const c = new Course(180, 320);
  c.flat(260).checkpoint();
  c.hill(300, 66);
  c.flat(60).saw(0, 148).flat(120);
  c.jump(260, 200, 64, 240, 200, { pit: 'barrel', nPit: 2 });
  c.flat(100).checkpoint();
  c.bumps(4, 152, 26);
  c.flat(60).saw(0, 150).flat(60).saw(0, 150).flat(120);  // twin saws
  c.jump(260, 210, 74, 260, 210, { pit: 'spikes' });
  c.flat(100).checkpoint();
  c.dip(300, 82);
  c.jump(280, 210, 72, 255, 210, { pit: 'barrel', nPit: 2 });
  c.whoops(4, 120, 32);
  c.flat(70).saw(0, 155).flat(120);
  c.jump(280, 220, 78, 280, 220, { landDrop: 20, pit: 'spikes' });
  c.flat(100).checkpoint();
  c.hill(300, 78);
  c.flat(80).saw(0, 156).flat(140);
  c.jump(300, 220, 80, 285, 225, { pit: 'barrel', nPit: 2 });
  c.flat(160).hill(280, 70).finish();
  return { name: 'Danger Zone', course: c, star: [32, 44, 60] };
}

function level5() { // Cliffhanger: big drops, flip gaps, steep landings
  const c = new Course(180, 300);
  c.flat(300).checkpoint();
  c.jump(120, 210, 74, 250, 200, { landDrop: 44 });     // drop off a ledge
  c.flat(120).checkpoint();
  c.hill(320, 78);
  c.jump(320, 230, 80, 278, 228, { landDrop: 36 });     // big flip gap
  c.flat(120).whoops(4, 130, 30);
  c.jump(300, 220, 78, 268, 216, { landDrop: 40, pit: 'spikes' });
  c.flat(120).checkpoint();
  c.dip(300, 86).hill(300, 78);
  c.jump(320, 235, 80, 280, 230, { landDrop: 30 });     // biggest air
  c.flat(120).saw(0, 158).flat(130);
  c.jump(300, 220, 78, 270, 220, { landDrop: 40 });
  c.flat(120).checkpoint();
  c.whoops(5, 130, 30);
  c.jump(320, 230, 80, 280, 226, { landDrop: 28, pit: 'spikes' });
  c.flat(160).hill(300, 66).finish();
  return { name: 'Cliffhanger', course: c, star: [34, 48, 64] };
}

function level6() { // Grand Finale: everything, longer, climactic
  const c = new Course(180, 316);
  c.flat(260).checkpoint();
  c.jump(120, 200, 62, 230, 200);
  c.bumps(3, 156, 24);
  c.jump(280, 210, 74, 260, 210, { pit: 'barrel', nPit: 2 });
  c.flat(120).checkpoint();
  c.hill(300, 72);
  c.flat(60).saw(0, 150).flat(130);
  c.dip(300, 84);
  c.jump(320, 230, 80, 280, 225, { landDrop: 26, pit: 'spikes' });
  c.flat(120).checkpoint();
  c.whoops(5, 128, 30);
  c.flat(70).saw(0, 152).flat(70).saw(0, 152).flat(140);
  c.jump(300, 210, 76, 265, 210, { landDrop: 20, pit: 'barrel', nPit: 2 });
  c.flat(120).checkpoint();
  c.hill(300, 78);
  c.jump(320, 235, 80, 280, 230, { landDrop: 36 });     // big finale air
  c.whoops(5, 130, 30);
  c.flat(90).saw(0, 156).flat(140);
  c.jump(320, 230, 80, 280, 226, { pit: 'spikes' });
  c.flat(120).checkpoint();
  c.dip(300, 86).hill(300, 78);
  c.jump(320, 235, 80, 280, 230, { landDrop: 30, pit: 'barrel', nPit: 2 });
  c.flat(160).saw(0, 150).flat(160);
  c.hill(300, 70).finish();
  return { name: 'Grand Finale', course: c, star: [40, 56, 76] };
}

export function buildLevels() { return [level1(), level2(), level3(), level4(), level5(), level6()]; }

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

function level1() { // Warm-Up: gas, small jumps, land
  const c = new Course(180, 330);
  c.flat(260).checkpoint();
  c.hill(300, 58).hill(280, 46);
  c.jump(300, 190, 56, 220, 200);
  c.flat(120).checkpoint();
  c.dip(280, 80).hill(300, 66);
  c.jump(320, 200, 60, 240, 210, { landDrop: 30 });
  c.flat(200).hill(280, 56).finish();
  return { name: 'Warm-Up', course: c, star: [13, 19, 27] };
}

function level2() { // Air Time: bigger jumps for flips, spikes in pits
  const c = new Course(180, 320);
  c.flat(300);
  c.jump(60, 200, 72, 250, 210, { pit: 'spikes' });
  c.flat(120).checkpoint();
  c.hill(300, 74).dip(260, 64);
  c.jump(300, 220, 78, 270, 220, { landDrop: 20, pit: 'spikes' });
  c.flat(120).checkpoint();
  c.bumps(3, 150, 30);
  c.jump(300, 210, 74, 260, 210);
  c.flat(120).checkpoint();
  c.hill(300, 84);
  c.jump(300, 220, 80, 280, 220, { pit: 'spikes' });
  c.flat(160).hill(300, 66).finish();
  return { name: 'Air Time', course: c, star: [18, 26, 36] };
}

function level3() { // Danger Zone: barrels, saws, whoops
  const c = new Course(180, 320);
  c.flat(280).checkpoint();
  c.hill(300, 66);
  c.flat(70).saw(0, 150).flat(130);   // saw hangs high over flat -> threat only if you jump into it
  c.jump(280, 200, 64, 240, 200);
  c.flat(120).checkpoint();
  c.bumps(4, 158, 26);                 // whoops (rollable at speed)
  c.jump(300, 210, 74, 260, 210, { pit: 'barrel', nPit: 2 });
  c.flat(120).checkpoint();
  c.flat(70).saw(0, 150).flat(70);
  c.dip(300, 78);
  c.jump(300, 210, 72, 260, 210, { pit: 'spikes' });
  c.flat(120).checkpoint();
  c.flat(70).saw(0, 155).flat(130);
  c.jump(300, 220, 78, 280, 220, { pit: 'barrel', nPit: 2 });
  c.flat(140).hill(280, 74).finish();
  return { name: 'Danger Zone', course: c, star: [20, 28, 40] };
}

function level4() { // Grand Finale: everything, longer
  const c = new Course(180, 320);
  c.flat(240).checkpoint();
  c.jump(120, 200, 62, 230, 200);
  c.flat(80); c.bumps(3, 158, 24);
  c.jump(280, 210, 74, 260, 210, { pit: 'barrel', nPit: 2 });
  c.flat(120).checkpoint();
  c.hill(280, 70);
  c.flat(70).saw(0, 152).flat(120);
  c.dip(300, 82);
  c.jump(300, 220, 80, 280, 220, { pit: 'spikes' });
  c.flat(120).checkpoint();
  c.bumps(4, 158, 26);
  c.flat(70).saw(0, 155).flat(120);
  c.jump(300, 210, 76, 270, 210, { landDrop: 20, pit: 'barrel', nPit: 2 });
  c.flat(120).checkpoint();
  c.hill(300, 80);
  c.flat(80).saw(0, 158).flat(140);
  c.jump(320, 230, 84, 300, 230, { pit: 'spikes' });
  c.flat(160).saw(0, 150).flat(180);
  c.hill(300, 76).finish();
  return { name: 'Grand Finale', course: c, star: [24, 34, 48] };
}

export function buildLevels() { return [level1(), level2(), level3(), level4()]; }

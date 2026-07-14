// levels.js — course builder + level definitions for Moto Rush X3.
// Turtle-style builder emits a ground polyline (wheels roll on top), hazards,
// checkpoints and a finish marker. Geometry is sized to the measured jump
// physics: ~300px runway -> ramp -> gap(<=300) -> landing slope. Ground hazards
// (spikes, barrels) sit at pit bottoms so a cleared jump flies over them; saws
// hang overhead above the racing line. So hazards punish mistimed play rather
// than being unavoidable walls — and the courses stay completable.

const STEP = 10;

export const COURSE_VERSION = 'course-4';

export class Course {
  constructor(startX, startY) {
    this.x = startX; this.y = startY;
    this.startX = startX; this.startY = startY;
    this.ground = [{ x: startX - 240, y: startY }, { x: startX, y: startY }];
    this.chains = [this.ground];
    this.render = [{ type: 'ground', pts: this.ground }];
    this.hazards = []; this.platforms = []; this.forceZones = []; this.checkpoints = []; this.decos = [];
    this.finishX = null; this.finishPt = null;
    this.minY = startY; this.maxY = startY;
    this._surface = 'dirt'; this._surfaceStrength = 1;
  }
  _push(x, y) {
    this.ground.push({ x, y, surface: this._surface, surfaceStrength: this._surfaceStrength });
    this.x = x; this.y = y;
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
  _surf(type, w, strength = 1) {
    const prev = this._surface, prevStrength = this._surfaceStrength;
    this._surface = type; this._surfaceStrength = strength; this.flat(w);
    this._surface = prev; this._surfaceStrength = prevStrength;
    return this;
  }
  ice(w) { return this._surf('ice', w); }
  boost(w, strength = 1) { return this._surf('boost', w, strength); }
  bouncy(w, strength = 1) { return this._surf('bouncy', w, strength); }
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
    const x = this.x + (opts.dx || 0), y = (opts.y != null ? opts.y : this.y) + (opts.dy || 0);
    this.hazards.push({ type, x, y, baseX: x, baseY: y, r, spin: 0,
      motion: opts.motion || null, fuse: opts.fuse, boost: opts.boost, core: opts.core });
    return this;
  }
  movingSaw(dx, height, { axis = 'y', amplitude = 70, period = 2.4, phase = 0 } = {}) {
    return this.hazard('saw', { dx, dy: -height, motion: { kind: 'sine', axis, amplitude, period, phase } });
  }
  pendulum(dx, anchorHeight = 210, length = 130, period = 2.8, phase = 0) {
    const anchorX = this.x + dx, anchorY = this.y - anchorHeight;
    this.hazards.push({ type: 'mace', x: anchorX, y: anchorY + length, baseX: anchorX,
      baseY: anchorY + length, anchorX, anchorY, r: 38, spin: 0,
      motion: { kind: 'pendulum', length, amplitude: 0.82, period, phase } });
    return this;
  }
  crusher(dx, height = 205, travel = 125, period = 2.6, phase = 0) {
    return this.hazard('crusher', { dx, dy: -height, r: 46,
      motion: { kind: 'piston', axis: 'y', amplitude: travel, period, phase } });
  }
  tnt(dx = 0, dy = -24, opts = {}) {
    return this.hazard('tnt', { dx, dy, r: 30, fuse: opts.fuse ?? 0.18,
      boost: opts.boost ?? 760, core: opts.core ?? 30 });
  }
  platform(dx = 0, dy = -80, opts = {}) {
    const id = opts.id || `platform-${this.platforms.length}`;
    this.platforms.push({ id, x: this.x + dx, y: this.y + dy,
      width: opts.width ?? 170, height: opts.height ?? 22,
      startActive: opts.startActive !== false,
      triggerX: opts.triggerX ?? (opts.triggerDx == null ? null : this.x + opts.triggerDx),
      surface: opts.surface || 'metal', motion: opts.motion || { kind: 'static' },
      render: { model: opts.model || 'freight', warningStripe: opts.warningStripe !== false } });
    return this;
  }
  forceZone(dx = 0, dy = -90, opts = {}) {
    const finite = (value, fallback) => Number.isFinite(value) ? value : fallback;
    const acceleration = opts.acceleration && typeof opts.acceleration === 'object'
      ? opts.acceleration : {};
    this.forceZones.push({
      id: String(opts.id || `kinetic-loom-${this.forceZones.length}`),
      kind: 'kinetic-loom',
      x: this.x + finite(dx, 0),
      y: this.y + finite(dy, -90),
      width: Math.max(1, finite(opts.width, 220)),
      height: Math.max(1, finite(opts.height, 120)),
      acceleration: {
        x: finite(acceleration.x, 0),
        y: finite(acceleration.y, 0),
      },
      angularAcceleration: finite(opts.angularAcceleration, 0),
      enabled: opts.enabled !== false,
      render: {
        model: 'kinetic-loom',
        palette: String(opts.palette || 'cyan'),
        label: String(opts.label || 'KINETIC LOOM'),
      },
    });
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
  return { name: 'Warm-Up', world: 'Canyon Run', course: c, star: [18, 25, 34] };
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
  return { name: 'Air Time', world: 'Canyon Run', course: c, star: [26, 36, 50] };
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
  return { name: 'Whoops & Woes', world: 'Canyon Run', course: c, star: [30, 42, 56] };
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
  return { name: 'Danger Zone', world: 'Canyon Run', course: c, star: [32, 44, 60] };
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
  c.flat(120).saw(0, 220).flat(130);       // high route remains safe after varied landings
  c.jump(300, 220, 78, 270, 220, { landDrop: 40 });
  c.flat(120).checkpoint();
  c.whoops(5, 130, 30);
  c.jump(320, 230, 80, 280, 226, { landDrop: 28, pit: 'spikes' });
  c.flat(160).hill(300, 66).finish();
  return { name: 'Cliffhanger', world: 'Canyon Run', course: c, star: [34, 48, 64] };
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
  c.flat(160).saw(0, 220).flat(160);
  c.hill(300, 70).finish();
  return { name: 'Grand Finale', world: 'Canyon Run', course: c, star: [40, 56, 76] };
}

function level7() { // Boostline: surface acceleration is taught safely before gaps
  const c = new Course(180, 320);
  c.flat(220).checkpoint().boost(260, 0.8).flat(120);
  c.jump(120, 210, 72, 270, 220).flat(120).checkpoint();
  c.hill(300, 70).boost(210, 0.9).jump(80, 220, 78, 285, 225, { landDrop: 20 });
  c.flat(140).movingSaw(80, 168, { axis: 'y', amplitude: 54, period: 2.6 }).flat(180).checkpoint();
  c.bouncy(150, 0.9).hill(280, 64).jump(220, 215, 76, 270, 220);
  c.flat(160).boost(230, 1).whoops(4, 132, 24).hill(300, 68).finish();
  return { name: 'Boostline', world: 'Stormworks', course: c, star: [24, 34, 48] };
}

function level8() { // Pendulum Pass: readable rhythm hazards with safe runways
  const c = new Course(180, 318);
  c.flat(300).checkpoint();
  c.flat(90).pendulum(70, 218, 142, 3.1, 0).flat(210);
  c.jump(240, 205, 68, 245, 205).flat(130).checkpoint();
  c.dip(300, 76).flat(100).pendulum(80, 225, 150, 2.7, 0.3).flat(220);
  c.jump(260, 215, 76, 270, 218, { pit: 'spikes' }).flat(120).checkpoint();
  c.whoops(4, 132, 25).flat(80).pendulum(70, 215, 138, 2.35, 0.65).flat(180);
  c.boost(190, 0.7).jump(120, 220, 78, 280, 224).flat(150).hill(300, 64).finish();
  return { name: 'Pendulum Pass', world: 'Stormworks', course: c, star: [27, 38, 53] };
}

function level9() { // Cold Circuit: low-grip braking and committed boost exits
  const c = new Course(180, 316);
  c.flat(260).checkpoint().ice(360).flat(120);
  c.jump(180, 205, 68, 250, 205).flat(120).checkpoint();
  c.ice(420).hill(280, 62).flat(100).movingSaw(70, 164, { axis: 'x', amplitude: 72, period: 2.8 });
  c.flat(210).jump(260, 215, 74, 265, 215, { landDrop: 18 }).flat(120).checkpoint();
  c.ice(310).dip(280, 74).boost(190, 0.85).jump(80, 220, 78, 278, 222);
  c.flat(150).bouncy(150).whoops(4, 134, 24).hill(300, 66).finish();
  return { name: 'Cold Circuit', world: 'Stormworks', course: c, star: [29, 41, 56] };
}

function level10() { // Blast Foundry: TNT can punish a stall or launch a clean line
  const c = new Course(180, 320);
  c.flat(280).checkpoint();
  c.jump(120, 205, 70, 260, 210, { pit: 'tnt' }).flat(130).checkpoint();
  c.hill(300, 72).flat(100).tnt(90).flat(220);
  c.jump(220, 220, 80, 285, 225, { pit: 'tnt', nPit: 2 }).flat(130).checkpoint();
  c.whoops(4, 134, 25).boost(180, 0.72).jump(100, 220, 78, 280, 222);
  c.flat(140).tnt(80).flat(210).movingSaw(90, 170, { axis: 'y', amplitude: 50, period: 2.3 });
  c.flat(170).jump(240, 220, 78, 278, 222, { landDrop: 20 }).hill(300, 68).finish();
  return { name: 'Blast Foundry', world: 'Stormworks', course: c, star: [30, 42, 58] };
}

function level11() { // Piston Works: wait for a cycle or boost under it
  const c = new Course(180, 318);
  c.flat(300).checkpoint();
  c.flat(120).crusher(70, 220, 132, 2.9, 0).flat(230);
  c.jump(220, 210, 72, 255, 210).flat(130).checkpoint();
  c.boost(180, 0.78).flat(100).crusher(70, 225, 138, 2.45, 0.4).flat(230);
  c.dip(300, 80).whoops(4, 132, 25).flat(120).checkpoint();
  c.flat(100).crusher(60, 218, 128, 2.2, 0.7).flat(110).pendulum(90, 220, 142, 2.6, 0.2).flat(210);
  c.jump(260, 220, 78, 278, 222, { pit: 'spikes' }).flat(160).hill(300, 68).finish();
  return { name: 'Piston Works', world: 'Stormworks', course: c, star: [31, 44, 60] };
}

function level12() { // Stormbreak: full first-campaign remix and spectacle finish
  const c = new Course(180, 316);
  c.flat(260).checkpoint().boost(220, 0.85);
  c.jump(100, 215, 76, 275, 220, { pit: 'tnt' }).flat(130);
  c.flat(100).pendulum(70, 220, 145, 2.5, 0.2).flat(220).checkpoint();
  c.ice(300).whoops(4, 134, 24).bouncy(150).jump(160, 220, 78, 280, 224);
  c.flat(130).crusher(70, 225, 136, 2.4, 0.5).flat(230).checkpoint();
  c.hill(300, 76).movingSaw(80, 172, { axis: 'x', amplitude: 80, period: 2.4 }).flat(180);
  c.jump(260, 225, 80, 285, 228, { landDrop: 24, pit: 'tnt', nPit: 2 });
  c.flat(130).boost(220, 1).whoops(5, 132, 25).flat(120).checkpoint();
  c.flat(100).pendulum(70, 225, 150, 2.25, 0.65).flat(220);
  c.jump(260, 225, 80, 285, 228, { pit: 'spikes' }).flat(170).hill(320, 72).finish();
  return { name: 'Stormbreak', world: 'Stormworks', course: c, star: [38, 53, 72] };
}

function level13() { // Freight Flight: optional moving decks above a safe service road
  const c = new Course(180, 320);
  c.flat(260).checkpoint().ramp(190, 72).flat(80)
    .platform(95, -108, { id: 'freight-rail-a', width: 190,
      motion: { kind: 'horizontal-sine', amplitude: 82, period: 2.8, phase: 0.1 } });
  c.fall(280, 72).flat(260).checkpoint().hill(300, 76)
    .platform(100, -118, { id: 'freight-lift-a', width: 160,
      motion: { kind: 'lift', distance: 112, period: 3.2, direction: -1 } });
  c.dip(320, 88).boost(190, 0.72).jump(100, 215, 74, 260, 215).flat(150).checkpoint();
  c.whoops(4, 134, 24).platform(140, -104, { id: 'freight-rail-b', width: 210,
    motion: { kind: 'horizontal-ping-pong', amplitude: 100, period: 3.4, phase: 0.35 } });
  c.flat(300).hill(300, 68).finish();
  return { name: 'Freight Flight', world: 'R&D Yard', course: c, star: [20, 29, 42] };
}

function level14() { // Lift Logic: vertical decks create timing and recovery lines
  const c = new Course(180, 318);
  c.flat(300).checkpoint().hill(280, 70).flat(120)
    .platform(80, -92, { id: 'lift-logic-a', width: 180,
      startActive: false, triggerDx: -70, model: 'sensor-lift',
      motion: { kind: 'vertical-sine', amplitude: 70, period: 2.7 } });
  c.dip(360, 96).ice(260).flat(150).checkpoint()
    .platform(130, -126, { id: 'lift-logic-b', width: 150,
      motion: { kind: 'lift', distance: 138, period: 3.5, direction: -1, phase: 0.25 } });
  c.jump(260, 220, 78, 278, 222).flat(140).bouncy(150).whoops(4, 134, 24).checkpoint();
  c.platform(150, -112, { id: 'lift-logic-c', width: 220,
    motion: { kind: 'vertical-ping-pong', amplitude: 86, period: 3.1, phase: 0.5 } });
  c.boost(220, 0.86).hill(320, 72).finish();
  return { name: 'Lift Logic', world: 'R&D Yard', course: c, star: [22, 32, 46] };
}

function level15() { // Proof Circuit: a compact replay-friendly mixed-mechanic trial
  const c = new Course(180, 316);
  c.flat(260).checkpoint().boost(210, 0.8).jump(100, 210, 72, 260, 215).flat(120)
    .platform(100, -108, { id: 'proof-shuttle', width: 190,
      motion: { kind: 'horizontal-sine', amplitude: 92, period: 2.5, phase: 0.2 } });
  c.flat(420).pendulum(70, 220, 142, 2.65, 0.25).flat(220).checkpoint();
  c.ice(260).bouncy(150).jump(160, 220, 78, 280, 224, { pit: 'tnt' }).flat(130)
    .platform(120, -118, { id: 'proof-lift', width: 170,
      motion: { kind: 'lift', distance: 126, period: 3, direction: -1, phase: 0.4 } });
  c.whoops(4, 134, 24).boost(190, 0.9).hill(320, 72).finish();
  return { name: 'Proof Circuit', world: 'R&D Yard', course: c, star: [24, 35, 50] };
}

function level16() { // Vector Weave: three readable force fields over a forgiving service road
  const c = new Course(180, 320);
  c.flat(260).checkpoint()
    .forceZone(160, -70, { id: 'weave-assist', width: 250, height: 110,
      acceleration: { x: 480, y: 0 }, palette: 'cyan', label: 'FLOW ASSIST' });
  c.flat(420).hill(280, 58)
    .forceZone(-110, -160, { id: 'weave-loft', width: 180, height: 120,
      acceleration: { x: 170, y: -820 }, palette: 'magenta', label: 'LOFT LINE' })
    .platform(320, -170, { id: 'weave-sky-deck', width: 180, height: 22,
      motion: { kind: 'static' }, model: 'sensor-lift' })
    .flat(360).checkpoint();
  c.forceZone(260, -55, { id: 'weave-correction', width: 220, height: 150,
    acceleration: { x: 60, y: -360 }, palette: 'amber', label: 'SOFT LANDING' })
    .dip(320, 34).flat(160).checkpoint();
  c.whoops(3, 150, 20).flat(220).hill(280, 50).flat(180).finish();
  return { name: 'Vector Weave', world: 'R&D Yard', course: c, star: [18, 27, 40] };
}

export function buildLevels() {
  return [level1(), level2(), level3(), level4(), level5(), level6(),
    level7(), level8(), level9(), level10(), level11(), level12(),
    level13(), level14(), level15(), level16()];
}

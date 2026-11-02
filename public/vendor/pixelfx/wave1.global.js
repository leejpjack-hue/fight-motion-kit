(() => {
  var __defProp = Object.defineProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };

  // public/vendor/pixelfx/src/core/math.js
  var TAU = Math.PI * 2;
  var clamp = (x, a = 0, b = 1) => x < a ? a : x > b ? b : x;
  var seg = (t, t0, t1) => clamp((t - t0) / (t1 - t0));
  var smooth = (e0, e1, x) => {
    const t = seg(x, e0, e1);
    return t * t * (3 - 2 * t);
  };
  var ease = {
    linear: (t) => t,
    inQuad: (t) => t * t,
    outQuad: (t) => 1 - (1 - t) * (1 - t),
    inOutQuad: (t) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2,
    inCubic: (t) => t * t * t,
    outCubic: (t) => 1 - Math.pow(1 - t, 3),
    inOutCubic: (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
    inQuart: (t) => t * t * t * t,
    outQuart: (t) => 1 - Math.pow(1 - t, 4),
    inExpo: (t) => t <= 0 ? 0 : Math.pow(2, 10 * t - 10),
    outExpo: (t) => t >= 1 ? 1 : 1 - Math.pow(2, -10 * t),
    inSine: (t) => 1 - Math.cos(t * Math.PI / 2),
    outSine: (t) => Math.sin(t * Math.PI / 2),
    inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
    inBack: (t, s = 1.70158) => t <= 0 ? 0 : t >= 1 ? 1 : (s + 1) * t * t * t - s * t * t,
    outBack: (t, s = 1.70158) => t <= 0 ? 0 : t >= 1 ? 1 : 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2),
    outElastic: (t) => t <= 0 ? 0 : t >= 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (2 * Math.PI / 3)) + 1,
    outBounce: (t) => {
      const n = 7.5625, d = 2.75;
      if (t < 1 / d) return n * t * t;
      if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
      if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
      return n * (t -= 2.625 / d) * t + 0.984375;
    }
  };
  function hash(...ns) {
    let h = 2654435769;
    for (const n of ns) {
      h = Math.imul(h ^ (n | 0), 2246822507);
      h ^= h >>> 13;
      h = Math.imul(h, 3266489909);
      h ^= h >>> 16;
    }
    return h >>> 0;
  }
  var rand = (...ns) => hash(...ns) / 4294967296;
  var Rng = class {
    constructor(seed = 1) {
      this.s = seed >>> 0 || 1;
    }
    next() {
      let t = this.s = this.s + 1831565813 >>> 0;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }
    range(a, b) {
      return a + (b - a) * this.next();
    }
    int(a, b) {
      return Math.floor(this.range(a, b + 1));
    }
    chance(p) {
      return this.next() < p;
    }
    sign() {
      return this.next() < 0.5 ? -1 : 1;
    }
    pick(list) {
      return list[Math.floor(this.next() * list.length)];
    }
    /** Roughly normal, mean 0, sd 1. */
    gauss() {
      return (this.next() + this.next() + this.next() + this.next() - 2) * 1.732;
    }
  };

  // public/vendor/pixelfx/src/core/color.js
  var rgb = (r, g, b) => 255 << 24 | (b & 255) << 16 | (g & 255) << 8 | r & 255;
  var red = (c) => c & 255;
  var green = (c) => c >>> 8 & 255;
  var blue = (c) => c >>> 16 & 255;
  function hex(h) {
    if (typeof h === "number") return h;
    let s = h.replace("#", "");
    if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
    const v = parseInt(s.slice(0, 6), 16);
    return rgb(v >> 16 & 255, v >> 8 & 255, v & 255);
  }
  var toHex = (c) => "#" + [red(c), green(c), blue(c)].map((v) => v.toString(16).padStart(2, "0")).join("");
  function mix(a, b, t) {
    t = clamp(t);
    return rgb(red(a) + (red(b) - red(a)) * t, green(a) + (green(b) - green(a)) * t, blue(a) + (blue(b) - blue(a)) * t);
  }
  var scale = (c, k) => rgb(Math.min(255, red(c) * k), Math.min(255, green(c) * k), Math.min(255, blue(c) * k));
  var luma = (c) => (0.299 * red(c) + 0.587 * green(c) + 0.114 * blue(c)) / 255;
  var ramp = (list) => list.map(hex);
  function fit(r, n) {
    r = r.map(hex);
    if (r.length === n) return r;
    return Array.from({ length: n }, (_, i) => r[Math.round(i * (r.length - 1) / Math.max(1, n - 1))]);
  }
  var PAL = {
    fire: ["#1f0b10", "#4a1118", "#8c1d1c", "#cc3a1a", "#f2701f", "#ffae35", "#ffe27a", "#fff8d6"],
    ember: ["#1a0a0e", "#3d1012", "#701a14", "#a8301a", "#e0561e", "#ff8a2a", "#ffc46a"],
    lava: ["#14060a", "#380a10", "#6e1210", "#ac2410", "#e8501a", "#ff8c2a", "#ffd25a"],
    smoke: ["#0e0c12", "#1d1a22", "#2e2a35", "#433e4b", "#5c5664", "#7b7484", "#a39cab"],
    dust: ["#1c1610", "#33281c", "#4f3f2c", "#6e5a40", "#927a58", "#b89f78", "#dcc8a2"],
    ice: ["#0c1430", "#162c5c", "#1f4f94", "#2f7fcc", "#58b4ec", "#9bdcff", "#d8f4ff", "#ffffff"],
    water: ["#081830", "#0e2e5a", "#14508c", "#1c76bc", "#36a2e0", "#78ccf4", "#c4ecff", "#ffffff"],
    electric: ["#0a0f2e", "#172a78", "#2550d0", "#3f8cff", "#7cc8ff", "#c8f0ff", "#ffffff"],
    volt: ["#24160a", "#5e3a0c", "#a8680f", "#e8a218", "#ffd23c", "#fff08a", "#ffffff"],
    poison: ["#0d1a0c", "#173a14", "#265e18", "#3f8a1e", "#6cb82a", "#a8e04a", "#e0ff8a"],
    holy: ["#2a1c08", "#5a3e10", "#9a6c18", "#d8a428", "#ffd84a", "#fff09a", "#fffbe6", "#ffffff"],
    heal: ["#08201a", "#0f3f2c", "#17663e", "#24924e", "#3ec466", "#7ee88a", "#c8ffc4", "#ffffff"],
    arcane: ["#140a26", "#2b1252", "#481c88", "#6b2cc0", "#9a48ec", "#c684ff", "#ecc8ff", "#ffffff"],
    shadow: ["#050308", "#0f0a18", "#1c1230", "#2c1a4a", "#432468", "#5e3290", "#8048b8", "#a970e0"],
    blood: ["#14040a", "#3a0a14", "#6a101c", "#a01824", "#d42a30", "#ff5a50", "#ff9a8a"],
    earth: ["#140e0a", "#2a1e14", "#47321e", "#69492a", "#8e6638", "#b88a52", "#dcb47c"],
    stone: ["#0e0e12", "#1c1c24", "#2c2c38", "#42424f", "#5c5c6b", "#7d7d8c", "#a4a4b2", "#d0d0da"],
    gold: ["#1e1206", "#4a2c08", "#86520c", "#c48412", "#f0b424", "#ffe066", "#fff6c4", "#ffffff"],
    leaf: ["#0c1a0e", "#163418", "#225224", "#357530", "#4f9a3a", "#7cc048", "#b4e070", "#e4ffb0"],
    wood: ["#160c06", "#2e1a0c", "#4a2c14", "#6a421e", "#8e5c2c", "#b47c40", "#d8a464"],
    metal: ["#0c0e14", "#1c2230", "#2e3648", "#4a5468", "#6e7a90", "#9aa6ba", "#d0d8e6", "#ffffff"],
    bone: ["#1a1814", "#3a352c", "#5e5648", "#8a806c", "#b8ad96", "#e4dcc8", "#fffaf0"],
    neon: ["#1a0516", "#3d0a33", "#701560", "#b0228f", "#f53cd1", "#ff86e6", "#ffd2f6", "#ffffff"],
    cyber: ["#041418", "#08303a", "#0c5260", "#108088", "#18b4b0", "#4ce8d8", "#b4fff0", "#ffffff"],
    matrix: ["#020a04", "#05200c", "#0a3c16", "#106624", "#1a9a34", "#3cd650", "#a4ffa8", "#e8ffe8"],
    candy: ["#ff4a5a", "#ff9a2a", "#ffe03c", "#5ad84a", "#3cc8ff", "#7a6cff", "#f53cd1"],
    night: ["#07060d", "#0c0a18", "#131026", "#1b1734", "#241f44", "#2f2956"]
  };
  var RAMP = Object.fromEntries(Object.entries(PAL).map(([k, v]) => [k, ramp(v)]));
  var WHITE = hex("#ffffff");
  var BLACK = hex("#000000");
  var INK = hex("#0b0a10");
  var PATCH = hex("#f53cd1");

  // public/vendor/pixelfx/src/core/sim.js
  var GRAVITY = 950;
  var CROSS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  var DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
  var HOT = ["#fff3a6", "#ffe26b", "#ff8a2a", "#f2561d"].map(hex);
  var FIRE_RAMP = ["#ffffff", "#fff3a6", "#ffe26b", "#ffc23d", "#ff8a2a", "#f2561d", "#c9281f", "#8a1f17", "#4a1712"].map(hex);
  var SMOKE_RAMP = ["#7b6f72", "#5d5660", "#433d48", "#2b2630", "#1a171e"].map(hex);
  var rampAt = (r, t) => r[Math.min(r.length - 1, Math.max(0, Math.floor(t * r.length)))];
  var P = { SPARK: 0, MOTE: 1, STREAK: 2, FLAKE: 3, VAPOUR: 4, DUST: 5, STAR: 6, EMBER: 7, SMOKE: 8, FIRE: 9, BRAND: 10, GRIT: 11 };
  var PF = { SMOKES: 1, BIG: 2, BACK: 4 };
  var SOFT = /* @__PURE__ */ new Set([P.VAPOUR, P.DUST, P.SMOKE]);
  var Particles = class {
    constructor(opts = {}) {
      this.R = opts.rng ?? new Rng(opts.seed ?? 1);
      this.list = [];
      this.t = 0;
      this.ground = opts.ground ?? (() => Infinity);
      this.sparks = (opts.sparks ?? HOT).map(hex);
      this.haze = opts.haze === void 0 ? null : hex(opts.haze);
      this.onLand = opts.onLand ?? null;
    }
    /** delay: seconds before it appears; flag: PF bits. col 0 lets FIRE and SMOKE use their own ramps. */
    spawn(k, x, y, vx, vy, life, col = WHITE, size = 1, delay = 0, flag = 0) {
      this.list.push({ k, x, y, vx, vy, life, max: life, col: col ? hex(col) : 0, size, seed: this.R.next() * 100, delay, flag });
    }
    get count() {
      return this.list.length;
    }
    update(dt) {
      this.t += dt;
      const R = this.R, t = this.t;
      for (let i = this.list.length - 1; i >= 0; i--) {
        const p = this.list[i];
        if (p.delay > 0) {
          p.delay -= dt;
          continue;
        }
        if ((p.life -= dt) <= 0) {
          if (p.k === P.FIRE && p.flag & PF.SMOKES) {
            const big = p.flag & PF.BIG;
            this.spawn(P.SMOKE, p.x, p.y, p.vx * 0.6, p.vy * 0.6 - 6, big ? R.range(1.3, 2.3) : R.range(0.8, 1.4), 0, p.size * (big ? 0.85 : 0.7), 0, big ? PF.BIG : 0);
          }
          this.list.splice(i, 1);
          continue;
        }
        switch (p.k) {
          case P.FIRE:
            p.vy -= 95 * dt;
            p.vx += Math.sin(t * 17 + p.seed) * 30 * dt;
            p.vx -= p.vx * 5 * dt;
            p.vy -= p.vy * 3.2 * dt;
            break;
          case P.GRIT: {
            p.vy += GRAVITY * dt;
            p.vx -= p.vx * 0.8 * dt;
            const g = this.ground(p.x), ny = p.y + p.vy * dt;
            p.x += p.vx * dt;
            if (p.vy > 0 && p.y <= g && ny >= g) {
              p.y = g - 0.25;
              if (p.vy > 130 && R.chance(0.4)) p.vy = -p.vy * 0.25, p.vx = p.vx * 0.5 + R.range(-10, 10);
              else p.vx = p.vy = 0, p.life = Math.min(p.life, 0.5);
            } else p.y = ny;
            continue;
          }
          case P.BRAND: {
            p.vy += GRAVITY * 0.8 * dt;
            p.vx -= p.vx * 0.9 * dt;
            if (R.chance(0.9 * Math.min(1, dt * 60))) this.spawn(P.FIRE, p.x, p.y, p.vx * 0.1 + R.range(-7, 7), p.vy * 0.1 - 10, R.range(0.16, 0.32), 0, R.range(0.9, 1.7) * (0.5 + p.life / p.max * 0.6), 0, R.chance(0.4) ? PF.SMOKES : 0);
            const g = this.ground(p.x), ny = p.y + p.vy * dt;
            p.x += p.vx * dt;
            if (p.vy > 0 && p.y <= g && ny >= g) {
              this.onLand?.(p.x, g);
              this.list.splice(i, 1);
            } else p.y = ny;
            continue;
          }
          case P.SPARK: {
            p.vy += GRAVITY * 0.45 * dt;
            p.vx -= p.vx * 2.2 * dt;
            p.vy -= p.vy * 2.2 * dt;
            const g = this.ground(p.x), ny = p.y + p.vy * dt;
            p.x += p.vx * dt;
            if (p.vy > 0 && p.y <= g && ny >= g) p.vy = -p.vy * 0.45, p.vx *= 0.7, p.y = g - 0.25;
            else p.y = ny;
            continue;
          }
          case P.STREAK:
            p.vx += p.vx * 3 * dt, p.vy += p.vy * 3 * dt;
            break;
          case P.FLAKE:
            p.vx -= p.vx * 2.2 * dt;
            p.vy -= p.vy * 2.2 * dt - 35 * dt;
            p.x += Math.sin(this.t * 2.5 + p.seed) * 7 * dt;
            break;
          case P.EMBER:
            p.vy += (-30 + Math.sin(t * 3 + p.seed) * 20) * dt;
            p.vx += Math.cos(t * 2.3 + p.seed) * 45 * dt;
            p.vx -= p.vx * 1.6 * dt;
            p.vy -= p.vy * 1.6 * dt;
            break;
          case P.SMOKE: {
            const big = p.flag & PF.BIG;
            p.vy -= (big ? 23 : 16) * dt;
            p.vx += Math.sin(t * 1.3 + p.seed) * 8 * dt;
            p.vx -= p.vx * 1.6 * dt;
            p.vy -= p.vy * 1.2 * dt;
            break;
          }
          case P.MOTE:
            p.vx -= p.vx * 0.6 * dt;
            p.vy -= p.vy * 0.6 * dt;
            break;
          default: {
            const drag = SOFT.has(p.k) ? 4 : 1.6;
            p.vx -= p.vx * drag * dt;
            p.vy -= p.vy * drag * dt + 5 * dt;
          }
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
    }
    draw(p, layer) {
      for (const q of this.list) {
        if (q.delay > 0) continue;
        if (layer && (SOFT.has(q.k) || q.flag & PF.BACK ? "back" : "front") !== layer) continue;
        const k = q.life / q.max, x = q.x, y = q.y, sp = Math.hypot(q.vx, q.vy) || 1, ux = q.vx / sp, uy = q.vy / sp;
        switch (q.k) {
          case P.SPARK: {
            const S = this.sparks, head = k > 0.6 ? S[0] : k > 0.3 ? S[1] : S[2], len2 = Math.min(9, 1 + sp * 0.022);
            p.line(x - ux * len2, y - uy * len2, x - ux * len2 * 0.4, y - uy * len2 * 0.4, k > 0.5 ? head : S[S.length - 1]);
            p.line(x - ux * len2 * 0.45, y - uy * len2 * 0.45, x, y, head);
            p.glow(x, y, 3, head, 0.45 * k);
            break;
          }
          case P.MOTE: {
            const len2 = Math.min(16, 0.5 + sp * 0.026) * q.size, a = k < 0.35 ? k / 0.35 : 1;
            p.line(x - ux * len2, y - uy * len2, x - ux * len2 * 0.35, y - uy * len2 * 0.35, scale(q.col, 0.55), a);
            p.line(x - ux * len2 * 0.4, y - uy * len2 * 0.4, x, y, q.col, a);
            p.glow(x, y, 2.5 + q.size, q.col, 0.4 * k);
            break;
          }
          case P.STREAK: {
            const L = clamp(sp / 30, 1, 7);
            for (let d = L; d >= 0; d -= 0.5) p.dot(x - ux * d, y - uy * d, d < 1 ? WHITE : d < L * 0.5 ? q.col : scale(q.col, 0.6), d < L * 0.5 ? 1 : 1.2 - d / L);
            p.glow(x, y, 4, q.col, 0.4);
            break;
          }
          case P.FLAKE: {
            const a = Math.min(1, k * 3);
            p.dot(x, y, q.col, a);
            if (q.size > 1.3) for (const [dx, dy] of CROSS) p.dot(x + dx, y + dy, scale(q.col, 0.8), a * 0.8);
            break;
          }
          case P.VAPOUR: {
            const r = q.size * (0.6 + (1 - k) * 0.9);
            p.disc(x, y, r, q.col, Math.pow(k, 1.3) * 0.45);
            if (this.haze) p.glow(x, y, r * 1.8, this.haze, 0.16 * k);
            break;
          }
          case P.DUST:
            p.disc(x, y, q.size * (0.6 + (1 - k) * 0.9), q.col, Math.pow(k, 1.3) * 0.7);
            break;
          case P.SMOKE: {
            const age = 1 - k, big = q.flag & PF.BIG;
            const r = q.size * (0.65 + Math.min(1, age * 2.5) * 0.45 + age * (big ? 0.5 : 0.4));
            const a = Math.min(1, age * 12) * Math.min(1, k * 2.4) * (big ? 0.7 : 0.58);
            const c = q.col ? mix(q.col, rampAt(SMOKE_RAMP, age), age) : rampAt(SMOKE_RAMP, age * 1.05);
            p.disc(x, y, r, c, a * 0.45);
            p.disc(x + r * 0.05, y + r * 0.06, r * 0.74, c, a * 0.62);
            if (age < 0.5) p.disc(x - r * 0.22, y - r * 0.3, r * 0.5, mix(c, WHITE, 0.12), a * 0.4 * (1 - age * 2));
            break;
          }
          case P.FIRE: {
            const age = 1 - k, heat = Math.min(0.999, Math.pow(age, 0.62) + q.seed % 1 * 0.1), F = FIRE_RAMP, n = F.length;
            const idx = Math.min(n - 2, Math.floor(heat * (n - 1)));
            const r = q.size * (0.55 + 0.45 * Math.min(1, age * 7)) * (1 - age * 0.55), c = F[idx];
            if (idx >= n - 2) p.disc(x, y, r, c, Math.min(1, k * 3) * 0.85);
            else {
              p.circle(x, y, r, F[Math.min(n - 1, idx + 2)]);
              p.circle(x - r * 0.16, y - r * 0.22, r * 0.78, c);
              if (r > 1.6) p.circle(x, y - r * 0.9, r * 0.42, c);
              if (idx <= 3 && r > 1.8) p.circle(x - r * 0.28, y - r * 0.34, r * 0.36, F[Math.max(0, idx - 1)]);
              if (idx < 6) p.glow(x, y, r * 2.4 + 2, c, 0.18 * k);
            }
            break;
          }
          case P.BRAND:
            p.circle(x, y, 1.6, HOT[3]);
            p.px(x, y, Math.sin(this.t * 40 + q.seed) > 0 ? HOT[0] : HOT[1]);
            p.px(x + 1, y, HOT[1]);
            p.glow(x, y, 7, HOT[2], 0.45);
            break;
          case P.GRIT:
            if (k > 0.25 || k * 4 > 0.5) {
              p.px(x, y, q.col);
              if (q.size >= 2) p.px(x + 1, y, q.col), p.px(x, y + 1, scale(q.col, 0.8)), p.px(x + 1, y + 1, scale(q.col, 0.7));
            }
            break;
          case P.EMBER: {
            const c = k > 0.6 ? this.sparks[0] : k > 0.3 ? this.sparks[1] : this.sparks[2];
            if (k < 0.25 && Math.sin(this.t * 40 + q.seed) < 0) break;
            p.px(x, y, c);
            if (q.size > 1.5) p.px(x, y + 1, this.sparks[this.sparks.length - 1]);
            p.glow(x, y, 3 + q.size, c, 0.35 * k);
            break;
          }
          default: {
            const tw = 0.6 + 0.4 * Math.sin(this.t * (8 + q.seed % 5) + q.seed);
            if (q.size < 1) {
              if (tw * k > 0.25) p.px(x, y, tw > 0.8 ? WHITE : q.col);
              p.glow(x, y, 3, q.col, 0.4 * k * tw);
              break;
            }
            sparkle(p, x, y, q.size * tw * Math.min(1, k * 3), q.col, scale(q.col, 0.75), 0.5 * k * tw);
          }
        }
      }
    }
  };
  var B = { SHARD: 0, CHUNK: 1, DRIP: 2 };
  var Bits = class {
    constructor(opts = {}) {
      this.list = [];
      this.ground = opts.ground ?? (() => Infinity);
    }
    add(b) {
      const life = b.life ?? 1;
      this.list.push({ kind: B.SHARD, vx: 0, vy: 0, a: 0, va: 0, s: 1, c: WHITE, g: 1, drag: 0, bounce: 0, rest: false, ...b, life, max: life });
    }
    get count() {
      return this.list.length;
    }
    update(dt) {
      for (let i = this.list.length - 1; i >= 0; i--) {
        const b = this.list[i];
        if ((b.life -= dt) <= 0) {
          this.list.splice(i, 1);
          continue;
        }
        if (b.rest) continue;
        b.vy += GRAVITY * b.g * dt;
        b.vx -= b.vx * b.drag * dt;
        b.vy -= b.vy * b.drag * dt;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.a += b.va * dt;
        const floor = this.ground(b.x), sp = b.vy;
        if (b.g <= 0 || b.y < floor || sp <= 0) continue;
        b.y = floor - 0.01;
        if (b.kind === B.DRIP) b.life = 0;
        else if (b.bounce > 0 && sp > 70) b.vy = -sp * b.bounce, b.vx *= 0.7, b.va *= 0.6;
        else b.rest = true, b.vx = b.vy = 0;
      }
    }
    draw(p) {
      for (const b of this.list) {
        const a = Math.min(1, b.life / 0.4), ca = Math.cos(b.a), sa = Math.sin(b.a);
        if (b.kind === B.SHARD) {
          for (let d = -b.s / 2; d <= b.s / 2; d += 0.5) p.dot(b.x + ca * d, b.y + sa * d, d > b.s / 2 - 0.6 ? WHITE : hex(b.c), a);
        } else if (b.kind === B.DRIP) {
          p.dot(b.x, b.y, hex(b.c), a);
          p.dot(b.x, b.y - 1, hex(b.c), a * 0.5);
        } else {
          const R = (b.ramp ?? ["#1c2030", "#3a4a66", "#6e86a8", "#a8c0dc", "#e8f2ff"]).map(hex), n = R.length;
          const x = Math.round(b.x), y = Math.round(b.y), r = Math.ceil(b.s) + 1;
          for (let py = -r; py <= r; py++)
            for (let px = -r; px <= r; px++) {
              const u = (px + 0.5) * ca + (py + 0.5) * sa, v = -(px + 0.5) * sa + (py + 0.5) * ca;
              const d = Math.abs(u) / b.s + Math.abs(v) / (b.s * 0.62);
              if (d > 1.3) continue;
              p.dot(x + px, y + py, d > 1 ? R[0] : v < 0 ? u < 0 ? R[n - 1] : R[n - 2] : u < 0 ? R[n - 3] : R[Math.max(1, n - 4)], a);
            }
        }
      }
    }
  };
  var Lights = class {
    constructor() {
      this.list = [];
    }
    add(x, y, r, color, k, life) {
      this.list.push({ x, y, r, color: hex(color), k, life, max: life });
    }
    update(dt) {
      for (let i = this.list.length - 1; i >= 0; i--) if ((this.list[i].life -= dt) <= 0) this.list.splice(i, 1);
    }
    draw(p) {
      for (const l of this.list) {
        const k = l.life / l.max;
        p.glow(l.x, l.y, l.r * (0.55 + 0.45 * k), l.color, l.k * k * k);
      }
    }
  };
  function sparkle(p, x, y, arm, c, tip = c, k = 0.6) {
    const n = Math.round(arm);
    if (n < 1) return;
    const X = Math.floor(x), Y = Math.floor(y);
    for (let d = 1; d <= n; d++) {
      const cc = d > n * 0.6 ? tip : c;
      for (const [dx, dy] of CROSS) p.px(X + dx * d, Y + dy * d, cc);
    }
    if (n >= 3) for (const [dx, dy] of DIAG) p.px(X + dx, Y + dy, c);
    if (n >= 6) for (const [dx, dy] of DIAG) p.px(X + dx * 2, Y + dy * 2, tip);
    p.px(X, Y, WHITE);
    p.glow(x, y, 4 + n * 2, c, k);
  }
  function flare(p, x, y, L, k, ramp2) {
    if (L < 1) return;
    const R = ramp2.map(hex), n = R.length;
    for (let i = 0; i < 8; i++) {
      const an = i * Math.PI / 4, len2 = i % 4 === 0 ? L : i % 2 === 0 ? L * 0.6 : L * 0.3, ca = Math.cos(an), sa = Math.sin(an);
      for (let d = 0; d <= len2; d += 0.5) {
        const u = d / len2;
        p.dot(x + ca * d, y + sa * d, u < 0.35 ? WHITE : u < 0.7 ? R[n - 2] : R[n - 3], u < 0.6 ? 1 : k * 1.5 * (1 - u) + 0.2);
      }
    }
  }
  function band(p, cx, cy, r, sy, th, k, ramp2, keep = () => true, hot = false) {
    if (r <= 0 || k <= 0) return;
    const R = ramp2.map(hex), n = R.length;
    for (let j = 0, m = Math.ceil(r * TAU * 1.2); j < m; j++) {
      const ang = j / m * TAU, ca = Math.cos(ang), sa = Math.sin(ang);
      if (!keep(ang)) continue;
      for (let o = th; o >= 0; o -= 0.5) {
        const u = o / th, c = u < 0.15 ? hot ? WHITE : R[n - 1] : u < 0.4 ? R[n - 2] : u < 0.7 ? R[n - 3] : R[n - 4];
        p.dot(cx + ca * (r - o), cy + sa * (r - o) * sy, c, k * (u < 0.4 ? 1.2 : 1.15 - u));
      }
    }
  }

  // public/vendor/pixelfx/src/core/font.js
  var MINI = {
    A: ".#.|#.#|###|#.#|#.#",
    B: "##.|#.#|##.|#.#|##.",
    C: ".##|#..|#..|#..|.##",
    D: "##.|#.#|#.#|#.#|##.",
    E: "###|#..|##.|#..|###",
    F: "###|#..|##.|#..|#..",
    G: ".##|#..|#.#|#.#|.##",
    H: "#.#|#.#|###|#.#|#.#",
    I: "###|.#.|.#.|.#.|###",
    J: "..#|..#|..#|#.#|.#.",
    K: "#.#|#.#|##.|#.#|#.#",
    L: "#..|#..|#..|#..|###",
    M: "#.#|###|###|#.#|#.#",
    N: "##.|#.#|#.#|#.#|#.#",
    O: ".#.|#.#|#.#|#.#|.#.",
    P: "##.|#.#|##.|#..|#..",
    Q: ".#.|#.#|#.#|##.|.##",
    R: "##.|#.#|##.|#.#|#.#",
    S: ".##|#..|.#.|..#|##.",
    T: "###|.#.|.#.|.#.|.#.",
    U: "#.#|#.#|#.#|#.#|###",
    V: "#.#|#.#|#.#|#.#|.#.",
    W: "#.#|#.#|###|###|#.#",
    X: "#.#|#.#|.#.|#.#|#.#",
    Y: "#.#|#.#|.#.|.#.|.#.",
    Z: "###|..#|.#.|#..|###",
    0: "###|#.#|#.#|#.#|###",
    1: ".#.|##.|.#.|.#.|###",
    2: "##.|..#|.#.|#..|###",
    3: "##.|..#|.#.|..#|##.",
    4: "#.#|#.#|###|..#|..#",
    5: "###|#..|##.|..#|##.",
    6: ".##|#..|###|#.#|###",
    7: "###|..#|.#.|.#.|.#.",
    8: "###|#.#|###|#.#|###",
    9: "###|#.#|###|..#|##.",
    "+": "...|.#.|###|.#.|...",
    "-": "...|...|###|...|...",
    "!": "#|#|#|.|#",
    "?": "##.|..#|.#.|...|.#.",
    ".": ".|.|.|.|#",
    ",": "..|..|..|.#|#.",
    ":": ".|#|.|#|.",
    "/": "..#|..#|.#.|#..|#..",
    "%": "#.#|..#|.#.|#..|#.#",
    x: "...|#.#|.#.|#.#|...",
    "*": "#.#|.#.|#.#|...|...",
    "'": "#|#|.|.|.",
    "(": ".#|#.|#.|#.|.#",
    ")": "#.|.#|.#|.#|#.",
    "<": "..#|.#.|#..|.#.|..#",
    ">": "#..|.#.|..#|.#.|#..",
    "=": "...|###|...|###|...",
    _: "...|...|...|...|###",
    "#": "#.#|###|#.#|###|#.#"
  };
  var BIG = {
    A: ".###.|#...#|#...#|#####|#...#|#...#|#...#",
    B: "####.|#...#|#...#|####.|#...#|#...#|####.",
    C: ".###.|#...#|#....|#....|#....|#...#|.###.",
    D: "####.|#...#|#...#|#...#|#...#|#...#|####.",
    E: "#####|#....|#....|####.|#....|#....|#####",
    F: "#####|#....|#....|####.|#....|#....|#....",
    G: ".###.|#...#|#....|#.###|#...#|#...#|.####",
    H: "#...#|#...#|#...#|#####|#...#|#...#|#...#",
    I: "###|.#.|.#.|.#.|.#.|.#.|###",
    J: "..###|...#.|...#.|...#.|...#.|#..#.|.##..",
    K: "#...#|#..#.|#.#..|##...|#.#..|#..#.|#...#",
    L: "#....|#....|#....|#....|#....|#....|#####",
    M: "#...#|##.##|#.#.#|#.#.#|#...#|#...#|#...#",
    N: "#...#|#...#|##..#|#.#.#|#..##|#...#|#...#",
    O: ".###.|#...#|#...#|#...#|#...#|#...#|.###.",
    P: "####.|#...#|#...#|####.|#....|#....|#....",
    Q: ".###.|#...#|#...#|#...#|#.#.#|#..#.|.##.#",
    R: "####.|#...#|#...#|####.|#.#..|#..#.|#...#",
    S: ".####|#....|#....|.###.|....#|....#|####.",
    T: "#####|..#..|..#..|..#..|..#..|..#..|..#..",
    U: "#...#|#...#|#...#|#...#|#...#|#...#|.###.",
    V: "#...#|#...#|#...#|#...#|#...#|.#.#.|..#..",
    W: "#...#|#...#|#...#|#.#.#|#.#.#|#.#.#|.#.#.",
    X: "#...#|#...#|.#.#.|..#..|.#.#.|#...#|#...#",
    Y: "#...#|#...#|.#.#.|..#..|..#..|..#..|..#..",
    Z: "#####|....#|...#.|..#..|.#...|#....|#####",
    0: ".###.|#...#|#..##|#.#.#|##..#|#...#|.###.",
    1: ".#.|##.|.#.|.#.|.#.|.#.|###",
    2: ".###.|#...#|....#|...#.|..#..|.#...|#####",
    3: "#####|...#.|..#..|...#.|....#|#...#|.###.",
    4: "...#.|..##.|.#.#.|#..#.|#####|...#.|...#.",
    5: "#####|#....|####.|....#|....#|#...#|.###.",
    6: "..##.|.#...|#....|####.|#...#|#...#|.###.",
    7: "#####|....#|...#.|..#..|.#...|.#...|.#...",
    8: ".###.|#...#|#...#|.###.|#...#|#...#|.###.",
    9: ".###.|#...#|#...#|.####|....#|...#.|.##..",
    "!": "#|#|#|#|#|.|#",
    "?": ".###.|#...#|....#|...#.|..#..|.....|..#..",
    "+": ".....|..#..|..#..|#####|..#..|..#..|.....",
    "-": "....|....|....|####|....|....|....",
    ".": ".|.|.|.|.|.|#",
    ",": "..|..|..|..|..|.#|#.",
    ":": ".|.|#|.|.|#|.",
    "/": "....#|....#|...#.|..#..|.#...|#....|#....",
    "%": "##...|##..#|...#.|..#..|.#...|#..##|...##",
    x: ".....|.....|#...#|.#.#.|..#..|.#.#.|#...#",
    "*": ".....|..#..|#.#.#|.###.|#.#.#|..#..|.....",
    "'": "#|#|.|.|.|.|.",
    "<": "...#|..#.|.#..|#...|.#..|..#.|...#",
    ">": "#...|.#..|..#.|...#|..#.|.#..|#...",
    "=": "....|....|####|....|####|....|....",
    "(": "..#|.#.|#..|#..|#..|.#.|..#",
    ")": "#..|.#.|..#|..#|..#|.#.|#..",
    "#": ".#.#.|.#.#.|#####|.#.#.|#####|.#.#.|.#.#."
  };
  function build(table, h) {
    const out = {};
    for (const [ch, src] of Object.entries(table)) {
      const rows = src.split("|");
      out[ch] = { w: rows[0].length, rows: rows.map((r) => [...r].map((c) => c === "#")) };
      if (rows.length !== h) throw new Error(`glyph ${ch} has ${rows.length} rows, expected ${h}`);
    }
    return out;
  }
  var FONTS = {
    mini: { h: 5, space: 2, gap: 1, glyphs: build(MINI, 5) },
    big: { h: 7, space: 3, gap: 1, glyphs: build(BIG, 7) }
  };
  function textWidth(str, font = "mini") {
    const F = FONTS[font];
    let w = 0;
    for (const ch of String(str)) {
      const g = F.glyphs[ch] ?? F.glyphs[ch.toUpperCase()];
      w += (g ? g.w : F.space) + F.gap;
    }
    return Math.max(0, w - F.gap);
  }
  function rasterText(str, font, plot2) {
    const F = FONTS[font];
    let x = 0;
    for (const ch of String(str)) {
      const g = F.glyphs[ch] ?? F.glyphs[ch.toUpperCase()];
      if (!g) {
        x += F.space + F.gap;
        continue;
      }
      for (let r = 0; r < F.h; r++) for (let c = 0; c < g.w; c++) if (g.rows[r][c]) plot2(x + c, r);
      x += g.w + F.gap;
    }
  }

  // public/vendor/pixelfx/src/core/painter.js
  var BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
  var OUT = { c: 0, a: 1, l: 0, k: 0 };
  var sprites = /* @__PURE__ */ new WeakMap();
  var call = (v, ...args) => typeof v === "function" ? v(...args) : v;
  var Painter = class {
    constructor(frame2) {
      this.frame = frame2;
      this.reset();
    }
    /** Re-read the frame and clear placement, fade and light strength. */
    reset() {
      const f = this.frame;
      this.w = f.w;
      this.h = f.h;
      this.ox = f.ox | 0;
      this.oy = f.oy | 0;
      this.C = f.color;
      this.L = f.light;
      this.tx = 0;
      this.ty = 0;
      this.fx = 1;
      this.cs = 1;
      this.sn = 0;
      this.fade = 1;
      this.lightK = 1;
      this.layer = "front";
      return this;
    }
    /** Put the effect's origin at (x, y) in frame space, mirrored if flip, rotated by angle (radians). */
    place(x, y, flip = false, angle = 0) {
      this.tx = x;
      this.ty = y;
      this.fx = flip ? -1 : 1;
      this.cs = Math.cos(angle);
      this.sn = Math.sin(angle);
      return this;
    }
    // ---- transforms: local (effect) space <-> screen (frame) space
    toX(x, y) {
      return this.tx + x * this.fx * this.cs - y * this.sn;
    }
    toY(x, y) {
      return this.ty + x * this.fx * this.sn + y * this.cs;
    }
    fromX(sx, sy) {
      const dx = sx - this.tx, dy = sy - this.ty;
      return (dx * this.cs + dy * this.sn) * this.fx;
    }
    fromY(sx, sy) {
      const dx = sx - this.tx, dy = sy - this.ty;
      return -dx * this.sn + dy * this.cs;
    }
    // the screen pixel of the local pixel cell holding (x, y): mirrors and rotations land on whole cells
    cellX(x, y) {
      return Math.floor(this.toX(Math.floor(x) + 0.5, Math.floor(y) + 0.5));
    }
    cellY(x, y) {
      return Math.floor(this.toY(Math.floor(x) + 0.5, Math.floor(y) + 0.5));
    }
    // ---- raw writes, screen space, whole pixels. Color 0 means "nothing": it never erases what's there.
    put(sx, sy, c, a = 1) {
      if (!c) return;
      a *= this.fade;
      if (a < 1 && a <= BAYER[(sy & 3) << 2 | sx & 3]) return;
      const x = sx - this.ox, y = sy - this.oy;
      if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
      this.C[y * this.w + x] = c;
    }
    add(sx, sy, c, k = 1) {
      k *= this.fade * this.lightK;
      if (k <= 4e-3) return;
      const x = sx - this.ox, y = sy - this.oy;
      if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
      const i = y * this.w + x, d = this.L[i];
      const r = Math.min(255, (d & 255) + (c & 255) * k) | 0;
      const g = Math.min(255, (d >>> 8 & 255) + (c >>> 8 & 255) * k) | 0;
      const b = Math.min(255, (d >>> 16 & 255) + (c >>> 16 & 255) * k) | 0;
      this.L[i] = 255 << 24 | b << 16 | g << 8 | r;
    }
    /**
     * Blend a color over what's there at alpha a (0..1), keeping the result's own alpha: soft smoke, vapour and
     * mist. Use dithered dot() for hard pixel fades and blend() for translucent volumes.
     */
    blendPx(sx, sy, c, a) {
      a *= this.fade;
      if (!c || a <= 4e-3) return;
      const x = sx - this.ox, y = sy - this.oy;
      if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
      const i = y * this.w + x, d = this.C[i], da = (d >>> 24) / 255, oa = a + da * (1 - a), k = a / oa;
      const ch = (s) => (c >>> s & 255) * k + (d >>> s & 255) * (1 - k) & 255;
      this.C[i] = (oa * 255 & 255) << 24 | ch(16) << 16 | ch(8) << 8 | ch(0);
    }
    /** Translucent pixel at a local point. */
    blend(x, y, c, a) {
      this.blendPx(this.cellX(x, y), this.cellY(x, y), c, a);
    }
    /** A translucent disc: puffs of smoke, vapour, dust. c and a may be functions of (d: 0 center..1 rim, angle). */
    disc(cx, cy, r, c, a) {
      if (r < 0.5) return this.blend(cx, cy, call(c, 0, 0), call(a, 0, 0));
      this.each(cx - r, cy - r, cx + r, cy + r, (x, y, sx, sy) => {
        const dx = x - cx, dy = y - cy, d2 = dx * dx + dy * dy;
        if (d2 > r * r) return;
        const d = Math.sqrt(d2) / r, ang = Math.atan2(dy, dx);
        this.blendPx(sx, sy, call(c, d, ang), call(a, d, ang));
      });
    }
    /** Read back the color under a local point (0 if empty). */
    get(x, y) {
      const sx = this.cellX(x, y) - this.ox, sy = this.cellY(x, y) - this.oy;
      return sx < 0 || sy < 0 || sx >= this.w || sy >= this.h ? 0 : this.C[sy * this.w + sx];
    }
    // ---- pixels
    /** One opaque pixel. */
    px(x, y, c) {
      this.put(this.cellX(x, y), this.cellY(x, y), c, 1);
    }
    /** One pixel at alpha a (0..1), faded by ordered dither. */
    dot(x, y, c, a = 1) {
      if (a > 0) this.put(this.cellX(x, y), this.cellY(x, y), c, a);
    }
    /** Add light to one pixel. */
    light(x, y, c, k = 1) {
      this.add(this.cellX(x, y), this.cellY(x, y), c, k);
    }
    /**
     * Visit every screen pixel whose center falls in the local box [x0, x1] x [y0, y1], with that center in
     * local space: fn(lx, ly, sx, sy). The basis of every filled shape, so shapes mirror and rotate exactly.
     */
    each(x0, y0, x1, y1, fn) {
      let ax = Infinity, bx = -Infinity, ay = Infinity, by = -Infinity;
      for (let k = 0; k < 4; k++) {
        const x = k & 1 ? x1 : x0, y = k & 2 ? y1 : y0, sx = this.toX(x, y), sy = this.toY(x, y);
        if (sx < ax) ax = sx;
        if (sx > bx) bx = sx;
        if (sy < ay) ay = sy;
        if (sy > by) by = sy;
      }
      const sx0 = Math.max(Math.floor(ax), this.ox), sx1 = Math.min(Math.ceil(bx), this.ox + this.w - 1);
      const sy0 = Math.max(Math.floor(ay), this.oy), sy1 = Math.min(Math.ceil(by), this.oy + this.h - 1);
      for (let sy = sy0; sy <= sy1; sy++)
        for (let sx = sx0; sx <= sx1; sx++) {
          const cx = sx + 0.5, cy = sy + 0.5;
          fn(this.fromX(cx, cy), this.fromY(cx, cy), sx, sy);
        }
    }
    /**
     * A pixel shader over a local box. fn(x, y, out) returns a color, or sets out.c (color), out.a (alpha),
     * out.l (light color, defaults to out.c) and out.k (light amount). Return nothing to leave the pixel alone.
     */
    shade(x0, y0, x1, y1, fn) {
      const o = OUT;
      this.each(x0, y0, x1, y1, (lx, ly, sx, sy) => {
        o.c = 0;
        o.a = 1;
        o.l = 0;
        o.k = 0;
        const c = fn(lx, ly, o) || o.c;
        if (c) this.put(sx, sy, c, o.a);
        if (o.k > 0) this.add(sx, sy, o.l || c, o.k);
      });
    }
    // ---- shapes. Colors (c) and alphas (a) can be numbers or functions of the shape's own coordinates.
    /** 1 px line. c and a may be functions of u (0 at the start, 1 at the end). */
    line(x0, y0, x1, y1, c, a = 1) {
      let sx = this.cellX(x0, y0), sy = this.cellY(x0, y0);
      const ex = this.cellX(x1, y1), ey = this.cellY(x1, y1);
      const dx = Math.abs(ex - sx), dy = -Math.abs(ey - sy), stepx = sx < ex ? 1 : -1, stepy = sy < ey ? 1 : -1;
      const n = Math.max(dx, -dy) || 1, fc = typeof c === "function", fa = typeof a === "function";
      let err = dx + dy, i = 0;
      for (; ; ) {
        const u = i++ / n;
        this.put(sx, sy, fc ? c(u) : c, fa ? a(u) : a);
        if (sx === ex && sy === ey) break;
        const e2 = 2 * err;
        if (e2 >= dy) {
          err += dy;
          sx += stepx;
        }
        if (e2 <= dx) {
          err += dx;
          sy += stepy;
        }
      }
    }
    /** Lines through a list of points [[x, y], ...]. */
    polyline(pts, c, a = 1) {
      for (let i = 1; i < pts.length; i++) this.line(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], c, a);
    }
    /** Thick segment with round ends. c and a may be functions of (u along, v across: 0 center, 1 edge). */
    beam(x0, y0, x1, y1, width, c, a = 1) {
      const r = width / 2, dx = x1 - x0, dy = y1 - y0, L2 = dx * dx + dy * dy || 1e-9;
      this.shade(Math.min(x0, x1) - r, Math.min(y0, y1) - r, Math.max(x0, x1) + r, Math.max(y0, y1) + r, (x, y, o) => {
        const u = clamp(((x - x0) * dx + (y - y0) * dy) / L2), px = x0 + dx * u - x, py = y0 + dy * u - y;
        const d2 = px * px + py * py;
        if (d2 > r * r) return;
        const v = Math.sqrt(d2) / r;
        o.c = call(c, u, v);
        o.a = call(a, u, v);
      });
    }
    /** Filled disc. c and a may be functions of (d: 0 center to 1 rim, angle). */
    circle(cx, cy, r, c, a = 1) {
      if (r < 0.6) return this.dot(cx, cy, call(c, 0, 0), call(a, 0, 0));
      this.shade(cx - r, cy - r, cx + r, cy + r, (x, y, o) => {
        const dx = x - cx, dy = y - cy, d2 = dx * dx + dy * dy;
        if (d2 > r * r) return;
        const d = Math.sqrt(d2) / r, ang = Math.atan2(dy, dx);
        o.c = call(c, d, ang);
        o.a = call(a, d, ang);
      });
    }
    /** Ellipse. c and a may be functions of (d: 0 center to 1 rim, angle). */
    ellipse(cx, cy, rx, ry, c, a = 1) {
      if (rx <= 0 || ry <= 0) return;
      this.shade(cx - rx, cy - ry, cx + rx, cy + ry, (x, y, o) => {
        const dx = (x - cx) / rx, dy = (y - cy) / ry, d2 = dx * dx + dy * dy;
        if (d2 > 1) return;
        const d = Math.sqrt(d2), ang = Math.atan2(dy, dx);
        o.c = call(c, d, ang);
        o.a = call(a, d, ang);
      });
    }
    /** Ring from radius r - w to r. c and a may be functions of (v: 0 inner to 1 outer, angle). */
    ring(cx, cy, r, w, c, a = 1) {
      const r0 = Math.max(0, r - w);
      this.shade(cx - r, cy - r, cx + r, cy + r, (x, y, o) => {
        const dx = x - cx, dy = y - cy, d2 = dx * dx + dy * dy;
        if (d2 > r * r || d2 < r0 * r0) return;
        const v = w > 0 ? (Math.sqrt(d2) - r0) / (r - r0 || 1) : 1, ang = Math.atan2(dy, dx);
        o.c = call(c, v, ang);
        o.a = call(a, v, ang);
      });
    }
    /**
     * Band of a ring from angle a0 to a1 (radians, a1 > a0), radius r - w to r: the slash and smear shape.
     * c and a may be functions of (u: 0 at a0 to 1 at a1, v: 0 inner to 1 outer). w can be a function of u
     * for a crescent that tapers at both ends.
     */
    arc(cx, cy, r, w, a0, a1, c, a = 1) {
      const span = a1 - a0, wf = typeof w === "function";
      this.shade(cx - r, cy - r, cx + r, cy + r, (x, y, o) => {
        const dx = x - cx, dy = y - cy, d = Math.sqrt(dx * dx + dy * dy);
        if (d > r) return;
        let ang = Math.atan2(dy, dx) - a0;
        ang -= Math.floor(ang / (Math.PI * 2)) * Math.PI * 2;
        if (ang > span) return;
        const u = ang / span, ww = wf ? w(u) : w;
        if (ww <= 0 || d < r - ww) return;
        const v = (d - (r - ww)) / ww;
        o.c = call(c, u, v);
        o.a = call(a, u, v);
      });
    }
    /** Filled rectangle. */
    rect(x, y, w, h, c, a = 1) {
      if (this.sn === 0) {
        const X0 = Math.round(x), Y0 = Math.round(y), X1 = Math.round(x + w), Y1 = Math.round(y + h);
        for (let yy = Y0; yy < Y1; yy++) for (let xx = X0; xx < X1; xx++) this.put(this.cellX(xx, yy), this.cellY(xx, yy), c, a);
        return;
      }
      this.shade(x, y, x + w, y + h, (lx, ly, o) => {
        if (lx < x || ly < y || lx >= x + w || ly >= y + h) return;
        o.c = c;
        o.a = a;
      });
    }
    /** Filled polygon from points [[x, y], ...] (even-odd rule). */
    poly(pts, c, a = 1) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const [x, y] of pts) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
      const n = pts.length;
      this.shade(x0, y0, x1, y1, (x, y, o) => {
        let inside = false;
        for (let i = 0, j = n - 1; i < n; j = i++) {
          const [xi, yi] = pts[i], [xj, yj] = pts[j];
          if (yi > y !== yj > y && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
        }
        if (!inside) return;
        o.c = call(c, x, y);
        o.a = call(a, x, y);
      });
    }
    tri(x0, y0, x1, y1, x2, y2, c, a = 1) {
      this.poly([[x0, y0], [x1, y1], [x2, y2]], c, a);
    }
    // ---- light
    /** Radial glow into the light buffer: k at the center, falling to 0 at radius r. */
    glow(x, y, r, c, k = 0.5) {
      if (r < 1 || k <= 4e-3) return;
      const cx = this.toX(x, y), cy = this.toY(x, y);
      const x0 = Math.floor(cx - r), x1 = Math.ceil(cx + r), y0 = Math.floor(cy - r), y1 = Math.ceil(cy + r);
      for (let sy = y0; sy <= y1; sy++) {
        const dy = (sy + 0.5 - cy) / r;
        for (let sx = x0; sx <= x1; sx++) {
          const dx = (sx + 0.5 - cx) / r, d = dx * dx + dy * dy;
          if (d >= 1) continue;
          const f = 1 - Math.sqrt(d);
          this.add(sx, sy, c, f * f * k);
        }
      }
    }
    /** Glow around a segment (a soft beam of light). */
    glowLine(x0, y0, x1, y1, r, c, k = 0.5) {
      if (r < 1 || k <= 4e-3) return;
      const ax = this.toX(x0, y0), ay = this.toY(x0, y0), bx = this.toX(x1, y1), by = this.toY(x1, y1);
      const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1e-9;
      const X0 = Math.floor(Math.min(ax, bx) - r), X1 = Math.ceil(Math.max(ax, bx) + r);
      const Y0 = Math.floor(Math.min(ay, by) - r), Y1 = Math.ceil(Math.max(ay, by) + r);
      for (let sy = Y0; sy <= Y1; sy++)
        for (let sx = X0; sx <= X1; sx++) {
          const px = sx + 0.5, py = sy + 0.5, u = clamp(((px - ax) * dx + (py - ay) * dy) / L2);
          const ex = ax + dx * u - px, ey = ay + dy * u - py, d = Math.sqrt(ex * ex + ey * ey) / r;
          if (d >= 1) continue;
          const f = 1 - d;
          this.add(sx, sy, c, f * f * k);
        }
    }
    /** Glow hugging a circle of radius R (a shockwave's light), falling off over width r. */
    glowRing(x, y, R, r, c, k = 0.5) {
      if (r < 1 || k <= 4e-3) return;
      const cx = this.toX(x, y), cy = this.toY(x, y), E = R + r;
      for (let sy = Math.floor(cy - E); sy <= Math.ceil(cy + E); sy++)
        for (let sx = Math.floor(cx - E); sx <= Math.ceil(cx + E); sx++) {
          const d = Math.abs(Math.hypot(sx + 0.5 - cx, sy + 0.5 - cy) - R) / r;
          if (d >= 1) continue;
          const f = 1 - d;
          this.add(sx, sy, c, f * f * k);
        }
    }
    // ---- sprites, text, masks
    /**
     * A little sprite from strings: rows like ["..##..", ".#oo#."], pal maps characters to colors
     * ({ "#": "#222034", o: 0xff... }); "." and " " are empty. Top-left at (x, y).
     * opts: { scale, a, flip (mirror left-right), flipY (upside down), tint (draw every pixel in one color) }.
     */
    sprite(rows, pal, x, y, opts = {}) {
      let s = sprites.get(rows);
      if (!s) sprites.set(rows, s = rows.map((r) => [...r]));
      const k = opts.scale ?? 1, a = opts.a ?? 1, W = s[0]?.length ?? 0, cache = {};
      for (let r = 0; r < s.length; r++)
        for (let q = 0; q < s[r].length; q++) {
          const ch = s[r][q];
          if (ch === "." || ch === " ") continue;
          let c = opts.tint;
          if (c === void 0) {
            c = cache[ch];
            if (c === void 0) c = cache[ch] = pal[ch] === void 0 ? 0 : hex(pal[ch]);
          }
          if (!c) continue;
          const col = opts.flip ? W - 1 - q : q, row = opts.flipY ? s.length - 1 - r : r;
          if (k === 1) this.dot(x + col, y + row, c, a);
          else this.rect(x + col * k, y + row * k, k, k, c, a);
        }
    }
    /**
     * Pixel text. opts: { font: "mini" (3x5) | "big" (5x7), scale, align: "left" | "center" | "right",
     * outline: color, shadow: color, a }. (x, y) is the top of the text, at the left, center or right.
     */
    text(str, x, y, c, opts = {}) {
      const font = opts.font ?? "mini", k = opts.scale ?? 1, a = opts.a ?? 1, w = textWidth(str, font) * k;
      const left = Math.round(opts.align === "center" ? x - w / 2 : opts.align === "right" ? x - w : x), top = Math.round(y);
      const ol = opts.outline, sh = opts.shadow;
      if (ol !== void 0) rasterText(str, font, (gx, gy) => this.rect(left + gx * k - 1, top + gy * k - 1, k + 2, k + 2, ol, a));
      if (sh !== void 0) rasterText(str, font, (gx, gy) => this.rect(left + gx * k + 1, top + gy * k + 1, k, k, sh, a));
      rasterText(str, font, (gx, gy) => this.rect(left + gx * k, top + gy * k, k, k, call(c, gx, gy), a));
    }
    /** Size of text in pixels: [w, h]. */
    measure(str, opts = {}) {
      const k = opts.scale ?? 1;
      return [textWidth(str, opts.font ?? "mini") * k, FONTS[opts.font ?? "mini"].h * k];
    }
    /** Fill a mask ({ w, h, data }) with its top-left at (x, y). c may be a function of (mx, my). */
    mask(m, x, y, c, a = 1) {
      for (let my = 0; my < m.h; my++)
        for (let mx = 0; mx < m.w; mx++) if (m.data[my * m.w + mx]) this.dot(x + mx, y + my, call(c, mx, my), call(a, mx, my));
    }
    /** The 1 px outline just outside a mask. */
    outline(m, x, y, c, a = 1) {
      const at = (mx, my) => mx >= 0 && my >= 0 && mx < m.w && my < m.h && m.data[my * m.w + mx];
      for (let my = -1; my <= m.h; my++)
        for (let mx = -1; mx <= m.w; mx++)
          if (!at(mx, my) && (at(mx - 1, my) || at(mx + 1, my) || at(mx, my - 1) || at(mx, my + 1)))
            this.dot(x + mx, y + my, call(c, mx, my), call(a, mx, my));
    }
  };

  // public/vendor/pixelfx/src/core/actor.js
  var HERO = [
    "....kkkkk...",
    "..kkhhhhhk..",
    ".khhhhhhhhk.",
    ".khhhhhhhhhk",
    ".khhssssshhk",
    ".khsessesshk",
    ".khsessesshk",
    "..ksssssssk.",
    "...kkSSSkk..",
    "..kttttttk..",
    ".kttTttTttk.",
    ".ksttTTttsk.",
    ".kstttttttk.",
    "..kbbbbbbk..",
    "..kppkkppk..",
    "..kppk.kppk.",
    "..kppk.kppk.",
    "..koook.kook",
    "..kkkkk.kkkk"
  ];
  var HERO_PAL = {
    k: "#17121f",
    h: "#7a4128",
    s: "#f3c49d",
    S: "#c98b6c",
    e: "#17121f",
    t: "#5f6f94",
    T: "#46536f",
    b: "#8a5a32",
    p: "#38334a",
    o: "#6a4030",
    // the 2x character's extra detail
    H: "#a35d34",
    w: "#ffffff",
    m: "#a3564a",
    g: "#e8c060",
    L: "#7f90b6",
    O: "#8f5a3f",
    P: "#4b4560",
    // the scarf
    c: "#f53cd1",
    C: "#ff8fe6",
    D: "#a31f8a"
  };
  var DUMMY_PAL = {
    k: "#0e0c14",
    A: "#e4e6ec",
    B: "#b6b9c3",
    C: "#868995",
    D: "#5c5e6a",
    E: "#6e707c",
    F: "#4b4d58",
    G: "#34353f",
    J: "#2a2b33",
    m: "#f53cd1"
  };
  var HERO2 = [
    "...........kkk..........",
    "..........kAABk.........",
    ".........kAAABJk........",
    ".........kABBJJk........",
    ".........kBBBJCDk.......",
    ".........kBCJDDDk.......",
    ".........kkJJJDk........",
    ".......kkkkABBJCkk......",
    "......kAABCJBCCCkDk.....",
    "......kABBCJCCCmDkDk....",
    "......kBBCDDJCDDDkDk....",
    "......kABCDJDDDDDkk.....",
    ".....kAABDkDDDDJkk......",
    ".....kABCDkDDJJGkk......",
    ".....kABCkJJJGGGkk......",
    "....kJJCDkFFFGGGk.......",
    "....kAJJDkJJJGGGk.......",
    "....kJCJJkABBJGGk.......",
    ".....kJCCkBBCDJJJk......",
    ".....kCCCJBBCDJJDk......",
    ".....kCCCDJCCDkJDDk.....",
    "......kCDDJBCDkDDDk.....",
    ".......kDJJJCDkDDDkk....",
    ".......kJBCJCDkDDDkk....",
    ".......kBDJBCDkCDDkk....",
    "........kJJBCDkCDDk.....",
    "........kBBBCDkCCDDk....",
    "........kBBBCDkCCDDk....",
    ".........kBBCDkJDDDk....",
    "........kBJJJJkCJJJk....",
    "........kBBCCDkCCDDk....",
    "........kBBCDDkCDDk.....",
    "........kBBCDkCCDDk.....",
    "........kBCCDkCCDDk.....",
    "........kBCDDkCDDDk.....",
    ".......kJBCJkkkDJkkkk...",
    ".......kAJJAAAAkCCCCCk..",
    "........kkkkkkkkkkkkk..."
  ];
  function maskOf(rows, k = 1) {
    const h = rows.length * k, w = rows[0].length * k, data = new Uint8Array(w * h);
    rows.forEach((r, y) => [...r].forEach((ch, x) => {
      if (ch === ".") return;
      for (let j = 0; j < k * k; j++) data[(y * k + (j / k | 0)) * w + x * k + j % k] = 1;
    }));
    return { w, h, data };
  }
  var MASKS = { 1: maskOf(HERO, 1), 2: maskOf(HERO2, 1) };
  var SPRITES = { 1: HERO, 2: HERO2 };
  function pixelsOf(rows, pal) {
    const w = rows[0].length, data = new Uint32Array(w * rows.length);
    rows.forEach((r, y) => [...r].forEach((ch, x) => data[y * w + x] = ch === "." ? 0 : hex(pal[ch])));
    return data;
  }
  var PIXELS = { 1: pixelsOf(HERO, HERO_PAL), 2: pixelsOf(HERO2, DUMMY_PAL) };
  function stockActor(k = 1) {
    k = k === 2 ? 2 : 1;
    const m = MASKS[k], x = -Math.floor(m.w / 2), y = -m.h;
    return { mask: m, pixels: PIXELS[k], x, y, w: m.w, h: m.h, k, head: [0, y], chest: [0, k === 2 ? -26 : y + 11], ...k === 2 ? { eyes: [[13, 3], [15, 3]] } : {} };
  }
  function drawActor(p, actor = stockActor(), a = 1) {
    if (a > 0) p.sprite(SPRITES[actor.k === 2 ? 2 : 1], actor.k === 2 ? DUMMY_PAL : HERO_PAL, actor.x, actor.y, { a });
  }
  var actorAlphaOf = (mod, t, o) => typeof mod.actorAlpha === "function" ? mod.actorAlpha(t, o) : 1;

  // public/vendor/pixelfx/src/core/fx.js
  function createFrame(w, h, ox = 0, oy = 0) {
    return { w, h, ox, oy, color: new Uint32Array(w * h), light: new Uint32Array(w * h) };
  }
  function clearFrame(f) {
    f.color.fill(0);
    f.light.fill(0);
    return f;
  }
  var painters = /* @__PURE__ */ new WeakMap();
  function painterFor(frame2) {
    let p = painters.get(frame2);
    if (!p) painters.set(frame2, p = new Painter(frame2));
    return p.reset();
  }
  var FADE = 0.3;
  var isRamp = (v) => Array.isArray(v) && v.length > 0 && v.every((c) => typeof c === "number" || /^#[0-9a-f]{3,8}$/i.test(c));
  function resolveOptions(meta14, o = {}) {
    const opts = { ...meta14.options ?? {}, ...o };
    for (const [k, def] of Object.entries(meta14.options ?? {}))
      if (isRamp(def) && isRamp(o[k]) && o[k].length !== def.length) opts[k] = fit(o[k], def.length).map(toHex);
    if (meta14.actor && !opts.actor) opts.actor = stockActor(meta14.actor === 2 ? 2 : 1);
    return opts;
  }
  function createFx(mod, o = {}) {
    const meta14 = mod.meta ?? {};
    const opts = resolveOptions(meta14, o);
    const impl = mod.create ? mod.create(opts) : mod;
    const D = meta14.duration ?? 1;
    let t = 0, stopAt = Infinity;
    return {
      meta: meta14,
      options: opts,
      get t() {
        return t;
      },
      update(dt) {
        t += dt;
        if (!impl.update) return;
        const n = Math.max(1, Math.ceil(dt * 120 - 1e-9));
        for (let i = 0; i < n; i++) impl.update(dt / n, opts);
      },
      draw(frame2, layer) {
        const p = painterFor(frame2);
        p.place(opts.x ?? 0, opts.y ?? 0, !!opts.flip, opts.angle ?? 0);
        p.fade = stopAt === Infinity ? 1 : clamp(1 - (t - stopAt) / FADE);
        p.lightK = opts.light ?? 1;
        const tt = meta14.loop ? t % D : Math.min(t, D);
        if (layer !== "front" && impl.drawBack) {
          p.layer = "back";
          impl.drawBack(p, tt, opts);
        }
        if (layer !== "back") {
          p.layer = "front";
          impl.draw(p, tt, opts);
        }
      },
      /** Let it end: loops fade out, one-shots cut short. */
      stop() {
        if (stopAt === Infinity) stopAt = t;
      },
      done() {
        return t - stopAt >= FADE || !meta14.loop && t >= D;
      }
    };
  }
  function composite(f, out, bg = null, lightK = 1) {
    const n = f.w * f.h, C = f.color, L = f.light, flat = typeof bg === "number";
    for (let i = 0; i < n; i++) {
      const c = C[i], l = L[i] & 16777215;
      let r, g, b, a;
      const ca = c >>> 24;
      if (ca === 255) {
        r = c & 255;
        g = c >>> 8 & 255;
        b = c >>> 16 & 255;
        a = 255;
      } else if (bg === null) {
        r = c & 255;
        g = c >>> 8 & 255;
        b = c >>> 16 & 255;
        a = ca;
      } else {
        const k = flat ? bg : bg[i], f2 = ca / 255;
        r = (c & 255) * f2 + (k & 255) * (1 - f2);
        g = (c >>> 8 & 255) * f2 + (k >>> 8 & 255) * (1 - f2);
        b = (c >>> 16 & 255) * f2 + (k >>> 16 & 255) * (1 - f2);
        a = 255;
      }
      if (l) {
        const lr = (l & 255) * lightK, lg = (l >>> 8 & 255) * lightK, lb = (l >>> 16 & 255) * lightK;
        if (a < 255) {
          const pa = a / 255, pr = r * pa + lr, pg = g * pa + lg, pb = b * pa + lb;
          const na = Math.min(1, Math.max(pa, Math.max(lr, lg, lb) / 255));
          if (na > 0) {
            r = Math.min(255, pr / na);
            g = Math.min(255, pg / na);
            b = Math.min(255, pb / na);
            a = na * 255;
          }
        } else {
          r = Math.min(255, r + lr);
          g = Math.min(255, g + lg);
          b = Math.min(255, b + lb);
        }
      }
      const j = i * 4;
      out[j] = r;
      out[j + 1] = g;
      out[j + 2] = b;
      out[j + 3] = a;
    }
    return out;
  }

  // public/vendor/pixelfx/src/core/scene.js
  var SKY = hex("#15131d");
  var SKY_TOP = hex("#0d0b14");
  var SKY_LOW = hex("#221d33");
  var FLOOR_EDGE = hex("#4a4263");
  var FLOOR = hex("#2b2639");
  var FLOOR_DARK = hex("#211d2d");
  var MORTAR = hex("#1a1724");

  // public/vendor/pixelfx/src/core/rig.js
  var PAL2 = Object.fromEntries(Object.entries(DUMMY_PAL).map(([k, v]) => [k, hex(v) >>> 0]));
  var INK2 = PAL2.k;
  var SEAM = PAL2.J;
  var MARK = PAL2.m;
  var SHELL = [PAL2.A, PAL2.B, PAL2.C, PAL2.D];
  var CORE = [PAL2.E, PAL2.F, PAL2.G, PAL2.G];
  var DEG = Math.PI / 180;
  var W0 = 24;
  var H0 = 38;
  var add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  var sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  var mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
  var dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  var cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  var len = (a) => Math.hypot(a[0], a[1], a[2]);
  var unit = (a) => mul(a, 1 / (len(a) || 1e-6));
  var rotY = (t) => {
    const c = Math.cos(t), s = Math.sin(t);
    return [c, 0, s, 0, 1, 0, -s, 0, c];
  };
  var rotZ = (t) => {
    const c = Math.cos(t), s = Math.sin(t);
    return [c, -s, 0, s, c, 0, 0, 0, 1];
  };
  var mm = (A, B2) => {
    const o = new Array(9);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) o[r * 3 + c] = A[r * 3] * B2[c] + A[r * 3 + 1] * B2[3 + c] + A[r * 3 + 2] * B2[6 + c];
    return o;
  };
  var mv = (M2, v) => [M2[0] * v[0] + M2[1] * v[1] + M2[2] * v[2], M2[3] * v[0] + M2[4] * v[1] + M2[5] * v[2], M2[6] * v[0] + M2[7] * v[1] + M2[8] * v[2]];
  var tv = (M2, v) => [M2[0] * v[0] + M2[3] * v[1] + M2[6] * v[2], M2[1] * v[0] + M2[4] * v[1] + M2[7] * v[2], M2[2] * v[0] + M2[5] * v[1] + M2[8] * v[2]];
  var clamp01 = (v) => Math.max(0, Math.min(1, v));
  var M = {
    pelvis: 19.7,
    spine1: 2.8,
    spine2: 4.6,
    shoulderUp: 2.5,
    shoulderOut: 5.9,
    neckUp: 4,
    headUp: 3.1,
    hipDown: 1.1,
    hipOut: 2.8,
    thigh: 8.6,
    shin: 8.3,
    upper: 7.6,
    fore: 7.4,
    turn: 36 * DEG
  };
  var STAND = { lean: 0, crouch: 0, yaw: 0, fx: -3, fy: -15, bx: 5, by: -15, ffx: -2, ffy: -4, fbx: 3, fby: -4 };
  function ik(a, target, L1, L2, pole) {
    let to = sub(target, a), d = len(to);
    const reach = L1 + L2 - 0.02;
    if (d > reach) {
      to = mul(to, reach / d);
      d = reach;
    }
    const u = unit(to), along2 = (L1 * L1 - L2 * L2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, L1 * L1 - along2 * along2));
    let v = sub(pole, mul(u, dot(pole, u)));
    v = len(v) < 1e-4 ? unit(cross(u, [0, 0, 1])) : unit(v);
    return { joint: add(a, add(mul(u, along2), mul(v, h))), end: add(a, to), u, v };
  }
  function frame(t, R) {
    return { t, R };
  }
  function boneFrame(a, b, pole) {
    const x = unit(sub(b, a));
    let y = sub(pole, mul(x, dot(pole, x)));
    y = len(y) < 1e-4 ? unit(cross(x, [0, 0, 1])) : unit(y);
    const z = cross(x, y);
    return frame(a, [x[0], y[0], z[0], x[1], y[1], z[1], x[2], y[2], z[2]]);
  }
  var weaponOf = (name) => WEAPONS[name];
  function solve(pose) {
    const q = { ...STAND, ...pose }, lean = q.lean, W = q.weapon && weaponOf(q.weapon), OW = q.offWeapon && weaponOf(q.offWeapon);
    const sa = q.sa ?? 0, wl = q.wl ?? 1, axisZ = Math.sqrt(Math.max(0, 1 - wl * wl)) * (q.wz ?? 1);
    const axis = [Math.cos(sa) * wl, -Math.sin(sa) * wl, axisZ], side = [-Math.sin(sa), -Math.cos(sa), 0];
    const two = !!(q.two && W), nearZ = q.fz ?? (two ? 3 : 4.5);
    const fwd = (q.fx - STAND.fx) / 24, farFwd = two ? 0 : (q.bx - STAND.bx) / 22;
    let turn = M.turn + (fwd >= 0 ? -44 * DEG * Math.min(1, fwd) : 28 * DEG * Math.min(1, -fwd * 1.8));
    turn += (farFwd > 0 ? 34 * DEG * Math.min(1, farFwd) : 0) + (q.twist ?? 0) * 4 * DEG;
    if (q.turn !== void 0) turn = q.turn;
    const hipTurn = M.turn + (turn - M.turn) * 0.45, tilt = Math.atan2(lean, 13);
    const Rp = mm(rotZ(-tilt * 0.25), rotY(-hipTurn)), Rc = mm(rotZ(-tilt), rotY(-turn));
    const ankleN = [q.ffx, -q.ffy - 1.8, q.fzz ?? 2.4], ankleF = [q.fbx, -q.fby - 1.8, q.bzz ?? -2.4];
    let pelvis = [lean * 0.2, M.pelvis - q.crouch, 0];
    const hipAt = (s) => add(pelvis, mv(Rp, [0, -M.hipDown, s * M.hipOut]));
    const maxLeg = (M.thigh + M.shin) * 0.995;
    for (const [s, a] of [[1, ankleN], [-1, ankleF]]) {
      const h = hipAt(s), dx = h[0] - a[0], dz = h[2] - a[2], flat = dx * dx + dz * dz;
      if (flat < maxLeg * maxLeg) {
        const top = a[1] + Math.sqrt(maxLeg * maxLeg - flat);
        if (h[1] > top) pelvis = [pelvis[0], pelvis[1] - (h[1] - top), pelvis[2]];
      }
    }
    const waist = add(pelvis, [Math.sin(tilt * 0.45) * M.spine1, Math.cos(tilt * 0.45) * M.spine1, 0]);
    const chest = add(waist, [Math.sin(tilt) * M.spine2, Math.cos(tilt) * M.spine2, 0]);
    const neck = add(chest, mv(Rc, [0, M.neckUp, 0]));
    const headTurn = M.turn * 0.9 + (turn - M.turn) * 0.35, nod = tilt * 0.35 + (q.hy ?? 0) * 7 * DEG, roll = (q.hx ?? 0) * 7 * DEG;
    const Rh = mm(rotZ(-nod - roll), rotY(-headTurn));
    const head = add(neck, mv(Rh, [0.15, M.headUp, 0]));
    const pick = (s, target) => {
      const base = add(chest, mv(Rc, [0, M.shoulderUp, s * M.shoulderOut])), to = sub(target, base), d = len(to);
      return add(base, mul(unit(to), Math.min(1.8, Math.max(0, d - 11) * 0.35)));
    };
    const nearT = [q.fx, -q.fy, nearZ];
    const farT = two ? [q.fx + axis[0] * W.two, -q.fy + axis[1] * W.two, nearZ + axis[2] * W.two] : [q.bx, -q.by, q.bz ?? (q.armsFront ? 5.5 : -4.5)];
    const sN = pick(1, nearT), sF = pick(-1, farT);
    const pole = (s, T, shoulder, hold) => {
      const up = clamp01((T[1] - shoulder[1] + 2) / 10);
      const base = [-0.55 + up * 1.1, -1 + up * 0.9, s * (0.45 + up * 0.5)];
      if (!hold) return base;
      const u = unit(sub(T, shoulder));
      let best = base, score = Infinity;
      for (let i = 0; i < 16; i++) {
        const a = i / 16 * Math.PI * 2, x = unit(cross(u, [0.3, 1, 0.2])), y = cross(u, x), v = add(mul(x, Math.cos(a)), mul(y, Math.sin(a)));
        const A = ik(shoulder, T, M.upper, M.fore, v), f = unit(sub(A.end, A.joint));
        const cost = Math.abs(dot(f, hold)) * 0.7 + (1 - dot(unit(base), v)) * 0.55;
        if (cost < score) {
          score = cost;
          best = v;
        }
      }
      return best;
    };
    const holdN = W ? W.across ? side : axis : null, holdF = two ? W.across ? side : axis : OW ? [Math.cos(q.sb ?? Math.PI), -Math.sin(q.sb ?? Math.PI), 0] : null;
    const armN = ik(sN, nearT, M.upper, M.fore, pole(1, nearT, sN, holdN)), armF = ik(sF, farT, M.upper, M.fore, pole(-1, farT, sF, holdF));
    const kneePole = (s) => mv(Rp, [1, 0, s * 0.35]);
    const hipN = hipAt(1), hipF = hipAt(-1);
    const legN = ik(hipN, ankleN, M.thigh, M.shin, kneePole(1)), legF = ik(hipF, ankleF, M.thigh, M.shin, kneePole(-1));
    const footDir = (s) => {
      const t = hipTurn * 0.6 + s * 8 * DEG;
      return [Math.cos(t), 0, Math.sin(t)];
    };
    const B2 = {
      pelvis: frame(pelvis, Rp),
      waist: frame(waist, mm(rotZ(-tilt * 0.6), rotY(-(turn + hipTurn) / 2))),
      chest: frame(chest, Rc),
      head: frame(head, Rh),
      neck: frame(neck, Rh),
      upperN: boneFrame(sN, armN.joint, armN.v),
      foreN: boneFrame(armN.joint, armN.end, armN.v),
      upperF: boneFrame(sF, armF.joint, armF.v),
      foreF: boneFrame(armF.joint, armF.end, armF.v),
      thighN: boneFrame(hipN, legN.joint, legN.v),
      shinN: boneFrame(legN.joint, legN.end, legN.v),
      thighF: boneFrame(hipF, legF.joint, legF.v),
      shinF: boneFrame(legF.joint, legF.end, legF.v)
    };
    B2.footN = frame(legN.end, mm(rotY(-Math.atan2(footDir(1)[2], footDir(1)[0])), rotZ(q.toeF ? -55 * DEG : 0)));
    B2.footF = frame(legF.end, mm(rotY(-Math.atan2(footDir(-1)[2], footDir(-1)[0])), rotZ(q.toeB ? -55 * DEG : 0)));
    return { B: B2, W, OW, q, axis, side, armN, armF, legN, legF, sN, sF, hipN, hipF, turn };
  }
  var BW = 300;
  var BH = 240;
  var OX = 150;
  var OY = 180;
  var Zb = new Float32Array(BW * BH);
  var Tone = new Float32Array(BW * BH);
  var Part = new Int8Array(BW * BH);
  var Mat = new Int8Array(BW * BH);
  var Fr = new Int8Array(BW * BH);
  var LX = new Float32Array(BW * BH);
  var LY = new Float32Array(BW * BH);
  var Col = new Uint32Array(BW * BH);
  var touched = [];
  var LIGHT = unit([-0.55, 0.72, 0.5]);
  var clipBody = false;
  var clipWeapon = false;
  var curFrameIndex = 0;
  var curDim = 0;
  var onlyPart = 0;
  var FRAME_IDS = ["pelvis", "waist", "chest", "head", "neck", "upperN", "foreN", "upperF", "foreF", "thighN", "shinN", "thighF", "shinF", "footN", "footF"];
  function plot(i, z, tone, part, mat, wx, wy, color) {
    if (onlyPart && part !== onlyPart) return;
    if (Part[i] === 0) touched.push(i);
    else if (z <= Zb[i]) return;
    Zb[i] = z;
    Tone[i] = tone;
    Part[i] = part;
    Mat[i] = mat;
    Fr[i] = curFrameIndex;
    LX[i] = wx;
    LY[i] = wy;
    Col[i] = color;
  }
  function sphere(c, r, part, mat) {
    const x0 = Math.floor(c[0] - r), x1 = Math.ceil(c[0] + r), y0 = Math.floor(c[1] - r), y1 = Math.ceil(c[1] + r);
    for (let wy = y0; wy <= y1; wy++)
      for (let wx = x0; wx <= x1; wx++) {
        const dx = wx - c[0], dy = wy - c[1], d2 = dx * dx + dy * dy;
        if (d2 > r * r || clipBody && wy < 1.5) continue;
        const dz = Math.sqrt(r * r - d2), n = [dx / r, dy / r, dz / r], i = (OY - wy) * BW + (OX + wx);
        plot(i, c[2] + dz, dot(n, LIGHT), part, mat, wx, wy, 0);
      }
  }
  function sweep(a, b, ra, rb, part, mat, bulge = 0) {
    const n = Math.max(2, Math.ceil(len(sub(b, a)) / 0.4));
    for (let k = 0; k <= n; k++) {
      const u = k / n;
      sphere(add(a, mul(sub(b, a), u)), ra + (rb - ra) * u + bulge * Math.sin(u * Math.PI), part, mat);
    }
  }
  function ellipsoid(c, R, r, part, mat) {
    const big = Math.max(r[0], r[1], r[2]), x0 = Math.floor(c[0] - big), x1 = Math.ceil(c[0] + big), y0 = Math.floor(c[1] - big), y1 = Math.ceil(c[1] + big);
    const Rt = [R[0], R[3], R[6], R[1], R[4], R[7], R[2], R[5], R[8]], D = [1 / (r[0] * r[0]), 1 / (r[1] * r[1]), 1 / (r[2] * r[2])];
    const A = new Array(9);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) A[i * 3 + j] = R[i * 3] * D[0] * R[j * 3] + R[i * 3 + 1] * D[1] * R[j * 3 + 1] + R[i * 3 + 2] * D[2] * R[j * 3 + 2];
    void Rt;
    for (let wy = y0; wy <= y1; wy++)
      for (let wx = x0; wx <= x1; wx++) {
        if (clipBody && wy < 1.5) continue;
        const dx = wx - c[0], dy = wy - c[1];
        const qa = A[8], qb = 2 * (A[2] * dx + A[5] * dy), qc = A[0] * dx * dx + 2 * A[1] * dx * dy + A[4] * dy * dy - 1, disc = qb * qb - 4 * qa * qc;
        if (disc < 0) continue;
        const dz = (-qb + Math.sqrt(disc)) / (2 * qa);
        const n = unit([A[0] * dx + A[1] * dy + A[2] * dz, A[3] * dx + A[4] * dy + A[5] * dz, A[6] * dx + A[7] * dy + A[8] * dz]);
        plot((OY - wy) * BW + (OX + wx), c[2] + dz, dot(n, LIGHT), part, mat, wx, wy, 0);
      }
  }
  var PART = { pelvis: 1, waist: 2, chest: 3, neck: 4, head: 5, face: 6, upperN: 7, elbowN: 8, foreN: 9, handN: 10, upperF: 11, elbowF: 12, foreF: 13, handF: 14, thighN: 15, kneeN: 16, shinN: 17, footN: 18, thighF: 19, kneeF: 20, shinF: 21, footF: 22, weapon: 23, offWeapon: 24 };
  var useFrame = (name) => {
    curFrameIndex = FRAME_IDS.indexOf(name);
  };
  function drawBody(S) {
    const { B: B2, armN, armF, legN, legF, sN, sF, hipN, hipF, turn } = S, F_ = (name) => B2[name];
    useFrame("pelvis");
    ellipsoid(add(F_("pelvis").t, mv(F_("pelvis").R, [0, -0.2, 0])), F_("pelvis").R, [2.9, 2.6, 4.2], PART.pelvis, 0);
    useFrame("waist");
    sweep(F_("pelvis").t, F_("chest").t, 3, 3.3, PART.waist, 1);
    useFrame("chest");
    ellipsoid(add(F_("chest").t, mv(F_("chest").R, [0.2, 0.9, 0])), F_("chest").R, [3.4, 4.2, 5.5], PART.chest, 0);
    useFrame("neck");
    sweep(F_("neck").t, add(F_("neck").t, mv(F_("head").R, [0, 1.6, 0])), 1.25, 1.15, PART.neck, 1);
    useFrame("head");
    ellipsoid(F_("head").t, F_("head").R, [3, 3.3, 2.8], PART.head, 0);
    ellipsoid(add(F_("head").t, mv(F_("head").R, [0.85, -0.45, 0])), F_("head").R, [2.4, 2.7, 2.35], PART.face, 0);
    const arm = (far, A, sh, up, el, fo, ha, nameU, nameF) => {
      curDim = far ? 1 : 0;
      useFrame(nameU);
      sphere(sh, 2.5, up, 0);
      sweep(sh, A.joint, 2.1, 1.6, up, 0);
      sphere(A.joint, 1.45, el, 1);
      useFrame(nameF);
      sweep(A.joint, A.end, 1.6, 1.2, fo, 0, 0.15);
      sphere(A.end, 1.9, ha, 0);
      curDim = 0;
    };
    arm(false, armN, sN, PART.upperN, PART.elbowN, PART.foreN, PART.handN, "upperN", "foreN");
    arm(true, armF, sF, PART.upperF, PART.elbowF, PART.foreF, PART.handF, "upperF", "foreF");
    const leg = (far, L, hip, th, kn, sh, fo, nameT, nameS, nameFt) => {
      useFrame(nameT);
      sweep(hip, L.joint, 3.2, 2.2, th, 0);
      sphere(L.joint, 1.9, kn, 1);
      useFrame(nameS);
      sweep(L.joint, L.end, 2.15, 1.4, sh, 0, 0.4);
      useFrame(nameFt);
      const R = F_(nameFt).R, a = F_(nameFt).t;
      sweep(add(a, mv(R, [-1.5, -0.6, 0])), add(a, mv(R, [4.6, -1.1, 0])), 1.7, 1.25, fo, 0);
    };
    leg(false, legN, hipN, PART.thighN, PART.kneeN, PART.shinN, PART.footN, "thighN", "shinN", "footN");
    leg(true, legF, hipF, PART.thighF, PART.kneeF, PART.shinF, PART.footF, "thighF", "shinF", "footF");
    void turn;
  }
  function along(H, axis, side, part) {
    const n = cross(axis, side);
    const T = (i, k, c, lift = 0) => {
      const x = H[0] + axis[0] * i + side[0] * k + n[0] * lift, y = H[1] + axis[1] * i + side[1] * k + n[1] * lift, z = H[2] + axis[2] * i + side[2] * k + n[2] * lift;
      const wx = Math.round(x), wy = Math.round(y);
      if (clipWeapon && wy < 0) return;
      const idx = (OY - wy) * BW + (OX + wx);
      if (idx < 0 || idx >= BW * BH) return;
      curFrameIndex = -1;
      plot(idx, z + 0.05, 2, part, 2, wx, wy, c);
    };
    T.at = (i, k) => [H[0] + axis[0] * i + side[0] * k, H[1] + axis[1] * i + side[1] * k, H[2] + axis[2] * i + side[2] * k];
    return T;
  }
  var STEEL = Object.fromEntries(Object.entries({ hi: "#ffffff", a: "#e8edf6", b: "#a4afc6", d: "#68748f", gold: "#ffd84a", goldD: "#b8862a", grip: "#7a3a2a", gripD: "#4a2018", wood: "#8a5a32", woodD: "#5a3820", dark: "#3a3448", darkD: "#262033", olive: "#58663f", oliveA: "#7d8c58", oliveD: "#3a4529" }).map(([k, v]) => [k, hex(v) >>> 0]));
  function blade(T, from, length, w) {
    for (let i = from; i <= from + length + 0.01; i += 0.4) {
      const r = i - from, wd = r > length - 5 ? Math.max(0, (length - r) / 5 * w) : w;
      for (let k = -wd; k <= wd + 0.01; k += 0.4) T(i, k, k < -w * 0.4 ? STEEL.hi : k > w * 0.4 ? STEEL.d : STEEL.a);
    }
  }
  var haft = (T, from, to, a, d, r = 0.8) => {
    for (let i = from; i <= to; i += 0.4) for (let k = -r; k <= r + 0.01; k += 0.4) T(i, k, k > 0.1 ? d : a);
  };
  var WEAPONS = {
    // the fist is at i = 0; `two` is where the other hand goes; `across`: the handle lies across the weapon's length
    sword: { two: -4.4, draw(T, q) {
      const end = q.two ? -6.5 : -2.6;
      haft(T, end, 2.2, STEEL.grip, STEEL.gripD);
      for (let k = -1.4; k <= 1.4; k += 0.4) T(end - 0.4, k, STEEL.gold);
      for (let k = -4.6; k <= 4.6; k += 0.4) T(2.6, k, Math.abs(k) > 3.8 ? STEEL.goldD : STEEL.gold), T(3, k, STEEL.goldD);
      blade(T, 3.2, 25, 2.2);
    } },
    greatsword: { two: -4.8, draw(T) {
      haft(T, -7.2, 2.2, STEEL.grip, STEEL.gripD);
      for (let k = -1.8; k <= 1.8; k += 0.4) T(-7.6, k, STEEL.gold);
      for (let k = -6.6; k <= 6.6; k += 0.4) T(2.6, k, Math.abs(k) > 5.6 ? STEEL.goldD : STEEL.gold), T(3, k, STEEL.goldD);
      blade(T, 3.2, 31, 3);
      for (let i = 4; i <= 28; i += 0.4) T(i, 0, STEEL.b);
    } },
    dagger: { draw(T) {
      haft(T, -2.4, 1.8, STEEL.grip, STEEL.gripD);
      for (let k = -2.6; k <= 2.6; k += 0.4) T(2.2, k, STEEL.goldD);
      blade(T, 2.6, 10, 1.3);
    } },
    spear: { two: -12, draw(T) {
      haft(T, -18, 36, STEEL.wood, STEEL.woodD, 0.5);
      blade(T, 36, 11, 2);
      for (let k = -2.4; k <= 2.4; k += 0.4) T(36, k, STEEL.goldD);
    } },
    hammer: { two: -7, draw(T) {
      for (const lift of [-0.8, 0, 0.8]) for (let i = -10; i <= 18; i += 0.4) for (let k = -0.8; k <= 0.81; k += 0.4) T(i, k, k > 0.1 ? STEEL.woodD : STEEL.wood, lift);
      for (let i = 18; i <= 28; i += 0.4) for (let k = -9; k <= 9; k += 0.4) {
        const face = Math.abs(k) > 7.4 ? k < 0 ? STEEL.a : STEEL.d : i < 20 ? STEEL.hi : i > 26.4 ? STEEL.d : Math.abs(k) < 2 ? STEEL.gold : STEEL.b;
        T(i, k, face, 4.5);
        T(i, k, face, -4.5);
        if (i < 18.4 || i > 27.6 || Math.abs(k) > 8.6) for (let l = -4; l <= 4; l += 0.4) T(i, k, k < 0 ? STEEL.a : i > 27.6 ? STEEL.d : STEEL.b, l);
      }
    } },
    scythe: { two: -11, draw(T) {
      haft(T, -16, 31, STEEL.dark, STEEL.darkD, 0.5);
      for (let j = 0; j <= 28; j += 0.4) {
        const u = j / 28, w = 3.2 * (1 - u) + 0.3, b = 31.5 - u * u * 12;
        for (let k = -w; k <= w; k += 0.4) T(b + k, j + 0.8, k > w * 0.3 ? STEEL.hi : k < -w * 0.4 ? STEEL.d : STEEL.b);
      }
    } },
    claw: { draw(T) {
      for (const q0 of [-2.4, 0, 2.4])
        for (let i = 2; i <= 9.5; i += 0.4) {
          const u = (i - 2) / 7.5, k = q0 + u * u * 1.8;
          T(i, k, u > 0.55 ? STEEL.hi : STEEL.a);
          if (u < 0.6) T(i, k + 0.8, STEEL.d);
        }
    } },
    bow: { across: true, draw(T, q, off) {
      for (let u = -1; u <= 1.001; u += 0.025) {
        const k = u * 17, i = 6 * (1 - u * u) - 1;
        T(i, k, Math.abs(u) > 0.85 ? STEEL.goldD : STEEL.wood);
        T(i + 0.8, k, STEEL.woodD);
      }
      const tipA = T.at(-1, -17), tipB = T.at(-1, 17), mid = q.pull ? off : T.at(-1, 0);
      const line = (A, B2, c) => {
        const n = Math.max(2, Math.ceil(len(sub(B2, A)) / 0.4)), Z = STEEL.a;
        for (let k = 0; k <= n; k++) {
          const P2 = add(A, mul(sub(B2, A), k / n)), wx = Math.round(P2[0]), wy = Math.round(P2[1]), idx = (OY - wy) * BW + (OX + wx);
          curFrameIndex = -1;
          plot(idx, P2[2] + 0.05, 2, PART.weapon, 2, wx, wy, c ?? Z);
        }
      };
      line(tipA, mid);
      line(tipB, mid);
      if (q.nocked) {
        const nock = mid, tip = T.at(13, 0);
        line(nock, tip, STEEL.wood);
        for (let i = 9; i <= 13; i += 0.4) for (let k = -(13 - i) * 0.45; k <= (13 - i) * 0.45; k += 0.4) T(i, k, STEEL.hi);
      }
    } },
    pistol: { across: true, draw(T) {
      for (let i = -1; i <= 9.5; i += 0.4) for (let k = -4.2; k <= -2.4; k += 0.4) T(i, k, k < -3.6 ? STEEL.a : k > -2.9 ? STEEL.d : STEEL.b);
      for (let i = -1.2; i <= 1.2; i += 0.4) for (let k = -2.4; k <= 2.4; k += 0.4) T(i, k, STEEL.gripD);
      T(9, -4.6, STEEL.hi);
    } },
    launcher: { two: -9, draw(T) {
      for (let i = -14; i <= 22; i += 0.4) for (let k = -6; k <= -1; k += 0.4) T(i, k, k < -4.8 ? STEEL.oliveA : k > -2.2 ? STEEL.oliveD : Math.abs(i - 3) < 1.4 ? STEEL.gold : STEEL.olive);
      for (let k = -6.8; k <= -0.2; k += 0.4) T(22.4, k, STEEL.b), T(-14.4, k, STEEL.d);
    } },
    handle: { draw(T) {
      haft(T, -2.6, 6, STEEL.grip, STEEL.gripD);
      for (let k = -1.6; k <= 1.6; k += 0.4) T(-3, k, STEEL.gold), T(6.4, k, STEEL.gold);
    } }
  };
  function finish(S, restFrames) {
    const dim = (part) => part >= PART.upperF && part <= PART.handF ? 1 : part >= PART.thighF && part <= PART.footF ? 1 : 0;
    const toneOf = (v, part) => {
      let t = v > 0.8 ? 0 : v > 0.42 ? 1 : v > 0.08 ? 2 : 3;
      t = Math.min(3, t + dim(part));
      return t;
    };
    const tones = /* @__PURE__ */ new Map();
    for (const i of touched) tones.set(i, toneOf(Tone[i], Part[i]));
    for (const i of touched) {
      if (Mat[i] === 2) continue;
      const t = tones.get(i), votes = [0, 0, 0, 0];
      let same = false;
      for (const d of [-1, 1, -BW, BW]) {
        const j = i + d;
        if (Part[j] !== Part[i] || !tones.has(j)) continue;
        const u = tones.get(j);
        votes[u]++;
        if (u === t) same = true;
      }
      if (!same && votes.some((v) => v > 0)) tones.set(i, votes.indexOf(Math.max(...votes)));
    }
    for (const i of touched) {
      if (Mat[i] === 2) continue;
      Col[i] = (Mat[i] === 1 ? CORE : SHELL)[tones.get(i)];
    }
    const marks = /* @__PURE__ */ new Map();
    for (const i of touched) {
      for (const d of [1, BW]) {
        const j = i + d;
        if (Part[j] === 0 || Part[j] === Part[i]) continue;
        const far = Zb[i] < Zb[j] ? i : j, dz = Math.abs(Zb[i] - Zb[j]), steel = Mat[i] === 2 || Mat[j] === 2;
        if (Mat[far] === 2 && dz < 1) continue;
        const ink = steel || dz > 2.2;
        if (ink) marks.set(far, INK2);
        else if (!marks.has(far)) marks.set(far, SEAM);
      }
    }
    for (const [i, c] of marks) Col[i] = c;
    const { B: B2 } = S, chestAt = add(B2.chest.t, mv(B2.chest.R, [3, 1.6, -1.8]));
    if (mv(B2.chest.R, [1, 0, 0])[2] > 0.15) {
      const i = (OY - Math.round(chestAt[1])) * BW + (OX + Math.round(chestAt[0]));
      if (Part[i] === PART.chest) Col[i] = MARK;
    }
    const list = touched.slice(), ring = /* @__PURE__ */ new Map();
    for (const i of list) for (const d of [-1, 1, -BW, BW]) {
      const j = i + d;
      if (Part[j] === 0 && !ring.has(j)) ring.set(j, i);
    }
    const n = list.length + ring.size, out = { n, xs: new Int16Array(n), ys: new Int16Array(n), color: new Uint32Array(n), src: new Int16Array(n), ink: new Uint8Array(n), x0: 0, y0: 0, x1: 0, y1: 0 };
    const srcFor = (i) => {
      const f = Fr[i];
      if (f < 0 || !restFrames) return -1;
      const name = FRAME_IDS[f], A = B2[name], R02 = restFrames[name], wx = i % BW - OX, wy = OY - (i / BW | 0), P2 = [wx, wy, Zb[i]];
      const lp = tv(A.R, sub(P2, A.t)), rp = add(R02.t, mv(R02.R, lp)), c = Math.round(rp[0]) + 12, r = 38 - Math.round(rp[1]);
      return c < 0 || r < 0 || c >= W0 || r >= H0 ? -1 : r * W0 + c;
    };
    let k = 0, x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    const push = (i, c, s, isInk) => {
      const x = i % BW - OX, y = (i / BW | 0) - OY;
      out.xs[k] = x;
      out.ys[k] = y;
      out.color[k] = c;
      out.src[k] = s;
      out.ink[k] = isInk ? 1 : 0;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      k++;
    };
    for (const i of list) push(i, Col[i], srcFor(i), Col[i] === INK2);
    for (const [j, i] of ring) push(j, INK2, srcFor(i), true);
    let zs = 0;
    for (const i of list) zs += Zb[i];
    Object.assign(out, { x0, y0, x1, y1, z: list.length ? zs / list.length : 0 });
    for (const i of list) Part[i] = 0;
    touched.length = 0;
    return out;
  }
  var turnAll = (S, a) => {
    const R = rotY(-a), P2 = (v) => mv(R, v);
    for (const f of Object.values(S.B)) {
      f.t = P2(f.t);
      f.R = mm(R, f.R);
    }
    for (const A of [S.armN, S.armF, S.legN, S.legF]) {
      A.joint = P2(A.joint);
      A.end = P2(A.end);
    }
    S.sN = P2(S.sN);
    S.sF = P2(S.sF);
    S.hipN = P2(S.hipN);
    S.hipF = P2(S.hipF);
    S.axis = P2(S.axis);
    S.side = P2(S.side);
  };
  var REST_FRAMES = null;
  function render(pose) {
    const S = solve(pose), q = S.q, whole = (q.yaw ?? 0) + (q.face === -1 ? Math.PI : 0);
    if (whole) turnAll(S, whole);
    const air = (q.y ?? 0) < -0.5;
    clipBody = !air;
    clipWeapon = !air;
    drawBody(S);
    clipBody = false;
    if (S.W) S.W.draw(along(S.armN.end, S.axis, S.side, PART.weapon), q, S.armF.end);
    if (S.OW) {
      const sb = q.sb ?? Math.PI;
      let ax = [Math.cos(sb), -Math.sin(sb), 0], sd = [-Math.sin(sb), -Math.cos(sb), 0];
      if (whole) {
        const R = rotY(-whole);
        ax = mv(R, ax);
        sd = mv(R, sd);
      }
      S.OW.draw(along(S.armF.end, ax, sd, PART.offWeapon), q, S.armF.end);
    }
    clipWeapon = false;
    return finish(S, REST_FRAMES);
  }
  REST_FRAMES = solve({}).B;
  var CACHE = /* @__PURE__ */ new Map();
  var keyOf = (p) => {
    let s = (p.y ?? 0) < -0.5 ? "air," : "";
    for (const k of Object.keys(p).sort()) {
      const v = p[k];
      if (v === void 0 || k === "x" || k === "y" || k === "ghost") continue;
      s += k + (typeof v === "number" ? k === "sa" || k === "sb" || k === "wl" || k === "yaw" || k === "turn" ? Math.round(v * 20) : Math.round(v) : v) + ",";
    }
    return s;
  };
  function posed(pose) {
    const key = keyOf(pose);
    let r = CACHE.get(key);
    if (!r) {
      if (CACHE.size > 6e3) CACHE.clear();
      CACHE.set(key, r = render(pose));
    }
    return r;
  }

  // public/vendor/pixelfx/src/core/act.js
  var lerp = (a, b, u) => a + (b - a) * u;
  function lerpPose(a, b, u) {
    const out = { ...STAND, ...a };
    const B2 = { ...STAND, ...b };
    for (const k of Object.keys(B2)) {
      const v = B2[k];
      if (typeof v === "number" && typeof out[k] === "number") out[k] = lerp(out[k], v, u);
      else if (out[k] === void 0 && typeof v === "number") out[k] = v;
    }
    for (const k of ["hx", "hy", "lean", "crouch"]) if (B2[k] === void 0 && typeof out[k] === "number") out[k] = lerp(out[k], 0, u);
    if (B2.wl === void 0 && typeof out.wl === "number") out.wl = lerp(out.wl, 1, u);
    return out;
  }
  var eases = { out: (u) => 1 - (1 - u) * (1 - u), in: (u) => u * u, line: (u) => u };
  function poseAt(track, t) {
    if (t <= track[0][0]) return track[0][1];
    for (let i = 0; i < track.length - 1; i++) {
      const [t0, a] = track[i], [t1, b, how] = track[i + 1];
      if (t >= t1) continue;
      if (how === "snap") return a;
      const e = eases[how] ?? ((u2) => u2 * u2 * (3 - 2 * u2));
      const stepped = t0 + Math.floor((t - t0) * 12 + 1e-6) / 12;
      const out = lerpPose(a, b, e((stepped - t0) / (t1 - t0)));
      const u = e((t - t0) / (t1 - t0));
      out.x = lerp(a.x ?? 0, b.x ?? 0, u);
      out.y = lerp(a.y ?? 0, b.y ?? 0, u);
      return out;
    }
    return track[track.length - 1][1];
  }
  function isHeld(track, t) {
    if (t >= track[track.length - 1][0] || t < track[0][0]) return true;
    for (let i = 0; i < track.length - 1; i++) {
      if (t >= track[i + 1][0]) continue;
      const a = { ...STAND, ...track[i][1] }, b = { ...STAND, ...track[i + 1][1] };
      return track[i + 1][0] - track[i][0] > 0.4 && ["fx", "fy", "bx", "by", "crouch", "lean", "x", "y"].every((k) => Math.abs((a[k] ?? 0) - (b[k] ?? 0)) < 1.5);
    }
    return true;
  }
  var TW = 38;
  var TH = 52;
  var TP = Object.fromEntries(Object.entries({ ink: "#0b0a1a", wood: "#724c2e", woodL: "#a0703a", woodD: "#4e331f", straw: "#d2aa55", strawL: "#f0d98a", burlapD: "#86643a", burlap: "#b38b57", burlapL: "#c9a26c", red: "#9a2f3c", redL: "#c4434f", white: "#ffffff" }).map(([k, v]) => [k, hex(v)]));
  var DUST = ["#efe7dc", "#c9bfb8", "#8f8693", "#5a5468"].map(hex);
  var DUMMY = new Uint32Array(TW * TH);
  (function buildDummy() {
    const px = (x, y, c) => {
      if (x >= 0 && y >= 0 && x < TW && y < TH) DUMMY[y * TW + x] = c;
    };
    const R = (x, y, w, h, c) => {
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) px(x + i, y + j, c);
    };
    R(15, 38, 8, 14, TP.ink);
    R(16, 34, 6, 18, TP.wood);
    R(16, 34, 2, 18, TP.woodL);
    R(20, 34, 2, 18, TP.woodD);
    R(1, 18, 36, 1, TP.ink);
    R(1, 23, 36, 1, TP.ink);
    R(1, 19, 36, 4, TP.wood);
    R(1, 19, 36, 1, TP.woodL);
    R(1, 22, 36, 1, TP.woodD);
    for (const [bx, s] of [[0, -1], [33, 1]]) {
      R(bx, 17, 5, 8, TP.straw);
      for (const [dx, dy, c] of [[2, 16, TP.straw], [3, 15, TP.strawL], [1, 17, TP.strawL], [2, 25, TP.straw], [1, 26, TP.strawL], [3, 25, TP.burlapD], [2, 19, TP.strawL], [3, 21, TP.strawL], [1, 22, TP.burlapD], [2, 23, TP.strawL]]) px(bx + dx, dy, c);
      px(s < 0 ? bx - 1 : bx + 5, 19, TP.straw);
      px(s < 0 ? bx - 1 : bx + 5, 22, TP.strawL);
    }
    const sack = (x, y, w, h) => {
      R(x + 1, y, w - 2, 1, TP.ink);
      R(x + 1, y + h - 1, w - 2, 1, TP.ink);
      R(x, y + 1, 1, h - 2, TP.ink);
      R(x + w - 1, y + 1, 1, h - 2, TP.ink);
      R(x + 1, y + 1, w - 2, h - 2, TP.burlap);
      R(x + w - 4, y + 1, 3, h - 2, TP.burlapD);
      R(x + 1, y + h - 3, w - 2, 2, TP.burlapD);
      R(x + 1, y + 1, 1, h - 4, TP.burlapL);
      R(x + 1, y + 1, w - 6, 1, TP.burlapL);
      for (let j = y + 2; j < y + h - 2; j += 3) for (let i = x + 3 + j % 2; i < x + w - 4; i += 4) px(i, j, TP.burlapD);
    };
    sack(9, 17, 20, 24);
    for (let y = 19; y < 36; y++) for (let x = 11; x < 27; x++) {
      const d = Math.hypot(x - 18.5, y - 27);
      if (d > 4 && d < 5.4 || d < 1.9) px(x, y, x + y < 45 ? TP.redL : TP.red);
    }
    for (let x = 10; x < 28; x++) {
      px(x, 36, x & 1 ? TP.woodL : TP.straw);
      px(x, 37, x & 1 ? TP.woodD : TP.wood);
    }
    for (const [x, y, c] of [[11, 41, TP.straw], [12, 42, TP.strawL], [14, 41, TP.strawL], [15, 42, TP.straw], [23, 41, TP.straw], [24, 42, TP.strawL], [26, 41, TP.straw], [13, 43, TP.straw], [25, 43, TP.straw]]) px(x, y, c);
    sack(10, 1, 18, 16);
    for (const ex of [14, 23]) for (let d = -2; d <= 2; d++) {
      px(ex + d, 7 + d, TP.ink);
      px(ex - d, 7 + d, TP.ink);
    }
    for (let x = 14; x < 24; x++) px(x, 12, x & 1 ? TP.ink : TP.burlapD);
    for (const x of [15, 18, 21]) {
      px(x, 11, TP.ink);
      px(x, 13, TP.ink);
    }
    for (let x = 12; x < 26; x++) {
      px(x, 16, x & 1 ? TP.woodL : TP.straw);
      px(x, 17, x & 1 ? TP.wood : TP.woodD);
    }
    for (const [x, y, c] of [[13, 0, TP.straw], [15, 0, TP.strawL], [18, 0, TP.straw], [21, 0, TP.strawL], [24, 0, TP.straw], [9, 4, TP.straw], [28, 6, TP.straw], [8, 7, TP.strawL], [29, 3, TP.strawL]]) px(x, y, c);
  })();
  var SKINS = { flash: [TP.white, 1], char: [hex("#1a0c0e"), 0.72], ice: [hex("#a8e8ff"), 0.72], shadow: [hex("#3a1a70"), 0.5], holy: [hex("#fff4c0"), 0.5], red: [hex("#ff2040"), 0.45], shock: [hex("#8fd6ff"), 0.6], poison: [hex("#58c43a"), 0.5] };
  var STRAW = [TP.strawL, TP.straw, TP.straw, TP.burlapD, TP.burlapD];
  var Target = class {
    constructor(x, seed = 5) {
      Object.assign(this, { x, theta: 0, omega: 0, flashT: 0, skin: null, skinFade: 0, shiver: 0, clock: 0, R: new Rng(seed), straw: [] });
    }
    hit({ push = 1.2, straw = 8, flash = 0.05, skin, shiver = 0, y = -26 } = {}) {
      this.omega += push;
      this.flashT = Math.max(this.flashT, flash);
      if (skin !== void 0) this.skin = skin;
      if (shiver) this.shiver = shiver;
      const R = this.R;
      for (let k = 0; k < straw; k++) {
        const back = R.next() < 0.3;
        this.straw.push({ x: this.x + R.range(-3, 3), y: y + R.range(-3, 3), vx: back ? R.range(-60, -5) : R.range(10, 130), vy: R.range(-120, -5), age: 0, life: R.range(1.2, 2.2), big: R.next() < 0.5 });
      }
    }
    step(dt) {
      this.clock += dt;
      this.omega += (-60 * this.theta - 3.4 * this.omega) * dt;
      this.theta = clamp(this.theta + this.omega * dt, -0.4, 0.42);
      if (this.flashT > 0) this.flashT -= dt;
      if (this.shiver > 0) this.shiver -= dt;
      for (const s of this.straw) {
        s.age += dt;
        s.vy += 210 * dt;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        if (s.y >= 0) {
          s.y = 0;
          s.vx *= 0.2;
          s.vy = 0;
        }
      }
      this.straw = this.straw.filter((s) => s.age < s.life);
    }
    draw(C, W, H, X, Y, flip) {
      const tan = Math.tan(this.theta), sv = this.shiver > 0 ? Math.floor(this.clock * 30) & 1 ? 1 : -1 : 0, name = this.flashT > 0 ? "flash" : this.skin, sk = name ? SKINS[name] : null;
      const base = X + (flip ? -this.x - 1 : this.x);
      for (let r = 0; r < TH; r++) {
        const o = Math.round((TH - 1 - r) * tan * 0.8) + sv;
        for (let x = 0; x < TW; x++) {
          const c = DUMMY[r * TW + x];
          if (!c) continue;
          const px = base + (flip ? -(x - 19 + o) - 1 : x - 19 + o), py = Y - TH + r;
          if (px >= 0 && py >= 0 && px < W && py < H) C[py * W + px] = sk ? mix(c, sk[0], sk[1]) : c;
        }
      }
    }
    drawStraw(C, W, H, X, Y, flip) {
      for (const s of this.straw) {
        const c = STRAW[Math.min(4, Math.floor(s.age / s.life * 5))], lx = Math.round(s.x), ly = Math.round(s.y) - 1;
        for (let i = 0; i < (s.big ? 2 : 1); i++) {
          const px = X + (flip ? -(lx + i) - 1 : lx + i), py = Y + ly;
          if (px >= 0 && py >= 0 && px < W && py < H) C[py * W + px] = c;
        }
      }
    }
  };
  var GHOST_LIFE = 0.16;
  var REST_MASK = new Uint8Array(24 * 38);
  var REST_PX = new Uint32Array(24 * 38);
  HERO2.forEach((row, r) => [...row].forEach((ch, c) => {
    if (ch !== ".") {
      REST_MASK[r * 24 + c] = 1;
      REST_PX[r * 24 + c] = hex(DUMMY_PAL[ch]);
    }
  }));
  var NEAREST = new Int16Array(24 * 38).fill(-1);
  for (let r = 0; r < 38; r++)
    for (let c = 0; c < 24; c++) {
      let best = -1, bd = 1e9;
      for (let y = Math.max(0, r - 7); y < Math.min(38, r + 8); y++)
        for (let x = Math.max(0, c - 7); x < Math.min(24, c + 8); x++) {
          const d = (x - c) * (x - c) + (y - r) * (y - r);
          if (REST_MASK[y * 24 + x] && d < bd) {
            bd = d;
            best = y * 24 + x;
          }
        }
      NEAREST[r * 24 + c] = best;
    }
  var lum = (c) => (0.3 * (c & 255) + 0.59 * (c >>> 8 & 255) + 0.11 * (c >>> 16 & 255)) / 255;
  function carry(v, rest, own) {
    const lv = lum(v);
    if (lv > 0.9 || v >>> 24 < 255) return v;
    const k = Math.max(0.45, Math.min(1.5, lum(own) / Math.max(0.08, lum(rest))));
    const ch = (n) => Math.min(255, Math.round((v >>> n & 255) * k));
    return 255 << 24 | ch(16) << 16 | ch(8) << 8 | ch(0);
  }
  function actSpan(mod) {
    const a = mod.act, D = mod.meta?.duration ?? 1, k = a?.poses;
    return { from: Math.min(0, k?.[0]?.[0] ?? 0), to: mod.meta?.loop ? Infinity : Math.max(D, k?.[k.length - 1]?.[0] ?? 0) };
  }
  function createAct(mod, o = {}) {
    const a = mod.act ?? {}, meta14 = mod.meta ?? {}, D = meta14.duration ?? 1, flip = !!o.flip, seed = o.seed ?? meta14.options?.seed ?? 1;
    const fx = createFx(mod, o), track = a.poses ?? [[0, { ...STAND }]], span = actSpan(mod);
    const X = o.x ?? 0, Y = o.y ?? 0;
    const targets = (a.targets ?? (a.target ? [a.target] : [])).map((g, i) => new Target(g.x ?? 66, seed + 4 + i));
    const hits = (a.hits ?? []).map((h) => ({ ...h })).sort((p, q) => p.t - q.t), dust = (a.dust ?? []).slice();
    const R = new Rng(seed + 9), specks = [];
    const ramp2 = o.palette ?? meta14.options?.palette, ghosts = [], gc = hex(a.ghost ?? ramp2?.[Math.floor(ramp2.length * 0.7)] ?? "#8fb4ff");
    let t = span.from, stop = 0, stopped = false, shakeT = 0, shake0 = 0, amp = 0, nh = 0, nd = 0, loopN = 0, gAcc = 0, last = null;
    const poseNow = () => {
      let tt = t;
      if (meta14.loop && t >= D) tt = t % D;
      let q = poseAt(track, tt);
      if (!meta14.loop && isHeld(track, tt)) {
        const up = Math.floor(tt * 3) & 1;
        q = { ...STAND, ...q, crouch: (q.crouch ?? 0) + up, fy: (q.fy ?? STAND.fy) + up, by: (q.by ?? STAND.by) + up };
      }
      last = q;
      return q;
    };
    let scratch = null;
    const scratchFor = (f) => {
      if (!scratch || scratch.a.w !== f.w || scratch.a.h !== f.h) scratch = { a: createFrame(f.w, f.h, f.ox, f.oy), b: createFrame(f.w, f.h, f.ox, f.oy) };
      return scratch;
    };
    const out = {
      fx,
      meta: meta14,
      act: a,
      targets,
      get t() {
        return t;
      },
      /** How far the whole picture is thrown right now, in px. */
      get shake() {
        if (shakeT <= 0) return [0, 0];
        const k = amp * (shakeT / shake0), f = Math.floor(shakeT * 60);
        return [Math.round(Math.sin(f * 2.4) * k), Math.round(Math.cos(f * 3.7) * k * 0.7)];
      },
      get frozen() {
        return stop > 0;
      },
      /** The pose he's in right now. */
      get pose() {
        return last;
      },
      update(dt) {
        if (shakeT > 0) shakeT -= dt;
        if (stop > 0) {
          stop -= dt;
          return;
        }
        const t0 = t;
        t += dt;
        if (t >= 0) fx.update(t0 < 0 ? t : dt);
        if (meta14.loop && t >= D) {
          const n = Math.floor(t / D);
          if (n !== loopN) {
            loopN = n;
            nh = 0;
            nd = 0;
          }
        }
        const tt = meta14.loop && t >= D ? t % D : t;
        for (; nh < hits.length && hits[nh].t <= tt; nh++) {
          const h = hits[nh];
          if (h.stop) stop = Math.max(stop, h.stop);
          if (h.shake) {
            shakeT = shake0 = h.shake;
            amp = h.amp ?? 2;
          }
          if (h.target !== false) targets.forEach((g, i) => (h.at === void 0 || h.at === i) && g.hit(h));
          out.onHit?.(h);
        }
        for (; nd < dust.length && dust[nd].t <= tt; nd++) {
          const d = dust[nd], n = d.n ?? 6;
          for (let i = 0; i < n; i++) {
            const dir = d.dir ?? (R.next() < 0.5 ? -1 : 1);
            specks.push({ x: d.x + R.range(-3, 3), y: -1 - R.range(0, 2), vx: dir * R.range(22, 90), vy: R.range(-34, -6), age: 0, life: R.range(0.16, 0.4), big: R.next() < 0.45, c: d.c ? hex(d.c) : 0 });
          }
        }
        for (const k of specks) {
          k.age += dt;
          k.vx *= 1 - 5 * dt;
          k.vy += 110 * dt;
          k.x += k.vx * dt;
          k.y = Math.min(-1, k.y + k.vy * dt);
        }
        for (let i = specks.length - 1; i >= 0; i--) if (specks[i].age >= specks[i].life) specks.splice(i, 1);
        const q = poseNow();
        for (const g of targets) g.step(dt);
        gAcc += dt;
        if (q.ghost && gAcc >= 1 / 30) {
          gAcc = 0;
          ghosts.push({ q, age: 0 });
          if (ghosts.length > 7) ghosts.shift();
        }
        for (const g of ghosts) g.age += dt;
        while (ghosts.length && ghosts[0].age > GHOST_LIFE) ghosts.shift();
      },
      /** Paint it. { body: false } leaves the character out, { target: false } the target. */
      draw(frame2, { body = true, target: showTarget = true } = {}) {
        const W = frame2.w, H = frame2.h, q = last ?? poseNow(), active = t >= 0;
        const tgt = showTarget ? targets : [];
        const drawTargets = () => tgt.forEach((g) => g.draw(frame2.color, W, H, FX, FY, flip));
        const drawStraw = () => tgt.forEach((g) => g.drawStraw(frame2.color, W, H, FX, FY, flip));
        const drawDust = () => {
          for (const k of specks) {
            const c = k.c || DUST[Math.min(3, Math.floor(k.age / k.life * 4))], lx = Math.round(k.x), py = FY + Math.round(k.y);
            for (let i = 0; i < (k.big ? 2 : 1); i++) {
              const px = flip ? FX - lx - i - 1 : FX + lx + i;
              if (px >= 0 && py >= 0 && px < W && py < H) frame2.color[py * W + px] = c;
            }
          }
        };
        const FX = X - (frame2.ox | 0), FY = Y - (frame2.oy | 0);
        if (!body) {
          if (active) fx.draw(frame2, "back");
          drawTargets();
          if (active) fx.draw(frame2, "front");
          drawStraw();
          return;
        }
        const rx = Math.round(q.x ?? 0), ry = Math.round(q.y ?? 0), BX = FX + (flip ? -rx : rx), BY = FY + ry;
        const r = posed(q), mirror = flip;
        const paint2 = (i, color) => {
          const px = mirror ? BX - r.xs[i] - 1 : BX + r.xs[i], py = BY + r.ys[i];
          if (px < 0 || py < 0 || px >= W || py >= H) return;
          frame2.color[py * W + px] = color;
          if (ghosts.length) frame2.light[py * W + px] = 0;
        };
        const drawGhosts = () => {
          for (const g of ghosts) {
            const gr = posed(g.q), gx = FX + (flip ? -Math.round(g.q.x ?? 0) : Math.round(g.q.x ?? 0)), gy = FY + Math.round(g.q.y ?? 0), k = 0.5 * (1 - g.age / GHOST_LIFE);
            const gm = flip, r0 = (gc & 255) * k, g0 = (gc >>> 8 & 255) * k, b0 = (gc >>> 16 & 255) * k;
            for (let i = 0; i < gr.n; i++) {
              const px = gm ? gx - gr.xs[i] - 1 : gx + gr.xs[i], py = gy + gr.ys[i];
              if (px < 0 || py < 0 || px >= W || py >= H) continue;
              const j = py * W + px, d = frame2.light[j];
              frame2.light[j] = 255 << 24 | Math.min(255, (d >>> 16 & 255) + b0) << 16 | Math.min(255, (d >>> 8 & 255) + g0) << 8 | Math.min(255, (d & 255) + r0);
            }
          }
        };
        const shadow = () => {
          const sy = FY, cx = FX + (flip ? -rx : rx), hw = 10 + (Math.abs(q.ffx - q.fbx) >> 1) - Math.min(8, Math.abs(ry) >> 1);
          if (sy < 0 || sy >= H) return;
          for (let dy = 0; dy < 2; dy++)
            for (let x = -hw + dy * 2; x <= hw - dy * 2; x++) {
              const px = cx + x, i = (sy + dy) * W + px;
              if (px < 0 || px >= W || sy + dy >= H) continue;
              frame2.color[i] = frame2.color[i] & 16777215 | Math.max(frame2.color[i] >>> 24, 110) << 24;
            }
        };
        if (!a.onBody) {
          if (active) fx.draw(frame2, "back");
          drawTargets();
          shadow();
          drawGhosts();
          for (let i = 0; i < r.n; i++) paint2(i, r.color[i]);
          if (active) fx.draw(frame2, "front");
          drawStraw();
          drawDust();
          return;
        }
        const { a: A, b: B2 } = scratchFor(frame2);
        clearFrame(A);
        clearFrame(B2);
        if (active) fx.draw(A, "back");
        B2.color.set(A.color);
        B2.light.set(A.light);
        const tt = meta14.loop ? t < 0 ? 0 : t % D : clamp(t, 0, D), alpha = active ? actorAlphaOf(mod, tt, fx.options) : 1;
        drawActor(painterFor(B2).place(FX, FY, flip), fx.options.actor ?? stockActor(2), alpha);
        if (active) fx.draw(B2, "front");
        const follow = a.follow ?? 1, lean = (q.lean ?? 0) * follow, cr = (q.crouch ?? 0) * follow;
        const shiftOf = (ly) => {
          const k = clamp((-11 - ly) / 7, 0, 1), f = clamp((-1 - ly) / 6, 0, 1);
          return [Math.round(lean * k + rx * f), Math.round(cr * k + ry * f)];
        };
        const rest = (sx, sy) => {
          const c = (flip ? FX - sx - 1 : sx - FX) + 12, r0 = sy - FY + 38;
          return c >= 0 && r0 >= 0 && c < 24 && r0 < 38 && REST_MASK[r0 * 24 + c] === 1;
        };
        const C = frame2.color, Ls = frame2.light;
        const copy = (buf, sx, sy, s) => {
          const [dx, dy] = shiftOf(sy - FY), px = sx + (flip ? -dx : dx), py = sy + dy;
          if (px < 0 || py < 0 || px >= W || py >= H) return;
          const i = py * W + px;
          if (buf === Ls) {
            const d = Ls[i];
            Ls[i] = 255 << 24 | Math.min(255, (d >>> 16 & 255) + (s >>> 16 & 255)) << 16 | Math.min(255, (d >>> 8 & 255) + (s >>> 8 & 255)) << 8 | Math.min(255, (d & 255) + (s & 255));
          } else if (s >>> 24 === 255 || !C[i]) C[i] = s;
          else {
            const k = (s >>> 24) / 255, d = C[i];
            const ch = (n) => Math.round((s >>> n & 255) * k + (d >>> n & 255) * (1 - k));
            C[i] = Math.max(s >>> 24, d >>> 24) << 24 | ch(16) << 16 | ch(8) << 8 | ch(0);
          }
        };
        drawTargets();
        shadow();
        for (let sy = 0; sy < H; sy++)
          for (let sx = 0; sx < W; sx++) {
            const c = A.color[sy * W + sx];
            if (c) copy(C, sx, sy, c);
          }
        drawGhosts();
        const restIndex = (s) => {
          const c = s % 24, r0 = s / 24 | 0, sx = flip ? FX - (c - 12) - 1 : FX + c - 12, sy = FY + r0 - 38;
          return sx >= 0 && sy >= 0 && sx < W && sy < H ? sy * W + sx : -1;
        };
        for (let i = 0; i < r.n; i++) {
          const s = r.src[i] >= 0 ? NEAREST[r.src[i]] : -1;
          if (s < 0) {
            if (alpha > 0.5) paint2(i, r.color[i]);
            continue;
          }
          const j = restIndex(s), v = j >= 0 ? B2.color[j] : REST_PX[s];
          if (!v) continue;
          paint2(i, v === REST_PX[s] ? r.color[i] : carry(v, REST_PX[s], r.color[i]));
        }
        for (let sy = 0; sy < H; sy++)
          for (let sx = 0; sx < W; sx++) {
            const j = sy * W + sx;
            if (B2.color[j] && B2.color[j] !== A.color[j] && !rest(sx, sy)) copy(C, sx, sy, B2.color[j]);
            if (B2.light[j] & 16777215) copy(Ls, sx, sy, B2.light[j]);
          }
        drawStraw();
        drawDust();
      },
      /** Let a loop end: it fades out and done() goes true. */
      stop() {
        fx.stop();
        stopped = true;
      },
      /** One-shots end when the last pose is over. */
      done() {
        return stopped ? fx.done() : t >= span.to && stop <= 0;
      }
    };
    poseNow();
    return out;
  }
  function actBounds(mod) {
    const a = mod.act, [w, h] = mod.meta.size, [ox, oy] = mod.meta.origin;
    let x0 = -ox, y0 = -oy, x1 = w - ox, y1 = h - oy;
    const see = (p) => {
      const r = posed(p), X = Math.round(p.x ?? 0), Y = Math.round(p.y ?? 0), a2 = r.x0, b = r.x1;
      x0 = Math.min(x0, a2 + X - 1);
      x1 = Math.max(x1, b + X + 1);
      y0 = Math.min(y0, r.y0 + Y - 1);
      y1 = Math.max(y1, r.y1 + Y + 1);
    };
    const k = a?.poses;
    if (k) {
      for (let t = k[0][0]; t <= k[k.length - 1][0]; t += 1 / 12) see(poseAt(k, t));
      for (const key of k) see(key[1]);
    } else see(STAND);
    for (const g of a?.targets ?? (a?.target ? [a.target] : [])) {
      const tx = g.x ?? 66;
      x0 = Math.min(x0, tx - 30);
      x1 = Math.max(x1, tx + 36);
      y0 = Math.min(y0, -56);
    }
    return { x0, y0, x1, y1 };
  }

  // public/vendor/pixelfx/src/core/poses.js
  var READY = { crouch: 3, fx: 11, fy: -21, bx: 9, by: -21, ffx: 7, fbx: -7 };

  // public/vendor/pixelfx/src/fx/impacts/hit-spark.js
  var hit_spark_exports = {};
  __export(hit_spark_exports, {
    create: () => create,
    meta: () => meta
  });
  var meta = {
    name: "Hit spark",
    desc: "The everyday hit: a sharp, lopsided cross flare with one long ray along the blow round a white diamond core, then a cone of sparks and hot chips that fall and bounce.",
    tags: ["impact", "hit", "spark", "combat", "directional", "one-shot"],
    size: [136, 80],
    origin: [44, 64],
    duration: 0.5,
    loop: false,
    fps: 30,
    bg: "ground",
    options: { palette: ["#4a1712", "#c9281f", "#f2561d", "#ff8a2a", "#ffe26b", "#fff3a6", "#ffffff"], height: 20, aim: 0.1, seed: 4 }
  };
  function ray(p, x, y, a, L, w, C, from = 0) {
    const c = Math.cos(a), s = Math.sin(a);
    for (let d = from * L; d <= L; d += 0.5) {
      const u = d / L, hw = w * Math.pow(1 - u, 1.6);
      const col = u < 0.3 ? WHITE : u < 0.62 ? C[5] : u < 0.88 ? C[4] : C[3];
      p.px(x + c * d, y + s * d, col);
      if (hw > 0.45) for (let o = 0.5; o <= hw; o += 0.5) for (const e of [-o, o]) p.px(x + c * d - s * e, y + s * d + c * e, u < 0.3 && o < 1 ? C[5] : C[4]);
    }
  }
  function diamond(p, x, y, r, C) {
    for (let dy = -r - 1; dy <= r + 1; dy++)
      for (let dx = -r - 1; dx <= r + 1; dx++) {
        const m = Math.abs(dx) + Math.abs(dy);
        if (m <= r) p.px(x + dx, y + dy, WHITE);
        else if (m === r + 1) p.px(x + dx, y + dy, C[3]);
      }
  }
  function create(o) {
    const C = fit(o.palette, 7), R = new Rng(o.seed), X = 0, Y = -o.height, A = o.aim, floor = () => 0;
    const ps = new Particles({ rng: R, ground: floor, sparks: [C[6], C[5], C[4], C[2]] });
    const lights = new Lights();
    const tilt = R.range(-0.08, 0.08);
    const rays = [
      { a: A + tilt, L: R.range(33, 37), w: 2.2 },
      { a: A + Math.PI + tilt, L: R.range(8, 10), w: 2.2 },
      { a: A - Math.PI / 2 + tilt, L: R.range(15, 18), w: 2.6 },
      { a: A + Math.PI / 2 + tilt, L: R.range(10, 12), w: 2.3 },
      { a: A - Math.PI / 4 + tilt, L: R.range(5, 7), w: 1 }
    ];
    lights.add(X, Y, 38, C[4], 0.35, 0.18);
    lights.add(X + Math.cos(A) * 10, Y + Math.sin(A) * 10, 22, C[5], 0.45, 0.1);
    lights.add(X, -2, 26, C[3], 0.22, 0.22);
    for (let i = 0; i < 9; i++) {
      const a = A + R.range(-0.6, 0.6) - 0.15, v = R.range(170, 360);
      ps.spawn(P.SPARK, X + 1, Y, Math.cos(a) * v, Math.sin(a) * v - 40, R.range(0.25, 0.45), WHITE, 1, i > 6 ? R.range(0.01, 0.03) : 0);
    }
    for (let i = 0; i < 6; i++) {
      const a = A + R.range(-1.1, 0.5) - 0.3, v = R.range(70, 170);
      ps.spawn(P.GRIT, X + 1, Y, Math.cos(a) * v, Math.sin(a) * v - R.range(30, 80), R.range(0.35, 0.45), R.pick([C[5], C[4], C[4], C[3]]), 1);
    }
    let t = 0;
    return {
      update(dt) {
        t += dt;
        ps.update(dt);
        lights.update(dt);
      },
      draw(p) {
        ps.draw(p);
        if (t < 0.025) {
          for (const r of rays) ray(p, X, Y, r.a, r.L, r.w, C);
          diamond(p, X, Y, 4, C);
        } else if (t < 0.058) {
          for (const r of rays) ray(p, X, Y, r.a, r.L * 1.2, r.w * 0.55, C, 0.12);
          diamond(p, X, Y, 3, C);
        } else if (t < 0.092) {
          const r = rays[0];
          ray(p, X, Y, r.a, r.L * 1.3, 0.6, [C[0], C[1], C[2], C[3], C[3], C[4]], 0.4);
        }
        const pop = Math.exp(-t / 0.045);
        if (pop > 0.02) {
          p.glow(X, Y, 22, C[4], 0.3 * pop);
          p.glow(X, Y, 7, WHITE, 0.15 * pop);
          p.glowLine(X, Y, X + Math.cos(A) * 26, Y + Math.sin(A) * 26, 4, C[5], 0.25 * pop);
        }
        lights.draw(p);
      }
    };
  }

  // public/vendor/pixelfx/src/fx/impacts/blunt-hit.js
  var blunt_hit_exports = {};
  __export(blunt_hit_exports, {
    create: () => create2,
    meta: () => meta2
  });

  // public/vendor/pixelfx/src/fx/impacts/_lib.js
  var SOOT = hex("#0d0a12");
  var OUTLINE = hex("#1a1422");
  var LIGHT2 = Math.atan2(-1, -1);
  function stone(c) {
    c = hex(c);
    return { light: mix(scale(c, 1.35), WHITE, 0.08), body: c, shade: scale(c, 0.64), dust: mix(scale(c, 1.2), rgb(150, 140, 150), 0.3), lip: mix(scale(c, 1.55), WHITE, 0.12) };
  }
  function spikes(R, n, aim, { len: len2 = [7, 10], w = [1.5, 2.1], fwd = 1.8, back = 0.6, jag = 1, jit = 0.18 } = {}) {
    return Array.from({ length: n }, (_, i) => {
      const a = aim + i / n * TAU + R.range(-jit, jit), cb = Math.cos(a - aim);
      const L = R.range(len2[0], len2[1]) * (1 + fwd * Math.pow(Math.max(0, cb), 3) + back * Math.pow(Math.max(0, -cb), 3)) * (i % 2 ? jag : 1);
      return { a, len: L, w: R.range(w[0], w[1]) * (i % 2 ? Math.sqrt(jag) : 1) };
    });
  }
  function star(p, x, y, list, sc, th, [rim, body, inner, core], a = 1, heart = 2.4) {
    for (let pass = 0; pass < 3; pass++)
      for (const s of list) {
        const c = Math.cos(s.a), sn = Math.sin(s.a), L = s.len * sc;
        for (let d = 0; d <= L; d += 0.5) {
          if (pass === 2 && d > L * 0.55) break;
          const hw0 = s.w * th * (1 - d / L) * Math.min(1, 0.5 + d / 3);
          const hw = pass === 0 ? hw0 + 0.8 : pass === 1 ? hw0 : hw0 * 0.45;
          const col = pass === 0 ? rim : pass === 1 ? d < L * 0.35 ? inner : body : core;
          for (let o = -hw; o <= hw; o += 0.5) p.dot(x + c * d - sn * o, y + sn * d + c * o, col, a);
        }
      }
    const r = heart * sc * Math.sqrt(th);
    p.circle(x, y, r + 0.8, inner, a);
    p.circle(x, y, r, core, a);
  }
  function brokenRing(p, x, y, r, th, segs, brk, c, c2 = c, k = 1, sy = 1, maxY = Infinity) {
    if (r <= 0 || k <= 0) return;
    const full = TAU / segs.length;
    for (const s of segs) {
      const span = full * (1 - s.gap * brk) + 0.02, rr = r * (1 + s.dr * brk), m = Math.max(4, Math.ceil(rr * span * 1.8));
      for (let j = 0; j <= m; j++) {
        const u = j / m, ang = s.a + (u - 0.5) * span, w = Math.max(0.5, th * (s.w ?? 1) * (1 - brk * Math.pow(Math.abs(2 * u - 1), 1.6)));
        const ca = Math.cos(ang), sa = Math.sin(ang);
        for (let o = -w / 2; o <= w / 2 + 0.01; o += 0.5) if (y + sa * (rr + o) * sy < maxY) p.dot(x + ca * (rr + o), y + sa * (rr + o) * sy, o > -0.26 ? c : c2, k);
      }
    }
  }
  function walk(R, x, y, a, L, { jit = 0.55, steer = 0.45, step: step2 = [2, 4], maxY = Infinity, d0 = 0 } = {}) {
    const pts = [[x, y, d0]];
    let d = 0, cur = a;
    while (d < L - 0.01) {
      const s = Math.min(L - d, R.range(step2[0], step2[1]));
      cur += R.range(-jit, jit) + (a - cur) * steer;
      x += Math.cos(cur) * s;
      y = clamp(y + Math.sin(cur) * s, 0.5, maxY);
      d += s;
      pts.push([x, y, d0 + d]);
    }
    return pts;
  }
  function makeCracks(R, n, { len: len2 = [14, 40], dive = 0.85, maxY = 22, forks = 0.5, x0 = [1, 5] } = {}) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const side = i % 2 ? 1 : -1, dip = 0.06 + Math.pow(R.next(), 1.7) * dive, L = R.range(len2[0], len2[1]) * (1 - 0.5 * dip / (dive + 0.06));
      const a = side > 0 ? dip : Math.PI - dip, pts = walk(R, side * R.range(x0[0], x0[1]), R.range(0.5, 1.5), a, L, { maxY });
      const c = { pts, len: L, t0: R.range(0, 0.035), kids: [] };
      for (let j = 2; j < pts.length - 1; j++)
        if (R.chance(forks * 0.4)) {
          const [fx, fy, fd] = pts[j];
          c.kids.push(walk(R, fx, fy, a + R.sign() * R.range(0.45, 1), R.range(3, 9) * (1 - 0.5 * j / pts.length), { maxY, d0: fd, jit: 0.7, step: [1.5, 3] }));
        }
      out.push(c);
    }
    return out;
  }
  function drawCracks(p, cracks, g, heat, hot, dark, lip, k = 1) {
    if (k <= 0) return;
    const col = (d) => {
      const h = heat(d);
      return h > 0.75 ? hot[0] : h > 0.5 ? hot[1] : h > 0.3 ? hot[2] : h > 0.12 ? hot[3] : dark;
    };
    for (const c of cracks) {
      const G = g(c);
      if (G <= 0) continue;
      for (const path of [c.pts, ...c.kids]) {
        for (let i = 1; i < path.length; i++) {
          const [x0, y0, d0] = path[i - 1], [x1, y1, d1] = path[i];
          if (d0 >= G) break;
          const f = d1 > G ? (G - d0) / (d1 - d0) : 1, ex = x0 + (x1 - x0) * f, ey = y0 + (y1 - y0) * f;
          p.line(x0, y0 + 1, ex, ey + 1, lip, (u) => rand(Math.round(x0 + (ex - x0) * u), Math.round(y0 + (ey - y0) * u), 5) < 0.3 ? k * 0.8 : 0);
          p.line(x0, y0, ex, ey, (u) => col(d0 + (d1 - d0) * f * u), k);
          const h = heat(d0);
          if (h > 0.12) p.glow((x0 + ex) / 2, (y0 + ey) / 2, 4 + h * 4, hot[2], 0.22 * h * k);
        }
      }
    }
  }
  function frontCrescent(p, x, dir, h, w, cols, k = 1) {
    if (h < 1 || w < 0.3 || k <= 0) return;
    const ry = h * 0.8, cy = -h * 0.2, rx = Math.max(2, h * 0.55);
    const x0 = dir > 0 ? x - rx - w - 1 : x - 1, x1 = dir > 0 ? x + 1 : x + rx + w + 1;
    p.shade(x0, -h - 1, x1, 0, (px, py, out) => {
      if (py > 0) return;
      const ey = (py - cy) / ry;
      if (ey <= -1 || ey >= 1) return;
      const e2 = 1 - ey * ey, edge = rx * Math.sqrt(e2) - rx, wt = w * Math.pow(e2, 0.45), q = (edge - (px - x) * dir) / Math.max(0.5, wt);
      if (q < 0 || q > 1) return;
      out.c = q < 0.28 ? cols[0] : q < 0.62 ? cols[1] : cols[2];
      out.a = k * (ey < -0.8 ? 0.7 : 1) * (q > 0.7 ? 1.25 - q * 0.8 : 1);
    });
  }
  function dustRing(p, cx, cy, r, w, k, c, { sy = 1, ph = 0, brk = 0, lit = 0.35, maxY = Infinity, half = 0 } = {}) {
    if (k <= 0.01 || r <= 0) return;
    const W = w * 1.6, lite = mix(c, WHITE, lit);
    for (let y = Math.floor(cy - (r + W) * sy) - 1; y <= Math.min(maxY - 1, Math.ceil(cy + (r + W) * sy) + 1); y++)
      for (let x = Math.floor(cx - r - W) - 1; x <= Math.ceil(cx + r + W) + 1; x++) {
        const dx = x + 0.5 - cx, dy = (y + 0.5 - cy) / sy, d = Math.hypot(dx, dy), g = Math.atan2(dy, dx);
        if (half < 0 && dy >= 0 || half > 0 && dy < 0) continue;
        const lumpy = 0.6 + 0.3 * Math.sin(5 * g + ph) + 0.18 * Math.sin(11 * g + ph * 2.1) + 0.12 * Math.sin(17 * g + ph * 0.7);
        const wt = w * lumpy, off = Math.abs(d - r - w * 0.25 * Math.sin(7 * g + ph));
        if (off >= wt) continue;
        const tear = brk > 0 ? clamp((0.55 + 0.45 * Math.sin(6 * g + ph * 1.7) - brk) / 0.25) : 1;
        const a = k * (1 - Math.pow(off / wt, 2)) * tear;
        if (a > 0.01) p.blend(x, y, dy < 0 && d > r - wt * 0.3 ? lite : c, a);
      }
  }
  var rockShape = (R, n = 6) => Array.from({ length: n }, () => R.range(0.7, 1.12));
  function rock(p, b, st) {
    const r = 0.75 + b.s * 0.8, n = b.pts.length, fade = Math.min(1, b.life / 0.5), ca = Math.cos(b.a), sa = Math.sin(b.a);
    p.shade(b.x - r - 2, b.y - r - 2, b.x + r + 2, b.y + r + 2, (x, y, out) => {
      const dx = x - b.x, dy = y - b.y, u = dx * ca + dy * sa, v = -dx * sa + dy * ca, d = Math.hypot(u, v);
      let ang = Math.atan2(v, u);
      if (ang < 0) ang += TAU;
      const f = ang / TAU * n, i = Math.floor(f) % n, w = f - Math.floor(f), edge = r * (b.pts[i] * (1 - w) + b.pts[(i + 1) % n] * w);
      if (d > edge + 0.85) return;
      out.a = fade;
      if (d > edge) return OUTLINE;
      const lit = Math.cos((i + 0.5) / n * TAU + b.a - LIGHT2);
      if (d < edge * 0.42) return lit > 0.55 ? st.light : st.body;
      return lit > 0.35 ? st.light : lit < -0.4 ? st.shade : st.body;
    });
  }

  // public/vendor/pixelfx/src/fx/impacts/blunt-hit.js
  var meta2 = {
    name: "Blunt hit",
    desc: "A heavy, soft thud: a white-hot lumpy blob cools to cream in a warm pool of light, inked wedges jab out and snap back, a squashed ring of dust puffs swells and drifts, clods drop.",
    tags: ["impact", "hit", "blunt", "punch", "club", "thump", "dust", "comic", "one-shot"],
    size: [128, 88],
    origin: [64, 72],
    duration: 0.9,
    loop: false,
    fps: 30,
    bg: "ground",
    options: { palette: ["#1d1620", "#4a3a3c", "#7d6a66", "#b09c90", "#dccab4", "#f6ead2", "#ffffff"], warm: "#ffc98a", dust: "#b7a8a6", clod: "#6e5a5a", height: 22, seed: 9 }
  };
  var lump = (r, a, ph) => r * (1 + 0.15 * Math.sin(5 * a + ph) + 0.08 * Math.sin(9 * a + ph * 2.3));
  function create2(o) {
    const C = fit(o.palette, 7), R = new Rng(o.seed), X = 0, Y = -o.height, PH = R.range(0, TAU), floor = () => 0;
    const WARM = hex(o.warm), DUST2 = hex(o.dust), st = stone(o.clod);
    const lights = new Lights(), bits = new Bits({ ground: floor });
    lights.add(X, Y, 48, WARM, 0.6, 0.4);
    lights.add(X, Y, 16, WHITE, 0.6, 0.07);
    lights.add(X, -2, 36, WARM, 0.25, 0.4);
    const wedges = Array.from({ length: 9 }, (_, i) => ({ a: i / 9 * TAU + R.range(-0.2, 0.2), len: R.range(6, 15), w: R.range(3.2, 5), r0: R.range(13, 16), t0: R.range(0.015, 0.04), out: R.range(0.04, 0.06), back: R.range(0.09, 0.14) }));
    const puffs = Array.from({ length: 30 }, (_, i) => {
      const a = i / 30 * TAU + R.range(-0.12, 0.12), side = Math.abs(Math.cos(a)), v = R.range(40, 140) * (0.6 + 0.5 * side);
      return { x: X + Math.cos(a) * 9, y: Y + Math.sin(a) * 6, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.5, r: R.range(2.4, 6.2) * (0.75 + 0.35 * side), life: R.range(0.35, 0.85), max: 0, t0: R.range(0.03, 0.1), lift: R.range(4, 16) };
    });
    for (let i = 0; i < 5; i++)
      puffs.push({ x: X + R.range(-6, 6), y: Y - R.range(3, 6), vx: R.range(-30, 30), vy: -R.range(20, 45), r: R.range(3.5, 5.5), life: R.range(0.6, 0.85), max: 0, t0: R.range(0.05, 0.1), lift: R.range(14, 24) });
    for (const q of puffs) q.max = q.life;
    for (let i = 0; i < 5; i++) {
      const s = R.sign(), a = -Math.PI / 2 + s * R.range(0.5, 1.3), v = R.range(70, 140);
      bits.add({ kind: B.CHUNK, x: X + s * R.range(4, 8), y: Y + R.range(-3, 3), vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 1, drag: 0.6, bounce: 0.28, life: R.range(0.65, 0.85), a: R.range(0, TAU), va: s * R.range(8, 16), s: R.chance(0.4) ? 2 : 1, pts: rockShape(R), pvy: 0 });
    }
    const kicks = [];
    let t = 0;
    return {
      update(dt) {
        t += dt;
        for (const q of puffs) {
          if (t < q.t0) continue;
          q.life -= dt;
          q.vx -= q.vx * 4.5 * dt;
          q.vy -= q.vy * 4.5 * dt + (q.lift ?? 6) * dt;
          q.x += q.vx * dt;
          q.y += q.vy * dt;
        }
        for (const b of bits.list) b.pvy = b.vy;
        bits.update(dt);
        for (const b of bits.list)
          if (b.pvy > 60 && b.vy <= 0) {
            for (let i = 0; i < 2; i++) kicks.push({ x: b.x, y: -1, vx: R.sign() * R.range(8, 22), vy: -R.range(3, 10), r: R.range(1.2, 2), life: 0.4, max: 0.4, t0: 0 });
            b.pvy = 0;
          }
        for (const q of kicks) {
          q.life -= dt;
          q.vx -= q.vx * 4 * dt;
          q.vy -= q.vy * 4 * dt;
          q.x += q.vx * dt;
          q.y += q.vy * dt;
        }
        lights.update(dt);
      },
      draw(p) {
        for (const q of [...puffs, ...kicks]) {
          const k = q.life / q.max;
          if (t < q.t0 || k <= 0) continue;
          const r = q.r * (0.7 + (1 - k) * 0.85), a = Math.pow(k, 1.25) * Math.min(1, (t - q.t0) / 0.03), c = mix(DUST2, WARM, clamp(1 - (t - 0.03) / 0.25) * 0.55);
          p.disc(q.x, q.y, r, c, (d) => 0.58 * a * (1 - d * d * 0.75));
          p.disc(q.x - r * 0.22, q.y - r * 0.32, r * 0.58, mix(c, WHITE, 0.55), (d) => 0.48 * a * (1 - d * d));
        }
        for (const b of bits.list) rock(p, b, st);
        if (t < 0.058) {
          const f = t < 0.025 ? 0 : 1, R02 = f ? 13.5 : 11.5;
          p.shade(X - R02 * 1.4, Y - R02 * 1.4, X + R02 * 1.4, Y + R02 * 1.4, (x, y) => {
            const dx = x - X, dy = (y - Y) * (f ? 1.25 : 1.1), d = Math.hypot(dx, dy), ro = lump(R02, Math.atan2(dy, dx), PH + f * 0.6);
            if (d > ro) return;
            const q = d / ro;
            return f === 0 ? q < 0.55 ? WHITE : q < 0.86 ? C[5] : C[4] : q < 0.3 ? WHITE : q < 0.72 ? C[5] : q < 0.9 ? C[4] : C[3];
          });
        }
        for (const w of wedges) {
          const u = t - w.t0;
          if (u < 0 || u > w.out + w.back) continue;
          const s = u < w.out ? ease.outCubic(u / w.out) : 1 - ease.inQuad((u - w.out) / w.back), L = w.len * s;
          if (L < 1.5) continue;
          const ca = Math.cos(w.a), sa = Math.sin(w.a), r0 = w.r0 + 2 * s, hw = w.w * (0.6 + 0.4 * s) / 2;
          const tip = [X + ca * r0, Y + sa * r0], end = [X + ca * (r0 + L), Y + sa * (r0 + L)], n = [-sa * hw, ca * hw];
          const wedge = (g) => [[tip[0] - ca * g, tip[1] - sa * g], [end[0] + n[0] * (1 + g * 0.45) + ca * g, end[1] + n[1] * (1 + g * 0.45) + sa * g], [end[0] - n[0] * (1 + g * 0.45) + ca * g, end[1] - n[1] * (1 + g * 0.45) + sa * g]];
          p.poly(wedge(1), C[1]);
          p.poly(wedge(0), u < w.out + 0.02 ? WHITE : C[5]);
        }
        const pop = Math.exp(-t / 0.06);
        if (pop > 0.02) p.glow(X, Y, 28, WARM, 0.5 * pop);
        lights.draw(p);
      }
    };
  }

  // public/vendor/pixelfx/src/fx/impacts/crit-hit.js
  var crit_hit_exports = {};
  __export(crit_hit_exports, {
    create: () => create3,
    meta: () => meta3
  });
  var meta3 = {
    name: "Critical hit",
    desc: "A critical hit: a jagged starburst slams in white and overshoots, a ring breaks into flying arcs, sparks streak off, shards tumble to the floor under a big flare.",
    tags: ["impact", "hit", "crit", "critical", "combat", "directional", "one-shot"],
    size: [216, 136],
    origin: [84, 106],
    duration: 0.9,
    loop: false,
    fps: 30,
    bg: "ground",
    options: { palette: ["#2a0510", "#5c0a1c", "#a3142a", "#e0302c", "#ff7a2a", "#ffc23d", "#fff09a", "#ffffff"], height: 26, aim: 0.12, seed: 3 }
  };
  var KEYS = [
    [0, 1, 1, 1, [6, 7, 7, 7]],
    [0.025, 1.3, 1, 1, [2, 5, 6, 7]],
    [0.058, 1.05, 0.72, 1, [2, 4, 5, 6]],
    [0.092, 1.22, 0.3, 1, [1, 2, 3, 4]],
    [0.125]
  ];
  function flare2(p, x, y, L, k, C) {
    for (const [dx, dy, len2] of [[1, 0, L], [0, 1, L * 0.45], [0.7, 0.7, L * 0.16], [0.7, -0.7, L * 0.16]])
      for (const s of [-1, 1])
        for (let d = 1; d <= len2; d++) {
          const u = d / len2, a = u < 0.7 ? 1 : k * (1.6 - u);
          p.dot(x + s * dx * d, y + s * dy * d, u < 0.35 ? WHITE : u < 0.7 ? C[6] : C[5], a);
          if (dy === 0 && u < 0.42) for (const e of [-1, 1]) p.dot(x + s * d, y + e, u < 0.2 ? C[6] : C[5], u < 0.3 ? 1 : k);
        }
    p.glowLine(x - L, y, x + L, y, 6, C[6], 0.5 * k);
    p.glowLine(x, y - L * 0.45, x, y + L * 0.45, 4, C[6], 0.3 * k);
  }
  function create3(o) {
    const C = fit(o.palette, 8), R = new Rng(o.seed), X = 0, Y = -o.height, A = o.aim, floor = () => 0;
    const ps = new Particles({ rng: R, ground: floor, sparks: [C[7], C[6], C[5], C[3]] });
    const bits = new Bits({ ground: floor }), lights = new Lights();
    const sp = spikes(R, 14, A, { len: [11, 15], w: [1.8, 2.5], fwd: 1.4, back: 0.6, jag: 0.5 });
    [...sp].sort((a, b) => b.len - a.len).slice(0, 2).forEach((s) => s.len *= 1.3);
    const segs = Array.from({ length: 7 }, (_, i) => {
      const a = A + i / 7 * TAU;
      return { a, gap: R.range(0.55, 0.85), dr: R.range(0.08, 0.4) + 0.15 * Math.max(0, Math.cos(a - A)), w: 0.7 + 0.5 * Math.max(0, Math.cos(a - A)) };
    });
    lights.add(X, Y, 84, C[5], 0.6, 0.5);
    lights.add(X, Y, 30, WHITE, 0.7, 0.1);
    lights.add(X, -4, 44, C[4], 0.3, 0.45);
    for (let i = 0; i < 36; i++) {
      const back = R.chance(0.22), a = (back ? A + Math.PI : A) + R.range(-1, 1) * (back ? 0.6 : 0.8), v = R.range(170, 430) * (back ? 0.6 : 1);
      ps.spawn(P.SPARK, X, Y, Math.cos(a) * v, Math.sin(a) * v - 50, R.range(0.15, 0.5), WHITE, 1, R.chance(0.3) ? R.range(0, 0.04) : 0);
    }
    for (let i = 0; i < 10; i++) {
      const a = A + R.range(-1, 1) * 1.1 - 0.35, v = R.range(110, 280);
      bits.add({ kind: B.SHARD, x: X, y: Y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40, g: 0.8, drag: 0.7, bounce: 0.35, life: R.range(0.55, 0.85), a: R.range(0, TAU), va: R.range(-25, 25), s: R.range(2, 4.5), c: R.pick([C[7], C[6], C[6], C[5]]) });
    }
    for (let i = 0; i < 12; i++) {
      const a = A - Math.PI / 2 + R.range(-1.4, 1.4), v = R.range(35, 110);
      ps.spawn(P.MOTE, X + Math.cos(a) * 4, Y + Math.sin(a) * 4, Math.cos(a) * v, Math.sin(a) * v - 15, R.range(0.35, 0.7), R.pick([C[6], C[5], C[5]]), 0.6, R.range(0, 0.05));
    }
    for (let i = 0; i < 5; i++) {
      const a = R.range(0, TAU), d = R.range(14, 34);
      ps.spawn(P.STAR, X + Math.cos(a) * d, Y + Math.sin(a) * d * 0.8, 0, -4, R.range(0.22, 0.38), R.chance(0.5) ? C[6] : WHITE, R.range(1.6, 3), R.range(0.08, 0.32));
    }
    let t = 0;
    return {
      update(dt) {
        t += dt;
        ps.update(dt);
        bits.update(dt);
        lights.update(dt);
      },
      draw(p) {
        const u = clamp((t - 0.03) / 0.37);
        if (t >= 0.03 && u < 1) {
          const r = 10 + 30 * ease.outCubic(u), brk = smooth(0.12, 0.6, u), th = Math.max(1, 3.6 * Math.pow(1 - u, 1.2));
          const i = u < 0.12 ? 7 : u < 0.3 ? 6 : u < 0.5 ? 5 : u < 0.75 ? 4 : 3;
          brokenRing(p, X, Y, r, th, segs, brk, C[i], C[Math.max(2, i - 2)], u < 0.6 ? 1 : (1 - u) / 0.4, 1, 0);
          if (u < 0.6) p.glowRing(X, Y, r, 6, C[5], 0.35 * Math.pow(1 - u / 0.6, 2));
        }
        bits.draw(p);
        ps.draw(p);
        const f = (t - 0.04) / 0.28;
        if (f > 0 && f < 1) {
          flare2(p, X, Y, 64 * Math.pow(1 - f, 1.3), 1 - f, C);
          p.glow(X, Y, 56, C[5], 0.4 * (1 - f));
        }
        for (let i = 0; i < KEYS.length - 1; i++)
          if (t >= KEYS[i][0] && t < KEYS[i + 1][0]) {
            const [, sc, th, a, cols] = KEYS[i];
            star(p, X, Y, sp, sc, th, cols.map((j) => C[j]), a, 2.6);
          }
        const pop = Math.exp(-t / 0.05);
        if (pop > 0.02) {
          p.glow(X, Y, 44, C[5], 0.4 * pop);
          p.glow(X, Y, 12, WHITE, 0.6 * pop);
        }
        lights.draw(p);
      }
    };
  }

  // public/vendor/pixelfx/src/fx/impacts/hit-flash.js
  var hit_flash_exports = {};
  __export(hit_flash_exports, {
    act: () => act,
    create: () => create4,
    meta: () => meta4
  });
  var meta4 = {
    name: "Hit flash",
    desc: "The character takes damage: a white frame, then their own colors flushed red and blinking white, cooling off, while comic hit lines jab in at them.",
    tags: ["impact", "hit", "damage", "hurt", "flash", "blink", "actor", "comic", "one-shot"],
    size: [80, 64],
    origin: [40, 54],
    duration: 0.5,
    loop: false,
    fps: 30,
    bg: "ground",
    actor: 2,
    options: { palette: ["#14040a", "#3a0a14", "#6a101c", "#a01824", "#d42a30", "#ff5a50", "#ff9a8a"], lines: 7, side: 1, seed: 17 }
  };
  var BLOWN = { x: -5, crouch: 4, lean: -5, hx: -1, fx: 8, fy: -33, bx: -11, by: -27, ffx: 9, ffy: -7, fbx: -6 };
  var act = {
    onBody: true,
    poses: [
      [-0.26, { ...READY, x: 0 }],
      [0, BLOWN, "snap"],
      [0.16, { ...BLOWN, x: -8, crouch: 5 }],
      [0.42, { ...BLOWN, x: -8, crouch: 5, lean: -2, fx: 9, fy: -22, bx: 6, by: -20, ffy: -4 }],
      [0.86, { ...READY, x: 0 }]
    ],
    hits: [{ t: 0, stop: 0.07, shake: 0.14, amp: 2 }]
  };
  var BEATS = [[0.025, "white"], [0.058, "white2"], [0.125, "red"], [0.158, "rim"], [0.36, "cool"]];
  function create4(o) {
    const C = fit(o.palette, 7), R = new Rng(o.seed), A = o.actor, M2 = A.mask, PX = A.pixels, S = o.side;
    const [cx, cy] = A.chest, hx = cx + S * 12, hy = cy - 5;
    const lights = new Lights();
    lights.add(hx, hy, 34, WHITE, 0.6, 0.1);
    lights.add(cx, cy, 30, C[4], 0.5, 0.35);
    const reds = new Uint32Array(PX.length), tints = new Uint32Array(PX.length);
    for (let i = 0; i < PX.length; i++) {
      if (!PX[i]) continue;
      const l = luma(PX[i] | 4278190080);
      reds[i] = C[clamp(Math.round(2 + l * 5), 2, 6)];
      tints[i] = mix(PX[i] | 4278190080, C[4], 0.55);
    }
    const lines = Array.from({ length: o.lines }, (_, i) => {
      const a = -Math.PI - 0.3 + (i + R.range(0.25, 0.75)) / o.lines * (Math.PI + 0.6);
      return { a, d: R.range(15, 19), len: R.range(6, 9), t0: R.range(0, 0.04) };
    });
    let t = 0;
    const beat = () => {
      for (const [end, b] of BEATS) if (t < end) return b;
      return null;
    };
    const body = (p, color) => p.mask(M2, A.x, A.y, (mx, my) => color(my * M2.w + mx));
    return {
      update(dt) {
        t += dt;
        lights.update(dt);
      },
      draw(p) {
        const b = beat();
        if (b === "white" || b === "white2") {
          body(p, () => WHITE);
          p.outline(M2, A.x, A.y, b === "white" ? C[6] : C[5]);
        } else if (b === "red") {
          body(p, (i) => reds[i]);
          p.outline(M2, A.x, A.y, C[5]);
        } else if (b === "rim") p.outline(M2, A.x, A.y, WHITE);
        else if (b === "cool") {
          const k2 = 1 - (t - 0.158) / (0.36 - 0.158);
          body(p, (i) => mix(PX[i] | 4278190080, tints[i], k2));
          if (k2 > 0.5) p.outline(M2, A.x, A.y, C[4], (k2 - 0.5) * 2);
        }
        if (t < 0.07) {
          const big = t < 0.035 ? 1 : 1.3, k2 = t < 0.035 ? 0 : 1;
          for (let i = 0; i < 8; i++) {
            const a = i / 8 * TAU + 0.2, L = (i % 2 ? 4 : 9) * big;
            p.line(hx + Math.cos(a) * L * 0.45 * k2, hy + Math.sin(a) * L * 0.45 * k2, hx + Math.cos(a) * L, hy + Math.sin(a) * L, (u) => u < 0.45 && !k2 ? WHITE : u < 0.75 ? C[6] : C[4]);
          }
          if (!k2) for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) p.px(hx + dx, hy + dy, WHITE);
          p.glow(hx, hy, 14, C[6], 0.5 * (1 - t / 0.07));
        }
        for (const l of lines) {
          const u = (t - l.t0) / 0.16;
          if (u < 0 || u >= 1) continue;
          const d0 = l.d - 6 * ease.outCubic(u), L = l.len * (1 - u), ca = Math.cos(l.a), sa = Math.sin(l.a) * 1.15;
          if (L < 1) continue;
          const w = (2.8 - 1.6 * u) / 2, nx = -sa * w, ny = ca * w, ex = cx + ca * (d0 + L), ey = cy + sa * (d0 + L), px0 = cx + ca * d0, py0 = cy + sa * d0;
          p.poly([[px0 - ca, py0 - sa], [ex + nx * 1.5 + ca, ey + ny * 1.5 + sa], [ex - nx * 1.5 + ca, ey - ny * 1.5 + sa]], C[3]);
          p.poly([[px0, py0], [ex + nx, ey + ny], [ex - nx, ey - ny]], u < 0.5 ? WHITE : C[6]);
        }
        const k = Math.exp(-t / 0.08);
        if (k > 0.02) p.glow(cx, cy, 26, b === "white" || b === "white2" ? WHITE : C[5], 0.35 * k);
        lights.draw(p);
      }
    };
  }

  // public/vendor/pixelfx/src/fx/impacts/impact-frame.js
  var impact_frame_exports = {};
  __export(impact_frame_exports, {
    create: () => create5,
    meta: () => meta5
  });
  var meta5 = {
    name: "Impact frame",
    desc: "An anime impact: two frames of white with black burst lines rushing at the hit, two frames inverted, then the lines pull out past the edges and vanish.",
    tags: ["impact", "hit", "anime", "manga", "flash", "speed-lines", "screen", "one-shot"],
    size: [320, 180],
    origin: [160, 90],
    duration: 0.3,
    loop: false,
    fps: 30,
    bg: "black",
    options: { palette: ["#000000", "#ffffff"], lines: 64, seed: 19 }
  };
  var FRAME = 1 / 30;
  function burst(R, n) {
    return Array.from({ length: n }, (_, i) => {
      const thick = R.chance(0.18);
      return { a: (i + R.range(0.1, 0.9)) / n * TAU, inner: thick ? R.range(30, 48) : R.range(18, 70), w: thick ? R.range(5, 8) : R.range(1.2, 3.6) };
    });
  }
  var spikes2 = (a, ph) => 10 + 6 * Math.abs(Math.sin(a * 5 + ph)) + 4 * Math.abs(Math.sin(a * 11 + ph * 2.7)) + 2 * Math.sin(a * 23 + ph);
  function create5(o) {
    const C = fit(o.palette, 3), R = new Rng(o.seed), INK3 = C[0], PAPER = C[2];
    const [W, H] = meta5.size, [OX2, OY2] = meta5.origin, x0 = -OX2, y0 = -OY2;
    const sets = [burst(R, o.lines), burst(R, o.lines)], jit = [[Math.round(R.range(-2, 2)), Math.round(R.range(-1, 1))], [Math.round(R.range(-2, 2)), Math.round(R.range(-1, 1))]];
    const ph = [R.range(0, TAU), R.range(0, TAU), R.range(0, TAU), R.range(0, TAU)];
    const masks = [];
    for (let f = 0; f < 8; f++) {
      const m = new Uint8Array(W * H), set = sets[f % 2], n = set.length, [jx, jy] = f < 4 ? jit[f % 2] : [0, 0];
      const reach = f < 4 ? 0 : Math.pow((f - 3) / 4.5, 1.5), thin = f < 4 ? 1 : 1 - (f - 3) / 5.5;
      for (let j = 0; j < H; j++)
        for (let i = 0; i < W; i++) {
          const X = x0 + i + 0.5 - jx, Y = y0 + j + 0.5 - jy, rho = Math.hypot(X, Y * 1.35), ang = Math.atan2(Y * 1.35, X);
          const slot = Math.floor((ang % TAU + TAU) % TAU / (TAU / n));
          let line = false;
          for (let k = -1; k <= 1 && !line; k++) {
            const l = set[(slot + k + n) % n];
            let d = ((ang - l.a) % TAU + TAU) % TAU;
            if (d > Math.PI) d = TAU - d;
            const inner = l.inner + reach * 150, hw = l.w * clamp((rho - inner) / 40) * thin;
            line = rho > inner && d * rho < Math.max(0.5, hw);
          }
          if (f < 4) {
            const r2 = Math.hypot(X, Y * 1.1), core = spikes2(Math.atan2(Y * 1.1, X), ph[f]) * (f === 0 ? 0.85 : 1 + f * 0.08);
            m[j * W + i] = r2 < core ? r2 < 4 + f ? 2 : 1 : line ? 1 : 2;
          } else m[j * W + i] = line ? 2 : 0;
        }
      masks.push(m);
    }
    let t = 0;
    return {
      update(dt) {
        t += dt;
      },
      draw(p) {
        const f = Math.floor(t / FRAME + 1e-6);
        if (f >= 8) return;
        const m = masks[f], inv = f === 2 || f === 3, ink = inv ? PAPER : INK3, paper = inv ? INK3 : PAPER;
        p.shade(x0, y0, x0 + W, y0 + H, (x, y) => {
          const i = Math.floor(x - x0), j = Math.floor(y - y0);
          if (i < 0 || j < 0 || i >= W || j >= H) return;
          const v = m[j * W + i];
          return v === 1 ? ink : v === 2 ? f < 4 ? paper : PAPER : 0;
        });
      }
    };
  }

  // public/vendor/pixelfx/src/fx/impacts/parry.js
  var parry_exports = {};
  __export(parry_exports, {
    create: () => create6,
    meta: () => meta6
  });
  var meta6 = {
    name: "Parry",
    desc: "Two blades clash: their edges flash in an X, a white four-point star rings out, a ring breaks into arcs and a fan of gold sparks sprays up and rains down.",
    tags: ["impact", "parry", "block", "clash", "sword", "metal", "sparks", "one-shot"],
    size: [200, 112],
    origin: [100, 96],
    duration: 1,
    loop: false,
    fps: 30,
    bg: "ground",
    options: { palette: ["#2a1a08", "#6a4410", "#b07a1a", "#e8b030", "#ffe066", "#fff6c4", "#ffffff"], height: 30, seed: 11 }
  };
  function create6(o) {
    const C = fit(o.palette, 7), R = new Rng(o.seed), X = 0, Y = -o.height, floor = () => 0;
    const ps = new Particles({ rng: R, ground: floor, sparks: [C[4], C[4], C[3], C[2]] });
    const lights = new Lights();
    const sp = [];
    for (let i = 0; i < 8; i++) sp.push({ a: i * Math.PI / 4 + R.range(-0.04, 0.04), len: i % 2 ? R.range(6, 8) : i % 4 === 0 ? R.range(19, 22) : R.range(14, 17), w: i % 2 ? 1.2 : 2.2 });
    const segs = Array.from({ length: 6 }, (_, i) => ({ a: i / 6 * TAU + R.range(-0.1, 0.1), gap: R.range(0.55, 0.8), dr: R.range(0.1, 0.35) }));
    const edges = [-0.62 + R.range(-0.08, 0.08), Math.PI + 0.62 + R.range(-0.08, 0.08)];
    lights.add(X, Y, 60, C[4], 0.65, 0.4);
    lights.add(X, Y, 22, WHITE, 0.8, 0.08);
    for (let i = 0; i < 24; i++) {
      const s = i % 2 ? 1 : -1, a = -Math.PI / 2 + s * R.range(0.3, 1.3), v = R.range(130, 290);
      ps.spawn(P.SPARK, X + s * R.range(1, 3), Y, Math.cos(a) * v, Math.sin(a) * v, R.range(0.45, 0.85), WHITE, 1, i > 17 ? R.range(0.02, 0.07) : 0);
    }
    for (let i = 0; i < 8; i++) {
      const a = R.range(0, TAU), v = R.range(40, 110);
      ps.spawn(P.MOTE, X, Y, Math.cos(a) * v, Math.sin(a) * v - 20, R.range(0.3, 0.55), R.pick([C[5], C[6]]), 0.6, R.range(0, 0.04));
    }
    for (let i = 0; i < 3; i++) {
      const a = R.range(0, TAU), d = R.range(12, 26);
      ps.spawn(P.STAR, X + Math.cos(a) * d, Y + Math.sin(a) * d, 0, -3, R.range(0.22, 0.34), WHITE, R.range(1.6, 2.6), R.range(0.1, 0.3));
    }
    let t = 0;
    return {
      update(dt) {
        t += dt;
        ps.update(dt);
        lights.update(dt);
      },
      draw(p) {
        const u = (t - 0.03) / 0.36;
        if (u >= 0 && u < 1) {
          const r = 8 + 24 * ease.outCubic(u), brk = smooth(0.15, 0.6, u), i = u < 0.15 ? 6 : u < 0.35 ? 5 : u < 0.6 ? 4 : 3;
          brokenRing(p, X, Y, r, Math.max(1, 2.6 * Math.pow(1 - u, 1.2)), segs, brk, C[i], C[Math.max(2, i - 2)], u < 0.6 ? 1 : (1 - u) / 0.4, 1, 0);
          if (u < 0.5) p.glowRing(X, Y, r, 5, C[4], 0.3 * (1 - u / 0.5));
        }
        ps.draw(p);
        if (t < 0.058)
          for (const a of edges) {
            const ca = Math.cos(a), sa = Math.sin(a), L = t < 0.025 ? 26 : 32, k = t < 0.025 ? 1 : 0.6;
            for (let d = -L; d <= L; d += 0.5) {
              const q = Math.abs(d) / L;
              p.dot(X + ca * d, Y + sa * d, q < 0.4 ? WHITE : q < 0.75 ? C[5] : C[4], q < 0.6 ? 1 : k * (1.3 - q));
            }
            p.glowLine(X - ca * L, Y - sa * L, X + ca * L, Y + sa * L, 4, C[5], 0.35 * k);
          }
        if (t < 0.025) star(p, X, Y, sp, 1, 1, [C[4], WHITE, WHITE, WHITE], 1, 2.6);
        else if (t < 0.058) star(p, X, Y, sp, 1.25, 0.65, [C[2], C[5], C[6], WHITE], 1, 2.6);
        else if (t < 0.092) star(p, X, Y, sp, 1.4, 0.3, [C[2], C[4], C[5], C[6]], 1, 2);
        const pop = Math.exp(-t / 0.05);
        if (pop > 0.02) {
          p.glow(X, Y, 30, C[4], 0.5 * pop);
          p.glow(X, Y, 10, WHITE, 0.4 * pop);
        }
        lights.draw(p);
      }
    };
  }

  // public/vendor/pixelfx/src/fx/impacts/ground-slam.js
  var ground_slam_exports = {};
  __export(ground_slam_exports, {
    create: () => create7,
    meta: () => meta7
  });
  var meta7 = {
    name: "Ground slam",
    desc: "Something lands hard: the floor flashes and cracks, two crescent shock waves race out along it, a dust wave and a tall dust cloud rise, rocks erupt, bounce and settle.",
    tags: ["impact", "ground", "slam", "shockwave", "quake", "rocks", "dust", "one-shot"],
    size: [288, 208],
    origin: [144, 164],
    duration: 3.2,
    loop: false,
    fps: 30,
    bg: "ground",
    options: { palette: ["#2a1712", "#5e2c1c", "#a4502a", "#e8893a", "#ffc764", "#fff0b4", "#ffffff"], stone: "#4a3f69", reach: 104, seed: 5 }
  };
  var WAVE = 0.6;
  function crater(p, st, hot, C, k) {
    for (let x = -12; x <= 11; x++) {
      const q = Math.abs(x + 0.5) / 12, dep = Math.round(2.6 * (1 - q * q));
      if (q < 0.84) {
        for (let y = 0; y < dep; y++) p.dot(x, y, SOOT, k);
        p.dot(x, dep, hot > 0.5 ? C[5] : hot > 0.2 ? C[4] : st.lip, k);
      } else {
        p.dot(x, -1, q > 0.93 ? st.light : st.lip, k);
        if (q < 0.9) p.dot(x, -2, st.light, k * 0.8);
      }
    }
  }
  function create7(o) {
    const C = fit(o.palette, 7), st = stone(o.stone), REACH = o.reach, R = new Rng(o.seed), floor = () => 0, D = meta7.duration;
    const ps = new Particles({ rng: R, ground: floor, sparks: [C[6], C[5], C[4], C[3]] });
    const bits = new Bits({ ground: floor }), lights = new Lights(), HOT2 = [WHITE, C[5], C[4], C[3]];
    const dustLit = mix(st.dust, WHITE, 0.2), cracks = makeCracks(R, 10, { len: [22, 58], dive: 0.55, maxY: 22, forks: 0.7, x0: [2, 9] });
    const front = (t2) => 7 + (REACH - 7) * ease.outCubic(clamp((t2 - 0.015) / WAVE));
    const heat = (t2) => Math.pow(clamp(1 - t2 / 0.8), 1.4);
    const crest = (u) => [6 + 28 * Math.pow(1 - u, 0.75), 1.5 + 5 * Math.pow(1 - u, 0.9)];
    const burst2 = [
      { a: -0.07, len: R.range(34, 40), w: 1.9 },
      { a: Math.PI + 0.07, len: R.range(34, 40), w: 1.9 },
      { a: -0.42 + R.range(-0.08, 0.08), len: R.range(15, 20), w: 1.5 },
      { a: -Math.PI + 0.42 + R.range(-0.08, 0.08), len: R.range(15, 20), w: 1.5 },
      { a: -Math.PI / 2 + R.range(-0.15, 0.15), len: R.range(18, 24), w: 1.7 },
      { a: -1.05 + R.range(-0.1, 0.1), len: R.range(10, 14), w: 1.2 },
      { a: -Math.PI + 1.05 + R.range(-0.1, 0.1), len: R.range(10, 14), w: 1.2 }
    ];
    const embers = [];
    for (const c of cracks)
      for (const [x, y, d] of c.pts) if (d > 3 && d < 32 && R.chance(0.25)) embers.push({ x, y, d, life: R.range(0.8, 2.2), ph: R.range(0, TAU) });
    lights.add(0, -12, 96, C[4], 0.6, 0.6);
    lights.add(0, -4, 50, WHITE, 0.9, 0.14);
    for (let i = 0; i < 56; i++) {
      const low = i < 14, s = R.sign(), a = low ? s > 0 ? -R.range(0.04, 0.6) : Math.PI + R.range(0.04, 0.6) : -Math.PI / 2 + R.range(-1.15, 1.15);
      const sp = low ? R.range(150, 380) : R.range(200, 500);
      ps.spawn(P.SPARK, R.range(-4, 4), -1, Math.cos(a) * sp, Math.sin(a) * sp, low ? R.range(0.2, 0.5) : R.range(0.25, 0.65), WHITE, 1, low ? 0 : R.range(0, 0.05));
    }
    for (let i = 0; i < 20; i++) {
      const s = i < 3 ? 4 : R.int(1, 3), a = -Math.PI / 2 + R.range(-0.5, 0.5), sp = s > 3 ? R.range(110, 190) : R.range(170, 380) * (s > 2 ? 0.8 : 1);
      bits.add({ kind: B.CHUNK, x: R.range(-7, 7), y: -2, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 1, drag: 0.4, bounce: 0.38, life: R.range(1.9, 2.7), a: R.range(0, TAU), va: R.range(-14, 14), s, pts: rockShape(R), pvy: 0 });
    }
    for (let i = 0; i < 110; i++) {
      const u = R.range(-1, 1), a = -Math.PI / 2 + u * 0.65, sp = R.range(110, 380) * (1 - 0.35 * Math.abs(u));
      ps.spawn(P.GRIT, u * 6, -1, Math.cos(a) * sp, Math.sin(a) * sp, R.range(1, 2.2), R.pick([st.light, st.body, st.body, st.shade, st.shade, st.lip]), R.chance(0.35) ? 2 : 1);
    }
    for (let i = 0; i < 28; i++) {
      const core = i < 14, s = R.sign();
      ps.spawn(P.SMOKE, core ? R.range(-5, 5) : s * R.range(4, 12), -R.range(2, 10), core ? R.range(-12, 12) : s * R.range(14, 38), -R.range(50, 130) * (core ? 1 : R.range(0.3, 0.6)), R.range(1.9, 2.7), R.chance(0.35) ? dustLit : st.dust, core ? R.range(4.5, 9) : R.range(4, 7.5), R.range(0.02, 0.22), PF.BIG);
    }
    for (let i = 0; i < 10; i++) {
      const s = R.sign();
      ps.spawn(P.SMOKE, s * R.range(2, 14), -R.range(2, 6), s * R.range(20, 70), -R.range(4, 20), R.range(1.4, 2.3), st.dust, R.range(6, 9), R.range(0, 0.08), PF.BIG);
    }
    for (let i = 0; i < 26; i++)
      ps.spawn(P.FLAKE, R.range(-22, 22), -R.range(14, 80), R.range(-12, 12), R.range(-10, 4), R.range(1.2, 2), R.chance(0.5) ? st.lip : dustLit, R.range(0.5, 1.2), R.range(0.25, 1));
    let t = 0;
    const acc = [R.next(), R.next()];
    const ring = (p, back) => {
      const u = clamp((t - 0.015) / (WAVE + 0.1));
      if (t < 0.015 || u >= 0.9) return;
      band(
        p,
        0,
        0.5,
        front(t) + 1,
        0.16,
        Math.max(1, 4 * Math.pow(1 - u, 0.8)),
        u < 0.55 ? 1.1 : (0.9 - u) / 0.35,
        u < 0.35 ? [C[3], C[4], C[5], C[6]] : [st.body, st.light, C[4], C[5]],
        (g) => Math.sin(g) < 0 === back,
        t < 0.09
      );
    };
    const fronts = (p) => {
      const u = clamp((t - 0.03) / (WAVE + 0.16));
      if (t < 0.03 || u >= 1) return;
      const fr = front(t), [h, w] = crest(u), k = u < 0.7 ? 1 : (1 - u) / 0.3;
      const cols = u < 0.14 ? [WHITE, C[6], C[5]] : u < 0.34 ? [C[6], C[5], C[4]] : u < 0.55 ? [C[5], C[4], st.lip] : [st.lip, st.light, st.dust];
      for (const s of [-1, 1]) {
        frontCrescent(p, s * fr, s, h, w, cols, k);
        p.glow(s * fr, -h * 0.3, 8 + h * 0.7, C[4], 0.5 * (1 - u) * k);
      }
    };
    return {
      update(dt) {
        t += dt;
        const u = clamp((t - 0.015) / WAVE);
        if (u > 0 && u < 1) {
          const fr = front(t), [h] = crest(u);
          for (let k = 0; k < 2; k++) {
            const s = k ? 1 : -1;
            for (acc[k] += dt * 120 * (1 - u * 0.7); acc[k] > 1; acc[k]--) {
              ps.spawn(P.SMOKE, s * (fr - R.range(1, 7)), -R.range(0.5, 3), s * R.range(15, 70) * (1 - u), -R.range(2, 12), R.range(1, 2.1), R.chance(0.3) ? dustLit : st.dust, R.range(2.5, 6.5) * (1 - 0.4 * u), 0, PF.BIG);
              if (R.chance(0.5)) ps.spawn(P.DUST, s * (fr - R.range(0, 3)), -R.range(0.3, 0.9) * h, s * R.range(-15, 25), -R.range(8, 35), R.range(0.3, 0.6), R.chance(0.5) ? dustLit : st.dust, R.range(1.2, 2.4));
              if (R.chance(0.4)) ps.spawn(P.GRIT, s * fr, -1, s * R.range(10, 60), -R.range(40, 140) * (1 - u), R.range(0.5, 1), R.pick([st.light, st.body, st.lip]), 1);
              if (u < 0.45 && R.chance(0.2)) ps.spawn(P.SPARK, s * fr, -1, s * R.range(60, 200), -R.range(30, 160), R.range(0.12, 0.3));
            }
          }
        }
        for (const b of bits.list) b.pvy = b.vy;
        bits.update(dt);
        for (const b of bits.list)
          if (b.pvy > 70 && b.vy <= 0) {
            const n = b.pvy > 200 ? 3 : 2;
            for (let i = 0; i < n; i++) ps.spawn(P.DUST, b.x + R.range(-1.5, 1.5), -0.5, R.sign() * R.range(8, 35), -R.range(2, 16), R.range(0.3, 0.65), st.dust, R.range(1.3, 2.4) * (0.7 + b.s * 0.25));
            b.pvy = 0;
          }
        ps.update(dt);
        lights.update(dt);
      },
      drawBack(p) {
        const fade = 1 - smooth(D - 0.9, D - 0.15, t), H = heat(t);
        if (t > 0.02) crater(p, st, H, C, fade);
        drawCracks(p, cracks, (c) => c.len * ease.outCubic(clamp((t - c.t0) / 0.1)), (d) => H * clamp(1.2 - d / 40), HOT2, SOOT, st.light, fade);
        for (const e of embers) {
          const k = 1 - (t - 0.1) / e.life;
          if (t < 0.1 || k <= 0) continue;
          const f = 0.6 + 0.4 * Math.sin(t * 23 + e.ph);
          p.px(e.x, e.y, k * f > 0.55 ? C[5] : k * f > 0.25 ? C[4] : C[3]);
          p.glow(e.x, e.y, 4, C[4], 0.35 * k * f);
        }
        ring(p, true);
        ps.draw(p, "back");
      },
      draw(p) {
        ring(p, false);
        fronts(p);
        for (const b of bits.list) rock(p, b, st);
        ps.draw(p, "front");
        if (t < 0.035) {
          p.ellipse(0, 0, 30, 4.5, (d) => d > 0.8 ? C[4] : d > 0.5 ? C[6] : WHITE);
          star(p, 0, -1, burst2, 1, 1, [C[4], C[6], WHITE, WHITE]);
        } else if (t < 0.07) star(p, 0, -1, burst2, 1.25, 0.5, [C[3], C[5], C[6], WHITE]);
        if (t < 0.14) p.glowLine(-80, 0, 80, 0, 10, C[5], 0.55 * (1 - t / 0.14));
        const H = heat(t);
        if (H > 0) p.glow(0, 1, 46, C[4], 0.35 * H);
        lights.draw(p);
      }
    };
  }

  // public/vendor/pixelfx/src/fx/impacts/heavy-landing.js
  var heavy_landing_exports = {};
  __export(heavy_landing_exports, {
    act: () => act2,
    create: () => create8,
    meta: () => meta8
  });
  var meta8 = {
    name: "Heavy landing",
    desc: "A character lands hard: the floor dents and cracks under their feet, two rings of dust roll out along the floor one after the other, and pebbles hop away.",
    tags: ["impact", "landing", "ground", "stomp", "dust", "rocks", "actor", "one-shot"],
    size: [176, 80],
    origin: [88, 60],
    duration: 1.6,
    loop: false,
    fps: 30,
    bg: "ground",
    actor: 2,
    options: { palette: ["#1c1a24", "#2f2a3a", "#4a4258", "#6b6280", "#9088a4", "#bdb6cc", "#e6e1ee"], stone: "#4a3f69", seed: 14 }
  };
  var FALL = { turn: 0.8, y: -46, crouch: -1, lean: -1, fx: -9, fy: -42, bx: 10, by: -42, ffx: 6, ffy: -8, fbx: -3, fby: -3, toeB: true, ghost: 1 };
  var HERO_ = { y: 0, crouch: 8, lean: 5, fx: 13, fy: -8, bx: -6, by: -23, ffx: 11, fbx: -10 };
  var act2 = {
    poses: [
      [-0.26, FALL],
      [-0.01, { ...FALL, y: -6 }, "in"],
      [0, HERO_, "snap"],
      [0.55, { ...HERO_, crouch: 7 }],
      [0.95, { ...HERO_, crouch: 5, lean: 3, fx: 13, fy: -15, bx: -5, by: -20 }],
      [1.3, READY],
      [1.6, READY]
    ],
    hits: [{ t: 5e-3, stop: 0.13, shake: 0.32, amp: 3 }]
  };
  function dent(p, st, k) {
    for (let x = -10; x <= 9; x++) {
      const q = Math.abs(x + 0.5) / 10, dep = Math.round(1.8 * (1 - q * q));
      if (q < 0.82) {
        for (let y = 0; y < dep; y++) p.dot(x, y, SOOT, k);
        p.dot(x, dep, st.lip, k);
      } else p.dot(x, -1, q > 0.92 ? st.light : st.lip, k);
    }
  }
  function create8(o) {
    const C = fit(o.palette, 7), st = stone(o.stone), R = new Rng(o.seed), floor = () => 0, D = meta8.duration;
    const back = new Particles({ rng: R, ground: floor }), front = new Particles({ rng: R, ground: floor });
    const bits = new Bits({ ground: floor }), cracks = makeCracks(R, 6, { len: [8, 20], dive: 0.7, maxY: 12, forks: 0.4, x0: [2, 6] });
    const DUST2 = mix(st.dust, C[5], 0.4), LIT = mix(DUST2, WHITE, 0.3), PH = R.range(0, TAU);
    const ring = (n, v0, v1, size, delay) => {
      for (let i = 0; i < n; i++) {
        const g = i / n * TAU + R.range(-0.1, 0.1), v = R.range(v0, v1), far = Math.sin(g) < 0;
        (far ? back : front).spawn(P.DUST, Math.cos(g) * 4, Math.sin(g) * 0.7 - 1, Math.cos(g) * v, Math.sin(g) * v * 0.16 - R.range(2, 10), R.range(0.45, 0.8), R.chance(0.45) ? LIT : DUST2, R.range(size[0], size[1]), delay + R.range(0, 0.03));
      }
    };
    ring(20, 140, 190, [2.2, 3.4], 0.01);
    ring(18, 70, 110, [3.4, 5.4], 0.12);
    for (let i = 0; i < 12; i++) {
      const s = R.sign(), up = i < 6;
      (i % 2 ? front : back).spawn(P.DUST, s * R.range(2, 10), -R.range(1, 4), s * R.range(10, 35) * (up ? 0.6 : 1), -(up ? R.range(25, 60) : R.range(4, 12)), R.range(0.55, 0.9), R.chance(0.5) ? LIT : DUST2, R.range(3, 5), R.range(0.02, 0.1));
    }
    for (let i = 0; i < 12; i++) {
      const s = R.sign(), v = R.range(50, 130);
      bits.add({ kind: B.CHUNK, x: s * R.range(3, 8), y: -1, vx: s * v, vy: -R.range(140, 230), g: 1, drag: 0.5, bounce: 0.55, life: R.range(1, 1.45), a: R.range(0, TAU), va: s * R.range(8, 16), s: R.chance(0.3) ? 2 : 1, pts: rockShape(R) });
    }
    for (let i = 0; i < 24; i++) {
      const s = R.sign(), a = -Math.PI / 2 + s * R.range(0.3, 1.2), v = R.range(60, 170);
      front.spawn(P.GRIT, s * R.range(2, 7), -1, Math.cos(a) * v, Math.sin(a) * v, R.range(0.6, 1.1), R.pick([st.light, st.body, st.lip]), R.chance(0.3) ? 2 : 1);
    }
    let t = 0;
    const rings = (p, far) => {
      for (const [t0, dur, r1, w, k0, edge] of [[0.01, 0.45, 58, 4.5, 0.75, 1], [0.12, 0.85, 42, 6, 0.8, 0]]) {
        const g = (t - t0) / dur;
        if (g <= 0 || g >= 1) continue;
        const r = 6 + r1 * ease.outCubic(g);
        dustRing(p, 0, 0, r, w * (1 + g), k0 * Math.pow(1 - g, 1.2) * Math.min(1, g / 0.06), DUST2, { sy: 0.2, ph: PH + t0 * 10, brk: g * 0.8, half: far ? -1 : 1 });
        if (edge && g < 0.75) band(p, 0, 0.5, r + 2, 0.2, Math.max(1, 2.5 * (1 - g)), 1.1 - g / 0.75, [st.body, st.light, LIT, WHITE], (a) => Math.sin(a) < 0 === far);
      }
    };
    return {
      update(dt) {
        t += dt;
        for (const b of bits.list) b.pvy = b.vy;
        bits.update(dt);
        for (const b of bits.list)
          if (b.pvy > 80 && b.vy <= 0) {
            front.spawn(P.DUST, b.x, -0.5, R.sign() * R.range(6, 20), -R.range(2, 10), R.range(0.25, 0.45), DUST2, R.range(1, 1.8));
            b.pvy = 0;
          }
        back.update(dt);
        front.update(dt);
      },
      drawBack(p) {
        const fade = 1 - smooth(D - 0.5, D - 0.1, t);
        dent(p, st, fade);
        drawCracks(p, cracks, (c) => c.len * ease.outCubic(clamp((t - c.t0) / 0.08)), () => 0, [WHITE, WHITE, WHITE, WHITE], SOOT, st.light, fade);
        rings(p, true);
        back.draw(p);
      },
      draw(p) {
        rings(p, false);
        front.draw(p);
        for (const b of bits.list) rock(p, b, st);
        if (t < 0.035) p.ellipse(0, 0, 15, 2.5, (d) => d < 0.55 ? WHITE : C[6]);
        else if (t < 0.07) for (let x = -22; x <= 22; x++) p.dot(x, 0, Math.abs(x) < 10 ? WHITE : C[5], 1 - Math.abs(x) / 24);
        if (t < 0.12) p.glowLine(-20, 0, 20, 0, 8, C[6], 0.45 * (1 - t / 0.12));
      }
    };
  }

  // public/vendor/pixelfx/src/fx/melee/uppercut.js
  var uppercut_exports = {};
  __export(uppercut_exports, {
    act: () => act3,
    create: () => create9,
    meta: () => meta9
  });

  // public/vendor/pixelfx/src/fx/melee/_lib.js
  var swing = (o) => ({ cx: 0, cy: 0, R: 30, sy: 1, rot: 0, a0: 0, dir: 1, k: 0, ...o });
  function onSwing(s, r, u) {
    const a = s.a0 + s.dir * u, lx = Math.cos(a) * r, ly = Math.sin(a) * r * s.sy - s.k * (s.R - r), c = Math.cos(s.rot), n = Math.sin(s.rot);
    return [s.cx + lx * c - ly * n, s.cy + lx * n + ly * c];
  }
  function travel(s, u) {
    const [x0, y0] = onSwing(s, s.R, u), [x1, y1] = onSwing(s, s.R, u + 0.01), l = Math.hypot(x1 - x0, y1 - y0) || 1;
    return { x: x0, y: y0, dx: (x1 - x0) / l, dy: (y1 - y0) / l, a: s.a0 + s.dir * u };
  }
  function plane(s, x, y) {
    const c = Math.cos(s.rot), n = Math.sin(s.rot), dx = x - s.cx, dy = y - s.cy, lx = dx * c + dy * n, ly = -dx * n + dy * c;
    if (!s.k) return [Math.hypot(lx, ly / s.sy), Math.atan2(ly / s.sy, lx)];
    const m = ly + s.k * s.R, A = s.sy * s.sy - s.k * s.k, B2 = 2 * m * s.k, Cc = lx * lx * s.sy * s.sy + m * m;
    const r = (-B2 + Math.sqrt(B2 * B2 + 4 * A * Cc)) / (2 * A);
    return [r, Math.atan2((m - s.k * r) / s.sy, lx)];
  }
  function smear(p, s, u0, u1, wMax, fn, half = 0, pad = 1) {
    if (u1 - u0 < 5e-3) return;
    const c = Math.cos(s.rot), n = Math.sin(s.rot), A = s.R + pad + 1, Bn = A * s.sy + s.k * (wMax + 2);
    const hx = Math.hypot(A * c, Bn * n) + 1, hy = Math.hypot(A * n, Bn * c) + 1, rIn = s.R - wMax - 1;
    const over = Math.abs(n) * A + s.k * (wMax + 2) + 2, y0 = half > 0 ? s.cy - over : s.cy - hy, y1 = half < 0 ? s.cy + over : s.cy + hy;
    p.shade(s.cx - hx, y0, s.cx + hx, y1, (x, y, out) => {
      const [r, a] = plane(s, x, y);
      if (r > s.R + pad || r < rIn) return;
      if (half && (Math.sin(a) < 0 ? -1 : 1) !== half) return;
      let u = s.dir * (a - s.a0) % TAU;
      if (u < 0) u += TAU;
      while (u < u0) u += TAU;
      if (u > u1) return;
      return fn(u, r, out, a);
    });
  }
  function trace(p, s, r, u0, u1, c, a, half = 0, step2 = 0.6) {
    const du = step2 / Math.max(4, r);
    for (let u = u0; u <= u1; u += du) {
      const g = s.a0 + s.dir * u;
      if (half && (Math.sin(g) < 0 ? -1 : 1) !== half) continue;
      const [x, y] = onSwing(s, r, u), k = typeof a === "function" ? a(u) : a;
      if (k > 0) p.dot(x, y, typeof c === "function" ? c(u) : c, k);
    }
  }
  function glowAlong(p, s, r, u0, u1, rad, c, k, half = 0, step2 = 0.35) {
    for (let u = u0; u <= u1; u += step2) {
      const g = s.a0 + s.dir * u;
      if (half && (Math.sin(g) < 0 ? -1 : 1) !== half) continue;
      const [x, y] = onSwing(s, r, u), kk = typeof k === "function" ? k(u) : k;
      if (kk > 4e-3) p.glow(x, y, rad, c, kk);
    }
  }
  function slash(p, s, t, half = 0) {
    const u = t - s.t0;
    if (u < 0) return;
    const R = s.ramp, n = R.length, life = s.sweep + s.hold + s.trail, hot = s.hot ?? 0;
    const head = ease.outExpo(clamp(u / s.sweep)), tail = smooth(s.sweep + s.hold, life, u), age = clamp(u / life);
    const U = s.span * head, T = s.span * tail, W = s.W * (1 - tail * 0.55);
    if (tail < 1 && U - T > 0.01) {
      smear(p, s, T, U, W, (uu, r, out) => {
        const v = (uu - T) / (U - T), w = W * Math.pow(Math.sin(Math.PI * Math.pow(v, s.lens ? 1 : 2.2)), s.lens ? 0.75 : 0.6);
        if (w < 0.35) return;
        const q = (s.R - r) / w;
        if (q < 0 || q > 1) return;
        const ci = q < 0.22 && age < 0.5 || q < hot * 0.7 ? 0 : Math.round(q * (n - 1) * 0.75 + age * 2.4 - v * 0.8 + 0.4 - hot * 3);
        out.c = R[n - 1 - clamp(ci, 0, n - 1)];
        out.a = Math.min(1, v / (s.lens ? 0.1 : 0.4));
      }, half);
      glowAlong(p, s, s.R - W * 0.4, T, U, 5 + W, R[n - 3], (uu) => (0.22 + hot * 0.3) * (1 - age) * ((uu - T) / (U - T)), half, 0.3);
    }
    const th = 0.7 * (1 - clamp((u - s.sweep - s.hold) / (s.trail + 0.2)));
    if (tail > 0.02 && th > 0) trace(p, s, s.R - 0.5, 0, T, R[2], (uu) => th * (0.4 + 0.6 * uu / s.span), half);
  }
  var slashEnd = (s) => travel({ ...s, R: s.R - s.W * 0.3 }, s.span);
  var OUTLINE2 = hex("#1a1422");
  function star2(p, x, y, spikes3, sc, th, core, body, inner, rim) {
    for (const pass of [0, 1, 2])
      for (const s of spikes3) {
        const c = Math.cos(s.a), sn = Math.sin(s.a), L = s.len * sc;
        for (let d = 0; d <= L; d += 0.5) {
          const hw0 = s.w * th * (1 - d / L) * Math.min(1, 0.5 + d / 3), hw = pass === 0 ? hw0 + 0.8 : pass === 1 ? hw0 : hw0 * 0.45;
          if (pass === 2 && d > L * 0.55) break;
          for (let o = -hw; o <= hw; o += 0.5) p.px(x + c * d - sn * o, y + sn * d + c * o, pass === 0 ? rim : pass === 1 ? d < L * 0.35 ? inner : body : core);
        }
      }
    const r = 2.4 * sc * Math.sqrt(th);
    p.circle(x, y, r + 0.8, inner);
    p.circle(x, y, r, core);
  }

  // public/vendor/pixelfx/src/fx/melee/uppercut.js
  var meta9 = {
    name: "Uppercut",
    desc: "A crescent rises from the floor past the face, and at the top a comic impact star bursts: bold outline, hot core, burst lines, twinkles and sparks.",
    tags: ["melee", "uppercut", "punch", "rising", "launcher", "comic", "combat", "directional", "one-shot"],
    size: [132, 128],
    origin: [48, 110],
    duration: 0.85,
    loop: false,
    fps: 30,
    bg: "ground",
    actor: 2,
    options: {
      palette: ["#3a1408", "#7a2a10", "#c4501a", "#f08a2a", "#ffc94a", "#fff2a8", "#ffffff"],
      outline: "#2a0a08",
      sparks: ["#fff3a6", "#ffe26b", "#ff8a2a", "#f2561d"],
      seed: 11
    }
  };
  var FISTS = { ...READY, fx: 12, fy: -25, bx: 9, by: -27, crouch: 3, lean: 1 };
  var COIL = { ...FISTS, crouch: 7, lean: 3, fx: 8, fy: -11, bx: 8, by: -27, ffx: 10, fbx: -9 };
  var TOP = { ...FISTS, x: 1, y: -11, crouch: -1, lean: 2, fx: 12, fy: -42, bx: -6, by: -21, ffx: 8, ffy: -8, fbx: -3, fby: -2, toeB: true, ghost: 1 };
  var act3 = {
    target: { x: 44 },
    poses: [
      [-0.42, FISTS],
      [-0.16, COIL],
      [0, { ...COIL, crouch: 8 }],
      [0.03, { ...FISTS, y: -4, crouch: 1, lean: 4, fx: 18, fy: -27, bx: -5, by: -23, ffx: 9, fbx: -7, toeB: true, ghost: 1 }, "snap"],
      [0.076, TOP, "snap"],
      [0.3, { ...TOP, y: -13, ghost: void 0 }],
      [0.56, { ...TOP, y: 0, crouch: 2, fx: 13, fy: -31, ffx: 7, ffy: -6, fbx: -5, fby: -5, ghost: void 0 }, "in"],
      [0.6, { ...FISTS, y: 0, crouch: 7, lean: 3, fx: 12, fy: -14, bx: -6, by: -16, ffx: 10, fbx: -9 }, "snap"],
      [0.98, FISTS]
    ],
    hits: [{ t: 0.076, stop: 0.13, shake: 0.18, amp: 2, push: -2.6, straw: 18, y: -34 }],
    dust: [{ t: 0.03, x: 8, n: 6 }, { t: 0.6, x: 0, n: 6 }]
  };
  function create9(o) {
    const C = fit(o.palette, 7), INK3 = hex(o.outline), Rg = new Rng(o.seed), ps = new Particles({ rng: Rg, ground: () => 0, sparks: o.sparks }), lights = new Lights();
    const A = swing({ cx: 8, cy: -25, R: 27, sy: 1, rot: 0, a0: 1.08, dir: -1, span: 2.5, W: 13, t0: 0.02, sweep: 0.07, hold: 0.05, trail: 0.22, ramp: C });
    const top = slashEnd(A), SX = top.x + 3, SY = top.y - 5, HIT = A.t0 + A.sweep * 0.8;
    const spikes3 = Array.from({ length: 10 }, (_, i) => ({ a: i / 10 * TAU + Rg.range(-0.12, 0.12) - Math.PI / 2, len: (i % 2 ? 7 : 13) + Rg.range(0, 4), w: i % 2 ? 2.2 : 3 }));
    const bursts = Array.from({ length: 8 }, (_, i) => ({ a: i / 8 * TAU + 0.2 + Rg.range(-0.15, 0.15), r0: Rg.range(15, 18), L: Rg.range(5, 9) }));
    let t = 0, hit = false, kicked = false;
    return {
      update(dt) {
        t += dt;
        if (!kicked) {
          kicked = true;
          for (let i = 0; i < 4; i++) ps.spawn(P.DUST, 18 + Rg.range(-4, 4), -1, Rg.range(-30, 30), -Rg.range(5, 20), Rg.range(0.3, 0.55), "#6a6080", Rg.range(1.5, 2.6));
        }
        if (!hit && t >= HIT) {
          hit = true;
          lights.add(SX, SY, 56, C[4], 0.6, 0.4);
          lights.add(SX, SY, 18, WHITE, 0.7, 0.08);
          for (let i = 0; i < 16; i++) {
            const a = -Math.PI / 2 + Rg.range(-1.6, 1.6), sp = Rg.range(120, 320);
            ps.spawn(P.SPARK, SX, SY, Math.cos(a) * sp, Math.sin(a) * sp, Rg.range(0.15, 0.45));
          }
          for (let i = 0; i < 6; i++) {
            const a = Rg.range(0, TAU), d = Rg.range(14, 24);
            ps.spawn(P.STAR, SX + Math.cos(a) * d, SY + Math.sin(a) * d, Math.cos(a) * 20, Math.sin(a) * 20 - 10, Rg.range(0.25, 0.5), Rg.chance(0.5) ? C[5] : WHITE, Rg.range(1.4, 2.6), Rg.range(0.04, 0.18));
          }
        }
        ps.update(dt);
        lights.update(dt);
      },
      draw(p) {
        slash(p, A, t);
        const u = t - A.t0;
        if (u > 0 && u < 0.16)
          for (const [dx, y0, L] of [[A.cx + A.R + 7, -16, 18], [A.cx + A.R + 11, -30, 12], [A.cx - 4, -40, 10]]) {
            const k = u / 0.16, y = y0 - 30 * k;
            for (let d = 0; d < L; d += 1) p.dot(dx, y + d, d < 3 ? WHITE : d < L * 0.5 ? C[5] : C[3], (1 - d / L) * (1 - k));
          }
        if (u > 0 && u < A.sweep + 0.06) {
          const [x, y] = onSwing(A, A.R - 5, A.span * ease.outExpo(clamp(u / A.sweep)));
          p.glow(x, y, 34, C[3], 0.45 * (1 - u / (A.sweep + 0.06)));
        }
        const q = t - HIT;
        if (q >= 0 && q < 0.36) {
          const pop = ease.outBack(clamp(q / 0.05), 2.6), out = 1 - smooth(0.16, 0.36, q), sc = pop * (0.35 + 0.65 * out), turn = q * 1.2;
          const sp = spikes3.map((s) => ({ ...s, a: s.a + turn }));
          if (sc > 0.08) {
            star2(p, SX, SY, sp, sc * 1.12, 1, INK3, INK3, INK3, INK3);
            star2(p, SX, SY, sp, sc, 1, q < 0.05 ? WHITE : C[6], C[4], C[3], C[2]);
          }
          p.glow(SX, SY, 30, C[4], 0.45 * out);
        }
        if (q >= 0.02 && q < 0.24) {
          const k = (q - 0.02) / 0.22, r = 7 + 17 * ease.outCubic(k), th = Math.max(1, 2.2 * (1 - k)), col = k < 0.25 ? WHITE : k < 0.5 ? C[5] : k < 0.75 ? C[4] : C[3];
          for (let a = 0; a < TAU; a += 0.6 / r) for (let o2 = 0; o2 < th; o2 += 0.5) p.dot(SX + Math.cos(a) * (r - o2), SY + Math.sin(a) * (r - o2), col, 1.15 - k);
        }
        if (q >= 0.02 && q < 0.2) {
          const k = (q - 0.02) / 0.18;
          for (const b of bursts) {
            const r0 = b.r0 + 10 * ease.outCubic(k), ca = Math.cos(b.a), sa = Math.sin(b.a);
            p.line(SX + ca * r0, SY + sa * r0, SX + ca * (r0 + b.L * (1 - k)), SY + sa * (r0 + b.L * (1 - k)), k < 0.4 ? WHITE : C[5], 1.1 - k);
          }
        }
        ps.draw(p);
        lights.draw(p);
      }
    };
  }

  // public/vendor/pixelfx/src/fx/explosions/cartoon-pow.js
  var cartoon_pow_exports = {};
  __export(cartoon_pow_exports, {
    create: () => create10,
    meta: () => meta10
  });

  // public/vendor/pixelfx/src/fx/explosions/_lib.js
  var OUTLINE3 = hex("#1a1422");
  var SOOT2 = hex("#0d0a12");
  var SOOT22 = hex("#17121d");
  var LIFTS = /* @__PURE__ */ new Set([P.SMOKE, P.DUST, P.FIRE, P.EMBER, P.VAPOUR]);
  function cull(ps, x0, y0, x1, y1) {
    const L = ps.list;
    for (let i = L.length - 1; i >= 0; i--) {
      const q = L[i];
      if (q.x < x0 || q.x > x1 || q.y < y0 || q.y > y1) L.splice(i, 1);
    }
  }
  var SOFT2 = /* @__PURE__ */ new Set([P.SMOKE, P.DUST, P.VAPOUR]);
  function fadeEdges(ps, x0, x1, w = 30, y1 = Infinity) {
    const L = ps.list;
    for (let i = L.length - 1; i >= 0; i--) {
      const q = L[i];
      if (!SOFT2.has(q.k)) continue;
      const r = q.size * 1.65, e = Math.min((Math.min(q.x - x0, x1 - q.x) - r) / w, (y1 - q.y - r) / 6);
      if (e <= 0) L.splice(i, 1);
      else if (e < 1) q.life = Math.min(q.life, q.max * 0.42 * e);
    }
  }
  function pool(p, x, y, rx, ry, c, k) {
    if (k <= 4e-3 || rx < 1 || ry < 0.5) return;
    p.shade(x - rx, y - ry, x + rx, y + ry, (px, py, out) => {
      const dx = (px - x) / rx, dy = (py - y) / ry, d = dx * dx + dy * dy;
      if (d >= 1) return;
      const f = 1 - Math.sqrt(d);
      out.l = c;
      out.k = f * f * k;
    });
  }
  function rock2(p, b, st, FR) {
    const r = 0.6 + b.s * 0.75, fade = Math.min(1, b.life / 0.5), lx = Math.cos(b.a) * r * 0.4, ly = Math.sin(b.a) * r * 0.4, heat = b.heat ?? 0;
    p.shade(b.x - r - 1, b.y - r - 1, b.x + r + 1, b.y + r + 1, (x, y, out) => {
      const dx = x - b.x, dy = y - b.y, d = Math.hypot(dx * 1.15, dy);
      if (d > r + 0.9) return;
      out.a = fade;
      if (d > r) return OUTLINE3;
      const lit = dx * lx + dy * ly;
      if (heat > 0.08) {
        const g = heat * (1.1 - d / (r + 0.5)) + (lit > 0.3 ? heat * 0.45 : 0);
        if (g > 0.5) return FR[g > 1 ? 1 : g > 0.8 ? 2 : g > 0.62 ? 3 : 4];
        if (g > 0.32) return FR[5];
      }
      return lit < -0.4 ? st.light : lit > 0.6 ? st.shade : st.body;
    });
    if (heat > 0.05) p.glow(b.x, b.y, r * 2 + 3, FR[3], 0.32 * heat * fade);
  }
  function drawDirt(p, ps, layer) {
    const all = ps.list, grit = [], rest = [];
    for (const q of all) (q.k === P.GRIT ? grit : rest).push(q);
    ps.list = rest;
    ps.draw(p, layer);
    ps.list = all;
    if (layer === "back") return;
    for (const q of grit) {
      if (q.delay > 0) continue;
      const k = q.life / q.max, sp = Math.hypot(q.vx, q.vy);
      if (k < 0.25 && k * 4 < 0.5) continue;
      if (sp > 140) {
        const L = Math.min(5, sp * 0.012), ux = q.vx / sp, uy = q.vy / sp;
        p.line(q.x - ux * L, q.y - uy * L, q.x, q.y, (u) => u < 0.5 ? scale(q.col, 0.7) : q.col);
      } else {
        p.px(q.x, q.y, q.col);
        if (q.size >= 2) p.px(q.x + 1, q.y, q.col), p.px(q.x, q.y + 1, scale(q.col, 0.8)), p.px(q.x + 1, q.y + 1, scale(q.col, 0.7));
      }
    }
  }
  function crater2(p, E, x, r, k, a = 1) {
    if (k <= 0 || a <= 0) return;
    const n = E.length, rx = r * k, ry = Math.max(1.5, r * 0.17 * k);
    for (let py = -1; py <= Math.ceil(ry) + 1; py++)
      for (let px = Math.floor(-rx - 1); px <= Math.ceil(rx + 1); px++) {
        const dx = (px + 0.5) / rx, dy = (py + 0.5 - ry * 0.35) / ry, d = Math.sqrt(dx * dx + dy * dy);
        if (d > 1.08) continue;
        const c = d > 0.92 ? dy < 0 ? E[n - 2] : E[2] : dy < -0.2 ? E[0] : dy < 0.35 ? E[1] : E[2];
        p.dot(x + px, py, c, a);
      }
    for (const s of [-1, 1])
      for (let i = 0; i < 9; i++) {
        const u = i / 8, h = Math.round(Math.sin(Math.PI * u) * 2.2 * k + (rand(i, s > 0 ? 3 : 4) < 0.4 ? 1 : 0) * k);
        const hx = x + s * (rx * 0.82 + u * r * 0.55);
        for (let j = 0; j <= h; j++) p.dot(hx, -j, j === h ? E[n - 2] : j === h - 1 ? E[3] : E[2], a);
      }
    for (let i = 0; i < 26; i++) {
      const s = rand(i, 7) < 0.5 ? -1 : 1, d = rx * (1.05 + rand(i, 8) * 1.4), y = Math.round(rand(i, 9) * 3) - 1;
      if (rand(i, 10) < k) p.dot(x + s * d, y, rand(i, 11) < 0.5 ? E[3] : E[2], a);
    }
  }
  function dome(p, F, x, r, k) {
    const e = 1.4 / r;
    p.shade(x - r - 1.5, -r - 1.5, x + r + 1.5, 0.5, (px, py) => {
      const d = Math.hypot(px - x, py) / r;
      if (d > 1 + e) return;
      return d > 1 ? F[2] : d > 0.8 ? k > 0.45 ? F[6] : F[5] : d > 0.5 ? k > 0.45 ? WHITE : F[6] : k > 0.2 ? WHITE : F[6];
    });
  }
  function lobe(p, x, y, r, FR, SM, fire, glow, a, z = 0, dark = 0, style = 0) {
    if (r < 0.7 || a <= 0.01) return;
    const n = FR.length, m = SM.length, back = z < -0.35 ? 1 : 0, rim = 1 - Math.min(0.35, 1.6 / r), seam = 1 - Math.min(0.3, 1.3 / r);
    const D = (i) => SM[Math.min(m - 1, i + back + dark)], soft = 0.55 + 0.4 * (1 - Math.min(1, a));
    const px = (lx, ly, sx, sy) => {
      const dx = (lx - x) / r, dy = (ly - y) / r, d2 = dx * dx + dy * dy;
      if (d2 > 1) return;
      const d = Math.sqrt(d2), nz = Math.sqrt(1 - d2), sky = -0.5 * dx - 0.66 * dy + 0.56 * nz;
      const v = fire * (1.32 - 0.78 * d) + 0.14 * sky * fire;
      let c, k = 0, solid = false;
      if (v > 0.44) {
        let i = Math.min(n - 3, Math.max(0, Math.floor((1.3 - v) * (n - 1) * 0.78)));
        if (d > seam) i = Math.min(6, Math.max(4, i + 2));
        else if (d > seam - 0.22) i = Math.min(n - 3, i + 1);
        c = FR[i];
        k = 0.05 * fire;
        solid = true;
      } else if (style) {
        const lam = -0.42 * dx - 0.78 * dy + 0.46 * nz;
        if (lam > 0.66 && d > 0.4) c = D(0);
        else if (lam > 0.16) c = D(1);
        else if (lam > -0.3) c = D(2);
        else {
          c = D(lam < -0.64 ? 4 : 3);
          const g = glow * (0.6 + 0.4 * dy);
          if (g > 0.55) c = FR[g > 0.8 ? 5 : 6], k = 0.08 * g;
          else if (g > 0.34) c = mix(c, FR[6], 0.6);
          else if (g > 0.16) c = mix(c, FR[7], 0.45);
        }
      } else {
        const g = glow * (0.82 * dy + 0.3 * nz);
        if (g > 0.45) c = FR[g > 0.66 ? 4 : 5], k = 0.1 * glow;
        else if (g > 0.3) c = FR[6];
        else if (g > 0.2) c = FR[7];
        else {
          const s = sky * 0.5 + 0.5;
          c = D(s > 0.8 ? 0 : s > 0.62 ? 1 : s > 0.42 ? 2 : s > 0.22 ? 3 : 4);
        }
      }
      p.blendPx(sx, sy, c, solid || d <= rim ? a : a * soft);
      if (k > 0) p.add(sx, sy, c, k);
    };
    if (p.sn !== 0 || p.cs !== 1) return p.each(x - r, y - r, x + r, y + r, px);
    const ax = p.tx + (x - r) * p.fx, bx = p.tx + (x + r) * p.fx;
    const sx0 = Math.max(p.ox, Math.floor(Math.min(ax, bx))), sx1 = Math.min(p.ox + p.w - 1, Math.ceil(Math.max(ax, bx)));
    const sy0 = Math.max(p.oy, Math.floor(p.ty + y - r)), sy1 = Math.min(p.oy + p.h - 1, Math.ceil(p.ty + y + r));
    for (let sy = sy0; sy <= sy1; sy++) {
      const ly = sy + 0.5 - p.ty, q = (ly - y) / r;
      if (q * q >= 1) continue;
      const hw = r * Math.sqrt(1 - q * q), cx = p.tx + x * p.fx;
      for (let sx = Math.max(sx0, Math.floor(cx - hw - 0.5)), e = Math.min(sx1, Math.ceil(cx + hw)); sx <= e; sx++) px((sx + 0.5 - p.tx) * p.fx, ly, sx, sy);
    }
  }

  // public/vendor/pixelfx/src/fx/explosions/cartoon-pow.js
  var meta10 = {
    name: "Cartoon POW",
    desc: "A comic-book hit: a jagged two-tone burst star slams in with a shake and boiling edges, POW! drops in letter by letter, action lines fly, then it all snaps away.",
    tags: ["cartoon", "comic", "pow", "hit", "impact", "text", "one-shot"],
    size: [184, 144],
    origin: [92, 72],
    duration: 1.05,
    loop: false,
    fps: 30,
    bg: "dark",
    options: { palette: ["#1a0e14", "#6e1a12", "#c8361a", "#f47a24", "#ffc23c", "#fff07a", "#ffffff"], text: "POW!", seed: 5 }
  };
  var N = 14;
  var IN = 0.05;
  var GO = 0.66;
  var END = 0.8;
  function create10(o) {
    const C = fit(o.palette, 7), R = new Rng(o.seed), INK3 = C[0];
    const ps = new Particles({ rng: R, sparks: [C[6], C[5], C[4], C[3]] });
    const spikes3 = Array.from({ length: N * 2 }, (_, i) => ({ r: i % 2 ? R.range(0.5, 0.6) : R.range(0.85, 1.05), j: R.next() * 100 }));
    const lines = Array.from({ length: 16 }, (_, i) => ({ a: (i + R.range(0.2, 0.8)) / 16 * TAU, r: R.range(0.92, 1.08), L: R.range(10, 17), t0: R.range(0, 0.06) }));
    let t = 0, popped = false, burst2 = false;
    return {
      update(dt) {
        t += dt;
        if (!burst2 && t >= IN) {
          burst2 = true;
          for (let i = 0; i < 22; i++) {
            const a = R.range(0, TAU), sp = R.range(180, 360);
            ps.spawn(P.SPARK, Math.cos(a) * 14, Math.sin(a) * 10, Math.cos(a) * sp, Math.sin(a) * sp, R.range(0.12, 0.3));
          }
        }
        if (!popped && t >= GO) {
          popped = true;
          for (let i = 0; i < 14; i++) {
            const a = R.range(0, TAU), sp = R.range(60, 150);
            ps.spawn(P.STAR, Math.cos(a) * 26, Math.sin(a) * 18, Math.cos(a) * sp, Math.sin(a) * sp, R.range(0.25, 0.42), R.pick([C[6], C[5], C[4]]), R.range(1.2, 2.4));
          }
        }
        ps.update(dt);
        cull(ps, -meta10.origin[0] + 3, -meta10.origin[1] + 3, meta10.size[0] - meta10.origin[0] - 3, meta10.size[1] - meta10.origin[1] - 3);
      },
      draw(p) {
        const k = clamp(t / IN);
        const s = t < IN ? 0.25 + 0.95 * ease.outCubic(k) : t < GO ? 1 + 0.18 * Math.exp(-(t - IN) * 18) * Math.cos((t - IN) * 40) : 1 - ease.inBack(clamp((t - GO) / (END - GO)), 2);
        const shake = t < 0.3 ? (1 - t / 0.3) * 2.2 : 0, sx = Math.round(Math.sin(t * 97) * shake), sy = Math.round(Math.cos(t * 83) * shake);
        if (s > 0.02) {
          const boil = Math.floor(t * 12), outer = 50 * s, rot = -0.1 + (t > GO ? (t - GO) * 3 : 0), M2 = N * 2;
          const rad = spikes3.map((q, i) => q.r * (1 + (rand(i, boil, 7) - 0.5) * 0.08));
          p.shade(sx - outer - 4, sy - outer - 4, sx + outer + 4, sy + outer + 4, (x2, y) => {
            const dx = x2 - sx, dy = (y - sy) / 0.82, d = Math.hypot(dx, dy);
            let u = ((Math.atan2(dy, dx) - rot) / TAU % 1 + 1) % 1 * M2;
            const i = Math.floor(u) % M2, f = u - Math.floor(u), r = rad[i] + (rad[(i + 1) % M2] - rad[i]) * f, e = d / r;
            if (e > outer + 2.5) return;
            if (e > outer) return INK3;
            if (e > outer * 0.66 + 2) return dx * 0.6 + dy * 0.8 > outer * 0.25 && (Math.floor(x2) + Math.floor(y) * 2) % 4 === 0 && Math.floor(y) % 2 === 0 ? C[4] : C[5];
            if (e > outer * 0.66) return INK3;
            return e > outer * 0.44 ? C[3] : C[4];
          });
          p.glow(sx, sy, outer * 1.3, C[5], 0.3 * Math.min(1, s));
        }
        for (const q of lines) {
          const u = (t - IN - q.t0) / 0.32;
          if (u <= 0 || u >= 1) continue;
          const r0 = (46 + 22 * ease.outCubic(u)) * q.r, L = q.L * 0.7 * (1 - u), ca = Math.cos(q.a), sa = Math.sin(q.a) * 0.82;
          p.line(ca * r0, sa * r0, ca * (r0 + L), sa * (r0 + L), (v) => v < 0.5 ? WHITE : C[5]);
        }
        const ru = (t - IN) / 0.24;
        if (ru > 0 && ru < 1) p.ring(0, 0, 30 + 34 * ease.outCubic(ru), Math.max(1, 2.5 * (1 - ru)), ru < 0.4 ? WHITE : C[5], 1.1 - ru);
        const word = String(o.text ?? "POW!"), scale2 = 3, widths = [...word].map((ch) => p.measure(ch, { font: "big", scale: scale2 })[0]);
        let x = -widths.reduce((a, w) => a + w + scale2, -scale2) / 2;
        [...word].forEach((ch, i) => {
          const u = (t - IN - 0.04 - i * 0.05) / 0.12, away = clamp((t - GO) / (END - GO - 0.04));
          if (u > 0 && away < 1) {
            const drop = (1 - ease.outBack(clamp(u), 2.4)) * -14, y = Math.round(-11 + drop - i * 1.5 + sy + away * 6);
            const lx = Math.round(x + sx), a = 1 - away;
            for (let d = 4; d >= 1; d--) p.text(ch, lx + d, y + d, d >= 3 ? INK3 : C[1], { font: "big", scale: scale2, a, outline: d === 4 ? INK3 : void 0 });
            for (const [ox, oy] of [[-2, 0], [2, 0], [0, -2], [0, 2], [-1, -1], [1, -1], [-1, 1], [1, 1]]) p.text(ch, lx + ox, y + oy, INK3, { font: "big", scale: scale2, a });
            p.text(ch, lx, y, (gx, gy) => gy < 4 ? C[6] : gy < 6 ? C[5] : C[4], { font: "big", scale: scale2, a });
          }
          x += widths[i] + scale2;
        });
        ps.draw(p);
        if (t > IN && t < IN + 0.12) sparkle(p, sx + 34, sy - 22, 6 * (1 - (t - IN) / 0.12), C[6], C[5], 0.6);
      }
    };
  }

  // public/vendor/pixelfx/src/fx/explosions/dirt-explosion.js
  var dirt_explosion_exports = {};
  __export(dirt_explosion_exports, {
    create: () => create11,
    meta: () => meta11
  });
  var meta11 = {
    name: "Dirt explosion",
    desc: "A buried charge goes off: a flash under the floor, a V of dirt clods and grit thrown high, a brown dust plume that billows and settles, and a crater left behind.",
    tags: ["explosion", "dirt", "earth", "dust", "debris", "ground", "one-shot"],
    size: [260, 240],
    origin: [130, 206],
    duration: 3.6,
    loop: false,
    fps: 30,
    bg: "ground",
    options: {
      palette: ["#1c1610", "#33281c", "#4f3f2c", "#6e5a40", "#927a58", "#b89f78", "#dcc8a2"],
      fire: ["#4a1712", "#c9281f", "#f2561d", "#ff8a2a", "#ffc23d", "#ffe26b", "#fff3a6", "#ffffff"],
      seed: 3
    }
  };
  function create11(o) {
    const E = fit(o.palette, 7), F = fit(o.fire, 8), R = new Rng(o.seed), floor = () => 0;
    const [W, H] = meta11.size, [OX2, OY2] = meta11.origin, X0 = -OX2 + 3, X1 = W - OX2 - 3, Y0 = -OY2 + 3, Y1 = H - OY2 - 3;
    const clod = { light: E[5], body: E[3], shade: E[2] }, DUST2 = mix(E[4], rgb(150, 140, 150), 0.2), SOIL = mix(E[3], rgb(90, 80, 90), 0.2), DARK = mix(E[2], rgb(60, 52, 60), 0.3);
    const ps = new Particles({ rng: R, ground: floor, sparks: [F[6], F[5], F[3], F[2]] }), lights = new Lights();
    const clods = new Bits({ ground: floor });
    let t = 0;
    lights.add(0, -10, 56, F[4], 0.7, 0.22);
    lights.add(0, -4, 26, WHITE, 0.6, 0.06);
    for (let i = 0; i < 14; i++) {
      const a = -Math.PI / 2 + R.range(-0.7, 0.7), sp = R.range(160, 320);
      ps.spawn(P.SPARK, 0, -2, Math.cos(a) * sp, Math.sin(a) * sp, R.range(0.15, 0.35));
    }
    for (let i = 0; i < 300; i++) {
      const side = R.sign(), a = -Math.PI / 2 + side * R.range(0.05, 0.62), sp = R.range(150, 470) * (1 - 0.3 * Math.abs(a + Math.PI / 2));
      ps.spawn(P.GRIT, R.range(-4, 4), -1, Math.cos(a) * sp, Math.sin(a) * sp, R.range(1.2, 2.2), R.pick([E[1], E[2], E[2], E[3], E[3], E[4], E[5]]), R.chance(0.45) ? 2 : 1, R.range(0, 0.06));
    }
    for (let i = 0; i < 30; i++) {
      const side = R.sign(), a = -Math.PI / 2 + side * R.range(0.1, 0.6), sp = R.range(200, 430);
      clods.add({ kind: B.CHUNK, x: R.range(-5, 5), y: -2, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 1, drag: 0.35, bounce: 0.25, life: R.range(2.2, 3), a: R.range(0, TAU), va: R.range(-12, 12), s: i < 12 ? R.range(2.6, 3.8) : R.range(1.4, 2.4) });
    }
    for (let i = 0; i < 22; i++)
      ps.spawn(P.SMOKE, R.range(-7, 7), -R.range(2, 12), R.range(-25, 25), -R.range(70, 180), R.range(1.8, 2.6), R.chance(0.6) ? SOIL : DUST2, R.range(9, 14), R.range(0, 0.14), PF.BIG);
    for (let i = 0; i < 14; i++) {
      const side = R.sign(), a = -Math.PI / 2 + side * R.range(0.35, 0.6), sp = R.range(110, 210);
      ps.spawn(P.SMOKE, side * R.range(2, 8), -R.range(2, 8), Math.cos(a) * sp, Math.sin(a) * sp, R.range(1.6, 2.4), R.chance(0.5) ? SOIL : DUST2, R.range(8, 12), R.range(0.02, 0.1), PF.BIG);
    }
    for (let i = 0; i < 16; i++) {
      const s = R.sign();
      ps.spawn(P.SMOKE, s * R.range(4, 16), -R.range(1, 5), s * R.range(70, 200), -R.range(2, 12), R.range(1.4, 2.2), DUST2, R.range(6, 9), R.range(0.02, 0.1), PF.BIG);
    }
    for (let i = 0; i < 8; i++) ps.spawn(P.SMOKE, R.range(-8, 8), -R.range(2, 8), R.range(-40, 40), -R.range(40, 110), R.range(1.2, 1.8), DARK, R.range(6, 9), R.range(0, 0.05));
    return {
      update(dt) {
        t += dt;
        for (const b of clods.list) b.pvy = b.vy;
        clods.update(dt);
        for (let i = clods.list.length - 1; i >= 0; i--) {
          const b = clods.list[i];
          if (b.x < X0 + 4 || b.x > X1 - 4) {
            clods.list.splice(i, 1);
            continue;
          }
          const landed = b.pvy > 0 && b.vy <= 0 || b.rest && !b.thud;
          if (!landed || b.pvy < 80) {
            if (b.rest) b.thud = true;
            continue;
          }
          b.thud = b.rest;
          for (let j = 0; j < 2 + Math.round(b.s); j++) ps.spawn(P.DUST, b.x + R.range(-2, 2), -0.5, R.sign() * R.range(15, 55), -R.range(4, 22), R.range(0.35, 0.7), DUST2, R.range(1.6, 1.2 + b.s));
          for (let j = 0; j < Math.round(b.s * 3); j++) ps.spawn(P.GRIT, b.x, -1, R.range(-70, 70), -R.range(40, 140), R.range(0.8, 1.4), R.pick([E[2], E[3], E[4]]), 1);
          if (b.s > 2.2 && b.pvy > 200) b.s *= 0.6;
        }
        ps.update(dt);
        cull(ps, X0, Y0, X1, Y1);
        fadeEdges(ps, X0, X1, 24, Y1);
        lights.update(dt);
      },
      drawBack(p) {
        crater2(p, E, 0, 28, ease.outCubic(Math.min(1, t / 0.12)), 1 - smooth(meta11.duration - 0.7, meta11.duration - 0.1, t));
        const k = t / 0.45;
        if (k < 1) band(p, 0, 0.5, 90 * ease.outCubic(k), 0.16, Math.max(1, 3 * (1 - k)), 1.1 - k, [E[2], E[4], E[5], E[6]], (g) => Math.sin(g) < 0);
        drawDirt(p, ps, "back");
      },
      draw(p) {
        const k = t / 0.45;
        if (k < 1) band(p, 0, 0.5, 90 * ease.outCubic(k), 0.16, Math.max(1, 3 * (1 - k)), 1.1 - k, [E[2], E[4], E[5], E[6]], (g) => Math.sin(g) >= 0);
        if (t < 0.09) dome(p, F, 0, 15 * (1 - t * 3), 1 - t / 0.09);
        for (const b of clods.list) rock2(p, b, clod, F);
        drawDirt(p, ps, "front");
        pool(p, 0, 1, 60, 10, F[3], 0.5 * Math.max(0, 1 - t / 0.3));
        lights.draw(p);
      }
    };
  }

  // public/vendor/pixelfx/src/fx/explosions/smoke-bomb.js
  var smoke_bomb_exports = {};
  __export(smoke_bomb_exports, {
    create: () => create12,
    meta: () => meta12
  });
  var meta12 = {
    name: "Smoke bomb",
    desc: "A round canister clinks down, fuse sparking, and pops: thick grey-violet smoke gushes out, rolls along the floor, billows into a cloud that hides all, then thins to wisps.",
    tags: ["smoke", "smoke-bomb", "ninja", "vanish", "escape", "ground", "one-shot"],
    size: [260, 176],
    origin: [130, 156],
    duration: 5,
    loop: false,
    fps: 30,
    bg: "ground",
    options: {
      palette: ["#0e0b14", "#1e1828", "#30283e", "#463c58", "#62567a", "#867a9e", "#aea4c4"],
      canister: ["#16121e", "#2a2434", "#443c52", "#686078", "#9c94ac"],
      sparks: ["#fff3a6", "#ffe26b", "#ff8a2a", "#f2561d"],
      seed: 3
    }
  };
  var POP = 0.95;
  var R0 = 4;
  var BAND = [hex("#3a1418"), hex("#7a2a24"), hex("#b84a34")];
  var GRIT = [hex("#5a4f6b"), hex("#3e3650"), hex("#776c88")];
  function step(c, dt, hit) {
    if (c.rest) return;
    c.vy += 900 * dt;
    c.x += c.vx * dt;
    c.y += c.vy * dt;
    if (c.y >= -R0 && c.vy > 0) {
      c.y = -R0;
      if (c.vy > 80) {
        hit?.(c.x, c.vy);
        c.vy = -c.vy * 0.38;
        c.vx *= 0.78;
      } else c.vy = 0;
    }
    if (c.vy === 0 && c.y >= -R0 - 0.01) {
      c.vx -= c.vx * 3 * dt;
      if (Math.abs(c.vx) < 2) c.vx = 0, c.rest = true;
    }
    c.a += (c.vy === 0 ? c.vx / R0 : c.va) * dt;
  }
  function create12(o) {
    const C = fit(o.palette, 7), K = fit(o.canister, 5), R = new Rng(o.seed), floor = () => 0;
    const SM = [C[5], C[4], C[3], C[2], C[1]];
    const [W, H] = meta12.size, [OX2, OY2] = meta12.origin, X0 = -OX2 + 3, X1 = W - OX2 - 3, Y0 = -OY2 + 3, Y1 = H - OY2 - 3;
    const ps = new Particles({ rng: R, ground: floor, sparks: o.sparks }), lights = new Lights();
    const start = { x: -70, y: -60, vx: 125, vy: -80, va: 7, a: 0, rest: false };
    const sim = { ...start };
    for (let i = 0; i < 2400 && !sim.rest; i++) step(sim, 1 / 240);
    const can = { ...start, x: start.x - sim.x };
    const N2 = 52, lobes = Array.from({ length: N2 }, (_, i) => {
      const kind = [0, 0, 1, 1, 2, 3][i % 6], side = R.sign();
      const ang = kind === 0 || kind === 3 ? side > 0 ? -R.range(0, 0.25) : Math.PI + R.range(0, 0.25) : -Math.PI / 2 + R.range(-0.6, 0.6);
      const sp = [R.range(70, 170), R.range(0, 25), R.range(45, 95), R.range(20, 60)][kind];
      const r1 = [R.range(12, 17), R.range(16, 22), R.range(13, 18), R.range(14, 19)][kind];
      const t0 = kind === 3 ? POP + R.range(0.45, 1.5) : POP + 0.6 * Math.pow(i / (N2 - 1), 1.6) + R.range(0, 0.03);
      return { kind, t0, vx: Math.cos(ang) * sp, vh: -Math.sin(ang) * sp, d: R.range(-1, 1), r0: R.range(5, 8), r1, f: R.range(-0.45, 0.4), wob: R.range(0, TAU), on: false, x: 0, h: 0, age: 0 };
    });
    let t = 0, popped = false;
    const fuseTip = () => [can.x + Math.sin(can.a) * (R0 + 2.5), can.y - Math.cos(can.a) * (R0 + 2.5)];
    const radius = (b) => (b.r0 + (b.r1 - b.r0) * (1 - Math.exp(-b.age / 0.28))) * (1 + 0.05 * Math.sin(t * 3 + b.wob)) * (1 + 0.35 * thin(b));
    const thin = (b) => smooth(2.5 + b.f, 3.9 + b.f * 0.6, t);
    return {
      update(dt) {
        t += dt;
        step(can, dt, (x, sp) => {
          for (let i = 0; i < 3; i++) ps.spawn(P.SPARK, x, -1, R.range(-70, 70), -R.range(40, 110), R.range(0.06, 0.14));
          for (let i = 0; i < 3; i++) ps.spawn(P.DUST, x + R.range(-2, 2), -0.5, R.sign() * R.range(10, 40), -R.range(4, 14), R.range(0.3, 0.55), GRIT[2], R.range(1.4, 2.4));
        });
        if (t < POP) {
          const [fx, fy] = fuseTip(), hurry = smooth(POP - 0.4, POP, t);
          if (R.chance((26 + 50 * hurry) * dt)) ps.spawn(P.SPARK, fx, fy, R.range(-50, 50), -R.range(30, 100), R.range(0.08, 0.18));
          if (R.chance(8 * dt)) ps.spawn(P.VAPOUR, fx, fy - 1, R.range(-4, 4), -R.range(10, 18), R.range(0.5, 0.8), C[5], R.range(1, 1.8));
        } else if (!popped) {
          popped = true;
          lights.add(can.x, -9, 64, C[6], 0.75, 0.22);
          lights.add(can.x, -5, 22, WHITE, 0.7, 0.06);
          for (let i = 0; i < 30; i++) {
            const a = R.range(-Math.PI - 0.35, 0.35), sp = R.range(120, 300);
            ps.spawn(P.SPARK, can.x, -5, Math.cos(a) * sp, Math.sin(a) * sp - 40, R.range(0.15, 0.4));
          }
          for (let i = 0; i < 26; i++) {
            const u = R.range(-1, 1), a = -Math.PI / 2 + u * 0.9, sp = R.range(80, 220) * (1 - 0.35 * Math.abs(u));
            ps.spawn(P.GRIT, can.x + u * 4, -1, Math.cos(a) * sp, Math.sin(a) * sp, R.range(0.9, 1.6), R.pick(GRIT), R.chance(0.35) ? 2 : 1);
          }
          Object.assign(can, { vy: -95, vx: R.range(-25, 25), va: R.sign() * 9, rest: false });
        }
        const wind = 6 * smooth(1.8, 3.2, t);
        for (const b of lobes) {
          if (!b.on) {
            if (t < b.t0) continue;
            b.on = true, b.x = can.x + R.range(-2, 2), b.h = 1;
          }
          b.age += dt;
          b.vx -= b.vx * 2.4 * dt;
          b.vh += [14 * smooth(0.7, 1.6, b.age), 3 + 9 * smooth(0.8, 1.8, b.age), 6 + 12 * smooth(0.3, 1.4, b.age), 10 * smooth(0.8, 1.6, b.age)][b.kind] * dt;
          b.vh -= b.vh * 1.6 * dt;
          b.x += (b.vx + wind) * dt;
          b.h = Math.max(0, b.h + b.vh * dt);
          const k = thin(b);
          if (k > 0.12 && k < 0.85 && R.chance(1.8 * dt)) {
            const r = radius(b), life = Math.min(R.range(1, 1.6), meta12.duration - 0.15 - t);
            if (life > 0.3) ps.spawn(P.VAPOUR, b.x + R.range(-r, r) * 0.5, -(b.h + r * 1.4), wind + R.range(-6, 10), -R.range(8, 20), life, C[4], r * R.range(0.3, 0.45));
          }
        }
        if (t > POP + 0.5 && t < 4.1 && R.chance(4 * dt)) ps.spawn(P.VAPOUR, can.x, can.y - 3, R.range(-3, 3), -R.range(8, 16), R.range(0.6, 0.9), C[4], R.range(1.5, 2.5));
        ps.update(dt);
        cull(ps, X0, Y0, X1, Y1);
        fadeEdges(ps, X0, X1, 20, Y1);
        lights.update(dt);
      },
      drawBack(p) {
        ps.draw(p, "back");
        clouds(p, true);
      },
      draw(p) {
        const fade = 1 - smooth(4.3, 4.8, t);
        if (fade > 0) drawCanister(p, K, can, t < POP, fade);
        if (t < POP) {
          const [fx, fy] = fuseTip();
          p.px(fx, fy, Math.sin(t * 50) > 0 ? WHITE : hex(o.sparks[1]));
          p.glow(fx, fy, 6, hex(o.sparks[2]), 0.45 + 0.2 * Math.sin(t * 37));
        }
        clouds(p, false);
        ps.draw(p, "front");
        const u = t - POP;
        if (u >= 0 && u < 0.067) {
          p.circle(can.x, -5, 6.5, C[5]);
          p.circle(can.x, -5, 4.5, WHITE);
        }
        if (u >= 0 && u < 0.16) flare(p, can.x, -5, 22 * (1 - u / 0.16), 1 - u / 0.16, [C[3], C[4], C[5], C[6]]);
        if (u >= 0 && u < 0.35) pool(p, can.x, 1, 50, 8, C[6], 0.5 * (1 - u / 0.35));
        lights.draw(p);
      }
    };
    function clouds(p, back) {
      const on = lobes.filter((b) => b.on);
      if (!on.length) return;
      let top = 0;
      for (const b of on) top = Math.min(top, -(b.h + radius(b) * 1.92));
      for (const b of on.filter((b2) => b2.d < -0.35 === back).sort((a, b2) => a.d - b2.d)) {
        const r = radius(b), y = -(b.h + r * 0.92) + b.d * 2.5, k = thin(b);
        const a = Math.min(1, b.age / 0.05) * Math.pow(1 - k, 1.4) * 0.97 * (1 - smooth(-OY2 + 34, -OY2 + 6, y - r));
        if (a <= 0.01) continue;
        const shade = (y - top) / Math.max(20, -top) > 0.55 ? 1 : 0;
        lobe(p, b.x, y, r, SM, SM, 0, 0, a, b.d, Math.min(2, shade + (k > 0.6 ? 1 : 0)), 1);
      }
    }
  }
  function drawCanister(p, K, c, live, a) {
    const ca = Math.cos(c.a), sa = Math.sin(c.a);
    p.shade(c.x - R0 - 2, c.y - R0 - 2, c.x + R0 + 2, c.y + R0 + 2, (px, py, out) => {
      const dx = px - c.x, dy = py - c.y, d = Math.hypot(dx, dy);
      if (d > R0 + 1) return;
      out.a = a;
      if (d > R0) return OUTLINE3;
      const v = -dx * sa + dy * ca, lit = -(dx * 0.6 + dy * 0.8) / R0;
      if (Math.abs(v) < 0.9) return BAND[lit > 0.3 ? 2 : lit > -0.4 ? 1 : 0];
      if (d < R0 * 0.5 && lit > 0.45) return K[4];
      return K[lit > 0.5 ? 3 : lit > 0 ? 2 : lit > -0.5 ? 1 : 0];
    });
    const cx = c.x + sa * R0, cy = c.y - ca * R0;
    if (live) p.line(cx, cy, cx + sa * 2.5, cy - ca * 2.5, hex("#8a6a48"), a);
    else p.dot(cx, cy, K[0], a);
  }

  // public/vendor/pixelfx/wave1.js
  var TIP = "679844a6e45b7dbdc4b3d1f76f2dd0fdcc2bc892";
  var MODULES = {
    "impacts/hit-spark": hit_spark_exports,
    "impacts/blunt-hit": blunt_hit_exports,
    "impacts/crit-hit": crit_hit_exports,
    "impacts/hit-flash": hit_flash_exports,
    "impacts/impact-frame": impact_frame_exports,
    "impacts/parry": parry_exports,
    "impacts/ground-slam": ground_slam_exports,
    "impacts/heavy-landing": heavy_landing_exports,
    "melee/uppercut": uppercut_exports,
    "explosions/cartoon-pow": cartoon_pow_exports,
    "explosions/dirt-explosion": dirt_explosion_exports,
    "explosions/smoke-bomb": smoke_bomb_exports
  };
  var IDS = Object.keys(MODULES);
  var sheets = /* @__PURE__ */ new Map();
  function metaOf(mod) {
    return { fps: 30, bg: "dark", loop: false, duration: 1, tags: [], options: {}, ...mod.meta };
  }
  function isScreen(meta14) {
    const w = meta14.size && meta14.size[0];
    const h = meta14.size && meta14.size[1];
    return w >= 320 && h > 0 && Math.abs(w / h - 16 / 9) < 0.05;
  }
  function layoutOf(mod) {
    const meta14 = metaOf(mod);
    const acted = !!mod.act;
    if (!acted) {
      const w2 = meta14.size[0];
      const h2 = meta14.size[1];
      const ox2 = meta14.origin[0];
      const oy2 = meta14.origin[1];
      return { W: w2, H: h2, x: ox2, y: oy2, meta: meta14, acted, screen: isScreen(meta14) };
    }
    const bounds = actBounds(mod);
    bounds.y1 = Math.min(bounds.y1, 22);
    const w = Math.max(1, bounds.x1 - bounds.x0);
    const h = Math.max(1, bounds.y1 - bounds.y0);
    const ox = -bounds.x0;
    const oy = -bounds.y0;
    const W = Math.ceil(Math.max(w, h));
    const H = W;
    const x = Math.floor((W - w) / 2) + ox;
    const y = Math.max(oy + 2, H - bounds.y1 - 2);
    return { W, H, x, y, meta: meta14, acted, screen: false };
  }
  function seek(mod, lay, localT) {
    const place2 = { x: lay.x, y: lay.y };
    const inst = lay.acted ? createAct(mod, place2) : createFx(mod, place2);
    const t = Math.max(0, Number(localT) || 0);
    if (lay.acted) {
      const from = actSpan(mod).from;
      const dt = t - from;
      if (dt > 0) inst.update(dt);
    } else if (t > 0) {
      inst.update(t);
    }
    return inst;
  }
  function raster(id, localT) {
    const mod = MODULES[id];
    if (!mod) return { id, ok: false, opaque: 0, w: 0, h: 0, data: null, duration: 0, screen: false, reason: "missing-module" };
    const lay = layoutOf(mod);
    const inst = seek(mod, lay, localT);
    const frame2 = clearFrame(createFrame(lay.W, lay.H));
    if (lay.acted) inst.draw(frame2);
    else {
      inst.draw(frame2, "back");
      inst.draw(frame2, "front");
    }
    const data = new Uint8ClampedArray(lay.W * lay.H * 4);
    composite(frame2, data, null);
    let opaque = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] > 16) opaque++;
    return {
      id,
      ok: true,
      opaque,
      w: lay.W,
      h: lay.H,
      data,
      duration: lay.meta.duration,
      screen: lay.screen,
      reason: opaque > 8 ? "" : "empty-frame"
    };
  }
  function sheet(w, h) {
    if (typeof document === "undefined") return null;
    const key = w + "x" + h;
    let s = sheets.get(key);
    if (!s) {
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      s = { canvas, ctx: canvas.getContext("2d") };
      sheets.set(key, s);
    }
    return s;
  }
  function place(sample, stageW = 1280, stageH = 720) {
    if (!sample || !sample.w || !sample.h) return { dx: 0, dy: 0, dw: stageW, dh: stageH };
    if (sample.screen) return { dx: 0, dy: 0, dw: stageW, dh: stageH };
    const scale2 = 4;
    const dw = sample.w * scale2;
    const dh = sample.h * scale2;
    return {
      dx: Math.round((stageW - dw) / 2),
      dy: Math.round(stageH * 0.46 - dh / 2),
      dw,
      dh
    };
  }
  function paint(id, localT, destCtx, destBox) {
    const sample = raster(id, localT);
    const drew = !!(sample.ok && sample.opaque > 8);
    if (!destCtx || !sample.data) {
      return { id, drew, pixels: sample.opaque || 0, reason: sample.reason || (drew ? "" : "no-canvas") };
    }
    const s = sheet(sample.w, sample.h);
    if (!s) return { id, drew: false, pixels: sample.opaque || 0, reason: "no-canvas" };
    const img = s.ctx.createImageData(sample.w, sample.h);
    img.data.set(sample.data);
    s.ctx.putImageData(img, 0, 0);
    const box = destBox || place(sample);
    destCtx.save();
    destCtx.imageSmoothingEnabled = false;
    destCtx.drawImage(s.canvas, box.dx, box.dy, box.dw, box.dh);
    destCtx.restore();
    return { id, drew, pixels: sample.opaque, reason: drew ? "" : sample.reason, box };
  }
  function meta13(id) {
    const mod = MODULES[id];
    if (!mod) return null;
    return metaOf(mod);
  }
  function has(id) {
    return Object.prototype.hasOwnProperty.call(MODULES, id);
  }
  var api = {
    tip: TIP,
    source: "pixelfx",
    ready: true,
    ids: IDS.slice(),
    has,
    meta: meta13,
    raster,
    paint,
    place
  };
  var wave1_default = api;
  var root = typeof globalThis !== "undefined" ? globalThis : window;
  root.HMPixelFx = api;
  if (typeof root.dispatchEvent === "function" && typeof root.Event === "function") {
    try {
      root.dispatchEvent(new root.Event("hm-pixelfx-ready"));
    } catch (_) {
    }
  }
})();

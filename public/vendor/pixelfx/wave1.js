// Wave 1 bridge. Same createFx / createAct path as landing/impact-wave1.js.
// Transparent composite so the fight plates stay visible under the effect.
import {
  createFrame,
  clearFrame,
  createFx,
  createAct,
  actSpan,
  actBounds,
  composite,
} from "./src/core/index.js";
import * as hitSpark from "./src/fx/impacts/hit-spark.js";
import * as bluntHit from "./src/fx/impacts/blunt-hit.js";
import * as critHit from "./src/fx/impacts/crit-hit.js";
import * as hitFlash from "./src/fx/impacts/hit-flash.js";
import * as impactFrame from "./src/fx/impacts/impact-frame.js";
import * as parry from "./src/fx/impacts/parry.js";
import * as groundSlam from "./src/fx/impacts/ground-slam.js";
import * as heavyLanding from "./src/fx/impacts/heavy-landing.js";
import * as uppercut from "./src/fx/melee/uppercut.js";
import * as cartoonPow from "./src/fx/explosions/cartoon-pow.js";
import * as dirtExplosion from "./src/fx/explosions/dirt-explosion.js";
import * as smokeBomb from "./src/fx/explosions/smoke-bomb.js";

export const TIP = "679844a6e45b7dbdc4b3d1f76f2dd0fdcc2bc892";

export const MODULES = {
  "impacts/hit-spark": hitSpark,
  "impacts/blunt-hit": bluntHit,
  "impacts/crit-hit": critHit,
  "impacts/hit-flash": hitFlash,
  "impacts/impact-frame": impactFrame,
  "impacts/parry": parry,
  "impacts/ground-slam": groundSlam,
  "impacts/heavy-landing": heavyLanding,
  "melee/uppercut": uppercut,
  "explosions/cartoon-pow": cartoonPow,
  "explosions/dirt-explosion": dirtExplosion,
  "explosions/smoke-bomb": smokeBomb,
};

export const IDS = Object.keys(MODULES);

const sheets = new Map();

function metaOf(mod) {
  return { fps: 30, bg: "dark", loop: false, duration: 1, tags: [], options: {}, ...mod.meta };
}

function isScreen(meta) {
  const w = meta.size && meta.size[0];
  const h = meta.size && meta.size[1];
  return w >= 320 && h > 0 && Math.abs(w / h - 16 / 9) < 0.05;
}

function layoutOf(mod) {
  const meta = metaOf(mod);
  const acted = !!mod.act;
  if (!acted) {
    const w = meta.size[0];
    const h = meta.size[1];
    const ox = meta.origin[0];
    const oy = meta.origin[1];
    return { W: w, H: h, x: ox, y: oy, meta, acted, screen: isScreen(meta) };
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
  return { W, H, x, y, meta, acted, screen: false };
}

function seek(mod, lay, localT) {
  const place = { x: lay.x, y: lay.y };
  const inst = lay.acted ? createAct(mod, place) : createFx(mod, place);
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

export function raster(id, localT) {
  const mod = MODULES[id];
  if (!mod) return { id, ok: false, opaque: 0, w: 0, h: 0, data: null, duration: 0, screen: false, reason: "missing-module" };
  const lay = layoutOf(mod);
  const inst = seek(mod, lay, localT);
  const frame = clearFrame(createFrame(lay.W, lay.H));
  if (lay.acted) inst.draw(frame);
  else {
    inst.draw(frame, "back");
    inst.draw(frame, "front");
  }
  const data = new Uint8ClampedArray(lay.W * lay.H * 4);
  composite(frame, data, null);
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
    reason: opaque > 8 ? "" : "empty-frame",
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

export function place(sample, stageW = 1280, stageH = 720) {
  if (!sample || !sample.w || !sample.h) return { dx: 0, dy: 0, dw: stageW, dh: stageH };
  if (sample.screen) return { dx: 0, dy: 0, dw: stageW, dh: stageH };
  const scale = 4;
  const dw = sample.w * scale;
  const dh = sample.h * scale;
  return {
    dx: Math.round((stageW - dw) / 2),
    dy: Math.round(stageH * 0.46 - dh / 2),
    dw,
    dh,
  };
}

export function paint(id, localT, destCtx, destBox) {
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

export function meta(id) {
  const mod = MODULES[id];
  if (!mod) return null;
  return metaOf(mod);
}

export function has(id) {
  return Object.prototype.hasOwnProperty.call(MODULES, id);
}

const api = {
  tip: TIP,
  source: "pixelfx",
  ready: true,
  ids: IDS.slice(),
  has,
  meta,
  raster,
  paint,
  place,
};
export default api;

const root = typeof globalThis !== "undefined" ? globalThis : window;
root.HMPixelFx = api;
if (typeof root.dispatchEvent === "function" && typeof root.Event === "function") {
  try { root.dispatchEvent(new root.Event("hm-pixelfx-ready")); } catch (_) {}
}

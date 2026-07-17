// ─── Player detection (Image Analysis) ───────────────────────────────────────
// In-browser person detection via TensorFlow.js COCO-SSD, lazy-loaded from CDN
// the first time an image is analyzed (~5MB once, then browser-cached; runs
// locally — no server round-trip, images never leave the device). Detections
// power the "player recognized" highlight shown while placing elements.
// Everything degrades silently: if the CDN or model fails, Image Analysis
// behaves exactly as before.
import * as S from './state.js';

// Detector: YOLOS-tiny (26MB) via transformers.js, WebGPU with a WASM fallback.
// Replaced COCO-SSD/MobileNet-v2: on the same broadcast frames it roughly
// doubles recall (12 → ~22 players) in a SINGLE pass — no tiling needed —
// with tighter boxes, which also cleans up the downstream jersey sampling.
// The op set these ONNX exports use needs transformers.js ≥ 4.x; older
// runtimes throw "AveragePool ceil not supported" — so this version is pinned.
const TRANSFORMERS_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0/dist/transformers.min.js';
const MODEL_ID = 'Xenova/yolos-tiny';
const MIN_SCORE = 0.25;  // keep low: broadcast players are small
const MIN_H_FRAC = 0.015;   // drop specks (crowd/noise) shorter than 1.5% of image height
const MAX_H_FRAC = 0.6;     // and implausibly tall boxes
const CROWD_TOP_FRAC = 0.15; // drop boxes lying ENTIRELY within the top 15% (stands)

let _model = null;
let _modelLoading = null;
let _detections = [];    // [{x,y,w,h,cx,feetY,score}] in board coords (image natural px)
let _detectRun = 0;      // bumped per image so stale async results are dropped
let _srcCanvas = null;   // full-res image pixels, kept so manual detectAt() can crop/sample

// Load YOLOS-tiny once and wrap it so the rest of this file keeps talking to a
// COCO-SSD-shaped detector: detect(src, minScore) → [{class, bbox:[x,y,w,h],
// score}] in the input image's pixel space. `src` is a data URL (full frame)
// or a canvas (detectAt crop). Everything downstream — feet calibration,
// jersey sampling, team clustering — is unchanged; only the box source moved.
async function _ensureModel() {
  if (_model) return _model;
  if (!_modelLoading) {
    _modelLoading = (async () => {
      const { pipeline, env } = await import(TRANSFORMERS_URL);
      env.allowLocalModels = false;
      let pipe;
      try { pipe = await pipeline('object-detection', MODEL_ID, { device: 'webgpu', dtype: 'fp32' }); }
      catch (e) { pipe = await pipeline('object-detection', MODEL_ID, { device: 'wasm', dtype: 'q8' }); }
      _model = {
        detect: async (src, minScore) => {
          const input = (typeof src === 'string') ? src : src.toDataURL();
          const res = await pipe(input, { threshold: minScore });
          return res.filter(r => r.label === 'person').map(r => ({
            class: 'person', score: r.score,
            bbox: [r.box.xmin, r.box.ymin, r.box.xmax - r.box.xmin, r.box.ymax - r.box.ymin],
          }));
        },
      };
      return _model;
    })().catch(err => { _modelLoading = null; throw err; });
  }
  return _modelLoading;
}

export function getDetections() { return _detections; }

export function clearDetections() {
  _detectRun++;
  _detections = [];
  _srcCanvas = null;
  _hideHighlight();
  _hideDetectPreview();
  _hideSweep();
  _hideStatus(true);
  document.getElementById('player-detect-reveal')?.remove();
}

// ─── Injected styles (scoped pdh- names; keeps styles.css untouched) ─────────
function _injectStyles() {
  if (document.getElementById('pdh-styles')) return;
  const st = document.createElement('style');
  st.id = 'pdh-styles';
  st.textContent = `
    @keyframes pdh-sweep { 0% { left: -14%; } 100% { left: 106%; } }
    @keyframes pdh-pop {
      0%   { transform: translateX(-50%) scale(0.8); opacity: 0; }
      60%  { transform: translateX(-50%) scale(1.05); opacity: 1; }
      100% { transform: translateX(-50%) scale(1); opacity: 1; }
    }
    @keyframes pdh-check {
      0%   { transform: scale(0) rotate(-20deg); }
      65%  { transform: scale(1.3) rotate(5deg); }
      100% { transform: scale(1) rotate(0deg); }
    }
    #player-detect-status .pdh-icon { display: inline-flex; }
    #player-detect-status.pdh-success .pdh-icon { animation: pdh-check 0.45s cubic-bezier(0.34, 1.56, 0.64, 1); }
  `;
  document.head.appendChild(st);
}

// ─── Status pill ──────────────────────────────────────────────────────────────
// Floating pill at the top of the canvas so the coach knows detection is
// running in the background (the first model load can freeze the tab briefly).
let _statusEl = null;
let _statusTimer = null;

const _SPINNER_SVG =
  '<svg width="15" height="15" viewBox="0 0 15 15">' +
  '<circle cx="7.5" cy="7.5" r="5.8" fill="none" stroke="rgba(52,211,153,0.25)" stroke-width="2.4"/>' +
  '<circle cx="7.5" cy="7.5" r="5.8" fill="none" stroke="#34D399" stroke-width="2.4" stroke-dasharray="14 23" stroke-linecap="round">' +
  '<animateTransform attributeName="transform" type="rotate" from="0 7.5 7.5" to="360 7.5 7.5" dur="0.8s" repeatCount="indefinite"/>' +
  '</circle></svg>';

const _CHECK_SVG =
  '<svg width="15" height="15" viewBox="0 0 15 15">' +
  '<circle cx="7.5" cy="7.5" r="7" fill="#34D399"/>' +
  '<path d="M4.3 7.8 L6.6 10 L10.8 5.2" fill="none" stroke="#0d1a12" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
  '</svg>';

function _ensureStatus() {
  if (_statusEl && _statusEl.isConnected) return _statusEl;
  _injectStyles();
  const host = document.getElementById('canvas-wrap') || document.body;
  _statusEl = document.createElement('div');
  _statusEl.id = 'player-detect-status';
  _statusEl.style.cssText =
    'position:absolute;top:70px;left:50%;transform:translateX(-50%);z-index:60;' +
    'display:flex;align-items:center;gap:9px;padding:9px 18px;border-radius:22px;' +
    'background:rgba(16,18,17,0.92);border:1px solid rgba(52,211,153,0.4);' +
    'box-shadow:0 4px 24px rgba(0,0,0,0.45), 0 0 18px rgba(52,211,153,0.12);' +
    'color:#eef4f0;font:600 13px Manrope,system-ui,sans-serif;pointer-events:none;' +
    'opacity:0;transition:opacity 0.25s;white-space:nowrap;';
  _statusEl.innerHTML = '<span class="pdh-icon"></span><span class="pdh-text"></span>';
  host.appendChild(_statusEl);
  return _statusEl;
}

function _showStatus(text, { spinner = false, success = false, autoHideMs = 0 } = {}) {
  const el = _ensureStatus();
  el.querySelector('.pdh-icon').innerHTML = spinner ? _SPINNER_SVG : (success ? _CHECK_SVG : '');
  el.querySelector('.pdh-text').textContent = text;
  el.classList.toggle('pdh-success', success);
  el.style.animation = 'none';
  el.getBoundingClientRect();   // flush so transition + re-triggered animation run
  el.style.animation = 'pdh-pop 0.35s ease-out';
  el.style.opacity = '1';
  clearTimeout(_statusTimer);
  if (autoHideMs) _statusTimer = setTimeout(() => _hideStatus(), autoHideMs);
}

function _hideStatus(immediate) {
  clearTimeout(_statusTimer);
  if (!_statusEl) return;
  _statusEl.style.opacity = '0';
  if (immediate) _statusEl.remove();
}

// ─── Scan sweep ───────────────────────────────────────────────────────────────
// A soft green light-band sweeping across the image while the model works —
// broadcast-telestrator vibes, and it makes "busy in the background" obvious.
let _sweepEl = null;

function _showSweep() {
  _injectStyles();
  const host = document.getElementById('pitch-container');
  if (!host || (_sweepEl && _sweepEl.isConnected)) return;
  _sweepEl = document.createElement('div');
  _sweepEl.id = 'player-detect-sweep';
  _sweepEl.style.cssText = 'position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:55;';
  const band = document.createElement('div');
  band.style.cssText =
    'position:absolute;top:0;bottom:0;width:11%;left:-14%;' +
    'background:linear-gradient(90deg, rgba(52,211,153,0) 0%, rgba(52,211,153,0.14) 40%, rgba(52,211,153,0.34) 50%, rgba(52,211,153,0.14) 60%, rgba(52,211,153,0) 100%);' +
    'animation:pdh-sweep 1.5s ease-in-out infinite;';
  _sweepEl.appendChild(band);
  host.appendChild(_sweepEl);
}

function _hideSweep() {
  if (_sweepEl) { _sweepEl.remove(); _sweepEl = null; }
}

// ─── Success reveal ───────────────────────────────────────────────────────────
// Mark EVERY recognized player — corner brackets + a dashed ground ring at the
// feet — staggering in, then holding for a few seconds so the coach can see
// exactly who was found before the markers fade.
const REVEAL_STAGGER = 70;
const REVEAL_HOLD = 3500;   // keep the reference on screen ~3.5s
const REVEAL_FADE = 600;

function _revealMark(g, d) {
  const ns = 'http://www.w3.org/2000/svg';
  const color = d.teamColor || '#34D399';
  const wrap = document.createElementNS(ns, 'g');
  wrap.style.cssText = 'opacity:0;transition:opacity 0.18s ease-out;';
  const brackets = document.createElementNS(ns, 'path');
  brackets.setAttribute('d', _bracketPath(d));
  brackets.setAttribute('fill', 'none');
  brackets.setAttribute('stroke', color);
  brackets.setAttribute('stroke-width', '2.5');
  brackets.setAttribute('stroke-linecap', 'round');
  brackets.setAttribute('vector-effect', 'non-scaling-stroke');
  const rx = Math.max(14, Math.min(70, d.w * 0.62));
  const feet = document.createElementNS(ns, 'ellipse');
  feet.setAttribute('cx', d.cx); feet.setAttribute('cy', d.feetY);
  feet.setAttribute('rx', rx); feet.setAttribute('ry', rx * 0.32);
  feet.setAttribute('fill', 'none');
  feet.setAttribute('stroke', color);
  feet.setAttribute('stroke-width', '1.5');
  feet.setAttribute('stroke-dasharray', '5,4');
  feet.setAttribute('vector-effect', 'non-scaling-stroke');
  wrap.appendChild(brackets); wrap.appendChild(feet);
  g.appendChild(wrap);
  wrap.getBoundingClientRect();
  wrap.style.opacity = '1';
  return wrap;
}

function _celebrateDetections() {
  if (!_detections.length) return;
  document.getElementById('player-detect-reveal')?.remove();
  const ns = 'http://www.w3.org/2000/svg';
  const g = document.createElementNS(ns, 'g');
  g.setAttribute('id', 'player-detect-reveal');
  g.setAttribute('pointer-events', 'none');
  S.svg.appendChild(g);
  _detections.forEach((d, i) => {
    setTimeout(() => {
      if (!g.isConnected) return;
      const wrap = _revealMark(g, d);
      setTimeout(() => { wrap.style.transition = `opacity ${REVEAL_FADE}ms ease-in`; wrap.style.opacity = '0'; }, REVEAL_HOLD);
    }, i * REVEAL_STAGGER);
  });
  setTimeout(() => g.remove(), _detections.length * REVEAL_STAGGER + REVEAL_HOLD + REVEAL_FADE + 200);
}

// ─── First-time intro modal ───────────────────────────────────────────────────
// Shown after every successful detection until the coach opts out — teaches
// that circles/units now attach to recognized players. Reuses the app's
// native modal classes so it looks like every other Táctica dialog.
const INTRO_KEY = 'tactica_detect_intro_dismissed';

function _introDismissed() {
  try { return localStorage.getItem(INTRO_KEY) === '1'; } catch (e) { return false; }
}

function _maybeShowIntroModal() {
  if (_introDismissed()) return;
  if (document.getElementById('player-detect-intro')) return;
  const bd = document.createElement('div');
  bd.className = 'modal-backdrop';
  bd.id = 'player-detect-intro';
  bd.innerHTML =
    '<div class="modal-box" style="width:360px">' +
      '<div style="display:flex;justify-content:center;padding:8px 0 2px">' +
        '<svg width="132" height="84" viewBox="0 0 132 84" fill="none">' +
          // player silhouette
          '<circle cx="66" cy="18" r="8" fill="rgba(255,255,255,0.85)"/>' +
          '<path d="M66 27 C 57 27 54 34 54 42 L 57 58 L 62 58 L 63 46 L 69 46 L 70 58 L 75 58 L 78 42 C 78 34 75 27 66 27 Z" fill="rgba(255,255,255,0.85)"/>' +
          // ground ellipse (the circle that attaches at the feet)
          '<ellipse cx="66" cy="64" rx="30" ry="9" fill="rgba(52,211,153,0.15)" stroke="#34D399" stroke-width="2" stroke-dasharray="6,4"/>' +
          // detection corner brackets
          '<path d="M34 16 L34 6 L44 6 M88 6 L98 6 L98 16 M98 62 L98 72 L88 72 M44 72 L34 72 L34 62" stroke="#34D399" stroke-width="2.5" stroke-linecap="round"/>' +
        '</svg>' +
      '</div>' +
      '<div class="modal-title" style="text-align:center">Players recognized automatically</div>' +
      '<div style="font-size:12.5px;color:var(--text-muted);line-height:1.65;text-align:center">' +
        'Táctica now spots the players in your image — and their team colours. With ' +
        '<strong style="color:var(--text)">Connected Lines</strong>, <strong style="color:var(--text)">Unit</strong>, ' +
        '<strong style="color:var(--text)">Callout</strong> or <strong style="color:var(--text)">Highlight</strong> active, ' +
        'hover a player to see them highlighted — click and the element attaches at their feet, ' +
        'sized and coloured to match. Clicking open grass still places freely.' +
      '</div>' +
      '<label style="display:flex;align-items:center;gap:8px;justify-content:center;cursor:pointer;' +
        'font-size:12px;color:var(--text-muted);user-select:none;padding-top:2px">' +
        '<input type="checkbox" id="pdi-dismiss" style="accent-color:#34D399;width:14px;height:14px;cursor:pointer">' +
        'Don’t show this again' +
      '</label>' +
      '<div class="modal-row">' +
        '<button class="modal-btn confirm" id="pdi-ok" style="width:100%">Got it</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(bd);
  bd.style.display = 'flex';
  bd.querySelector('#pdi-ok').onclick = () => {
    if (bd.querySelector('#pdi-dismiss').checked) {
      try { localStorage.setItem(INTRO_KEY, '1'); } catch (e) {}
    }
    bd.remove();
  };
}

// ─── Team detection (jersey colour) ───────────────────────────────────────────
// Sample each player's torso pixels, then 2-means-cluster the jersey colours
// into two teams. Every detection gets d.team (0|1) and d.teamColor — used to
// tint the hover highlight and the circles placed on that player.

function _sampleJersey(ctx, d) {
  // Central chest patch, anchored to the calibrated feet (feetY) rather than
  // the raw box. Filter out grass, skin (face/arms — warm tones that make
  // white kits read red) and deep shadow, then take the DOMINANT colour via a
  // coarse histogram. Dominant (not median) survives contamination from
  // overlapping opponents in a packed box — a white shirt with red bleed
  // still reads white.
  const bottom = (d.feetY != null ? d.feetY : d.y + d.h);
  const bodyH = bottom - d.y;
  const patchW = Math.max(3, Math.round(d.w * 0.42));
  const patchH = Math.max(3, Math.round(bodyH * 0.24));
  const x0 = Math.max(0, Math.round(d.cx - patchW / 2));
  const y0 = Math.max(0, Math.round(d.y + bodyH * 0.22));   // upper torso, below head
  try {
    const data = ctx.getImageData(x0, y0, patchW, patchH).data;
    const bins = new Map();   // quantised colour → {n, r, g, b}
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      if (g > r + 12 && g > b + 12) continue;                       // grass
      if (r + g + b < 75) continue;                                 // deep shadow / near-black
      // skin: warm, all channels present, green not crushed (a red kit has
      // green far lower, so it is NOT caught here)
      if (r > b + 12 && r >= g && g >= b && g > r * 0.55 && b > r * 0.30 && (r - b) < 115) continue;
      const key = (r >> 5) * 64 + (g >> 5) * 8 + (b >> 5);          // 8 levels/channel
      let e = bins.get(key);
      if (!e) { e = { n: 0, r: 0, g: 0, b: 0 }; bins.set(key, e); }
      e.n++; e.r += r; e.g += g; e.b += b;
    }
    let best = null;
    for (const e of bins.values()) if (!best || e.n > best.n) best = e;
    if (!best || best.n < 3) return null;
    return [Math.round(best.r / best.n), Math.round(best.g / best.n), Math.round(best.b / best.n)];
  } catch (e) { return null; }
}

const _dist2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

// Punch the sampled kit colour up to a readable annotation colour (kits read
// dark/muted on broadcast footage — shadows, compression).
function _vivid([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let hRot = 0, s = 0, l = (max + min) / 2;
  const dlt = max - min;
  if (dlt > 0.001) {
    s = l > 0.5 ? dlt / (2 - max - min) : dlt / (max + min);
    if (max === r) hRot = ((g - b) / dlt + (g < b ? 6 : 0)) / 6;
    else if (max === g) hRot = ((b - r) / dlt + 2) / 6;
    else hRot = ((r - g) / dlt + 4) / 6;
  }
  // Near-greyscale kits (white/black) keep their identity, just normalised;
  // coloured kits get saturation + lightness floors so they pop on grass.
  if (s > 0.12) { s = Math.max(s, 0.6); l = Math.min(Math.max(l, 0.55), 0.68); }
  else l = l > 0.5 ? 0.92 : Math.max(l, 0.2);
  const hue2rgb = (p, q, t) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  let R, G, B;
  if (s === 0) { R = G = B = l; }
  else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    R = hue2rgb(p, q, hRot + 1 / 3); G = hue2rgb(p, q, hRot); B = hue2rgb(p, q, hRot - 1 / 3);
  }
  return [Math.round(R * 255), Math.round(G * 255), Math.round(B * 255)];
}

const NEUTRAL_RGB = [235, 235, 235];   // "detected, team unclear" — never green (invisible on grass)

// Recompute team colours over the ENTIRE current detection set (auto + manual)
// so the palette stays globally consistent: at most two team colours, every
// same-team player identical. Called on the initial pass AND after every
// manual Add-Player click, so adding players never introduces a third colour.
const mean3 = g => [0, 1, 2].map(i => Math.round(g.reduce((s, v) => s + v[i], 0) / g.length));

function _recomputeTeams() {
  const pts = _detections.filter(d => d.jersey);
  const setColor = (d, rgb) => { d.teamRGB = rgb; d.teamColor = `rgb(${rgb.join(',')})`; };
  const assign = (d, role, team, rgb) => { d.role = role; d.team = team; setColor(d, rgb); };

  if (pts.length >= 3) {
    // 2-means over jersey colours; seed with the two farthest-apart samples
    let far = pts[0], best = -1;
    for (const p of pts) { const dd = _dist2(p.jersey, pts[0].jersey); if (dd > best) { best = dd; far = p; } }
    let c1 = pts[0].jersey.slice(), c2 = far.jersey.slice();
    for (let iter = 0; iter < 8; iter++) {
      const g1 = [], g2 = [];
      for (const p of pts) (_dist2(p.jersey, c1) <= _dist2(p.jersey, c2) ? g1 : g2).push(p.jersey);
      if (!g1.length || !g2.length) break;
      c1 = mean3(g1); c2 = mean3(g2);
    }

    if (_dist2(c1, c2) < 1200) {                 // only one team colour in frame
      const v = _vivid(c1);
      pts.forEach(d => assign(d, 'team', 0, v));
    } else {
      // Referees and goalkeepers wear kits distinct from BOTH teams, so they sit
      // far from either centroid — well beyond normal within-team variation.
      // Flag those as "officials" instead of forcing them into the nearest team
      // (which is why a referee used to read as, say, a red player).
      const nearest = d => Math.min(_dist2(d.jersey, c1), _dist2(d.jersey, c2));
      const sd = pts.map(d => Math.sqrt(nearest(d))).sort((a, b) => a - b);
      const bulk = sd.slice(0, Math.max(1, Math.round(sd.length * 0.7)));  // the tight majority
      const spread = bulk.reduce((s, v) => s + v, 0) / bulk.length;
      const thr = Math.max(70, spread * 2.2);
      // A real referee/keeper kit is either genuinely dark (black) or genuinely
      // vivid (fluorescent) — never a muddy mid-tone. A muddy outlier is a
      // contaminated jersey sample (shadow/overlap in a packed box), not an
      // official, so it stays a team player rather than getting mis-promoted.
      const cleanKit = ([r, g, b]) => {
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 510;
        const s = mx === mn ? 0 : (l < 0.5 ? (mx - mn) / (mx + mn) : (mx - mn) / (510 - mx - mn));
        return l < 0.28 || s > 0.68;
      };
      let officials = pts.filter(d => Math.sqrt(nearest(d)) > thr && cleanKit(d.jersey));
      // Guard: if a quarter-plus of the field reads as "outliers", the two-team
      // assumption is shaky (3+ kits, or bad sampling) — don't invent a crowd of
      // officials; fall back to colouring everyone by their nearest team.
      if (officials.length > pts.length * 0.25) officials = [];
      const isOfficial = new Set(officials);

      // Re-derive the team centroids from NON-officials only, so a bright
      // referee kit never defines (or tints) a team's colour.
      const inl = pts.filter(d => !isOfficial.has(d));
      const g1 = inl.filter(d => _dist2(d.jersey, c1) <= _dist2(d.jersey, c2)).map(d => d.jersey);
      const g2 = inl.filter(d => _dist2(d.jersey, c1) >  _dist2(d.jersey, c2)).map(d => d.jersey);
      if (g1.length) c1 = mean3(g1);
      if (g2.length) c2 = mean3(g2);
      const v1 = _vivid(c1), v2 = _vivid(c2);

      pts.forEach(d => {
        if (isOfficial.has(d)) {
          assign(d, 'official', -1, _vivid(d.jersey));   // keeps its own distinct colour
        } else {
          const a = _dist2(d.jersey, c1) <= _dist2(d.jersey, c2);
          assign(d, 'team', a ? 0 : 1, a ? v1 : v2);
        }
      });
    }
  } else if (pts.length === 2) {
    const distinct = _dist2(pts[0].jersey, pts[1].jersey) >= 1200;
    assign(pts[0], 'team', 0, _vivid(pts[0].jersey));
    assign(pts[1], 'team', distinct ? 1 : 0, _vivid(distinct ? pts[1].jersey : pts[0].jersey));
  } else if (pts.length === 1) {
    assign(pts[0], 'team', 0, _vivid(pts[0].jersey));
  }

  // Players whose jersey couldn't be sampled inherit the nearest TEAM
  // teammate's colour (never an official's — an unsampled outfielder isn't a
  // referee) — or a neutral light grey if there are no teams yet.
  const teamPts = pts.filter(d => d.role === 'team');
  for (const d of _detections) {
    if (d.jersey) continue;
    let nn = null, nd = Infinity;
    for (const o of teamPts) { const dd = (o.cx - d.cx) ** 2 + (o.feetY - d.feetY) ** 2; if (dd < nd) { nd = dd; nn = o; } }
    if (nn) assign(d, 'team', nn.team, nn.teamRGB);
    else assign(d, 'team', 0, NEUTRAL_RGB);
  }
}

// ─── Feet calibration ─────────────────────────────────────────────────────────
// COCO-SSD boxes on small broadcast players are often a touch high (cut off at
// the shins) or leave grass between the legs. Scan a wide strip from mid-body
// down to below the box and take the LOWEST row that still shows the player
// (boots/shadow) — the true ground contact. Finding the lowest contact (not
// the first grassy row) stops the ring from sitting above the feet.
function _refineFeet(ctx, d, natW, natH) {
  const stripW = Math.max(8, Math.round(d.w * 0.6));
  const x0 = Math.max(0, Math.round(d.cx - stripW / 2));
  const w = Math.min(stripW, natW - x0);
  const yTop = Math.round(d.y + d.h * 0.55);
  const yBot = Math.min(natH - 1, Math.round(d.feetY + d.h * 0.12));   // small margin — avoid diving into shadows
  let lowest = Math.round(d.y + d.h * 0.75);   // never end up above ~3/4 down the body
  try {
    for (let y = yTop; y <= yBot; y += 2) {
      const row = ctx.getImageData(x0, y, w, 1).data;
      let nonGrass = 0, n = 0;
      for (let i = 0; i < row.length; i += 4) {
        const r = row[i], g = row[i + 1], b = row[i + 2];
        if (!(g > r + 8 && g > b + 8)) nonGrass++;   // boot / sock / shadow
        n++;
      }
      if (nonGrass / n >= 0.28) lowest = y;   // player still present at this row
    }
  } catch (e) { /* tainted canvas etc. — keep the raw box bottom */ }
  return lowest;
}

// Kick off detection in the background. Called on every image load; safe to
// call repeatedly — results for a replaced image are discarded.
// Intersection-over-union and small-box-containment for de-duplicating the
// same player found in overlapping tiles / the full frame.
function _iou(a, b) {
  const x1 = Math.max(a.x, b.x), y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w), y2 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const uni = a.w * a.h + b.w * b.h - inter;
  return uni <= 0 ? 0 : inter / uni;
}
// One full-frame pass — YOLOS has the recall that COCO-SSD only reached by
// tiling, so the whole tile grid is gone. Same post-filters: drop specks and
// implausibly tall boxes, drop boxes lying entirely in the stands, then a light
// IoU dedup.
async function _detectFrame(model, dataUrl, W, H) {
  const preds = await model.detect(dataUrl, MIN_SCORE);
  const raw = preds
    .filter(p => p.class === 'person')
    .map(p => { const [x, y, w, h] = p.bbox; return { x, y, w, h, score: p.score }; });
  const filtered = raw.filter(b =>
    b.h >= MIN_H_FRAC * H && b.h <= MAX_H_FRAC * H &&
    (b.y + b.h) >= CROWD_TOP_FRAC * H);
  // YOLOS is a set-prediction model — one query per object, so it doesn't emit
  // the duplicates that COCO-SSD's tiling did. The old _nms (containment +
  // faint-fragment rules) was built for those and here it deletes real players
  // standing close together. A light IoU-only pass just catches the rare exact
  // double.
  return { boxes: _dedupeIoU(filtered, 0.7), passes: 1 };
}

// Loose IoU dedup: drop a box only when it heavily overlaps a stronger one.
function _dedupeIoU(boxes, thr) {
  boxes.sort((p, q) => q.score - p.score);
  const keep = [];
  for (const b of boxes) if (!keep.some(k => _iou(b, k) > thr)) keep.push(b);
  return keep;
}

// Manually recognise a player at a board-coordinate point the auto-pass
// missed. Crops tightly around the click (so the player is large and easy to
// detect), and if the model finds a person there, registers it with real
// size + feet + team colour. When opts.synthetic is true and nothing is
// found, drops a "player here" point anyway (perspective-sized, colour
// sampled at the click) so the explicit Mark-player mode always yields one.
// Returns the new detection, or null.
export async function detectAt(bx, by, opts = {}) {
  if (!_srcCanvas) return null;
  const W = _srcCanvas.width, H = _srcCanvas.height;
  if (bx < 0 || by < 0 || bx > W || by > H) return null;
  let det = null;
  try {
    const model = await _ensureModel();
    const cropH = Math.min(H, Math.max(140, Math.round(H * 0.24)));
    const cropW = Math.min(W, cropH);
    const rx = Math.max(0, Math.min(W - cropW, Math.round(bx - cropW / 2)));
    const ry = Math.max(0, Math.min(H - cropH, Math.round(by - cropH / 2)));
    const tile = document.createElement('canvas');
    tile.width = cropW; tile.height = cropH;
    tile.getContext('2d').drawImage(_srcCanvas, rx, ry, cropW, cropH, 0, 0, cropW, cropH);
    const preds = await model.detect(tile, 0.2);
    let bestD = Infinity;
    for (const p of preds) {
      if (p.class !== 'person') continue;
      const [x, y, w, h] = p.bbox;
      const fx = rx + x, fy = ry + y;
      const inside = bx >= fx - 4 && bx <= fx + w + 4 && by >= fy - 4 && by <= fy + h + 4;
      if (!inside) continue;
      const d2 = (fx + w / 2 - bx) ** 2 + (fy + h / 2 - by) ** 2;
      if (d2 < bestD) { bestD = d2; det = { x: fx, y: fy, w, h, score: p.score }; }
    }
  } catch (e) { /* fall through to synthetic */ }

  if (!det) {
    if (!opts.synthetic) return null;   // smart-click: only snap to a real detection
    // Perspective-sized box with feet at the click (players lower in frame are bigger)
    const h = Math.round(H * (0.05 + 0.1 * (by / H)));
    const w = Math.round(h * 0.42);
    det = { x: bx - w / 2, y: by - h, w, h, score: 0 };
  }
  const ctx = _srcCanvas.getContext('2d', { willReadFrequently: true });
  det.cx = det.x + det.w / 2;
  det.feetY = det.score > 0 ? _refineFeet(ctx, { ...det, feetY: det.y + det.h }, W, H) : by;
  det.jersey = _sampleJersey(ctx, det);
  det.manual = true;
  _detections.push(det);
  _recomputeTeams();   // re-colour the whole set so the palette stays consistent
  return det;
}

export function isDetectionReady() { return !!_srcCanvas; }

// Brief bracket flash on one newly-added player (reuses the reveal group).
export function flashDetection(d) {
  if (!d) return;
  const ns = 'http://www.w3.org/2000/svg';
  let g = document.getElementById('player-detect-reveal');
  if (!g) {
    g = document.createElementNS(ns, 'g');
    g.setAttribute('id', 'player-detect-reveal');
    g.setAttribute('pointer-events', 'none');
    S.svg.appendChild(g);
  }
  const p = document.createElementNS(ns, 'path');
  p.setAttribute('d', _bracketPath(d));
  p.setAttribute('fill', 'none');
  p.setAttribute('stroke', d.teamColor || '#34D399');
  p.setAttribute('stroke-width', '2.5');
  p.setAttribute('stroke-linecap', 'round');
  p.setAttribute('vector-effect', 'non-scaling-stroke');
  p.style.cssText = 'opacity:0;transition:opacity 0.16s ease-out;';
  g.appendChild(p);
  p.getBoundingClientRect();
  p.style.opacity = '1';
  setTimeout(() => { p.style.transition = 'opacity 0.35s ease-in'; p.style.opacity = '0'; }, 900);
  setTimeout(() => p.remove(), 1500);
}

export async function initPlayerDetection(dataUrl) {
  const run = ++_detectRun;
  _detections = [];
  // Let the image paint first — model warm-up can block the main thread,
  // and the busy UI must be on screen BEFORE the freeze so it reads as busy.
  _showStatus('Detecting players…', { spinner: true });
  _showSweep();
  await new Promise(r => setTimeout(r, 80));
  try {
    const model = await _ensureModel();
    if (run !== _detectRun) return;
    const img = new Image();
    await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = dataUrl; });
    const t0 = performance.now();
    const { boxes } = await _detectFrame(model, dataUrl, img.naturalWidth, img.naturalHeight);
    if (run !== _detectRun) return;   // a newer image replaced this one
    _detections = boxes.map(b => ({
      x: b.x, y: b.y, w: b.w, h: b.h, cx: b.x + b.w / 2, feetY: b.y + b.h, score: b.score
    }));
    // Keep the full-res pixels around for feet/jersey sampling AND for later
    // manual detectAt() clicks on players the auto-pass missed.
    const cv = document.createElement('canvas');
    cv.width = img.naturalWidth; cv.height = img.naturalHeight;
    cv.getContext('2d', { willReadFrequently: true }).drawImage(img, 0, 0);
    _srcCanvas = cv;
    if (_detections.length) {
      const ctx = cv.getContext('2d', { willReadFrequently: true });
      _detections.forEach(d => {
        d.feetY = _refineFeet(ctx, d, cv.width, cv.height);
        d.jersey = _sampleJersey(ctx, d);
      });
      _recomputeTeams();
    }
    console.log(`[tactica] player detection: ${_detections.length} player(s) (YOLOS-tiny, single pass) in ${Math.round(performance.now() - t0)}ms`);
    _hideSweep();
    if (_detections.length > 0) {
      _showStatus(`${_detections.length} player${_detections.length === 1 ? '' : 's'} recognized — click them with a circle tool`, { success: true, autoHideMs: 4500 });
      _celebrateDetections();
      // Teach the attach behavior once the bracket flash has had its moment
      setTimeout(() => { if (run === _detectRun && S.appMode === 'image') _maybeShowIntroModal(); }, 1100);
    } else {
      _showStatus('No players recognized in this image', { autoHideMs: 3000 });
    }
  } catch (err) {
    console.warn('[tactica] player detection unavailable:', err?.message || err);
    _hideSweep();
    _hideStatus();
  }
}

// Which detected player (if any) contains the point? Prefers the tightest box
// when boxes overlap (near player over far player crossing behind).
export function findPlayerAt(x, y) {
  const PAD = 6;
  let best = null;
  for (const d of _detections) {
    if (x >= d.x - PAD && x <= d.x + d.w + PAD && y >= d.y - PAD && y <= d.y + d.h + PAD) {
      if (!best || d.w * d.h < best.w * best.h) best = d;
    }
  }
  return best;
}

// ─── Hover highlight ──────────────────────────────────────────────────────────
// Corner brackets around the recognized player + a dashed ground ellipse at
// their feet (where a circle would land). Lives directly on the SVG root —
// NOT in objects-layer — so it never enters undo snapshots, saves or exports.

const HIGHLIGHT_TOOLS = new Set(['marker', 'net-zone', 'spotlight', 'tag', 'pair', 'mark-player', 'detect-player']);
let _hl = null;

function _bracketPath(d) {
  const L = Math.max(8, Math.min(22, Math.min(d.w, d.h) * 0.25));
  const { x, y, w, h } = d;
  return `M ${x} ${y + L} L ${x} ${y} L ${x + L} ${y} ` +
    `M ${x + w - L} ${y} L ${x + w} ${y} L ${x + w} ${y + L} ` +
    `M ${x + w} ${y + h - L} L ${x + w} ${y + h} L ${x + w - L} ${y + h} ` +
    `M ${x + L} ${y + h} L ${x} ${y + h} L ${x} ${y + h - L}`;
}

function _ensureHighlight() {
  if (_hl && _hl.isConnected) return _hl;
  const ns = 'http://www.w3.org/2000/svg';
  _hl = document.createElementNS(ns, 'g');
  _hl.setAttribute('id', 'player-detect-highlight');
  _hl.setAttribute('pointer-events', 'none');
  _hl.style.display = 'none';

  const brackets = document.createElementNS(ns, 'path');
  brackets.setAttribute('class', 'pdh-brackets');
  brackets.setAttribute('fill', 'none');
  brackets.setAttribute('stroke', '#34D399');
  brackets.setAttribute('stroke-width', '2.5');
  brackets.setAttribute('stroke-linecap', 'round');
  brackets.setAttribute('vector-effect', 'non-scaling-stroke');

  const feet = document.createElementNS(ns, 'ellipse');
  feet.setAttribute('class', 'pdh-feet');
  feet.setAttribute('fill', 'rgba(52,211,153,0.12)');
  feet.setAttribute('stroke', '#34D399');
  feet.setAttribute('stroke-width', '1.5');
  feet.setAttribute('stroke-dasharray', '5,4');
  feet.setAttribute('vector-effect', 'non-scaling-stroke');

  const pulse = document.createElementNS(ns, 'animate');
  pulse.setAttribute('attributeName', 'opacity');
  pulse.setAttribute('values', '1;0.55;1');
  pulse.setAttribute('dur', '1.6s');
  pulse.setAttribute('repeatCount', 'indefinite');

  _hl.appendChild(brackets);
  _hl.appendChild(feet);
  _hl.appendChild(pulse);
  S.svg.appendChild(_hl);
  return _hl;
}

function _showHighlight(d) {
  const hl = _ensureHighlight();
  const color = d.teamColor || '#34D399';
  const fill = d.teamRGB ? `rgba(${d.teamRGB.join(',')},0.14)` : 'rgba(52,211,153,0.12)';
  const brackets = hl.querySelector('.pdh-brackets');
  brackets.setAttribute('d', _bracketPath(d));
  brackets.setAttribute('stroke', color);
  const feet = hl.querySelector('.pdh-feet');
  const rx = Math.max(14, Math.min(70, d.w * 0.62));
  const ry = rx * 0.32;
  feet.setAttribute('cx', d.cx);
  feet.setAttribute('cy', d.feetY + ry);   // sit the ring below the feet (matches the placed marker)
  feet.setAttribute('rx', rx);
  feet.setAttribute('ry', ry);
  feet.setAttribute('stroke', color);
  feet.setAttribute('fill', fill);
  hl.style.display = '';
  // Keep it above everything currently on the svg
  S.svg.appendChild(hl);
}

function _hideHighlight() {
  if (_hl) _hl.style.display = 'none';
}

// ─── Detect-Player preview ────────────────────────────────────────────────────
// The Detect Player tool works on players the auto-pass missed, so there's no
// highlight to show on hover. Instead show a ghost reticle sized by perspective
// (bigger nearer the camera) so the coach sees roughly what will be detected.
let _detectPreview = null;
function _ensureDetectPreview() {
  if (_detectPreview && _detectPreview.isConnected) return _detectPreview;
  const ns = 'http://www.w3.org/2000/svg';
  _detectPreview = document.createElementNS(ns, 'g');
  _detectPreview.setAttribute('id', 'player-detect-preview');
  _detectPreview.setAttribute('pointer-events', 'none');
  const br = document.createElementNS(ns, 'path');
  br.setAttribute('class', 'pdp-brackets');
  br.setAttribute('fill', 'none'); br.setAttribute('stroke', 'rgba(52,211,153,0.75)');
  br.setAttribute('stroke-width', '2'); br.setAttribute('stroke-dasharray', '4,3');
  br.setAttribute('stroke-linecap', 'round'); br.setAttribute('vector-effect', 'non-scaling-stroke');
  const ft = document.createElementNS(ns, 'ellipse');
  ft.setAttribute('class', 'pdp-feet'); ft.setAttribute('fill', 'rgba(52,211,153,0.08)');
  ft.setAttribute('stroke', 'rgba(52,211,153,0.75)'); ft.setAttribute('stroke-width', '1.5');
  ft.setAttribute('stroke-dasharray', '5,4'); ft.setAttribute('vector-effect', 'non-scaling-stroke');
  _detectPreview.appendChild(br); _detectPreview.appendChild(ft);
  S.svg.appendChild(_detectPreview);
  return _detectPreview;
}
function _showDetectPreview(pt) {
  const H = (S.svg.viewBox && S.svg.viewBox.baseVal.height) || 1000;
  const bh = H * (0.05 + 0.1 * (pt.y / H));   // perspective player height, feet at cursor
  const bw = bh * 0.42;
  const x = pt.x - bw / 2, y = pt.y - bh;
  const g = _ensureDetectPreview();
  const L = Math.max(8, Math.min(22, Math.min(bw, bh) * 0.25));
  g.querySelector('.pdp-brackets').setAttribute('d',
    `M ${x} ${y + L} L ${x} ${y} L ${x + L} ${y} ` +
    `M ${x + bw - L} ${y} L ${x + bw} ${y} L ${x + bw} ${y + L} ` +
    `M ${x + bw} ${y + bh - L} L ${x + bw} ${y + bh} L ${x + bw - L} ${y + bh} ` +
    `M ${x + L} ${y + bh} L ${x} ${y + bh} L ${x} ${y + bh - L}`);
  const ft = g.querySelector('.pdp-feet');
  const rx = Math.max(14, bw * 0.62), ry = rx * 0.32;
  ft.setAttribute('cx', pt.x); ft.setAttribute('cy', pt.y + ry);
  ft.setAttribute('rx', rx); ft.setAttribute('ry', ry);
  g.style.display = '';
  S.svg.appendChild(g);
}
function _hideDetectPreview() { if (_detectPreview) _detectPreview.style.display = 'none'; }

// Wired once at module load: highlight follows the cursor while a placement
// tool is armed in Image Analysis. Detect Player also shows a size preview.
S.svg.addEventListener('mousemove', e => {
  if (S.appMode !== 'image') { _hideHighlight(); _hideDetectPreview(); return; }
  const pt = S.getSVGPoint(e, S.svg);
  if (S.tool === 'detect-player') {
    const d = findPlayerAt(pt.x, pt.y);
    if (d) { _showHighlight(d); _hideDetectPreview(); }
    else { _hideHighlight(); _showDetectPreview(pt); }
    return;
  }
  if (!HIGHLIGHT_TOOLS.has(S.tool) || _detections.length === 0) { _hideHighlight(); _hideDetectPreview(); return; }
  const d = findPlayerAt(pt.x, pt.y);
  if (d) _showHighlight(d); else _hideHighlight();
});
S.svg.addEventListener('mouseleave', () => { _hideHighlight(); _hideDetectPreview(); });

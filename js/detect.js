// ─── Player detection (Image Analysis) ───────────────────────────────────────
// In-browser person detection via TensorFlow.js COCO-SSD, lazy-loaded from CDN
// the first time an image is analyzed (~5MB once, then browser-cached; runs
// locally — no server round-trip, images never leave the device). Detections
// power the "player recognized" highlight shown while placing elements.
// Everything degrades silently: if the CDN or model fails, Image Analysis
// behaves exactly as before.
import * as S from './state.js';

const TF_URL = 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js';
const COCO_URL = 'https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd@2.2.3/dist/coco-ssd.min.js';
const MIN_SCORE = 0.3;   // keep low: broadcast players are small
const MAX_BOXES = 40;    // a full frame can show 20+ people incl. bench/refs

let _model = null;
let _modelLoading = null;
let _detections = [];    // [{x,y,w,h,cx,feetY,score}] in board coords (image natural px)
let _detectRun = 0;      // bumped per image so stale async results are dropped

function _loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error('script failed: ' + src));
    document.head.appendChild(s);
  });
}

async function _ensureModel() {
  if (_model) return _model;
  if (!_modelLoading) {
    _modelLoading = (async () => {
      if (!window.tf) await _loadScript(TF_URL);
      if (!window.cocoSsd) await _loadScript(COCO_URL);
      _model = await window.cocoSsd.load({ base: 'lite_mobilenet_v2' });
      return _model;
    })().catch(err => { _modelLoading = null; throw err; });
  }
  return _modelLoading;
}

export function getDetections() { return _detections; }

export function clearDetections() {
  _detectRun++;
  _detections = [];
  _hideHighlight();
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
// Flash the corner brackets of EVERY recognized player in a quick stagger —
// the celebratory payoff that doubles as a map of what was found.
function _celebrateDetections() {
  if (!_detections.length) return;
  document.getElementById('player-detect-reveal')?.remove();
  const ns = 'http://www.w3.org/2000/svg';
  const g = document.createElementNS(ns, 'g');
  g.setAttribute('id', 'player-detect-reveal');
  g.setAttribute('pointer-events', 'none');
  S.svg.appendChild(g);
  const STAGGER = 90, HOLD = 950, FADE = 350;
  _detections.forEach((d, i) => {
    setTimeout(() => {
      if (!g.isConnected) return;
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
      setTimeout(() => { p.style.transition = `opacity ${FADE}ms ease-in`; p.style.opacity = '0'; }, HOLD);
    }, i * STAGGER);
  });
  setTimeout(() => g.remove(), _detections.length * STAGGER + HOLD + FADE + 200);
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
        '<strong style="color:var(--text)">Connect Players</strong>, <strong style="color:var(--text)">Unit</strong>, ' +
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
  const x0 = Math.round(d.x + d.w * 0.25);
  const y0 = Math.round(d.y + d.h * 0.18);
  const w = Math.max(2, Math.round(d.w * 0.5));
  const h = Math.max(2, Math.round(d.h * 0.27));
  try {
    const data = ctx.getImageData(x0, y0, w, h).data;
    const rs = [], gs = [], bs = [];
    for (let i = 0; i < data.length; i += 8) {   // every 2nd pixel is plenty
      const r = data[i], g = data[i + 1], b = data[i + 2];
      if (g > r + 10 && g > b + 10) continue;    // grass showing through
      rs.push(r); gs.push(g); bs.push(b);
    }
    if (rs.length < 8) return null;
    const med = a => { a.sort((m, n) => m - n); return a[a.length >> 1]; };
    return [med(rs), med(gs), med(bs)];
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

function _clusterTeams() {
  const pts = _detections.filter(d => d.jersey);
  if (!pts.length) return;
  // Seeds: first point + the point farthest from it
  let far = pts[0], best = -1;
  for (const p of pts) { const dd = _dist2(p.jersey, pts[0].jersey); if (dd > best) { best = dd; far = p; } }
  let c1 = pts[0].jersey.slice(), c2 = far.jersey.slice();
  for (let iter = 0; iter < 6; iter++) {
    const g1 = [], g2 = [];
    for (const p of pts) (_dist2(p.jersey, c1) <= _dist2(p.jersey, c2) ? g1 : g2).push(p.jersey);
    if (!g1.length || !g2.length) break;
    const mean = g => [0, 1, 2].map(i => Math.round(g.reduce((s, v) => s + v[i], 0) / g.length));
    c1 = mean(g1); c2 = mean(g2);
  }
  // Clusters closer than ~35 RGB units apart = only one team in frame
  const single = _dist2(c1, c2) < 1200;
  const v1 = _vivid(c1), v2 = _vivid(c2);
  for (const d of _detections) {
    if (!d.jersey) continue;
    const inC1 = single || _dist2(d.jersey, c1) <= _dist2(d.jersey, c2);
    d.team = inC1 ? 0 : 1;
    d.teamRGB = inC1 ? v1 : v2;
    d.teamColor = `rgb(${d.teamRGB.join(',')})`;
  }
}

// ─── Feet calibration ─────────────────────────────────────────────────────────
// COCO-SSD boxes on small broadcast players often cut off at the waist or
// shins. Walk downward from the box bottom sampling a pixel strip under the
// player: keep extending while the strip still contains non-grass (kit/skin/
// sock) pixels, stop at the first clean-grass row — that is ground contact.
function _refineFeet(ctx, d, natW, natH) {
  const stripW = Math.max(6, Math.round(d.w * 0.4));
  const x0 = Math.max(0, Math.round(d.cx - stripW / 2));
  const w = Math.min(stripW, natW - x0);
  const maxY = Math.min(natH - 1, Math.round(d.feetY + d.h * 0.4));
  let feet = d.feetY;
  try {
    for (let y = Math.round(d.feetY); y <= maxY; y += 2) {
      const row = ctx.getImageData(x0, y, w, 1).data;
      let grass = 0, n = 0;
      for (let i = 0; i < row.length; i += 4) {
        const r = row[i], g = row[i + 1], b = row[i + 2];
        if (g > r + 10 && g > b + 10) grass++;
        n++;
      }
      feet = y;
      if (grass / n >= 0.82) break;   // reached clean grass below the boots
    }
  } catch (e) { /* tainted canvas etc. — keep the raw box bottom */ }
  return feet;
}

// Kick off detection in the background. Called on every image load; safe to
// call repeatedly — results for a replaced image are discarded.
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
    const preds = await model.detect(img, MAX_BOXES, MIN_SCORE);
    if (run !== _detectRun) return;   // a newer image replaced this one
    _detections = preds
      .filter(p => p.class === 'person')
      .map(p => {
        const [x, y, w, h] = p.bbox;
        return { x, y, w, h, cx: x + w / 2, feetY: y + h, score: p.score };
      });
    // Calibrate feet positions + sample jersey colours against the pixels
    if (_detections.length) {
      const cv = document.createElement('canvas');
      cv.width = img.naturalWidth; cv.height = img.naturalHeight;
      const ctx = cv.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      _detections.forEach(d => {
        d.feetY = _refineFeet(ctx, d, cv.width, cv.height);
        d.jersey = _sampleJersey(ctx, d);
      });
      _clusterTeams();
    }
    console.log(`[tactica] player detection: ${_detections.length} player(s) in ${Math.round(performance.now() - t0)}ms`);
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

const HIGHLIGHT_TOOLS = new Set(['marker', 'net-zone', 'spotlight', 'tag']);
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
  feet.setAttribute('cx', d.cx);
  feet.setAttribute('cy', d.feetY);
  feet.setAttribute('rx', rx);
  feet.setAttribute('ry', rx * 0.32);
  feet.setAttribute('stroke', color);
  feet.setAttribute('fill', fill);
  hl.style.display = '';
  // Keep it above everything currently on the svg
  S.svg.appendChild(hl);
}

function _hideHighlight() {
  if (_hl) _hl.style.display = 'none';
}

// Wired once at module load: highlight follows the cursor while a placement
// tool is armed in Image Analysis and detections exist.
S.svg.addEventListener('mousemove', e => {
  if (S.appMode !== 'image' || !HIGHLIGHT_TOOLS.has(S.tool) || _detections.length === 0) {
    _hideHighlight();
    return;
  }
  const pt = S.getSVGPoint(e, S.svg);
  const d = findPlayerAt(pt.x, pt.y);
  if (d) _showHighlight(d); else _hideHighlight();
});
S.svg.addEventListener('mouseleave', _hideHighlight);

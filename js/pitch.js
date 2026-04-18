import * as S from './state.js';
import { canAccess, showUpgradePrompt } from './subscription.js';

// ─── Compose layout string from toggle states ────────────────────────────────
function getToggledLayout() {
  const orient = document.querySelector('.pitch-opt[data-opt="orientation"].active')?.dataset.val || 'horizontal';
  const size = document.querySelector('.pitch-opt[data-opt="size"].active')?.dataset.val || 'full';
  const gridH = document.getElementById('pitch-toggle-gridh')?.checked || false;
  const gridV = document.getElementById('pitch-toggle-gridv')?.checked || false;
  const goals = document.getElementById('pitch-toggle-goals')?.checked ?? true;

  let layout;
  if (size === 'half') {
    layout = orient === 'vertical' ? 'half-v' : 'half-h';
  } else if (size === 'middle') {
    layout = orient === 'vertical' ? 'middle-v' : 'middle-h';
  } else if (size === '3q') {
    layout = orient === 'vertical' ? '3q-v' : '3q-h';
  } else {
    layout = orient === 'vertical' ? 'full-v' : 'full-h';
  }
  if (!goals) layout += '-ng';
  if (gridH && gridV) layout += '-grid';
  else if (gridH) layout += '-gridh';
  else if (gridV) layout += '-gridv';
  return layout;
}

// ─── Option button click (Orientation / Size) ───────────────────────────────
export function setPitchOpt(el) {
  const group = el.dataset.opt;
  document.querySelectorAll(`.pitch-opt[data-opt="${group}"]`).forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  updatePitchFromToggles();
}

// ─── Visual pitch thumbnail click (sets both orientation + size) ────────────
export function setPitchVisual(el) {
  const orient = el.dataset.pvOrient;
  const size = el.dataset.pvSize;
  // Update hidden pitch-opt buttons for getToggledLayout()
  document.querySelectorAll('.pitch-opt[data-opt="orientation"]').forEach(b => b.classList.remove('active'));
  document.querySelector(`.pitch-opt[data-opt="orientation"][data-val="${orient}"]`)?.classList.add('active');
  document.querySelectorAll('.pitch-opt[data-opt="size"]').forEach(b => b.classList.remove('active'));
  document.querySelector(`.pitch-opt[data-opt="size"][data-val="${size}"]`)?.classList.add('active');
  // Update visual grid active state
  document.querySelectorAll('.pitch-visual-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  updatePitchFromToggles();
}

// ─── Flip pitch direction ───────────────────────────────────────────────────
export function togglePitchFlip() {
  S.setPitchFlipped(!S.pitchFlipped);
  const btn = document.getElementById('pitch-flip-btn');
  if (btn) btn.classList.toggle('active', S.pitchFlipped);
  rebuildPitch();
}

// ─── Rebuild from current toggle states ─────────────────────────────────────
export function updatePitchFromToggles() {
  const layout = getToggledLayout();
  S.setCurrentPitchLayout(layout);
  rebuildPitch();
}

// ─── Legacy setPitch (used by storage.js for loading saved analyses) ────────
export function setPitch(layout, flipped) {
  // Migrate old half-h layouts → half-v (old half-h was vertical half, goal at bottom)
  if (layout.startsWith('half-h')) {
    layout = layout.replace('half-h', 'half-v');
  }
  S.setCurrentPitchLayout(layout);
  S.setPitchFlipped(!!flipped);

  // Sync toggles to match the loaded layout
  const isVertical = (/full-v|half-v|middle-v|3q-v/).test(layout);
  const isHalf = layout.startsWith('half');
  const isMiddle = layout.startsWith('middle');
  const is3Q = layout.startsWith('3q');
  const hasGridBoth = layout.includes('-grid') && !layout.includes('-gridh') && !layout.includes('-gridv');
  const hasGridH = hasGridBoth || layout.includes('-gridh');
  const hasGridV = hasGridBoth || layout.includes('-gridv');
  const hasGoals = !layout.includes('-ng');

  // Orientation
  document.querySelectorAll('.pitch-opt[data-opt="orientation"]').forEach(b => {
    b.classList.toggle('active', b.dataset.val === (isVertical ? 'vertical' : 'horizontal'));
  });
  // Size
  const sizeVal = isMiddle ? 'middle' : is3Q ? '3q' : isHalf ? 'half' : 'full';
  document.querySelectorAll('.pitch-opt[data-opt="size"]').forEach(b => {
    b.classList.toggle('active', b.dataset.val === sizeVal);
  });
  // Sync visual grid
  const orientVal = isVertical ? 'vertical' : 'horizontal';
  document.querySelectorAll('.pitch-visual-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.pvOrient === orientVal && b.dataset.pvSize === sizeVal);
  });
  // Sync flip button
  const flipBtn = document.getElementById('pitch-flip-btn');
  if (flipBtn) flipBtn.classList.toggle('active', S.pitchFlipped);
  // Toggles
  const gridHEl = document.getElementById('pitch-toggle-gridh');
  const gridVEl = document.getElementById('pitch-toggle-gridv');
  const goalsEl = document.getElementById('pitch-toggle-goals');
  if (gridHEl) gridHEl.checked = hasGridH;
  if (gridVEl) gridVEl.checked = hasGridV;
  if (goalsEl) goalsEl.checked = hasGoals;

  rebuildPitch();
}

export function setPitchColor(dotEl) {
  document.querySelectorAll('.pitch-color-dot').forEach(d => d.classList.remove('selected'));
  dotEl.classList.add('selected');
  const stripes = document.getElementById('pitch-toggle-stripes')?.checked;
  S.pitchColors.s1 = dotEl.dataset.s1;
  S.pitchColors.s2 = stripes ? (dotEl.dataset.s2s || dotEl.dataset.s1) : dotEl.dataset.s1;
  // Auto-switch line color when preset defines a default
  const defLine = dotEl.dataset.defaultLine;
  if (defLine) {
    S.pitchColors.line = defLine;
    // Sync the line dot selection
    const lineDot = document.querySelector(`.pitch-line-dot[data-line="${defLine}"]`);
    if (lineDot) {
      document.querySelectorAll('.pitch-line-dot').forEach(d => d.classList.remove('selected'));
      lineDot.classList.add('selected');
    }
  }
  rebuildPitch();
}

export function toggleStripes() {
  const stripes = document.getElementById('pitch-toggle-stripes')?.checked;
  const selectedDot = document.querySelector('.pitch-color-dot.selected');
  if (selectedDot) {
    S.pitchColors.s2 = stripes ? (selectedDot.dataset.s2s || S.pitchColors.s1) : S.pitchColors.s1;
  } else {
    // Custom color — auto-generate stripe shade
    S.pitchColors.s2 = stripes ? lighten(S.pitchColors.s1, 8) : S.pitchColors.s1;
  }
  rebuildPitch();
}

function lighten(color, amount) {
  // Simple hex lighten for custom colors
  if (color.startsWith('#') && color.length === 7) {
    const r = Math.min(255, parseInt(color.slice(1,3), 16) + amount);
    const g = Math.min(255, parseInt(color.slice(3,5), 16) + amount);
    const b = Math.min(255, parseInt(color.slice(5,7), 16) + amount);
    return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
  }
  return color;
}

export function setPitchLineColor(dotEl) {
  document.querySelectorAll('.pitch-line-dot').forEach(d => d.classList.remove('selected'));
  dotEl.classList.add('selected');
  S.pitchColors.line = dotEl.dataset.line;
  rebuildPitch();
}

export function rebuildPitch() {
  if (S.appMode === 'image') return;

  const svgEl = S.svg;
  const lay = S.currentPitchLayout;
  const isVertical = (/full-v|half-v|middle-v|3q-v/).test(lay);
  const isHalf = lay.startsWith('half');
  const isMiddle = lay.startsWith('middle');
  const is3Q = lay.startsWith('3q');
  const hasGoals = !lay.includes('-ng');
  const hasGridBoth = lay.includes('-grid') && !lay.includes('-gridh') && !lay.includes('-gridv');
  const hasGridH = hasGridBoth || lay.includes('-gridh');
  const hasGridV = hasGridBoth || lay.includes('-gridv');

  const pbHW = 130;  // penalty box half-width (~59% of pitch width, realistic proportions)
  const gaHW = 60;   // goal area half-width

  let W, H;
  if (isMiddle && !isVertical) {
    W = 350; H = 480;
  } else if (isMiddle && isVertical) {
    W = 480; H = 350;
  } else if (is3Q && !isVertical) {
    W = 550; H = 480;
  } else if (is3Q && isVertical) {
    W = 480; H = 550;
  } else if (isHalf && !isVertical) {
    W = 400; H = 480;  // horizontal half pitch (goal on right)
  } else if (isHalf && isVertical) {
    W = 480; H = 400;  // vertical half pitch (goal at bottom)
  } else if (isVertical) {
    W = 480; H = 680;
  } else {
    W = 700; H = 480;
  }

  svgEl.setAttribute('width', W);
  svgEl.setAttribute('height', H);
  svgEl.setAttribute('viewBox', `0 0 ${W} ${H}`);

  // Update stripe pattern — 9 stripes per half (18 total) like a real pitch
  const pat = document.getElementById('stripes');
  if (pat) {
    const vStripes = isVertical;  // vertical orientations get horizontal stripes
    const pitchLen = vStripes ? H : W;        // dimension along the pitch length
    const stripeW = Math.round(pitchLen / 18); // each visible stripe
    const pairW = stripeW * 2;                 // one light + one dark
    pat.setAttribute('width', vStripes ? pitchLen : String(pairW));
    pat.setAttribute('height', vStripes ? String(pairW) : pitchLen);
    pat.innerHTML = '';
    const r1 = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    const r2 = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    if (vStripes) {
      r1.setAttribute('width', pitchLen); r1.setAttribute('height', stripeW); r1.setAttribute('fill', S.pitchColors.s1);
      r2.setAttribute('y', stripeW); r2.setAttribute('width', pitchLen); r2.setAttribute('height', stripeW); r2.setAttribute('fill', S.pitchColors.s2);
    } else {
      r1.setAttribute('width', stripeW); r1.setAttribute('height', pitchLen); r1.setAttribute('fill', S.pitchColors.s1);
      r2.setAttribute('x', stripeW); r2.setAttribute('width', stripeW); r2.setAttribute('height', pitchLen); r2.setAttribute('fill', S.pitchColors.s2);
    }
    pat.appendChild(r1); pat.appendChild(r2);
  }

  // Update background rect
  const pitchBg = svgEl.querySelector('rect[fill="url(#stripes)"]');
  if (pitchBg) { pitchBg.setAttribute('width', W); pitchBg.setAttribute('height', H); }

  // Remove old markings (keep defs, objects-layer, players-layer)
  Array.from(svgEl.children).forEach(child => {
    if (child.tagName === 'defs' || child.id === 'objects-layer' || child.id === 'players-layer') return;
    child.remove();
  });

  // Recreate background
  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  bg.setAttribute('width', W); bg.setAttribute('height', H); bg.setAttribute('fill', 'url(#stripes)');
  svgEl.insertBefore(bg, document.getElementById('objects-layer'));

  // Markings group — flip transform applied here when pitch direction is flipped
  const markingsG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  markingsG.id = 'pitch-markings';
  if (S.pitchFlipped && (isHalf || is3Q)) {
    if (isVertical) {
      markingsG.setAttribute('transform', `translate(0,${H}) scale(1,-1)`);
    } else {
      markingsG.setAttribute('transform', `translate(${W},0) scale(-1,1)`);
    }
  }
  svgEl.insertBefore(markingsG, document.getElementById('objects-layer'));

  const LC = S.pitchColors.line;
  function mk(tag, attrs) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.entries(attrs).forEach(([k,v]) => el.setAttribute(k, v));
    markingsG.appendChild(el);
    return el;
  }

  if (isMiddle && !isVertical) {
    // ── Horizontal middle third (center zone only) ──
    // No left/right boundary (arbitrary cutoff) — only touchlines (top/bottom)
    const pad = 20, py = 20, pw = W - pad*2, ph = H - py*2;
    const cx = W/2, cy = H/2;
    mk('line',{x1:pad,y1:py,x2:pad+pw,y2:py,stroke:LC,'stroke-width':'1.5'});          // top touchline
    mk('line',{x1:pad,y1:py+ph,x2:pad+pw,y2:py+ph,stroke:LC,'stroke-width':'1.5'});    // bottom touchline
    // Center line (vertical)
    mk('line',{x1:cx,y1:py,x2:cx,y2:py+ph,stroke:LC,'stroke-width':'1.5'});
    // Center circle + spot
    mk('circle',{cx:cx,cy:cy,r:'55',fill:'none',stroke:LC,'stroke-width':'1.5'});
    mk('circle',{cx:cx,cy:cy,r:'2.5',fill:LC});
  } else if (isMiddle && isVertical) {
    // ── Vertical middle third ──
    // No top/bottom boundary (arbitrary cutoff) — only touchlines (left/right)
    const pad = 20, py = 20, pw = W - pad*2, ph = H - py*2;
    const cx = W/2, cy = H/2;
    mk('line',{x1:pad,y1:py,x2:pad,y2:py+ph,stroke:LC,'stroke-width':'1.5'});          // left touchline
    mk('line',{x1:pad+pw,y1:py,x2:pad+pw,y2:py+ph,stroke:LC,'stroke-width':'1.5'});    // right touchline
    // Center line (horizontal)
    mk('line',{x1:pad,y1:cy,x2:pad+pw,y2:cy,stroke:LC,'stroke-width':'1.5'});
    // Center circle + spot
    mk('circle',{cx:cx,cy:cy,r:'55',fill:'none',stroke:LC,'stroke-width':'1.5'});
    mk('circle',{cx:cx,cy:cy,r:'2.5',fill:LC});
  } else if (is3Q && !isVertical) {
    // ── Horizontal three-quarter pitch (goal on right) ──
    // No left boundary (arbitrary cutoff) — top, right, bottom are real lines
    const pad = 20, py = 20, pw = W - pad*2, ph = H - py*2;
    const cy = H/2;
    const R = pad + pw;    // right edge = goal line
    const halfX = pad + Math.round(pw * 0.33); // halfway line ~1/3 from left
    mk('line',{x1:pad,y1:py,x2:R,y2:py,stroke:LC,'stroke-width':'1.5'});               // top touchline
    mk('line',{x1:R,y1:py,x2:R,y2:py+ph,stroke:LC,'stroke-width':'1.5'});              // right goal line
    mk('line',{x1:pad,y1:py+ph,x2:R,y2:py+ph,stroke:LC,'stroke-width':'1.5'});         // bottom touchline
    // Halfway line
    mk('line',{x1:halfX,y1:py,x2:halfX,y2:py+ph,stroke:LC,'stroke-width':'1.5'});
    // Center circle + spot at halfway line
    mk('circle',{cx:halfX,cy:cy,r:'55',fill:'none',stroke:LC,'stroke-width':'1.5'});
    mk('circle',{cx:halfX,cy:cy,r:'2.5',fill:LC});
    // Right penalty box
    mk('path',{d:`M${R},${cy-pbHW} L${R-105},${cy-pbHW} L${R-105},${cy+pbHW} L${R},${cy+pbHW}`,fill:'none',stroke:LC,'stroke-width':'1.5'});
    mk('path',{d:`M${R},${cy-gaHW} L${R-40},${cy-gaHW} L${R-40},${cy+gaHW} L${R},${cy+gaHW}`,fill:'none',stroke:LC,'stroke-width':'1.5'});
    mk('circle',{cx:R-67,cy:cy,r:'2.5',fill:LC});
    const arcA3q = Math.acos(38/55);
    mk('path',{d:`M${R-105},${cy-55*Math.sin(arcA3q)} A55,55 0 0,0 ${R-105},${cy+55*Math.sin(arcA3q)}`,fill:'none',stroke:LC,'stroke-width':'1.5'});
    // Corner arcs on right
    mk('path',{d:`M${R-8},${py} A8,8 0 0,1 ${R},${py+8}`,fill:'none',stroke:LC,'stroke-width':'1.2'});
    mk('path',{d:`M${R},${py+ph-8} A8,8 0 0,1 ${R-8},${py+ph}`,fill:'none',stroke:LC,'stroke-width':'1.2'});
    // Goal
    if (hasGoals) mk('path',{d:`M${R},${cy-35} L${R+14},${cy-35} L${R+14},${cy+35} L${R},${cy+35}`,fill:'none',stroke:LC,'stroke-width':'1.5'});
  } else if (is3Q && isVertical) {
    // ── Vertical three-quarter pitch (goal at bottom) ──
    // No top boundary (arbitrary cutoff) — left, bottom, right are real lines
    const pad = 20, py = 20, pw = W - pad*2, ph = H - py*2;
    const cx = W/2;
    const B = py + ph;    // bottom edge = goal line
    const halfY = py + Math.round(ph * 0.33); // halfway line ~1/3 from top
    mk('line',{x1:pad,y1:py,x2:pad,y2:B,stroke:LC,'stroke-width':'1.5'});              // left touchline
    mk('line',{x1:pad,y1:B,x2:pad+pw,y2:B,stroke:LC,'stroke-width':'1.5'});            // bottom goal line
    mk('line',{x1:pad+pw,y1:py,x2:pad+pw,y2:B,stroke:LC,'stroke-width':'1.5'});        // right touchline
    // Halfway line
    mk('line',{x1:pad,y1:halfY,x2:pad+pw,y2:halfY,stroke:LC,'stroke-width':'1.5'});
    // Center circle + spot at halfway line
    mk('circle',{cx:cx,cy:halfY,r:'55',fill:'none',stroke:LC,'stroke-width':'1.5'});
    mk('circle',{cx:cx,cy:halfY,r:'2.5',fill:LC});
    // Bottom penalty box
    mk('path',{d:`M${cx-pbHW},${B} L${cx-pbHW},${B-105} L${cx+pbHW},${B-105} L${cx+pbHW},${B}`,fill:'none',stroke:LC,'stroke-width':'1.5'});
    mk('path',{d:`M${cx-gaHW},${B} L${cx-gaHW},${B-40} L${cx+gaHW},${B-40} L${cx+gaHW},${B}`,fill:'none',stroke:LC,'stroke-width':'1.5'});
    mk('circle',{cx:cx,cy:B-67,r:'2.5',fill:LC});
    const arcA3qv = Math.acos(38/55);
    mk('path',{d:`M${cx-55*Math.sin(arcA3qv)},${B-105} A55,55 0 0,1 ${cx+55*Math.sin(arcA3qv)},${B-105}`,fill:'none',stroke:LC,'stroke-width':'1.5'});
    // Corner arcs at bottom
    mk('path',{d:`M${pad},${B-8} A8,8 0 0,0 ${pad+8},${B}`,fill:'none',stroke:LC,'stroke-width':'1.2'});
    mk('path',{d:`M${pad+pw},${B-8} A8,8 0 0,1 ${pad+pw-8},${B}`,fill:'none',stroke:LC,'stroke-width':'1.2'});
    // Goal
    if (hasGoals) mk('path',{d:`M${cx-35},${B} L${cx-35},${B+14} L${cx+35},${B+14} L${cx+35},${B}`,fill:'none',stroke:LC,'stroke-width':'1.5'});
  } else if (isHalf && !isVertical) {
    // ── Horizontal half pitch (goal on right, halfway line on left) ──
    const pad = 20, py = 20, pw = W - pad*2, ph = H - py*2;
    const cy = H/2;
    const R = pad + pw;  // right edge = goal line
    mk('rect',{x:pad,y:py,width:pw,height:ph,fill:'none',stroke:LC,'stroke-width':'1.5'});
    // Penalty box (U-shape, open on right/boundary side)
    mk('path',{d:`M${R},${cy-pbHW} L${R-105},${cy-pbHW} L${R-105},${cy+pbHW} L${R},${cy+pbHW}`,fill:'none',stroke:LC,'stroke-width':'1.5'});
    mk('path',{d:`M${R},${cy-gaHW} L${R-40},${cy-gaHW} L${R-40},${cy+gaHW} L${R},${cy+gaHW}`,fill:'none',stroke:LC,'stroke-width':'1.5'});
    mk('circle',{cx:R-67,cy:cy,r:'2.5',fill:LC});
    const arcA = Math.acos(38/55);
    mk('path',{d:`M${R-105},${cy-55*Math.sin(arcA)} A55,55 0 0,0 ${R-105},${cy+55*Math.sin(arcA)}`,fill:'none',stroke:LC,'stroke-width':'1.5'});
    // Halfway line on left
    mk('line',{x1:pad,y1:py,x2:pad,y2:py+ph,stroke:LC,'stroke-width':'1.5'});
    // Center circle arc (right half, peeking from left edge)
    mk('path',{d:`M${pad},${cy-55} A55,55 0 0,1 ${pad},${cy+55}`,fill:'none',stroke:LC,'stroke-width':'1.5'});
    // Corner arcs on right
    mk('path',{d:`M${R-8},${py} A8,8 0 0,1 ${R},${py+8}`,fill:'none',stroke:LC,'stroke-width':'1.2'});
    mk('path',{d:`M${R},${py+ph-8} A8,8 0 0,1 ${R-8},${py+ph}`,fill:'none',stroke:LC,'stroke-width':'1.2'});
    // Goal (U-shape, open on boundary side)
    if (hasGoals) mk('path',{d:`M${R},${cy-35} L${R+14},${cy-35} L${R+14},${cy+35} L${R},${cy+35}`,fill:'none',stroke:LC,'stroke-width':'1.5'});
  } else if (isHalf && isVertical) {
    // ── Vertical half pitch (goal at bottom, halfway line at top) ──
    const pad = 20, py = 20, pw = W - pad*2, ph = H - py*2;
    const cx = W/2;
    const B = py + ph;
    mk('rect',{x:pad,y:py,width:pw,height:ph,fill:'none',stroke:LC,'stroke-width':'1.5'});
    // Penalty box (U-shape, open on bottom/boundary side)
    mk('path',{d:`M${cx-pbHW},${B} L${cx-pbHW},${B-105} L${cx+pbHW},${B-105} L${cx+pbHW},${B}`,fill:'none',stroke:LC,'stroke-width':'1.5'});
    mk('path',{d:`M${cx-gaHW},${B} L${cx-gaHW},${B-40} L${cx+gaHW},${B-40} L${cx+gaHW},${B}`,fill:'none',stroke:LC,'stroke-width':'1.5'});
    mk('circle',{cx:cx,cy:B-67,r:'2.5',fill:LC});
    const arcA = Math.acos(38/55);
    mk('path',{d:`M${cx-55*Math.sin(arcA)},${B-105} A55,55 0 0,1 ${cx+55*Math.sin(arcA)},${B-105}`,fill:'none',stroke:LC,'stroke-width':'1.5'});
    mk('line',{x1:pad,y1:py,x2:pad+pw,y2:py,stroke:LC,'stroke-width':'1.5'});
    mk('path',{d:`M${cx-55},${py} A55,55 0 0,0 ${cx+55},${py}`,fill:'none',stroke:LC,'stroke-width':'1.5'});
    mk('path',{d:`M${pad},${B-8} A8,8 0 0,0 ${pad+8},${B}`,fill:'none',stroke:LC,'stroke-width':'1.2'});
    mk('path',{d:`M${pad+pw},${B-8} A8,8 0 0,1 ${pad+pw-8},${B}`,fill:'none',stroke:LC,'stroke-width':'1.2'});
    // Goal (U-shape, open on boundary side)
    if (hasGoals) mk('path',{d:`M${cx-35},${B} L${cx-35},${B+14} L${cx+35},${B+14} L${cx+35},${B}`,fill:'none',stroke:LC,'stroke-width':'1.5'});
  } else if (!isVertical) {
    // ── Full horizontal pitch ──
    const pad = 30, py = 20, pw = W - pad*2, ph = H - py*2;
    const cx = W/2, cy = H/2;
    const L = pad, R = pad+pw, T = py, B = py+ph;
    mk('rect',{x:L,y:T,width:pw,height:ph,fill:'none',stroke:LC,'stroke-width':'1.5'});
    mk('line',{x1:cx,y1:T,x2:cx,y2:B,stroke:LC,'stroke-width':'1.5'});
    mk('circle',{cx:cx,cy:cy,r:'55',fill:'none',stroke:LC,'stroke-width':'1.5'});
    mk('circle',{cx:cx,cy:cy,r:'3',fill:LC});
    // Left penalty box (U-shape, open on left/boundary side)
    mk('path',{d:`M${L},${cy-pbHW} L${L+105},${cy-pbHW} L${L+105},${cy+pbHW} L${L},${cy+pbHW}`,fill:'none',stroke:LC,'stroke-width':'1.5'});
    mk('path',{d:`M${L},${cy-gaHW} L${L+40},${cy-gaHW} L${L+40},${cy+gaHW} L${L},${cy+gaHW}`,fill:'none',stroke:LC,'stroke-width':'1.5'});
    mk('circle',{cx:L+67,cy:cy,r:'2.5',fill:LC});
    mk('path',{d:`M${L+105},${cy-28} A55,55 0 0,1 ${L+105},${cy+28}`,fill:'none',stroke:LC,'stroke-width':'1.5'});
    // Right penalty box (U-shape, open on right/boundary side)
    mk('path',{d:`M${R},${cy-pbHW} L${R-105},${cy-pbHW} L${R-105},${cy+pbHW} L${R},${cy+pbHW}`,fill:'none',stroke:LC,'stroke-width':'1.5'});
    mk('path',{d:`M${R},${cy-gaHW} L${R-40},${cy-gaHW} L${R-40},${cy+gaHW} L${R},${cy+gaHW}`,fill:'none',stroke:LC,'stroke-width':'1.5'});
    mk('circle',{cx:R-67,cy:cy,r:'2.5',fill:LC});
    mk('path',{d:`M${R-105},${cy-28} A55,55 0 0,0 ${R-105},${cy+28}`,fill:'none',stroke:LC,'stroke-width':'1.5'});
    mk('path',{d:`M${L},${T+8} A8,8 0 0,1 ${L+8},${T}`,fill:'none',stroke:LC,'stroke-width':'1.2'});
    mk('path',{d:`M${R-8},${T} A8,8 0 0,1 ${R},${T+8}`,fill:'none',stroke:LC,'stroke-width':'1.2'});
    mk('path',{d:`M${L},${B-8} A8,8 0 0,0 ${L+8},${B}`,fill:'none',stroke:LC,'stroke-width':'1.2'});
    mk('path',{d:`M${R-8},${B} A8,8 0 0,0 ${R},${B-8}`,fill:'none',stroke:LC,'stroke-width':'1.2'});
    // Goals (U-shape, open on boundary side)
    if (hasGoals) mk('path',{d:`M${L},${cy-35} L${L-14},${cy-35} L${L-14},${cy+35} L${L},${cy+35}`,fill:'none',stroke:LC,'stroke-width':'1.5'});
    if (hasGoals) mk('path',{d:`M${R},${cy-35} L${R+14},${cy-35} L${R+14},${cy+35} L${R},${cy+35}`,fill:'none',stroke:LC,'stroke-width':'1.5'});
  } else {
    // ── Full vertical pitch ──
    const pad = 20, px = 20, pw = W - pad*2, ph = H - px*2;
    const cx = W/2, cy = H/2;
    const L = pad, R = pad+pw, T = px, B = px+ph;
    mk('rect',{x:L,y:T,width:pw,height:ph,fill:'none',stroke:LC,'stroke-width':'1.5'});
    mk('line',{x1:L,y1:cy,x2:R,y2:cy,stroke:LC,'stroke-width':'1.5'});
    mk('circle',{cx:cx,cy:cy,r:'55',fill:'none',stroke:LC,'stroke-width':'1.5'});
    mk('circle',{cx:cx,cy:cy,r:'3',fill:LC});
    // Top penalty box (U-shape, open on top/boundary side)
    mk('path',{d:`M${cx-pbHW},${T} L${cx-pbHW},${T+105} L${cx+pbHW},${T+105} L${cx+pbHW},${T}`,fill:'none',stroke:LC,'stroke-width':'1.5'});
    mk('path',{d:`M${cx-gaHW},${T} L${cx-gaHW},${T+40} L${cx+gaHW},${T+40} L${cx+gaHW},${T}`,fill:'none',stroke:LC,'stroke-width':'1.5'});
    mk('circle',{cx:cx,cy:T+67,r:'2.5',fill:LC});
    mk('path',{d:`M${cx-28},${T+105} A55,55 0 0,0 ${cx+28},${T+105}`,fill:'none',stroke:LC,'stroke-width':'1.5'});
    // Bottom penalty box (U-shape, open on bottom/boundary side)
    mk('path',{d:`M${cx-pbHW},${B} L${cx-pbHW},${B-105} L${cx+pbHW},${B-105} L${cx+pbHW},${B}`,fill:'none',stroke:LC,'stroke-width':'1.5'});
    mk('path',{d:`M${cx-gaHW},${B} L${cx-gaHW},${B-40} L${cx+gaHW},${B-40} L${cx+gaHW},${B}`,fill:'none',stroke:LC,'stroke-width':'1.5'});
    mk('circle',{cx:cx,cy:B-67,r:'2.5',fill:LC});
    mk('path',{d:`M${cx-28},${B-105} A55,55 0 0,1 ${cx+28},${B-105}`,fill:'none',stroke:LC,'stroke-width':'1.5'});
    mk('path',{d:`M${L+8},${T} A8,8 0 0,0 ${L},${T+8}`,fill:'none',stroke:LC,'stroke-width':'1.2'});
    mk('path',{d:`M${R-8},${T} A8,8 0 0,1 ${R},${T+8}`,fill:'none',stroke:LC,'stroke-width':'1.2'});
    mk('path',{d:`M${L},${B-8} A8,8 0 0,0 ${L+8},${B}`,fill:'none',stroke:LC,'stroke-width':'1.2'});
    mk('path',{d:`M${R},${B-8} A8,8 0 0,1 ${R-8},${B}`,fill:'none',stroke:LC,'stroke-width':'1.2'});
    // Goals (U-shape, open on boundary side)
    if (hasGoals) mk('path',{d:`M${cx-35},${T} L${cx-35},${T-14} L${cx+35},${T-14} L${cx+35},${T}`,fill:'none',stroke:LC,'stroke-width':'1.5'});
    if (hasGoals) mk('path',{d:`M${cx-35},${B} L${cx-35},${B+14} L${cx+35},${B+14} L${cx+35},${B}`,fill:'none',stroke:LC,'stroke-width':'1.5'});
  }

  // ── Grid lines (horizontal and/or vertical) ──
  if (hasGridH || hasGridV) {
    const gridColor = LC.replace(/[\d.]+\)$/, m => `${parseFloat(m)*0.55})`);
    const dashAttr = '6,4';
    const ga = {'stroke-width':'1','stroke-dasharray':dashAttr, stroke:gridColor};

    // Grid labels are pitch-relative: on horizontal pitches we swap screen directions
    // so "Horizontal grid" draws vertical screen lines (across pitch width) and vice versa
    const gH = isVertical ? hasGridH : hasGridV;  // horizontal screen lines
    const gV = isVertical ? hasGridV : hasGridH;  // vertical screen lines

    if (isMiddle && !isVertical) {
      // Horizontal middle third — even thirds
      const pad=20, py=20, pw=W-pad*2, ph=H-py*2;
      if (gH) {
        for (let i=1; i<=2; i++) mk('line',{x1:pad,y1:py+ph*i/3,x2:pad+pw,y2:py+ph*i/3,...ga});
      }
      if (gV) {
        for (let i=1; i<=2; i++) mk('line',{x1:pad+pw*i/3,y1:py,x2:pad+pw*i/3,y2:py+ph,...ga});
      }
    } else if (isMiddle && isVertical) {
      // Vertical middle third
      const pad=20, py=20, pw=W-pad*2, ph=H-py*2;
      if (gH) {
        for (let i=1; i<=2; i++) mk('line',{x1:pad,y1:py+ph*i/3,x2:pad+pw,y2:py+ph*i/3,...ga});
      }
      if (gV) {
        for (let i=1; i<=2; i++) mk('line',{x1:pad+pw*i/3,y1:py,x2:pad+pw*i/3,y2:py+ph,...ga});
      }
    } else if (is3Q && !isVertical) {
      // Horizontal three-quarter
      const pad=20, py=20, pw=W-pad*2, ph=H-py*2, cy=H/2;
      if (gH) {
        [cy-pbHW, cy-gaHW, cy+gaHW, cy+pbHW].forEach(y => {
          mk('line',{x1:pad,y1:y,x2:pad+pw,y2:y,...ga});
        });
      }
      if (gV) {
        for (let i=1; i<=2; i++) mk('line',{x1:pad+pw*i/3,y1:py,x2:pad+pw*i/3,y2:py+ph,...ga});
      }
    } else if (is3Q && isVertical) {
      // Vertical three-quarter
      const pad=20, py=20, pw=W-pad*2, ph=H-py*2, cx=W/2;
      if (gH) {
        for (let i=1; i<=2; i++) mk('line',{x1:pad,y1:py+ph*i/3,x2:pad+pw,y2:py+ph*i/3,...ga});
      }
      if (gV) {
        [cx-pbHW, cx-gaHW, cx+gaHW, cx+pbHW].forEach(x => {
          mk('line',{x1:x,y1:py,x2:x,y2:py+ph,...ga});
        });
      }
    } else if (isHalf && !isVertical) {
      // Horizontal half pitch
      const pad=20, py=20, pw=W-pad*2, ph=H-py*2, cy=H/2;
      if (gH) {
        [cy-pbHW, cy-gaHW, cy+gaHW, cy+pbHW].forEach(y => {
          mk('line',{x1:pad,y1:y,x2:pad+pw,y2:y,...ga});
        });
      }
      if (gV) {
        for (let i=1; i<=2; i++) {
          mk('line',{x1:pad+pw*i/3,y1:py,x2:pad+pw*i/3,y2:py+ph,...ga});
        }
      }
    } else if (isHalf && isVertical) {
      // Vertical half pitch
      const pad=20, py=20, pw=W-pad*2, ph=H-py*2, cx=W/2;
      if (gH) {
        for (let i=1; i<=2; i++) {
          mk('line',{x1:pad,y1:py+ph*i/3,x2:pad+pw,y2:py+ph*i/3,...ga});
        }
      }
      if (gV) {
        [cx-pbHW, cx-gaHW, cx+gaHW, cx+pbHW].forEach(x => {
          mk('line',{x1:x,y1:py,x2:x,y2:py+ph,...ga});
        });
      }
    } else if (isVertical) {
      // Full vertical
      const pad=20, px=20, pw=W-pad*2, ph=H-px*2, cx=W/2;
      if (gH) {
        for (let i=1; i<=2; i++) {
          mk('line',{x1:pad,y1:px+ph*i/3,x2:pad+pw,y2:px+ph*i/3,...ga});
        }
      }
      if (gV) {
        [cx-pbHW, cx-gaHW, cx+gaHW, cx+pbHW].forEach(x => {
          mk('line',{x1:x,y1:px,x2:x,y2:px+ph,...ga});
        });
      }
    } else {
      // Full horizontal
      const pad=30, py=20, pw=W-pad*2, ph=H-py*2, cy=H/2;
      if (gH) {
        [cy-pbHW, cy-gaHW, cy+gaHW, cy+pbHW].forEach(y => {
          mk('line',{x1:pad,y1:y,x2:pad+pw,y2:y,...ga});
        });
      }
      if (gV) {
        for (let i=1; i<=2; i++) {
          mk('line',{x1:pad+pw*i/3,y1:py,x2:pad+pw*i/3,y2:py+ph,...ga});
        }
      }
    }
  }

  // Re-append layers at the end
  svgEl.appendChild(document.getElementById('objects-layer'));
  svgEl.appendChild(document.getElementById('players-layer'));
}

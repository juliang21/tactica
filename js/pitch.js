import * as S from './state.js';
import { canAccess, showUpgradePrompt } from './subscription.js';

export function setPitch(layout) {
  // Check freemium gating
  const featureId = 'pitch:' + layout;
  if (!canAccess(featureId)) {
    showUpgradePrompt(layoutLabel(layout) + ' pitch');
    return;
  }
  S.setCurrentPitchLayout(layout);
  document.querySelectorAll('.pitch-thumb').forEach(t => t.classList.remove('selected'));
  const el = document.getElementById('pt-' + layout);
  if (el) el.classList.add('selected');
  rebuildPitch();
}

function layoutLabel(id) {
  const labels = {
    'full-h': 'Full Horizontal',
    'full-v': 'Full Vertical',
    'full-h-nd': 'Full H (No D)',
    'full-v-nd': 'Full V (No D)',
    'half-h': 'Half Pitch',
    'half-h-nd': 'Half (No D)',
    'half-h-ng': 'Half (No Goal)',
    'half-h-ng-nd': 'Half (Clean)',
  };
  return labels[id] || id;
}

export function setPitchColor(dotEl) {
  document.querySelectorAll('.pitch-color-dot').forEach(d => d.classList.remove('selected'));
  dotEl.classList.add('selected');
  S.pitchColors.s1 = dotEl.dataset.s1;
  S.pitchColors.s2 = dotEl.dataset.s2;
  S.pitchColors.line = dotEl.dataset.line;
  rebuildPitch();
}

export function rebuildPitch() {
  if (S.appMode === 'image') return;

  const svgEl = S.svg;
  const lay = S.currentPitchLayout;
  const isVertical = lay.includes('full-v');
  const isHalf = lay.startsWith('half');
  const hasGoals = !lay.includes('-ng');
  const hasD = !lay.includes('-nd');

  let W, H;
  if (isHalf) {
    W = 480; H = 400;  // vertical half pitch (wider than tall)
  } else if (isVertical) {
    W = 480; H = 680;
  } else {
    W = 700; H = 480;
  }

  svgEl.setAttribute('width', W);
  svgEl.setAttribute('height', H);
  svgEl.setAttribute('viewBox', `0 0 ${W} ${H}`);

  // Update stripe pattern
  const pat = document.getElementById('stripes');
  if (pat) {
    const vStripes = isVertical || isHalf;  // half pitch is also vertical
    pat.setAttribute('width', vStripes ? H : '40');
    pat.setAttribute('height', vStripes ? '40' : H);
    pat.innerHTML = '';
    const r1 = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    const r2 = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    if (vStripes) {
      r1.setAttribute('width', H); r1.setAttribute('height', '20'); r1.setAttribute('fill', S.pitchColors.s1);
      r2.setAttribute('y', '20'); r2.setAttribute('width', H); r2.setAttribute('height', '20'); r2.setAttribute('fill', S.pitchColors.s2);
    } else {
      r1.setAttribute('width', '20'); r1.setAttribute('height', H); r1.setAttribute('fill', S.pitchColors.s1);
      r2.setAttribute('x', '20'); r2.setAttribute('width', '20'); r2.setAttribute('height', H); r2.setAttribute('fill', S.pitchColors.s2);
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

  const LC = S.pitchColors.line;
  function mk(tag, attrs) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.entries(attrs).forEach(([k,v]) => el.setAttribute(k, v));
    svgEl.insertBefore(el, document.getElementById('objects-layer'));
    return el;
  }

  if (isHalf) {
    // ── Half pitch (vertical: goal at bottom, halfway line at top) ──
    // Uses same proportions as full vertical pitch, cropped to one half
    const pad = 20, py = 20, pw = W - pad*2, ph = H - py*2;
    const cx = W/2;
    const bot = py + ph;  // bottom of field = goal line

    // Outer boundary
    mk('rect',{x:pad,y:py,width:pw,height:ph,fill:'none',stroke:LC,'stroke-width':'2'});
    // Penalty area (200×105 from full pitch, centered at bottom)
    mk('rect',{x:cx-100,y:bot-105,width:200,height:105,fill:'none',stroke:LC,'stroke-width':'1.5'});
    // Goal area (110×40, centered at bottom)
    mk('rect',{x:cx-55,y:bot-40,width:110,height:40,fill:'none',stroke:LC,'stroke-width':'1.5'});
    // Penalty spot
    mk('circle',{cx:cx,cy:bot-67,r:'2.5',fill:LC});
    // Penalty arc (part outside penalty area)
    if (hasD) {
      const arcA = Math.acos(38/55);
      mk('path',{d:`M${cx-55*Math.sin(arcA)},${bot-105} A55,55 0 0,1 ${cx+55*Math.sin(arcA)},${bot-105}`,fill:'none',stroke:LC,'stroke-width':'1.5'});
    }
    // Halfway line at top
    mk('line',{x1:pad,y1:py,x2:pad+pw,y2:py,stroke:LC,'stroke-width':'1.5'});
    // Center circle arc (bottom half of circle, peeking into the half)
    mk('path',{d:`M${cx-55},${py} A55,55 0 0,0 ${cx+55},${py}`,fill:'none',stroke:LC,'stroke-width':'1.5'});
    // Corner arcs at bottom
    mk('path',{d:`M${pad},${bot-8} A8,8 0 0,0 ${pad+8},${bot}`,fill:'none',stroke:LC,'stroke-width':'1.2'});
    mk('path',{d:`M${pad+pw},${bot-8} A8,8 0 0,1 ${pad+pw-8},${bot}`,fill:'none',stroke:LC,'stroke-width':'1.2'});
    // Goal
    if (hasGoals) {
      mk('rect',{x:cx-35,y:bot,width:70,height:14,fill:'none',stroke:LC,'stroke-width':'1.5'});
    }
  } else if (!isVertical) {
    // ── Full horizontal pitch ──
    const pad = 30, py = 20, pw = W - pad*2, ph = H - py*2;
    const cx = W/2, cy = H/2;
    mk('rect',{x:pad,y:py,width:pw,height:ph,fill:'none',stroke:LC,'stroke-width':'2'});
    mk('line',{x1:cx,y1:py,x2:cx,y2:py+ph,stroke:LC,'stroke-width':'1.5'});
    mk('circle',{cx:cx,cy:cy,r:'55',fill:'none',stroke:LC,'stroke-width':'1.5'});
    mk('circle',{cx:cx,cy:cy,r:'3',fill:LC});
    mk('rect',{x:pad,y:cy-100,width:105,height:200,fill:'none',stroke:LC,'stroke-width':'1.5'});
    mk('rect',{x:pad,y:cy-55,width:40,height:110,fill:'none',stroke:LC,'stroke-width':'1.5'});
    mk('circle',{cx:pad+67,cy:cy,r:'2.5',fill:LC});
    if (hasD) mk('path',{d:`M${pad+105},${cy-28} A55,55 0 0,1 ${pad+105},${cy+28}`,fill:'none',stroke:LC,'stroke-width':'1.5'});
    mk('rect',{x:pad+pw-105,y:cy-100,width:105,height:200,fill:'none',stroke:LC,'stroke-width':'1.5'});
    mk('rect',{x:pad+pw-40,y:cy-55,width:40,height:110,fill:'none',stroke:LC,'stroke-width':'1.5'});
    mk('circle',{cx:pad+pw-67,cy:cy,r:'2.5',fill:LC});
    if (hasD) mk('path',{d:`M${pad+pw-105},${cy-28} A55,55 0 0,0 ${pad+pw-105},${cy+28}`,fill:'none',stroke:LC,'stroke-width':'1.5'});
    if (hasGoals) mk('rect',{x:pad-14,y:cy-35,width:14,height:70,fill:'none',stroke:LC,'stroke-width':'1.5'});
    if (hasGoals) mk('rect',{x:pad+pw,y:cy-35,width:14,height:70,fill:'none',stroke:LC,'stroke-width':'1.5'});
    mk('path',{d:`M${pad},${py+8} A8,8 0 0,1 ${pad+8},${py}`,fill:'none',stroke:LC,'stroke-width':'1.2'});
    mk('path',{d:`M${pad+pw-8},${py} A8,8 0 0,1 ${pad+pw},${py+8}`,fill:'none',stroke:LC,'stroke-width':'1.2'});
    mk('path',{d:`M${pad},${py+ph-8} A8,8 0 0,0 ${pad+8},${py+ph}`,fill:'none',stroke:LC,'stroke-width':'1.2'});
    mk('path',{d:`M${pad+pw-8},${py+ph} A8,8 0 0,0 ${pad+pw},${py+ph-8}`,fill:'none',stroke:LC,'stroke-width':'1.2'});
  } else {
    // ── Full vertical pitch ──
    const pad = 20, px = 20, pw = W - pad*2, ph = H - px*2;
    const cx = W/2, cy = H/2;
    mk('rect',{x:pad,y:px,width:pw,height:ph,fill:'none',stroke:LC,'stroke-width':'2'});
    mk('line',{x1:pad,y1:cy,x2:pad+pw,y2:cy,stroke:LC,'stroke-width':'1.5'});
    mk('circle',{cx:cx,cy:cy,r:'55',fill:'none',stroke:LC,'stroke-width':'1.5'});
    mk('circle',{cx:cx,cy:cy,r:'3',fill:LC});
    mk('rect',{x:cx-100,y:px,width:200,height:105,fill:'none',stroke:LC,'stroke-width':'1.5'});
    mk('rect',{x:cx-55,y:px,width:110,height:40,fill:'none',stroke:LC,'stroke-width':'1.5'});
    mk('circle',{cx:cx,cy:px+67,r:'2.5',fill:LC});
    if (hasD) mk('path',{d:`M${cx-28},${px+105} A55,55 0 0,0 ${cx+28},${px+105}`,fill:'none',stroke:LC,'stroke-width':'1.5'});
    mk('rect',{x:cx-100,y:px+ph-105,width:200,height:105,fill:'none',stroke:LC,'stroke-width':'1.5'});
    mk('rect',{x:cx-55,y:px+ph-40,width:110,height:40,fill:'none',stroke:LC,'stroke-width':'1.5'});
    mk('circle',{cx:cx,cy:px+ph-67,r:'2.5',fill:LC});
    if (hasD) mk('path',{d:`M${cx-28},${px+ph-105} A55,55 0 0,1 ${cx+28},${px+ph-105}`,fill:'none',stroke:LC,'stroke-width':'1.5'});
    if (hasGoals) mk('rect',{x:cx-35,y:px-14,width:70,height:14,fill:'none',stroke:LC,'stroke-width':'1.5'});
    if (hasGoals) mk('rect',{x:cx-35,y:px+ph,width:70,height:14,fill:'none',stroke:LC,'stroke-width':'1.5'});
    mk('path',{d:`M${pad+8},${px} A8,8 0 0,0 ${pad},${px+8}`,fill:'none',stroke:LC,'stroke-width':'1.2'});
    mk('path',{d:`M${pad+pw-8},${px} A8,8 0 0,1 ${pad+pw},${px+8}`,fill:'none',stroke:LC,'stroke-width':'1.2'});
    mk('path',{d:`M${pad},${px+ph-8} A8,8 0 0,0 ${pad+8},${px+ph}`,fill:'none',stroke:LC,'stroke-width':'1.2'});
    mk('path',{d:`M${pad+pw},${px+ph-8} A8,8 0 0,1 ${pad+pw-8},${px+ph}`,fill:'none',stroke:LC,'stroke-width':'1.2'});
  }

  // Re-append layers at the end
  svgEl.appendChild(document.getElementById('objects-layer'));
  svgEl.appendChild(document.getElementById('players-layer'));
}

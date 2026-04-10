import * as S from './state.js';
import { trackElementSelected } from './analytics.js';

// ─── Textbox rewrap callback (set from app.js to avoid circular import) ──────
let _rewrapFn = null;
let _selectTrackFn = null;
export function registerSelectTracker(fn) { _selectTrackFn = fn; }
export function registerRewrap(fn) { _rewrapFn = fn; }

// ─── Vision polygon update callback ─────────────────────────────────────────
let _updateVisionFn = null;
export function registerVisionUpdate(fn) { _updateVisionFn = fn; }

// ─── Link update callback ──────────────────────────────────────────────────
let _updateAllLinksFn = null;
export function registerLinkUpdate(fn) { _updateAllLinksFn = fn; }

// ─── Select team context callback (set from app.js to avoid circular import) ─
let _selectTeamContextFn = null;
export function registerSelectTeamContext(fn) { _selectTeamContextFn = fn; }

// ─── Headline rewrap callback ──────────────────────────────────────────────
let _rewrapHeadlineFn = null;
export function registerHeadlineRewrap(fn) { _rewrapHeadlineFn = fn; }

// ─── Tag reposition callback ──────────────────────────────────────────────
let _repositionTagFn = null;
export function registerTagReposition(fn) { _repositionTagFn = fn; }

// ─── Freeform path update callback ─────────────────────────────────────────
let _updateFreeformFn = null;
export function registerFreeformUpdate(fn) { _updateFreeformFn = fn; }

// ─── Motion visual update callback ─────────────────────────────────────────
let _updateMotionFn = null;
export function registerMotionUpdate(fn) { _updateMotionFn = fn; }

// ─── Spotlight name background helper ─────────────────────────────────────────
export function updateSpotlightNameBg(g) {
  const nl = g.querySelector('.spotlight-name');
  let bgRect = g.querySelector('.spotlight-name-bg');

  if (!nl || nl.style.display === 'none') {
    if (bgRect) bgRect.style.display = 'none';
    return;
  }

  // Default to dark bg unless explicitly set to 'none'
  const bgColor = g.dataset.spotNameBg || 'rgba(0,0,0,0.5)';

  if (bgColor === 'none') {
    if (bgRect) bgRect.style.display = 'none';
    return;
  }

  const bbox = nl.getBBox();
  if (!bbox.width) {
    if (bgRect) bgRect.style.display = 'none';
    return;
  }

  if (!bgRect) {
    bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bgRect.setAttribute('class', 'spotlight-name-bg');
    bgRect.setAttribute('rx', '4'); bgRect.setAttribute('ry', '4');
    bgRect.setAttribute('pointer-events', 'none');
    g.insertBefore(bgRect, nl);
  }
  bgRect.style.display = '';
  bgRect.setAttribute('x', bbox.x - 5);
  bgRect.setAttribute('y', bbox.y - 2);
  bgRect.setAttribute('width', bbox.width + 10);
  bgRect.setAttribute('height', bbox.height + 4);
  bgRect.setAttribute('fill', bgColor);
}

// ─── Transforms ───────────────────────────────────────────────────────────────
export function applyTransform(el) {
  const cx = parseFloat(el.dataset.cx), cy = parseFloat(el.dataset.cy);
  const scale = parseFloat(el.dataset.scale || '1');
  const rot = parseFloat(el.dataset.rotation || '0');
  const t = el.dataset.type;

  if (t === 'player' || t === 'referee' || t === 'ball' || t === 'cone') {
    el.setAttribute('transform', `translate(${cx},${cy}) scale(${scale})`);
  } else if (t === 'tag') {
    if (_repositionTagFn) _repositionTagFn(el);
  } else if (t === 'vision') {
    // Vision uses absolute polygon points (no transform needed)
    el.removeAttribute('transform');
    if (_updateVisionFn) _updateVisionFn(el);
  } else if (t === 'textbox') {
    // Textbox uses zone-style absolute positioning
    if (_rewrapFn) _rewrapFn(el);
  } else if (t === 'headline') {
    if (_rewrapHeadlineFn) _rewrapHeadlineFn(el);
  } else if (t === 'shadow-circle') {
    const sh = el.querySelector('ellipse');
    const hw = parseFloat(el.dataset.hw || '30') * scale;
    const hh = parseFloat(el.dataset.hh || '20') * scale;
    sh.setAttribute('cx', cx); sh.setAttribute('cy', cy);
    sh.setAttribute('rx', hw); sh.setAttribute('ry', hh);
    sh.setAttribute('transform', `rotate(${rot},${cx},${cy})`);
  } else if (t === 'freeform') {
    if (_updateFreeformFn) _updateFreeformFn(el);
  } else if (t === 'motion') {
    if (_updateMotionFn) _updateMotionFn(el);
  } else if (t === 'shadow-rect') {
    const sh = el.querySelector('rect');
    const hw = parseFloat(el.dataset.hw || '30') * scale;
    const hh = parseFloat(el.dataset.hh || '20') * scale;
    sh.setAttribute('x', cx-hw); sh.setAttribute('y', cy-hh);
    sh.setAttribute('width', hw*2); sh.setAttribute('height', hh*2);
    sh.setAttribute('transform', `rotate(${rot},${cx},${cy})`);
  } else if (t === 'spotlight') {
    const rx = parseFloat(el.dataset.rx || '28') * scale;
    const ry = parseFloat(el.dataset.ry || '5') * scale;
    const sourceW = 6;
    const beamW = rx * 2;

    // Update cone beam path
    const beam = el.querySelector('.spotlight-beam') || el.querySelector('path');
    if (beam) {
      beam.setAttribute('d', `M ${cx - sourceW} 0 L ${cx - beamW/2} ${cy} L ${cx + beamW/2} ${cy} L ${cx + sourceW} 0 Z`);
    }

    // Update glow ellipse (1.5x ring width)
    const glow = el.querySelector('.spotlight-glow');
    if (glow) {
      glow.setAttribute('cx', cx); glow.setAttribute('cy', cy);
      glow.setAttribute('rx', rx * 1.5); glow.setAttribute('ry', ry * 3);
    }

    // Update ring ellipse
    const ring = el.querySelector('.spotlight-ring') || el.querySelector('ellipse:not(.spotlight-glow)');
    if (ring) {
      ring.setAttribute('cx', cx); ring.setAttribute('cy', cy);
      ring.setAttribute('rx', rx); ring.setAttribute('ry', ry);
    }

    // Reposition name label
    const nameTxt = el.querySelector('.spotlight-name');
    if (nameTxt) {
      nameTxt.setAttribute('x', cx);
      nameTxt.setAttribute('y', cy + ry + 10);
    }
    // Reposition name bg
    updateSpotlightNameBg(el);
  }
}

export function updateArrowVisual(el) {
  const cx = parseFloat(el.dataset.cx), cy = parseFloat(el.dataset.cy);
  const dx1 = parseFloat(el.dataset.dx1), dy1 = parseFloat(el.dataset.dy1);
  const dx2 = parseFloat(el.dataset.dx2), dy2 = parseFloat(el.dataset.dy2);
  const sc = parseFloat(el.dataset.scale || '1');
  const rot = parseFloat(el.dataset.rotation || '0') * Math.PI / 180;
  const k = parseFloat(el.dataset.curve || '0');
  const tfm = (dx, dy) => ({
    x: cx + (dx*sc)*Math.cos(rot) - (dy*sc)*Math.sin(rot),
    y: cy + (dx*sc)*Math.sin(rot) + (dy*sc)*Math.cos(rot)
  });
  const p1 = tfm(dx1, dy1), p2 = tfm(dx2, dy2);

  // Compute control point for quadratic bezier
  const cp = arrowControlPoint(p1, p2, k);
  const d = `M${p1.x},${p1.y} Q${cp.x},${cp.y} ${p2.x},${p2.y}`;

  el.querySelectorAll('.arrow-line, .arrow-hit').forEach(p => {
    p.setAttribute('d', d);
  });
}

// Compute the quadratic bezier control point from endpoints and curvature k
export function arrowControlPoint(p1, p2, k) {
  const midX = (p1.x + p2.x) / 2;
  const midY = (p1.y + p2.y) / 2;
  let perpX = -(p2.y - p1.y);
  let perpY = p2.x - p1.x;
  const len = Math.sqrt(perpX * perpX + perpY * perpY);
  if (len < 1) return { x: midX, y: midY };
  perpX /= len; perpY /= len;
  return { x: midX + k * perpX, y: midY + k * perpY };
}

function moveElement(el, nx, ny) {
  el.dataset.cx = nx; el.dataset.cy = ny;
  const t = el.dataset.type;
  if (t === 'player' || t === 'referee' || t === 'ball' || t === 'cone' || t === 'vision') applyTransform(el);
  else if (t === 'textbox') applyTransform(el);
  else if (t === 'headline') applyTransform(el);
  else if (t === 'arrow') updateArrowVisual(el);
  else if (t === 'motion') applyTransform(el);
  else if (t === 'spotlight') applyTransform(el);
  else if (t === 'tag') applyTransform(el);
  else if (t === 'freeform') applyTransform(el);
  else if (t.startsWith('shadow')) applyTransform(el);
}

// ─── Multi-drag offsets ─────────────────────────────────────────────────────
const _dragOffsets = new Map(); // el → { dx, dy }

// ─── Marquee state ──────────────────────────────────────────────────────────
let _marquee = null;      // SVG rect element
let _marqueeOrigin = null; // { x, y } in SVG coords

// ─── Selection ────────────────────────────────────────────────────────────────
export function select(el, opts = {}) {
  const additive = opts.additive || false;

  if (additive) {
    // Toggle: if already selected, remove it
    if (S.selectedEls.has(el)) {
      deselectVisual(el);
      S.removeSelectedEl(el);
      // Update primary to another element or null
      if (S.selectedEl === el) {
        const remaining = [...S.selectedEls];
        S.setSelectedEl(remaining.length ? remaining[remaining.length - 1] : null);
      }
      _updateMultiSelectUI();
      return;
    }
    // Add to selection (don't deselect previous)
    S.addSelectedEl(el);
    S.setSelectedEl(el);
  } else {
    // Non-additive: clear previous selection
    if (S.selectedEls.size > 0) {
      for (const prev of S.selectedEls) {
        if (prev !== el) deselectVisual(prev);
      }
      S.clearSelectedEls();
    } else if (S.selectedEl && S.selectedEl !== el) {
      deselectVisual(S.selectedEl);
    }
    S.clearSelectedEls();
    S.addSelectedEl(el);
    S.setSelectedEl(el);
  }

  const type = el.dataset.type;
  const trackType = type === 'link' ? 'connect' : type;
  trackElementSelected(trackType);
  if (_selectTrackFn) _selectTrackFn(trackType);

  // Visual highlight
  if (type === 'player' || type === 'referee' || type === 'ball' || type === 'cone') {
    el.querySelector('circle:not(.hit-area),polygon')?.setAttribute('stroke-width', '3');
    if (type === 'player' || type === 'referee') el.querySelector('circle:not(.hit-area)')?.setAttribute('stroke', 'rgba(79,156,249,0.8)');
  }
  if (type === 'textbox') {
    const bg = el.querySelector('.textbox-bg');
    if (bg) { bg.setAttribute('stroke', 'rgba(79,156,249,0.8)'); bg.setAttribute('stroke-width', '1.5'); }
    showZoneHandles(el);
  }
  if (type === 'headline') {
    const bg = el.querySelector('.headline-bg');
    if (bg) { bg.setAttribute('stroke', 'rgba(79,156,249,0.8)'); bg.setAttribute('stroke-width', '1.5'); }
    showZoneHandles(el);
  }
  if (type === 'arrow') {
    const w = parseFloat(el.dataset.arrowWidth || '2.5');
    el.querySelector('.arrow-line')?.setAttribute('stroke-width', w + 1.5);
    showArrowHandles(el);
  }
  if (type.startsWith('shadow') || type === 'pair') {
    const shape = el.querySelector('rect,ellipse,.pair-ellipse');
    if (shape) {
      // Save current stroke before applying selection highlight
      if (!el.dataset.savedStroke) el.dataset.savedStroke = shape.getAttribute('stroke');
      shape.setAttribute('stroke', 'rgba(79,156,249,0.9)');
    }
    showZoneHandles(el);
  }
  if (type === 'spotlight') {
    const ring = el.querySelector('.spotlight-ring') || el.querySelector('ellipse:not(.spotlight-glow)');
    if (ring) {
      if (!el.dataset.savedStroke) el.dataset.savedStroke = ring.getAttribute('stroke');
      ring.setAttribute('stroke', 'rgba(79,156,249,0.9)');
    }
    showSpotlightHandles(el);
  }
  if (type === 'vision') {
    const shape = el.querySelector('.vision-shape');
    if (shape) {
      if (!el.dataset.savedStroke) el.dataset.savedStroke = shape.getAttribute('stroke') || 'none';
      if (!el.dataset.savedStrokeWidth) el.dataset.savedStrokeWidth = shape.getAttribute('stroke-width') || '1';
      shape.setAttribute('stroke', 'rgba(255,255,255,0.6)');
      shape.setAttribute('stroke-width', '1.5');
      shape.setAttribute('stroke-dasharray', '4,3');
    }
    showVisionHandles(el);
  }
  if (type === 'freeform') {
    const shape = el.querySelector('.freeform-shape');
    if (shape) {
      if (!el.dataset.savedStroke) el.dataset.savedStroke = shape.getAttribute('stroke');
      shape.setAttribute('stroke', 'rgba(79,156,249,0.9)');
    }
    showFreeformHandles(el);
  }
  if (type === 'motion') {
    const trail = el.querySelector('.motion-trail');
    if (trail) {
      if (!el.dataset.savedStroke) el.dataset.savedStroke = trail.getAttribute('stroke');
      trail.setAttribute('stroke', 'rgba(79,156,249,0.9)');
      trail.setAttribute('opacity', '1');
    }
    showMotionHandles(el);
  }
  if (type === 'tag') {
    const tagLine = el.querySelector('.tag-line');
    if (tagLine) {
      if (!el.dataset.savedStroke) el.dataset.savedStroke = tagLine.getAttribute('stroke');
      tagLine.setAttribute('stroke', 'rgba(79,156,249,0.9)');
    }
    const tagDot = el.querySelector('.tag-dot');
    if (tagDot) {
      if (!el.dataset.savedDotFill) el.dataset.savedDotFill = tagDot.getAttribute('fill');
      tagDot.setAttribute('fill', 'rgba(79,156,249,0.9)');
    }
    showTagHandles(el);
  }
  if (type === 'link') {
    const linkLine = el.querySelector('.link-line');
    if (linkLine) {
      if (!el.dataset.savedStroke) el.dataset.savedStroke = linkLine.getAttribute('stroke');
      linkLine.setAttribute('stroke', 'rgba(79,156,249,0.9)');
      linkLine.setAttribute('stroke-width', '3');
    }
  }
  // If multi-select, show multi-select UI instead of individual panels
  if (S.selectedEls.size > 1) {
    _updateMultiSelectUI();
    return;
  }

  // Info label
  const typeLabel = type === 'player' ? 'Player #' + el.dataset.label
    : type === 'referee' ? 'Referee ' + el.dataset.label
    : type === 'ball' ? 'Ball'
    : type === 'cone' ? 'Cone'
    : type === 'arrow' ? (['Run','Pass','Line'][['run','pass','line'].indexOf(el.dataset.arrowType)] || 'Arrow')
    : type === 'textbox' ? 'Text'
    : type === 'spotlight' ? 'Spotlight'
    : type === 'vision' ? 'Player\'s Vision'
    : type === 'freeform' ? 'Freeform Zone'
    : type === 'motion' ? 'Motion Path'
    : type === 'headline' ? 'Headline'
    : type === 'tag' ? 'Tag'
    : type === 'link' ? 'Player Link'
    : type === 'pair' ? 'Pair'
    : 'Zone';
  const hint = (type === 'player' || type === 'referee') ? ' · double-click to rename' : type === 'textbox' ? ' · double-click to edit' : '';
  S.selInfo.innerHTML = `<strong>${typeLabel}</strong><br><span style="font-size:10px;color:var(--text-muted)">Drag to move${hint}</span>`;

  // Mobile context bar
  if (window.innerWidth <= 768) {
    const ctxBar = document.getElementById('mobile-context-bar');
    if (ctxBar) {
      document.getElementById('ctx-label').textContent = typeLabel;
      ctxBar.classList.add('show');
    }
    const fb = document.getElementById('feedback-bubble');
    if (fb) fb.style.display = 'none';
  }
  const playerSec = document.getElementById('player-edit-section');
  const refereeSec = document.getElementById('referee-edit-section');
  const arrowSec = document.getElementById('arrow-edit-section');
  const zoneSec = document.getElementById('zone-edit-section');
  const textboxSec = document.getElementById('textbox-edit-section');
  const headlineSec = document.getElementById('headline-edit-section');
  const spotlightSec = document.getElementById('spotlight-edit-section');
  const visionSec = document.getElementById('vision-edit-section');
  const tagSec = document.getElementById('tag-edit-section');
  const linkSec = document.getElementById('link-edit-section');
  const delSec = document.getElementById('del-section');
  const layerSec = document.getElementById('layer-section');

  // Always switch to element tab
  switchTab('element');
  playerSec.style.display = 'none';
  if (refereeSec) refereeSec.style.display = 'none';
  arrowSec.style.display = 'none';
  zoneSec.style.display = 'none';
  textboxSec.style.display = 'none';
  if (headlineSec) headlineSec.style.display = 'none';
  spotlightSec.style.display = 'none';
  visionSec.style.display = 'none';
  if (tagSec) tagSec.style.display = 'none';
  if (linkSec) linkSec.style.display = 'none';
  delSec.style.display = '';
  layerSec.style.display = '';

  const isArrow = type === 'arrow';
  const isZone = type?.startsWith('shadow') || type === 'pair';
  const isText = type === 'textbox';
  const isHeadline = type === 'headline';
  const isTag = type === 'tag';
  const isLink = type === 'link';
  const showSize = !isArrow && !isZone && !isText && !isHeadline && !isTag && !isLink;
  document.getElementById('size-section').style.display = showSize ? '' : 'none';
  // Vision and zones use the standalone rotation-section; players use inline arm-rotation-group
  const showStandaloneRot = type === 'vision' || isZone;
  document.getElementById('rotation-section').style.display = showStandaloneRot ? '' : 'none';
  if (isZone) {
    const rv = el.dataset.rotation || '0';
    document.getElementById('rot-slider').value = rv;
    document.getElementById('rot-val').textContent = Math.round(parseFloat(rv)) + '°';
  }

  if (type === 'player') {
    playerSec.style.display = '';
    document.getElementById('number-input').value = el.dataset.label || '';
    document.getElementById('name-input').value = el.dataset.playerName || '';
    const nameSize = el.dataset.nameSize || '11';
    document.getElementById('name-size-slider').value = nameSize;
    document.getElementById('name-size-val').textContent = nameSize + 'px';
    // Arms toggle & inline rotation sync
    const armsToggle = document.getElementById('arms-toggle');
    const armRotGroup = document.getElementById('arm-rotation-group');
    if (armsToggle) armsToggle.checked = el.dataset.arms === '1';
    if (el.dataset.arms === '1') {
      const rv = el.dataset.rotation || '0';
      if (armRotGroup) armRotGroup.style.display = '';
      document.getElementById('arm-rot-slider').value = rv;
      document.getElementById('arm-rot-val').textContent = Math.round(parseFloat(rv)) + '°';
    } else {
      if (armRotGroup) armRotGroup.style.display = 'none';
    }
    // Switch right panel to the player's team context
    if ((el.dataset.team === 'a' || el.dataset.team === 'b') && _selectTeamContextFn) {
      _selectTeamContextFn(el.dataset.team);
    }
  } else if (type === 'referee') {
    if (refereeSec) {
      refereeSec.style.display = '';
      document.getElementById('ref-name-input').value = el.dataset.label || '';
    }
  } else if (type === 'arrow') {
    arrowSec.style.display = '';
    const w = el.dataset.arrowWidth || '2.5';
    document.getElementById('arrow-width-slider').value = w;
    document.getElementById('arrow-width-val').textContent = w;
    const curveVal = el.dataset.curve || '0';
    document.getElementById('arrow-curve-slider').value = curveVal;
    document.getElementById('arrow-curve-val').textContent = Math.round(parseFloat(curveVal));
    const dash = el.querySelector('.arrow-line')?.getAttribute('stroke-dasharray') || '';
    let style = 'solid';
    if (dash === '2,5') style = 'dotted';
    else if (dash && dash !== 'none') style = 'dashed';
    document.querySelectorAll('.style-btn').forEach(b => b.classList.toggle('active', b.dataset.style === style));
  } else if (type === 'textbox') {
    textboxSec.style.display = '';
    document.getElementById('textbox-input').value = el.dataset.textContent || '';
    const tSize = el.dataset.textSize || '14';
    document.getElementById('textbox-size-slider').value = tSize;
    document.getElementById('textbox-size-val').textContent = tSize + 'px';
    const tAlign = el.dataset.textAlign || 'center';
    document.querySelectorAll('[data-align]').forEach(b => b.classList.toggle('active', b.dataset.align === tAlign));
  } else if (type === 'headline') {
    if (headlineSec) {
      headlineSec.style.display = '';
      document.getElementById('headline-title-input').value = el.dataset.hlTitle || '';
      document.getElementById('headline-body-input').value = el.dataset.hlBody || '';
      const tSize = el.dataset.hlTitleSize || '16';
      document.getElementById('headline-title-size-slider').value = tSize;
      document.getElementById('headline-title-size-val').textContent = tSize + 'px';
      const bSize = el.dataset.hlBodySize || '12';
      document.getElementById('headline-body-size-slider').value = bSize;
      document.getElementById('headline-body-size-val').textContent = bSize + 'px';
    }
  } else if (type === 'spotlight') {
    spotlightSec.style.display = '';
    document.getElementById('spot-name-input').value = el.dataset.spotName || '';
    const sNameSize = el.dataset.spotNameSize || '11';
    document.getElementById('spot-name-size-slider').value = sNameSize;
    document.getElementById('spot-name-size-val').textContent = sNameSize + 'px';
  } else if (type === 'vision') {
    visionSec.style.display = '';
    const opVal = parseFloat(el.dataset.visionOpacity || '0.55');
    const opSlider = document.getElementById('vision-opacity-slider');
    const opLabel = document.getElementById('vision-opacity-value');
    if (opSlider) opSlider.value = opVal;
    if (opLabel) opLabel.textContent = Math.round(opVal * 100) + '%';
  } else if (type === 'tag') {
    if (tagSec) {
      tagSec.style.display = '';
      document.getElementById('tag-label-input').value = el.dataset.tagLabel || 'TOP SPEED';
      document.getElementById('tag-value-input').value = el.dataset.tagValue || '8.7km/h';
      const tAnchor = el.dataset.tagTextAnchor || 'bottom';
      document.querySelectorAll('[data-taganchor]').forEach(b => b.classList.toggle('active', b.dataset.taganchor === tAnchor));
      const lineLen = el.dataset.tagLineLen || '80';
      document.getElementById('tag-line-len-slider').value = lineLen;
      document.getElementById('tag-line-len-val').textContent = lineLen + 'px';
      const lineAngle = el.dataset.tagLineAngle || '-35';
      document.getElementById('tag-line-angle-slider').value = lineAngle;
      document.getElementById('tag-line-angle-val').textContent = Math.round(parseFloat(lineAngle)) + '°';
    }
  } else if (type === 'link') {
    if (linkSec) {
      linkSec.style.display = '';
      const lStyle = el.dataset.linkStyle || 'dashed';
      linkSec.querySelectorAll('.formation-btn').forEach(b => b.classList.toggle('active', b.dataset.linkstyle === lStyle));
    }
  } else if (isZone) {
    zoneSec.style.display = '';
    // Set active border style button based on current shape
    const shape = el.querySelector('rect,ellipse');
    const dashArr = shape?.getAttribute('stroke-dasharray') || '';
    const zStyle = (dashArr && dashArr !== 'none') ? 'dashed' : 'solid';
    document.querySelectorAll('[data-zstyle]').forEach(b => b.classList.toggle('active', b.dataset.zstyle === zStyle));
  }

  const s = parseFloat(el.dataset.scale || '1') * 100;
  document.getElementById('size-slider').value = s;
  document.getElementById('size-val').textContent = (s/100).toFixed(1) + '×';
  const rotVisible = document.getElementById('rotation-section').style.display !== 'none';
  if (rotVisible) {
    const r = parseFloat(el.dataset.rotation || '0');
    document.getElementById('rot-slider').value = r;
    document.getElementById('rot-val').textContent = Math.round(r) + '°';
  }

  // Also show rotation section for zones that have rotation
  if (isZone || type === 'spotlight') {
    // rotation already handled by zone handles
  }
}

export function deselectVisual(el) {
  if (!el) return;
  removeHandles();
  const t = el.dataset.type;
  if (t === 'player') {
    const circ = el.querySelector('circle:not(.hit-area)');
    if (circ) {
      const customBorder = el.dataset.borderColor;
      if (customBorder === 'none') {
        circ.setAttribute('stroke', 'transparent');
        circ.setAttribute('stroke-width', '0');
      } else if (customBorder) {
        circ.setAttribute('stroke', customBorder);
        circ.setAttribute('stroke-width', '2.5');
      } else {
        const fill = circ.getAttribute('fill');
        circ.setAttribute('stroke', S.isDarkColor(fill) ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.15)');
        circ.setAttribute('stroke-width', '2.5');
      }
    }
  }
  if (t === 'referee') {
    const circ = el.querySelector('circle:not(.hit-area)');
    if (circ) {
      const border = el.dataset.borderColor || '#FBBF24';
      if (border === 'none') {
        circ.setAttribute('stroke', 'transparent');
        circ.setAttribute('stroke-width', '0');
      } else {
        circ.setAttribute('stroke', border);
        circ.setAttribute('stroke-width', '2.5');
      }
    }
  }
  if (t === 'ball' || t === 'cone') el.querySelector('circle:not(.hit-area),polygon')?.setAttribute('stroke-width', '1.5');
  if (t === 'textbox') {
    const bg = el.querySelector('.textbox-bg');
    if (bg) { bg.removeAttribute('stroke'); bg.removeAttribute('stroke-width'); }
  }
  if (t === 'headline') {
    const bg = el.querySelector('.headline-bg');
    if (bg) { bg.removeAttribute('stroke'); bg.removeAttribute('stroke-width'); }
  }
  if (t === 'arrow') {
    const w = el.dataset.arrowWidth || '2.5';
    el.querySelector('.arrow-line')?.setAttribute('stroke-width', w);
  }
  if (t.startsWith('shadow') || t === 'pair') {
    const shape = el.querySelector('rect,ellipse,.pair-ellipse');
    if (shape && el.dataset.savedStroke) {
      shape.setAttribute('stroke', el.dataset.savedStroke);
      delete el.dataset.savedStroke;
    }
  }
  if (t === 'spotlight') {
    const ring = el.querySelector('.spotlight-ring') || el.querySelector('ellipse:not(.spotlight-glow)');
    if (ring && el.dataset.savedStroke) {
      ring.setAttribute('stroke', el.dataset.savedStroke);
      delete el.dataset.savedStroke;
    }
  }
  if (t === 'vision') {
    const shape = el.querySelector('.vision-shape');
    if (shape) {
      const saved = el.dataset.savedStroke;
      const savedW = el.dataset.savedStrokeWidth || '1';
      if (saved === 'none') { shape.setAttribute('stroke', 'none'); shape.removeAttribute('stroke-width'); }
      else if (saved) { shape.setAttribute('stroke', saved); shape.setAttribute('stroke-width', savedW); }
      else { shape.removeAttribute('stroke'); shape.removeAttribute('stroke-width'); }
      shape.removeAttribute('stroke-dasharray');
      delete el.dataset.savedStroke;
      delete el.dataset.savedStrokeWidth;
    }
  }
  if (t === 'freeform') {
    const shape = el.querySelector('.freeform-shape');
    if (shape && el.dataset.savedStroke) {
      shape.setAttribute('stroke', el.dataset.savedStroke);
      delete el.dataset.savedStroke;
    }
  }
  if (t === 'motion') {
    const trail = el.querySelector('.motion-trail');
    if (trail && el.dataset.savedStroke) {
      trail.setAttribute('stroke', el.dataset.savedStroke);
      trail.setAttribute('opacity', '0.7');
      delete el.dataset.savedStroke;
    }
  }
  if (t === 'tag') {
    const tagLine = el.querySelector('.tag-line');
    if (tagLine && el.dataset.savedStroke) {
      tagLine.setAttribute('stroke', el.dataset.savedStroke);
      delete el.dataset.savedStroke;
    }
    const tagDot = el.querySelector('.tag-dot');
    if (tagDot && el.dataset.savedDotFill) {
      tagDot.setAttribute('fill', el.dataset.savedDotFill);
      delete el.dataset.savedDotFill;
    }
  }
  if (t === 'link') {
    const linkLine = el.querySelector('.link-line');
    if (linkLine) {
      const saved = el.dataset.savedStroke || el.dataset.linkColor || 'rgba(255,255,255,0.4)';
      linkLine.setAttribute('stroke', saved);
      linkLine.setAttribute('stroke-width', '2');
      delete el.dataset.savedStroke;
    }
  }
}

export function deselect() {
  if (!S.selectedEl && S.selectedEls.size === 0) return;
  // Deselect all multi-selected elements
  for (const el of S.selectedEls) deselectVisual(el);
  S.clearSelectedEls();
  if (S.selectedEl) deselectVisual(S.selectedEl);
  S.setSelectedEl(null);
  S.selInfo.innerHTML = 'Nothing selected.<br><span style="font-size:10px;color:var(--text-muted)">Click to select · drag to move<br>Double-click player to rename</span>';
  // Hide mobile context bar & restore feedback
  hideMobileContext();
  document.getElementById('del-section').style.display = 'none';
  document.getElementById('layer-section').style.display = 'none';
  document.getElementById('player-edit-section').style.display = 'none';
  document.getElementById('arrow-edit-section').style.display = 'none';
  document.getElementById('zone-edit-section').style.display = 'none';
  document.getElementById('textbox-edit-section').style.display = 'none';
  document.getElementById('spotlight-edit-section').style.display = 'none';
  document.getElementById('vision-edit-section').style.display = 'none';
  const tagSec = document.getElementById('tag-edit-section');
  if (tagSec) tagSec.style.display = 'none';
  document.getElementById('rotation-section').style.display = 'none';
  document.getElementById('size-section').style.display = 'none';
}

function hideMobileContext() {
  const ctxBar = document.getElementById('mobile-context-bar');
  if (ctxBar) ctxBar.classList.remove('show');
  const fb = document.getElementById('feedback-bubble');
  if (fb) fb.style.display = '';
}

export function deleteSelected() {
  if (!S.selectedEl && S.selectedEls.size === 0) return;
  S.pushUndo();
  removeHandles();
  // Delete all selected elements
  if (S.selectedEls.size > 0) {
    for (const el of S.selectedEls) el.remove();
    S.clearSelectedEls();
  } else if (S.selectedEl) {
    S.selectedEl.remove();
  }
  S.setSelectedEl(null);
  S.selInfo.innerHTML = 'Nothing selected.';
  hideMobileContext();
  document.getElementById('del-section').style.display = 'none';
  document.getElementById('layer-section').style.display = 'none';
  document.getElementById('player-edit-section').style.display = 'none';
  document.getElementById('arrow-edit-section').style.display = 'none';
  document.getElementById('zone-edit-section').style.display = 'none';
  document.getElementById('textbox-edit-section').style.display = 'none';
  document.getElementById('spotlight-edit-section').style.display = 'none';
  document.getElementById('vision-edit-section').style.display = 'none';
  const tagDelSec = document.getElementById('tag-edit-section');
  if (tagDelSec) tagDelSec.style.display = 'none';
  const linkDelSec = document.getElementById('link-edit-section');
  if (linkDelSec) linkDelSec.style.display = 'none';
  const multiSec = document.getElementById('multi-select-section');
  if (multiSec) multiSec.style.display = 'none';
}

// ─── Tab Switcher ─────────────────────────────────────────────────────────────
export function switchTab(name) {
  ['players','pitch','element'].forEach(t => {
    document.getElementById('tab-' + t).classList.toggle('active', t === name);
    document.getElementById('pane-' + t).style.display = t === name ? 'flex' : 'none';
  });
}

// ─── Element Handles (arrows + zones) ─────────────────────────────────────────
let handleGroup = null;

function createHandle(ns, hx, hy, which, cursor) {
  const isMobile = 'ontouchstart' in window && window.innerWidth <= 768;
  const g = document.createElementNS(ns, 'g');
  g.dataset.handle = which;
  g.setAttribute('cursor', cursor || 'grab');
  // Invisible larger hit area for mobile touch
  if (isMobile) {
    const hit = document.createElementNS(ns, 'circle');
    hit.setAttribute('cx', hx); hit.setAttribute('cy', hy);
    hit.setAttribute('r', '18'); hit.setAttribute('fill', 'transparent');
    hit.setAttribute('stroke', 'none');
    g.appendChild(hit);
  }
  // Visible handle
  const c = document.createElementNS(ns, 'circle');
  c.setAttribute('cx', hx); c.setAttribute('cy', hy);
  c.setAttribute('r', isMobile ? '10' : '6');
  c.setAttribute('fill', 'rgba(201,169,98,0.4)');
  c.setAttribute('stroke', '#C9A962'); c.setAttribute('stroke-width', '1.5');
  g.appendChild(c);
  g.addEventListener('mousedown', handleDown);
  g.addEventListener('touchstart', handleDown, { passive: false });
  return g;
}

// ── Arrow handles ──
export function showArrowHandles(el) {
  removeHandles();
  const ns = 'http://www.w3.org/2000/svg';
  handleGroup = document.createElementNS(ns, 'g');
  handleGroup.setAttribute('id', 'element-handles');
  handleGroup.dataset.handleType = 'arrow';

  // Read endpoints from dataset
  const cx = parseFloat(el.dataset.cx), cy = parseFloat(el.dataset.cy);
  const dx1 = parseFloat(el.dataset.dx1), dy1 = parseFloat(el.dataset.dy1);
  const dx2 = parseFloat(el.dataset.dx2), dy2 = parseFloat(el.dataset.dy2);
  const sc = parseFloat(el.dataset.scale || '1');
  const rot = parseFloat(el.dataset.rotation || '0') * Math.PI / 180;
  const k = parseFloat(el.dataset.curve || '0');
  const tfm = (dx, dy) => ({
    x: cx + (dx*sc)*Math.cos(rot) - (dy*sc)*Math.sin(rot),
    y: cy + (dx*sc)*Math.sin(rot) + (dy*sc)*Math.cos(rot)
  });
  const p1 = tfm(dx1, dy1), p2 = tfm(dx2, dy2);
  const cp = arrowControlPoint(p1, p2, k);

  handleGroup.appendChild(createHandle(ns, p1.x, p1.y, 'start'));
  handleGroup.appendChild(createHandle(ns, p2.x, p2.y, 'end'));

  // Curve handle (different color to distinguish)
  const curveH = createHandle(ns, cp.x, cp.y, 'curve');
  curveH.querySelector('circle:not([fill="transparent"])').setAttribute('fill', '#C9A962');
  handleGroup.appendChild(curveH);

  S.svg.appendChild(handleGroup);
}

// ── Zone handles ──
function rotatedPoint(cx, cy, dx, dy, rot) {
  const r = rot * Math.PI / 180;
  return {
    x: cx + dx * Math.cos(r) - dy * Math.sin(r),
    y: cy + dx * Math.sin(r) + dy * Math.cos(r)
  };
}

function createRotateHandle(ns, hx, hy) {
  const g = document.createElementNS(ns, 'g');
  g.dataset.handle = 'rotate';
  g.setAttribute('cursor', 'crosshair');
  // Invisible hit area
  const hit = document.createElementNS(ns, 'circle');
  hit.setAttribute('cx', hx); hit.setAttribute('cy', hy);
  hit.setAttribute('r', '8'); hit.setAttribute('fill', 'transparent');
  hit.setAttribute('stroke', 'none');
  // Rotation arc arrow icon only
  const arc = document.createElementNS(ns, 'path');
  arc.setAttribute('d', `M${hx-4},${hy+1} A5,5 0 1,1 ${hx+3},${hy-4}`);
  arc.setAttribute('fill', 'none'); arc.setAttribute('stroke', '#C9A962');
  arc.setAttribute('stroke-width', '1.8'); arc.setAttribute('stroke-linecap', 'round');
  // Arrowhead
  const arrow = document.createElementNS(ns, 'path');
  arrow.setAttribute('d', `M${hx+1},${hy-6} L${hx+3},${hy-4} L${hx+5},${hy-6}`);
  arrow.setAttribute('fill', 'none'); arrow.setAttribute('stroke', '#C9A962');
  arrow.setAttribute('stroke-width', '1.5'); arrow.setAttribute('stroke-linecap', 'round');
  arrow.setAttribute('stroke-linejoin', 'round');
  g.appendChild(hit); g.appendChild(arc); g.appendChild(arrow);
  g.addEventListener('mousedown', handleDown);
  g.addEventListener('touchstart', handleDown, { passive: false });
  return g;
}

export function showZoneHandles(el) {
  removeHandles();
  const ns = 'http://www.w3.org/2000/svg';
  handleGroup = document.createElementNS(ns, 'g');
  handleGroup.setAttribute('id', 'element-handles');
  handleGroup.dataset.handleType = 'zone';

  const cx = parseFloat(el.dataset.cx), cy = parseFloat(el.dataset.cy);
  const hw = parseFloat(el.dataset.hw || '30');
  const hh = parseFloat(el.dataset.hh || '20');
  const rot = parseFloat(el.dataset.rotation || '0');

  // Corners & sides in local coords, then rotate
  const tl = rotatedPoint(cx, cy, -hw, -hh, rot);
  const tr = rotatedPoint(cx, cy, hw, -hh, rot);
  const br = rotatedPoint(cx, cy, hw, hh, rot);
  const bl = rotatedPoint(cx, cy, -hw, hh, rot);
  const sl = rotatedPoint(cx, cy, -hw, 0, rot);
  const sr = rotatedPoint(cx, cy, hw, 0, rot);
  const st = rotatedPoint(cx, cy, 0, -hh, rot);
  const sb = rotatedPoint(cx, cy, 0, hh, rot);

  // 0: corner-tl, 1: corner-tr (rotate), 2: corner-br, 3: corner-bl
  handleGroup.appendChild(createHandle(ns, tl.x, tl.y, 'corner-tl', 'nwse-resize'));
  handleGroup.appendChild(createRotateHandle(ns, tr.x, tr.y));
  handleGroup.appendChild(createHandle(ns, br.x, br.y, 'corner-br', 'nwse-resize'));
  handleGroup.appendChild(createHandle(ns, bl.x, bl.y, 'corner-bl', 'nesw-resize'));
  // 4: side-l, 5: side-r, 6: side-t, 7: side-b
  handleGroup.appendChild(createHandle(ns, sl.x, sl.y, 'side-l', 'ew-resize'));
  handleGroup.appendChild(createHandle(ns, sr.x, sr.y, 'side-r', 'ew-resize'));
  handleGroup.appendChild(createHandle(ns, st.x, st.y, 'side-t', 'ns-resize'));
  handleGroup.appendChild(createHandle(ns, sb.x, sb.y, 'side-b', 'ns-resize'));

  S.svg.appendChild(handleGroup);
}

// ── Spotlight handles (left/right resize) ──
export function showSpotlightHandles(el) {
  removeHandles();
  const ns = 'http://www.w3.org/2000/svg';
  handleGroup = document.createElementNS(ns, 'g');
  handleGroup.setAttribute('id', 'element-handles');
  handleGroup.dataset.handleType = 'spotlight';

  const cx = parseFloat(el.dataset.cx), cy = parseFloat(el.dataset.cy);
  const rx = parseFloat(el.dataset.rx || '28') * parseFloat(el.dataset.scale || '1');

  handleGroup.appendChild(createHandle(ns, cx - rx, cy, 'spot-left', 'ew-resize'));
  handleGroup.appendChild(createHandle(ns, cx + rx, cy, 'spot-right', 'ew-resize'));
  S.svg.appendChild(handleGroup);
}

// ── Vision handles ──
function visionWorldPoints(el) {
  const cx = parseFloat(el.dataset.cx), cy = parseFloat(el.dataset.cy);
  const len = parseFloat(el.dataset.visionLength || '80');
  const spread = parseFloat(el.dataset.visionSpread || '35');
  const rot = parseFloat(el.dataset.rotation || '0');
  const scale = parseFloat(el.dataset.scale || '1');
  const r = rot * Math.PI / 180;
  const cosR = Math.cos(r), sinR = Math.sin(r);
  const sLen = len * scale, sSpread = spread * scale;

  return {
    apex: { x: cx, y: cy },
    topRight: {
      x: cx + (sLen * cosR - (-sSpread) * sinR),
      y: cy + (sLen * sinR + (-sSpread) * cosR)
    },
    botRight: {
      x: cx + (sLen * cosR - sSpread * sinR),
      y: cy + (sLen * sinR + sSpread * cosR)
    },
    baseMid: {
      x: cx + sLen * cosR,
      y: cy + sLen * sinR
    }
  };
}

export function showVisionHandles(el) {
  removeHandles();
  const ns = 'http://www.w3.org/2000/svg';
  handleGroup = document.createElementNS(ns, 'g');
  handleGroup.setAttribute('id', 'element-handles');
  handleGroup.dataset.handleType = 'vision';

  const pts = visionWorldPoints(el);

  // 0: top-right vertex (spread + length)
  handleGroup.appendChild(createHandle(ns, pts.topRight.x, pts.topRight.y, 'vision-tr', 'nwse-resize'));
  // 1: bottom-right vertex (spread + length)
  handleGroup.appendChild(createHandle(ns, pts.botRight.x, pts.botRight.y, 'vision-br', 'nesw-resize'));
  // 2: base midpoint (length only)
  handleGroup.appendChild(createHandle(ns, pts.baseMid.x, pts.baseMid.y, 'vision-base', 'ew-resize'));
  // 3: rotate handle
  handleGroup.appendChild(createRotateHandle(ns, pts.topRight.x, pts.topRight.y - 15));

  S.svg.appendChild(handleGroup);
}

// ── Freeform zone handles (vertex handles) ──
export function showFreeformHandles(el) {
  removeHandles();
  const ns = 'http://www.w3.org/2000/svg';
  handleGroup = document.createElementNS(ns, 'g');
  handleGroup.setAttribute('id', 'element-handles');
  handleGroup.dataset.handleType = 'freeform';

  const cx = parseFloat(el.dataset.cx), cy = parseFloat(el.dataset.cy);
  const scale = parseFloat(el.dataset.scale || '1');
  const rot = parseFloat(el.dataset.rotation || '0') * Math.PI / 180;
  const cosR = Math.cos(rot), sinR = Math.sin(rot);
  const deltas = JSON.parse(el.dataset.freeformPts || '[]');

  deltas.forEach((d, i) => {
    const wx = cx + (d.dx * scale * cosR - d.dy * scale * sinR);
    const wy = cy + (d.dx * scale * sinR + d.dy * scale * cosR);
    handleGroup.appendChild(createHandle(ns, wx, wy, 'freeform-' + i, 'move'));
  });
  S.svg.appendChild(handleGroup);
}

// ── Motion handles (start/end like arrows) ──
export function showMotionHandles(el) {
  removeHandles();
  const ns = 'http://www.w3.org/2000/svg';
  handleGroup = document.createElementNS(ns, 'g');
  handleGroup.setAttribute('id', 'element-handles');
  handleGroup.dataset.handleType = 'motion';

  const trail = el.querySelector('.motion-trail');
  if (!trail) return;
  const x1 = parseFloat(trail.getAttribute('x1'));
  const y1 = parseFloat(trail.getAttribute('y1'));
  const x2 = parseFloat(trail.getAttribute('x2'));
  const y2 = parseFloat(trail.getAttribute('y2'));

  handleGroup.appendChild(createHandle(ns, x1, y1, 'start'));
  handleGroup.appendChild(createHandle(ns, x2, y2, 'end'));
  S.svg.appendChild(handleGroup);
}

function showTagHandles(el) {
  removeHandles();
  const ns = 'http://www.w3.org/2000/svg';
  handleGroup = document.createElementNS(ns, 'g');
  handleGroup.setAttribute('id', 'element-handles');
  handleGroup.dataset.handleType = 'tag';

  const cx = parseFloat(el.dataset.cx), cy = parseFloat(el.dataset.cy);
  // The dot is the draggable handle — drag it to change angle/length
  handleGroup.appendChild(createHandle(ns, cx, cy, 'dot'));
  S.svg.appendChild(handleGroup);
}

export function removeHandles() {
  if (handleGroup) { handleGroup.remove(); handleGroup = null; }
  S.setEndpointDragging(null);
}


// Move a handle (group or circle) to a new position
function moveHandleTo(h, x, y) {
  if (!h) return;
  if (h.tagName === 'circle') {
    h.setAttribute('cx', x); h.setAttribute('cy', y);
  } else {
    h.querySelectorAll('circle').forEach(c => { c.setAttribute('cx', x); c.setAttribute('cy', y); });
  }
}

function onTagHandleDrag(el, pt) {
  // Keep text end fixed, move the dot to mouse position
  const oldCx = parseFloat(el.dataset.cx), oldCy = parseFloat(el.dataset.cy);
  const oldLen = parseFloat(el.dataset.tagLineLen || '80');
  const oldAngle = parseFloat(el.dataset.tagLineAngle || '-35') * Math.PI / 180;
  // Text end position (stays fixed)
  const textX = oldCx + oldLen * Math.cos(oldAngle);
  const textY = oldCy + oldLen * Math.sin(oldAngle);
  // New dot position = mouse
  const newCx = pt.x, newCy = pt.y;
  // Compute new length and angle from new dot to text
  const dx = textX - newCx, dy = textY - newCy;
  const newLen = Math.max(20, Math.sqrt(dx * dx + dy * dy));
  const newAngleDeg = Math.atan2(dy, dx) * 180 / Math.PI;

  el.dataset.cx = newCx; el.dataset.cy = newCy;
  el.dataset.tagLineLen = Math.round(newLen);
  el.dataset.tagLineAngle = Math.round(newAngleDeg);
  applyTransform(el);

  // Sync sliders
  const lenSlider = document.getElementById('tag-line-len-slider');
  const lenVal = document.getElementById('tag-line-len-val');
  if (lenSlider) lenSlider.value = Math.round(newLen);
  if (lenVal) lenVal.textContent = Math.round(newLen) + 'px';
  const angleSlider = document.getElementById('tag-line-angle-slider');
  const angleVal = document.getElementById('tag-line-angle-val');
  if (angleSlider) angleSlider.value = Math.round(newAngleDeg);
  if (angleVal) angleVal.textContent = Math.round(newAngleDeg) + '°';

  updateHandlePositions(el);
}

function updateHandlePositions(el) {
  if (!handleGroup) return;
  const type = handleGroup.dataset.handleType;

  if (type === 'arrow') {
    const cx = parseFloat(el.dataset.cx), cy = parseFloat(el.dataset.cy);
    const dx1 = parseFloat(el.dataset.dx1), dy1 = parseFloat(el.dataset.dy1);
    const dx2 = parseFloat(el.dataset.dx2), dy2 = parseFloat(el.dataset.dy2);
    const sc = parseFloat(el.dataset.scale || '1');
    const rot = parseFloat(el.dataset.rotation || '0') * Math.PI / 180;
    const k = parseFloat(el.dataset.curve || '0');
    const tfm = (dx, dy) => ({
      x: cx + (dx*sc)*Math.cos(rot) - (dy*sc)*Math.sin(rot),
      y: cy + (dx*sc)*Math.sin(rot) + (dy*sc)*Math.cos(rot)
    });
    const p1 = tfm(dx1, dy1), p2 = tfm(dx2, dy2);
    const cp = arrowControlPoint(p1, p2, k);
    const hStart = handleGroup.children[0];
    const hEnd = handleGroup.children[1];
    const hCurve = handleGroup.children[2];
    if (hStart) hStart.querySelectorAll('circle').forEach(c => { c.setAttribute('cx', p1.x); c.setAttribute('cy', p1.y); });
    if (hEnd) hEnd.querySelectorAll('circle').forEach(c => { c.setAttribute('cx', p2.x); c.setAttribute('cy', p2.y); });
    if (hCurve) hCurve.querySelectorAll('circle').forEach(c => { c.setAttribute('cx', cp.x); c.setAttribute('cy', cp.y); });
  } else if (type === 'zone') {
    const cx = parseFloat(el.dataset.cx), cy = parseFloat(el.dataset.cy);
    const hw = parseFloat(el.dataset.hw || '30');
    const hh = parseFloat(el.dataset.hh || '20');
    const rot = parseFloat(el.dataset.rotation || '0');

    const tl = rotatedPoint(cx, cy, -hw, -hh, rot);
    const tr = rotatedPoint(cx, cy, hw, -hh, rot);
    const br = rotatedPoint(cx, cy, hw, hh, rot);
    const bl = rotatedPoint(cx, cy, -hw, hh, rot);
    const sl = rotatedPoint(cx, cy, -hw, 0, rot);
    const sr = rotatedPoint(cx, cy, hw, 0, rot);
    const st = rotatedPoint(cx, cy, 0, -hh, rot);
    const sb = rotatedPoint(cx, cy, 0, hh, rot);

    // 0: tl, 1: tr (rotate group), 2: br, 3: bl, 4: side-l, 5: side-r, 6: side-t, 7: side-b
    const children = handleGroup.children;
    moveHandleTo(children[0], tl.x, tl.y);
    // tr rotate handle — update the circles/paths inside the group
    const rotG = children[1];
    if (rotG) {
      const rc = rotG.querySelector('circle');
      if (rc) { rc.setAttribute('cx', tr.x); rc.setAttribute('cy', tr.y); }
      const rp = rotG.querySelector('path');
      if (rp) rp.setAttribute('d', `M${tr.x-3},${tr.y-2} A4,4 0 1,1 ${tr.x+2},${tr.y-3}`);
    }
    moveHandleTo(children[2], br.x, br.y);
    moveHandleTo(children[3], bl.x, bl.y);
    moveHandleTo(children[4], sl.x, sl.y);
    moveHandleTo(children[5], sr.x, sr.y);
    moveHandleTo(children[6], st.x, st.y);
    moveHandleTo(children[7], sb.x, sb.y);
  } else if (type === 'spotlight') {
    const cx = parseFloat(el.dataset.cx), cy = parseFloat(el.dataset.cy);
    const rx = parseFloat(el.dataset.rx || '28') * parseFloat(el.dataset.scale || '1');
    const children = handleGroup.children;
    moveHandleTo(children[0], cx - rx, cy);
    moveHandleTo(children[1], cx + rx, cy);
  } else if (type === 'vision') {
    const pts = visionWorldPoints(el);
    const children = handleGroup.children;
    moveHandleTo(children[0], pts.topRight.x, pts.topRight.y);
    moveHandleTo(children[1], pts.botRight.x, pts.botRight.y);
    moveHandleTo(children[2], pts.baseMid.x, pts.baseMid.y);
    const rotG = children[3];
    if (rotG) {
      const rc = rotG.querySelector('circle');
      if (rc) { rc.setAttribute('cx', pts.topRight.x); rc.setAttribute('cy', pts.topRight.y - 15); }
    }
  } else if (type === 'freeform') {
    const cx = parseFloat(el.dataset.cx), cy = parseFloat(el.dataset.cy);
    const scale = parseFloat(el.dataset.scale || '1');
    const rot = parseFloat(el.dataset.rotation || '0') * Math.PI / 180;
    const cosR = Math.cos(rot), sinR = Math.sin(rot);
    const deltas = JSON.parse(el.dataset.freeformPts || '[]');
    const children = handleGroup.children;
    deltas.forEach((d, i) => {
      if (children[i]) {
        const wx = cx + (d.dx * scale * cosR - d.dy * scale * sinR);
        const wy = cy + (d.dx * scale * sinR + d.dy * scale * cosR);
        moveHandleTo(children[i], wx, wy);
      }
    });
  } else if (type === 'motion') {
    const trail = el.querySelector('.motion-trail');
    if (trail) {
      const children = handleGroup.children;
      moveHandleTo(children[0], parseFloat(trail.getAttribute('x1')), parseFloat(trail.getAttribute('y1')));
      moveHandleTo(children[1], parseFloat(trail.getAttribute('x2')), parseFloat(trail.getAttribute('y2')));
    }
  } else if (type === 'tag') {
    const cx = parseFloat(el.dataset.cx), cy = parseFloat(el.dataset.cy);
    moveHandleTo(handleGroup.children[0], cx, cy);
  }
}

function handleDown(e) {
  e.stopPropagation(); e.preventDefault();
  S.setEndpointDragging(e.currentTarget.dataset.handle);
  S.setIsDragging(true);
  S.setDragMoved(false);
}

function onEndpointDrag(e) {
  if (!S.endpointDragging || !S.selectedEl) return;
  e.preventDefault();
  S.setDragMoved(true);
  const pt = S.getSVGPoint(e);
  const el = S.selectedEl;
  const t = el.dataset.type;

  if (t === 'arrow') {
    onArrowEndpointDrag(el, pt);
  } else if (t === 'spotlight') {
    onSpotlightHandleDrag(el, pt);
  } else if (t === 'vision') {
    onVisionHandleDrag(el, pt);
  } else if (t === 'freeform') {
    onFreeformHandleDrag(el, pt);
  } else if (t === 'motion') {
    onMotionEndpointDrag(el, pt);
  } else if (t === 'tag') {
    onTagHandleDrag(el, pt);
  } else if (t.startsWith('shadow') || t === 'textbox' || t === 'headline') {
    onZoneHandleDrag(el, pt);
  }
}

function onArrowEndpointDrag(el, pt) {
  const cx = parseFloat(el.dataset.cx), cy = parseFloat(el.dataset.cy);
  const dx1 = parseFloat(el.dataset.dx1), dy1 = parseFloat(el.dataset.dy1);
  const dx2 = parseFloat(el.dataset.dx2), dy2 = parseFloat(el.dataset.dy2);

  if (S.endpointDragging === 'curve') {
    // Drag curve handle — project mouse onto perpendicular to compute curvature
    let ax1 = cx + dx1, ay1 = cy + dy1;
    let ax2 = cx + dx2, ay2 = cy + dy2;
    const midX = (ax1 + ax2) / 2, midY = (ay1 + ay2) / 2;
    let perpX = -(ay2 - ay1), perpY = ax2 - ax1;
    const len = Math.sqrt(perpX * perpX + perpY * perpY);
    if (len > 1) {
      perpX /= len; perpY /= len;
      const k = (pt.x - midX) * perpX + (pt.y - midY) * perpY;
      el.dataset.curve = String(k);
      // Sync curvature slider if visible
      const slider = document.getElementById('arrow-curve-slider');
      if (slider) slider.value = Math.max(-150, Math.min(150, k));
      const valSpan = document.getElementById('arrow-curve-val');
      if (valSpan) valSpan.textContent = Math.round(k);
    }
    updateArrowVisual(el);
    updateHandlePositions(el);
    return;
  }

  let ax1 = cx + dx1, ay1 = cy + dy1;
  let ax2 = cx + dx2, ay2 = cy + dy2;

  if (S.endpointDragging === 'start') { ax1 = pt.x; ay1 = pt.y; }
  else { ax2 = pt.x; ay2 = pt.y; }

  const ncx = (ax1 + ax2) / 2, ncy = (ay1 + ay2) / 2;
  el.dataset.cx = ncx; el.dataset.cy = ncy;
  el.dataset.dx1 = ax1 - ncx; el.dataset.dy1 = ay1 - ncy;
  el.dataset.dx2 = ax2 - ncx; el.dataset.dy2 = ay2 - ncy;
  el.dataset.scale = '1'; el.dataset.rotation = '0';

  updateArrowVisual(el);
  updateHandlePositions(el);
}

function onSpotlightHandleDrag(el, pt) {
  const cx = parseFloat(el.dataset.cx);
  const newRx = Math.max(12, Math.abs(pt.x - cx));   // min radius 12
  el.dataset.rx = newRx;
  // Keep ry proportional (flat ratio)
  el.dataset.ry = Math.max(3, newRx * 5 / 28);
  applyTransform(el);
  updateHandlePositions(el);
}

function onVisionHandleDrag(el, pt) {
  const cx = parseFloat(el.dataset.cx), cy = parseFloat(el.dataset.cy);
  const rot = parseFloat(el.dataset.rotation || '0');
  const scale = parseFloat(el.dataset.scale || '1');
  const h = S.endpointDragging;

  if (h === 'rotate') {
    // Rotate based on angle from apex to mouse
    const angle = Math.atan2(pt.y - cy, pt.x - cx) * 180 / Math.PI;
    const len = parseFloat(el.dataset.visionLength || '80');
    const spread = parseFloat(el.dataset.visionSpread || '35');
    // The top-right corner is at local angle atan2(-spread, len)
    const baseAngle = Math.atan2(-spread, len) * 180 / Math.PI;
    let newRot = angle - baseAngle;
    newRot = ((newRot % 360) + 360) % 360;
    el.dataset.rotation = newRot;
    document.getElementById('rot-slider').value = Math.round(newRot);
    document.getElementById('rot-val').textContent = Math.round(newRot) + '°';
  } else {
    // Convert mouse to local (un-rotated) coords relative to apex
    const r = -rot * Math.PI / 180;
    const dx = pt.x - cx, dy = pt.y - cy;
    const lx = (dx * Math.cos(r) - dy * Math.sin(r)) / scale;
    const ly = (dx * Math.sin(r) + dy * Math.cos(r)) / scale;

    if (h === 'vision-base') {
      // Drag base midpoint: change length only
      el.dataset.visionLength = Math.max(20, lx);
    } else if (h === 'vision-tr') {
      // Drag top-right vertex: change both length and spread
      el.dataset.visionLength = Math.max(20, lx);
      el.dataset.visionSpread = Math.max(8, Math.abs(ly));
    } else if (h === 'vision-br') {
      // Drag bottom-right vertex: change both length and spread
      el.dataset.visionLength = Math.max(20, lx);
      el.dataset.visionSpread = Math.max(8, Math.abs(ly));
    }
  }

  applyTransform(el);
  updateHandlePositions(el);
}

function onFreeformHandleDrag(el, pt) {
  const h = S.endpointDragging;
  if (!h || !h.startsWith('freeform-')) return;
  const idx = parseInt(h.split('-')[1]);
  const cx = parseFloat(el.dataset.cx), cy = parseFloat(el.dataset.cy);
  const scale = parseFloat(el.dataset.scale || '1');
  const rot = parseFloat(el.dataset.rotation || '0') * Math.PI / 180;
  const cosR = Math.cos(-rot), sinR = Math.sin(-rot);

  // Convert world point back to local delta
  const wx = pt.x - cx, wy = pt.y - cy;
  const ldx = (wx * cosR - wy * sinR) / scale;
  const ldy = (wx * sinR + wy * cosR) / scale;

  const deltas = JSON.parse(el.dataset.freeformPts || '[]');
  if (idx >= 0 && idx < deltas.length) {
    deltas[idx] = { dx: ldx, dy: ldy };
    el.dataset.freeformPts = JSON.stringify(deltas);
    applyTransform(el);
    updateHandlePositions(el);
  }
}

function onMotionEndpointDrag(el, pt) {
  const cx = parseFloat(el.dataset.cx), cy = parseFloat(el.dataset.cy);
  const dx1 = parseFloat(el.dataset.dx1), dy1 = parseFloat(el.dataset.dy1);
  const dx2 = parseFloat(el.dataset.dx2), dy2 = parseFloat(el.dataset.dy2);

  let ax1 = cx + dx1, ay1 = cy + dy1;
  let ax2 = cx + dx2, ay2 = cy + dy2;

  if (S.endpointDragging === 'start') { ax1 = pt.x; ay1 = pt.y; }
  else { ax2 = pt.x; ay2 = pt.y; }

  const ncx = (ax1 + ax2) / 2, ncy = (ay1 + ay2) / 2;
  el.dataset.cx = ncx; el.dataset.cy = ncy;
  el.dataset.dx1 = ax1 - ncx; el.dataset.dy1 = ay1 - ncy;
  el.dataset.dx2 = ax2 - ncx; el.dataset.dy2 = ay2 - ncy;
  el.dataset.scale = '1'; el.dataset.rotation = '0';

  if (_updateMotionFn) _updateMotionFn(el);
  updateHandlePositions(el);
}

function getTextBoxMinSize(el) {
  if (el.dataset.type !== 'textbox') return { minHW: 10, minHH: 10 };
  const fontSize = parseFloat(el.dataset.textSize || '14');
  const content = el.dataset.textContent || '';
  const lines = content.split('\n');
  const lineH = fontSize * 1.35;
  const minHH = Math.max(10, (lines.length * lineH) / 2 + 6);

  // Measure longest word to get min width
  const ns = 'http://www.w3.org/2000/svg';
  const measure = document.createElementNS(ns, 'text');
  measure.setAttribute('font-family', 'Poppins, sans-serif');
  measure.setAttribute('font-size', fontSize);
  measure.setAttribute('font-weight', '400');
  measure.style.visibility = 'hidden';
  S.svg.appendChild(measure);
  let maxWordW = 20;
  for (const line of lines) {
    for (const word of line.split(/\s+/)) {
      if (!word) continue;
      measure.textContent = word;
      maxWordW = Math.max(maxWordW, measure.getComputedTextLength());
    }
  }
  measure.remove();
  const minHW = maxWordW / 2 + 12; // padding
  return { minHW, minHH };
}

function onZoneHandleDrag(el, pt) {
  const cx = parseFloat(el.dataset.cx), cy = parseFloat(el.dataset.cy);
  let hw = parseFloat(el.dataset.hw || '30');
  let hh = parseFloat(el.dataset.hh || '20');
  let rot = parseFloat(el.dataset.rotation || '0');
  const h = S.endpointDragging;
  const defaultMin = 10;

  // For textbox, compute minimum from text content
  const isText = el.dataset.type === 'textbox';
  const { minHW, minHH } = isText ? getTextBoxMinSize(el) : { minHW: defaultMin, minHH: defaultMin };

  if (h === 'rotate') {
    const angle = Math.atan2(pt.y - cy, pt.x - cx) * 180 / Math.PI;
    const baseAngle = Math.atan2(-hh, hw) * 180 / Math.PI;
    rot = angle - baseAngle;
    rot = ((rot % 360) + 360) % 360;
    el.dataset.rotation = rot;
  } else if (h.startsWith('corner')) {
    const r = -rot * Math.PI / 180;
    const lx = (pt.x - cx) * Math.cos(r) - (pt.y - cy) * Math.sin(r);
    const ly = (pt.x - cx) * Math.sin(r) + (pt.y - cy) * Math.cos(r);
    hw = Math.max(minHW, Math.abs(lx));
    hh = Math.max(minHH, Math.abs(ly));
  } else if (h === 'side-l' || h === 'side-r') {
    const r = -rot * Math.PI / 180;
    const lx = (pt.x - cx) * Math.cos(r) - (pt.y - cy) * Math.sin(r);
    // Anchor the opposite edge
    if (h === 'side-r') {
      const leftEdge = -hw; // fixed left edge in local coords
      const newHW = Math.max(minHW, (lx - leftEdge) / 2);
      const newCenterLocal = leftEdge + newHW;
      // Convert local offset back to world coords
      const rr = rot * Math.PI / 180;
      el.dataset.cx = cx + newCenterLocal * Math.cos(rr);
      el.dataset.cy = cy + newCenterLocal * Math.sin(rr);
      hw = newHW;
    } else {
      const rightEdge = hw; // fixed right edge in local coords
      const newHW = Math.max(minHW, (rightEdge - lx) / 2);
      const newCenterLocal = rightEdge - newHW;
      const rr = rot * Math.PI / 180;
      el.dataset.cx = cx + newCenterLocal * Math.cos(rr);
      el.dataset.cy = cy + newCenterLocal * Math.sin(rr);
      hw = newHW;
    }
  } else if (h === 'side-t' || h === 'side-b') {
    const r = -rot * Math.PI / 180;
    const ly = (pt.x - cx) * Math.sin(r) + (pt.y - cy) * Math.cos(r);
    // Anchor the opposite edge
    if (h === 'side-b') {
      const topEdge = -hh;
      const newHH = Math.max(minHH, (ly - topEdge) / 2);
      const newCenterLocal = topEdge + newHH;
      const rr = rot * Math.PI / 180;
      el.dataset.cx = cx + newCenterLocal * -Math.sin(rr);
      el.dataset.cy = cy + newCenterLocal * Math.cos(rr);
      hh = newHH;
    } else {
      const botEdge = hh;
      const newHH = Math.max(minHH, (botEdge - ly) / 2);
      const newCenterLocal = botEdge - newHH;
      const rr = rot * Math.PI / 180;
      el.dataset.cx = cx + newCenterLocal * -Math.sin(rr);
      el.dataset.cy = cy + newCenterLocal * Math.cos(rr);
      hh = newHH;
    }
  }

  el.dataset.hw = hw; el.dataset.hh = hh;
  el.dataset.scale = '1';
  applyTransform(el);
  updateHandlePositions(el);
}

// ─── Drag ─────────────────────────────────────────────────────────────────────
export function makeDraggable(el) {
  el.addEventListener('mousedown', startDrag);
  el.addEventListener('touchstart', startDrag, { passive: false });
}

function startDrag(e) {
  if (S.tool !== 'select') return;
  // Don't start whole-element drag if clicking a handle
  if (e.target.dataset?.handle) return;
  e.stopPropagation(); e.preventDefault();
  const pt = S.getSVGPoint(e);
  const target = e.currentTarget;
  const additive = e.ctrlKey || e.metaKey;

  // If target is already in multi-selection, start multi-drag without re-selecting
  if (S.selectedEls.has(target) && S.selectedEls.size > 1) {
    // Compute offsets for all selected elements
    _dragOffsets.clear();
    for (const el of S.selectedEls) {
      _dragOffsets.set(el, {
        dx: pt.x - parseFloat(el.dataset.cx),
        dy: pt.y - parseFloat(el.dataset.cy)
      });
    }
    S.setSelectedEl(target);
    S.setIsDragging(true);
    S.setDragMoved(false);
    S.pushUndo();
    return;
  }

  S.setDragOffX(pt.x - parseFloat(target.dataset.cx));
  S.setDragOffY(pt.y - parseFloat(target.dataset.cy));
  S.setIsDragging(true);
  S.setDragMoved(false);
  S.pushUndo();

  select(target, { additive });

  // Compute offsets for all selected elements (for multi-drag)
  _dragOffsets.clear();
  for (const el of S.selectedEls) {
    _dragOffsets.set(el, {
      dx: pt.x - parseFloat(el.dataset.cx),
      dy: pt.y - parseFloat(el.dataset.cy)
    });
  }
}

function onDrag(e) {
  if (!S.isDragging || !S.selectedEl) return;
  // If endpoint dragging, use that handler instead
  if (S.endpointDragging) { onEndpointDrag(e); return; }
  e.preventDefault();
  S.setDragMoved(true);
  const pt = S.getSVGPoint(e);

  // Multi-drag: move all selected elements
  if (S.selectedEls.size > 1 && _dragOffsets.size > 0) {
    for (const el of S.selectedEls) {
      const off = _dragOffsets.get(el);
      if (off) moveElement(el, pt.x - off.dx, pt.y - off.dy);
    }
    // Update handles for the primary selected element
    removeHandles();
  } else {
    moveElement(S.selectedEl, pt.x - S.dragOffX, pt.y - S.dragOffY);
    // Update handles if dragging the whole element
    const dt = S.selectedEl.dataset.type;
    if (dt === 'arrow' || dt?.startsWith('shadow') || dt === 'textbox' || dt === 'spotlight' || dt === 'vision') updateHandlePositions(S.selectedEl);
  }
  // Update player links after any drag
  if (_updateAllLinksFn) _updateAllLinksFn();
}

let _onDragEndFn = null;
export function registerDragEnd(fn) { _onDragEndFn = fn; }

function stopDrag() {
  if (S.isDragging && S.dragMoved && S.selectedEl && _onDragEndFn) {
    _onDragEndFn(S.selectedEl);
  }
  S.setIsDragging(false);
  S.setEndpointDragging(null);
  if (S.dragMoved) setTimeout(() => { S.setDragMoved(false); }, 0);
}

// ─── Multi-select UI ─────────────────────────────────────────────────────────
function _updateMultiSelectUI() {
  const count = S.selectedEls.size;
  if (count <= 1) return;

  // Collect types
  const types = new Set();
  for (const el of S.selectedEls) types.add(el.dataset.type);

  // Hide all individual edit sections
  const sections = ['player-edit-section', 'referee-edit-section', 'arrow-edit-section',
    'zone-edit-section', 'textbox-edit-section', 'headline-edit-section',
    'spotlight-edit-section', 'vision-edit-section', 'tag-edit-section', 'link-edit-section'];
  for (const id of sections) {
    const sec = document.getElementById(id);
    if (sec) sec.style.display = 'none';
  }
  document.getElementById('rotation-section').style.display = 'none';

  switchTab('element');
  document.getElementById('del-section').style.display = '';
  document.getElementById('layer-section').style.display = 'none';

  // Remove handles (no individual element handles in multi-select)
  removeHandles();

  // Info label
  const typeSummary = types.size === 1 ? [...types][0] + 's' : 'elements';
  S.selInfo.innerHTML = `<strong>${count} ${typeSummary} selected</strong><br><span style="font-size:10px;color:var(--text-muted)">Drag to move · Ctrl+click to toggle</span>`;

  // Mobile context bar
  if (window.innerWidth <= 768) {
    const ctxBar = document.getElementById('mobile-context-bar');
    if (ctxBar) {
      document.getElementById('ctx-label').textContent = `${count} ${typeSummary}`;
      ctxBar.classList.add('show');
    }
  }

  // Show/hide multi-select section
  let multiSec = document.getElementById('multi-select-section');
  if (!multiSec) _createMultiSelectSection();
  multiSec = document.getElementById('multi-select-section');
  if (multiSec) multiSec.style.display = '';

  // Show size slider only if all selected elements support size
  const allSupportSize = [...S.selectedEls].every(el => {
    const t = el.dataset.type;
    return t !== 'arrow' && !t?.startsWith('shadow') && t !== 'textbox' && t !== 'headline' && t !== 'tag';
  });
  document.getElementById('size-section').style.display = allSupportSize ? '' : 'none';
  if (allSupportSize) {
    // Show average size
    const sizes = [...S.selectedEls].map(el => parseFloat(el.dataset.scale || '1') * 100);
    const avg = sizes.reduce((a, b) => a + b, 0) / sizes.length;
    document.getElementById('size-slider').value = avg;
    document.getElementById('size-val').textContent = (avg / 100).toFixed(1) + '×';
  }

  // Show player-specific multi-edit if all are players
  if (types.size === 1 && types.has('player')) {
    const playerSec = document.getElementById('player-edit-section');
    if (playerSec) {
      playerSec.style.display = '';
      // Clear individual fields — they apply to all
      document.getElementById('number-input').value = '';
      document.getElementById('number-input').placeholder = 'mixed';
      document.getElementById('name-input').value = '';
      document.getElementById('name-input').placeholder = 'mixed';
    }
  }
}

function _createMultiSelectSection() {
  // The multi-select section is just a visual indicator — the real controls
  // are reused from existing sections (size, delete, player color via team color dots)
  // Nothing extra needed since we reuse the existing size slider and delete button
}

// ─── Marquee Selection ──────────────────────────────────────────────────────
export function startMarquee(e) {
  if (S.tool !== 'select') return;
  const pt = S.getSVGPoint(e);
  _marqueeOrigin = { x: pt.x, y: pt.y };

  const ns = 'http://www.w3.org/2000/svg';
  _marquee = document.createElementNS(ns, 'rect');
  _marquee.setAttribute('class', 'marquee-rect');
  _marquee.setAttribute('x', pt.x);
  _marquee.setAttribute('y', pt.y);
  _marquee.setAttribute('width', 0);
  _marquee.setAttribute('height', 0);
  _marquee.setAttribute('fill', 'rgba(79,156,249,0.1)');
  _marquee.setAttribute('stroke', 'rgba(79,156,249,0.6)');
  _marquee.setAttribute('stroke-width', '1');
  _marquee.setAttribute('stroke-dasharray', '4,3');
  _marquee.setAttribute('pointer-events', 'none');
  S.svg.appendChild(_marquee);
}

export function updateMarquee(e) {
  if (!_marquee || !_marqueeOrigin) return;
  const pt = S.getSVGPoint(e);
  const x = Math.min(_marqueeOrigin.x, pt.x);
  const y = Math.min(_marqueeOrigin.y, pt.y);
  const w = Math.abs(pt.x - _marqueeOrigin.x);
  const h = Math.abs(pt.y - _marqueeOrigin.y);
  _marquee.setAttribute('x', x);
  _marquee.setAttribute('y', y);
  _marquee.setAttribute('width', w);
  _marquee.setAttribute('height', h);
}

export function cleanupMarquee() {
  if (_marquee) { _marquee.remove(); _marquee = null; }
  _marqueeOrigin = null;
}

export function endMarquee(e) {
  if (!_marquee || !_marqueeOrigin) { cleanupMarquee(); return; }
  const pt = S.getSVGPoint(e);
  const x1 = Math.min(_marqueeOrigin.x, pt.x);
  const y1 = Math.min(_marqueeOrigin.y, pt.y);
  const x2 = Math.max(_marqueeOrigin.x, pt.x);
  const y2 = Math.max(_marqueeOrigin.y, pt.y);

  _marquee.remove();
  _marquee = null;
  _marqueeOrigin = null;

  // Don't select if marquee is too small (probably a click)
  if (x2 - x1 < 5 && y2 - y1 < 5) return;

  // Find all elements whose center falls inside the marquee
  const additive = e.ctrlKey || e.metaKey;
  if (!additive) {
    // Clear previous selection
    for (const el of S.selectedEls) deselectVisual(el);
    S.clearSelectedEls();
    if (S.selectedEl) { deselectVisual(S.selectedEl); S.setSelectedEl(null); }
  }

  const layers = [S.playersLayer, S.objectsLayer];
  for (const layer of layers) {
    for (const el of layer.children) {
      if (!el.dataset?.type) continue;
      const cx = parseFloat(el.dataset.cx);
      const cy = parseFloat(el.dataset.cy);
      if (cx >= x1 && cx <= x2 && cy >= y1 && cy <= y2) {
        // Add visual highlight without opening panel
        _applySelectHighlight(el);
        S.addSelectedEl(el);
        S.setSelectedEl(el);
      }
    }
  }

  if (S.selectedEls.size === 1) {
    // Single element selected — show normal panel
    const el = [...S.selectedEls][0];
    select(el);
  } else if (S.selectedEls.size > 1) {
    _updateMultiSelectUI();
  }
}

function _applySelectHighlight(el) {
  const type = el.dataset.type;
  if (type === 'player' || type === 'referee' || type === 'ball' || type === 'cone') {
    el.querySelector('circle:not(.hit-area),polygon')?.setAttribute('stroke-width', '3');
    if (type === 'player' || type === 'referee') el.querySelector('circle:not(.hit-area)')?.setAttribute('stroke', 'rgba(79,156,249,0.8)');
  }
  if (type === 'arrow') {
    const w = parseFloat(el.dataset.arrowWidth || '2.5');
    el.querySelector('.arrow-line')?.setAttribute('stroke-width', w + 1.5);
  }
  if (type?.startsWith('shadow')) {
    const shape = el.querySelector('rect,ellipse');
    if (shape) {
      if (!el.dataset.savedStroke) el.dataset.savedStroke = shape.getAttribute('stroke');
      shape.setAttribute('stroke', 'rgba(79,156,249,0.9)');
    }
  }
  if (type === 'spotlight') {
    const ring = el.querySelector('.spotlight-ring') || el.querySelector('ellipse:not(.spotlight-glow)');
    if (ring) {
      if (!el.dataset.savedStroke) el.dataset.savedStroke = ring.getAttribute('stroke');
      ring.setAttribute('stroke', 'rgba(79,156,249,0.9)');
    }
  }
  if (type === 'textbox') {
    const bg = el.querySelector('.textbox-bg');
    if (bg) { bg.setAttribute('stroke', 'rgba(79,156,249,0.8)'); bg.setAttribute('stroke-width', '1.5'); }
  }
  if (type === 'headline') {
    const bg = el.querySelector('.headline-bg');
    if (bg) { bg.setAttribute('stroke', 'rgba(79,156,249,0.8)'); bg.setAttribute('stroke-width', '1.5'); }
  }
  if (type === 'freeform') {
    const shape = el.querySelector('.freeform-shape');
    if (shape) {
      if (!el.dataset.savedStroke) el.dataset.savedStroke = shape.getAttribute('stroke');
      shape.setAttribute('stroke', 'rgba(79,156,249,0.9)');
    }
  }
  if (type === 'motion') {
    const trail = el.querySelector('.motion-trail');
    if (trail) {
      if (!el.dataset.savedStroke) el.dataset.savedStroke = trail.getAttribute('stroke');
      trail.setAttribute('stroke', 'rgba(79,156,249,0.9)');
      trail.setAttribute('opacity', '1');
    }
  }
  if (type === 'tag') {
    const tagLine = el.querySelector('.tag-line');
    if (tagLine) {
      if (!el.dataset.savedStroke) el.dataset.savedStroke = tagLine.getAttribute('stroke');
      tagLine.setAttribute('stroke', 'rgba(79,156,249,0.9)');
    }
    const tagDot = el.querySelector('.tag-dot');
    if (tagDot) {
      if (!el.dataset.savedDotFill) el.dataset.savedDotFill = tagDot.getAttribute('fill');
      tagDot.setAttribute('fill', 'rgba(79,156,249,0.9)');
    }
  }
  if (type === 'vision') {
    const shape = el.querySelector('.vision-shape');
    if (shape) {
      if (!el.dataset.savedStroke) el.dataset.savedStroke = shape.getAttribute('stroke') || 'none';
      if (!el.dataset.savedStrokeWidth) el.dataset.savedStrokeWidth = shape.getAttribute('stroke-width') || '1';
      shape.setAttribute('stroke', 'rgba(255,255,255,0.6)');
      shape.setAttribute('stroke-width', '1.5');
      shape.setAttribute('stroke-dasharray', '4,3');
    }
  }
}

// ─── Helper for multi-select property editing ─────────────────────────────────
export function forEachSelected(type, fn) {
  for (const el of S.selectedEls) {
    if (!type || el.dataset.type === type) fn(el);
  }
}

// ─── Bind drag events ────────────────────────────────────────────────────────
S.svg.addEventListener('mousemove', onDrag);
S.svg.addEventListener('touchmove', onDrag, { passive: false });
S.svg.addEventListener('mouseup', stopDrag);
S.svg.addEventListener('touchend', stopDrag);
document.addEventListener('mouseup', stopDrag);

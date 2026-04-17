import * as S from './state.js';
import { rebuildPitch } from './pitch.js';
import { deselect, switchTab, select, makeDraggable, applyTransform } from './interaction.js';
import { trackModeSwitch, trackElementInserted } from './analytics.js';
import { addPlayer, addBall, addCone, addReferee, addArrow, addShadow, addSpotlight, addVision, addTextBox, addHeadline, addTag } from './elements.js';

// ─── Trigger file picker ──────────────────────────────────────────────────────
export function triggerImageUpload() {
  document.getElementById('image-file-input').click();
}

// ─── Handle file selection ────────────────────────────────────────────────────
export function handleImageUpload(input) {
  const file = input.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    const dataUrl = reader.result;
    const img = new Image();
    img.onload = () => {
      enterImageMode(dataUrl, img.naturalWidth, img.naturalHeight);
    };
    img.src = dataUrl;
  };
  reader.readAsDataURL(file);

  // Reset input so the same file can be re-selected
  input.value = '';
}

// ─── Enter Image Mode ─────────────────────────────────────────────────────────
export function enterImageMode(dataUrl, natW, natH) {
  deselect();
  trackModeSwitch('image');

  S.setAppMode('image');
  S.setImageData(dataUrl);
  S.setImageDimensions({ width: natW, height: natH });

  // Clear undo stack (cross-mode undo is confusing)
  S.undoStack.length = 0;

  // Compute SVG dimensions — fit within max 900w x 680h preserving aspect ratio
  const maxW = 900, maxH = 680;
  const ratio = natW / natH;
  let W, H;
  if (ratio > maxW / maxH) {
    W = Math.min(natW, maxW);
    H = W / ratio;
  } else {
    H = Math.min(natH, maxH);
    W = H * ratio;
  }
  W = Math.round(W);
  H = Math.round(H);

  const svgEl = S.svg;
  svgEl.setAttribute('width', W);
  svgEl.setAttribute('height', H);
  svgEl.setAttribute('viewBox', `0 0 ${W} ${H}`);

  // Remove all pitch elements (keep defs, objects-layer, players-layer)
  Array.from(svgEl.children).forEach(child => {
    if (child.tagName === 'defs' || child.id === 'objects-layer' || child.id === 'players-layer') return;
    child.remove();
  });

  // Clear existing objects/players
  S.objectsLayer.innerHTML = '';
  S.playersLayer.innerHTML = '';
  S.playerCounts.a = 0;
  S.playerCounts.b = 0;
  S.playerCounts.joker = 0;

  // Insert image as background
  const imgEl = document.createElementNS('http://www.w3.org/2000/svg', 'image');
  imgEl.setAttribute('id', 'image-bg');
  imgEl.setAttribute('href', dataUrl);
  imgEl.setAttribute('x', '0');
  imgEl.setAttribute('y', '0');
  imgEl.setAttribute('width', W);
  imgEl.setAttribute('height', H);
  imgEl.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svgEl.insertBefore(imgEl, S.objectsLayer);

  // Hide canvas upload overlay, show pitch container
  const overlay = document.getElementById('image-upload-overlay');
  const pitchContainer = document.getElementById('pitch-container');
  if (overlay) overlay.classList.remove('visible');
  if (pitchContainer) pitchContainer.style.display = '';

  // Add CSS class for image mode UI
  document.body.classList.add('image-mode');

  // Enable grab-to-pan on the pitch wrap
  _initPanScroll();

  // Update UI and switch to players tab
  updateImageModeUI(true);
  switchTab('players');
}

// ─── Exit Image Mode ──────────────────────────────────────────────────────────
export function exitImageMode() {
  deselect();
  trackModeSwitch('pitch');

  S.setAppMode('pitch');
  S.setImageData(null);
  S.setImageDimensions(null);

  // Clear undo stack
  S.undoStack.length = 0;

  // Remove image background
  const imgBg = document.getElementById('image-bg');
  if (imgBg) imgBg.remove();

  // Clear elements from image mode
  S.objectsLayer.innerHTML = '';
  S.playersLayer.innerHTML = '';
  S.playerCounts.a = 0;
  S.playerCounts.b = 0;
  S.playerCounts.joker = 0;

  // Clean up mini pitch
  cleanupMiniPitch();

  // Remove CSS class
  document.body.classList.remove('image-mode');

  // Restore pitch
  rebuildPitch();

  updateImageModeUI(false);

  // Switch to players tab
  switchTab('players');
}

// ─── Mini Pitch (side pitch for image analysis) ─────────────────────────────
let miniPitchVisible = false;
let miniPitchType = { orient: 'vertical', size: 'full' };
let miniPitchColors = { s1: '#3a7a38', s2: '#367035', line: 'rgba(255,255,255,0.5)' };
let miniPitchOpts = { goals: true, stripes: true };
let _miniSvg = null; // reference to the mini-pitch SVG element
const MINI_ELEMENT_SCALE = 0.55; // scale factor for elements on the mini-pitch
let _originalImageW = null; // original main SVG width before mini-pitch resize
let _originalImageH = null;

export function toggleMiniPitch(show) {
  miniPitchVisible = show;
  const opts = document.getElementById('mini-pitch-options');
  if (opts) opts.style.display = show ? '' : 'none';

  if (show) {
    renderMiniPitch();
  } else {
    _miniSvg = null;
    const existing = document.getElementById('mini-pitch-wrap');
    if (existing) existing.remove();
    // Remove flex layout from pitch container
    const pc = document.getElementById('pitch-container');
    if (pc) { pc.style.display = ''; pc.style.gap = ''; }
    // Restore main SVG to original size
    _restoreMainSvgSize();
  }
}

function _restoreMainSvgSize() {
  if (_originalImageW == null || _originalImageH == null) return;
  const svgEl = S.svg;
  svgEl.setAttribute('width', _originalImageW);
  svgEl.setAttribute('height', _originalImageH);
  // viewBox stays at original — never changed
  _originalImageW = null;
  _originalImageH = null;
}

function _resizeMainSvgForMiniPitch(mpTotalW) {
  const svgEl = S.svg;
  const pitchWrap = document.getElementById('pitch-wrap');
  if (!pitchWrap || !svgEl) return;

  // Save original display dimensions (only on first call)
  if (_originalImageW == null) {
    _originalImageW = parseFloat(svgEl.getAttribute('width'));
    _originalImageH = parseFloat(svgEl.getAttribute('height'));
  }

  // Temporarily restore original size so pitchWrap reports its true width
  // (otherwise each re-render shrinks further because pitchWrap reflects the
  // already-shrunk content)
  svgEl.setAttribute('width', _originalImageW);
  svgEl.setAttribute('height', _originalImageH);

  // Force layout recalc before measuring
  const available = pitchWrap.clientWidth - mpTotalW;
  if (available <= 0 || _originalImageW <= available) return;

  // Scale down display size proportionally — viewBox stays the same
  // so element coordinates and image-bg remain correct
  const ratio = _originalImageW / _originalImageH;
  const newW = Math.round(available);
  const newH = Math.round(newW / ratio);

  svgEl.setAttribute('width', newW);
  svgEl.setAttribute('height', newH);
}

export function setMiniPitchType(el) {
  document.querySelectorAll('.mini-pitch-grid .pitch-visual-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  miniPitchType.orient = el.dataset.mpOrient;
  miniPitchType.size = el.dataset.mpSize;
  if (miniPitchVisible) renderMiniPitch();
}

export function setMiniPitchColor(el) {
  document.querySelectorAll('.mp-color-dot').forEach(d => d.classList.remove('selected'));
  el.classList.add('selected');
  const stripes = document.getElementById('mp-toggle-stripes')?.checked;
  miniPitchColors.s1 = el.dataset.s1;
  miniPitchColors.s2 = stripes ? (el.dataset.s2s || el.dataset.s1) : el.dataset.s1;
  if (miniPitchVisible) renderMiniPitch();
}

export function setMiniPitchLine(el) {
  document.querySelectorAll('.mp-line-dot').forEach(d => d.classList.remove('selected'));
  el.classList.add('selected');
  miniPitchColors.line = el.dataset.line;
  if (miniPitchVisible) renderMiniPitch();
}

export function updateMiniPitch() {
  miniPitchOpts.goals = document.getElementById('mp-toggle-goals')?.checked ?? true;
  const stripes = document.getElementById('mp-toggle-stripes')?.checked ?? true;
  miniPitchOpts.stripes = stripes;
  // Update s2 based on stripe toggle
  const activeDot = document.querySelector('.mp-color-dot.selected');
  if (activeDot) {
    miniPitchColors.s2 = stripes ? (activeDot.dataset.s2s || activeDot.dataset.s1) : miniPitchColors.s1;
  }
  if (miniPitchVisible) renderMiniPitch();
}

function renderMiniPitch() {
  // Preserve existing elements from old mini-pitch before removing it
  const savedElements = [];
  if (_miniSvg) {
    const oldObjLayer = _miniSvg.querySelector('#mp-objects-layer');
    const oldPlLayer = _miniSvg.querySelector('#mp-players-layer');
    if (oldObjLayer) Array.from(oldObjLayer.children).forEach(el => savedElements.push({ layer: 'objects', el }));
    if (oldPlLayer) Array.from(oldPlLayer.children).forEach(el => savedElements.push({ layer: 'players', el }));
  }

  // Remove old
  let wrap = document.getElementById('mini-pitch-wrap');
  if (wrap) wrap.remove();
  _miniSvg = null;

  const pc = document.getElementById('pitch-container');
  if (!pc) return;

  // Make pitch container flex so image + mini-pitch sit side by side
  pc.style.display = 'flex';
  pc.style.alignItems = 'flex-start';
  pc.style.gap = '12px';

  // Create the mini-pitch wrapper
  wrap = document.createElement('div');
  wrap.id = 'mini-pitch-wrap';

  const isV = miniPitchType.orient === 'vertical';
  const size = miniPitchType.size;

  // Dimensions — sized to be usable for placing players
  let W, H;
  if (size === 'half') {
    W = isV ? 240 : 200; H = isV ? 200 : 240;
  } else if (size === 'middle') {
    W = isV ? 240 : 180; H = isV ? 180 : 240;
  } else if (size === '3q') {
    W = isV ? 240 : 280; H = isV ? 280 : 240;
  } else {
    W = isV ? 240 : 340; H = isV ? 340 : 240;
  }

  // Resize main SVG so both fit without cropping
  _resizeMainSvgForMiniPitch(W + 12);

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', W);
  svg.setAttribute('height', H);
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('overflow', 'visible');
  svg.style.borderRadius = '6px';
  svg.style.flexShrink = '0';

  // Stripe pattern
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  const pat = document.createElementNS('http://www.w3.org/2000/svg', 'pattern');
  pat.setAttribute('id', 'mp-stripes');
  pat.setAttribute('patternUnits', 'userSpaceOnUse');
  if (isV) {
    pat.setAttribute('width', H); pat.setAttribute('height', '20');
    const r1 = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    r1.setAttribute('width', H); r1.setAttribute('height', '10'); r1.setAttribute('fill', miniPitchColors.s1);
    const r2 = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    r2.setAttribute('y', '10'); r2.setAttribute('width', H); r2.setAttribute('height', '10'); r2.setAttribute('fill', miniPitchColors.s2);
    pat.appendChild(r1); pat.appendChild(r2);
  } else {
    pat.setAttribute('width', '20'); pat.setAttribute('height', H);
    const r1 = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    r1.setAttribute('width', '10'); r1.setAttribute('height', H); r1.setAttribute('fill', miniPitchColors.s1);
    const r2 = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    r2.setAttribute('x', '10'); r2.setAttribute('width', '10'); r2.setAttribute('height', H); r2.setAttribute('fill', miniPitchColors.s2);
    pat.appendChild(r1); pat.appendChild(r2);
  }
  defs.appendChild(pat);
  // Clone essential defs from main SVG (markers, filters) so elements render correctly
  const mainDefs = S.svg.querySelector('defs');
  if (mainDefs) {
    mainDefs.querySelectorAll('marker, filter').forEach(def => {
      defs.appendChild(def.cloneNode(true));
    });
  }
  svg.appendChild(defs);

  // Background
  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  bg.setAttribute('width', W); bg.setAttribute('height', H);
  bg.setAttribute('fill', miniPitchOpts.stripes ? 'url(#mp-stripes)' : miniPitchColors.s1);
  bg.setAttribute('rx', '6');
  svg.appendChild(bg);

  const LC = miniPitchColors.line;
  const hasGoals = miniPitchOpts.goals;
  function mk(tag, attrs) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.entries(attrs).forEach(([k,v]) => el.setAttribute(k, v));
    svg.appendChild(el);
    return el;
  }

  const pad = 10;
  const pw = W - pad*2, ph = H - pad*2;
  const cx = W/2, cy = H/2;
  const pbHW = Math.round(pw * 0.27);  // penalty box half-width scaled
  const gaHW = Math.round(pw * 0.125);

  if (size === 'middle') {
    // Middle third
    if (isV) {
      mk('line',{x1:pad,y1:pad,x2:pad,y2:pad+ph,stroke:LC,'stroke-width':'1.2'});
      mk('line',{x1:pad+pw,y1:pad,x2:pad+pw,y2:pad+ph,stroke:LC,'stroke-width':'1.2'});
      mk('line',{x1:pad,y1:cy,x2:pad+pw,y2:cy,stroke:LC,'stroke-width':'1'});
      mk('circle',{cx:cx,cy:cy,r:Math.round(pw*0.2),fill:'none',stroke:LC,'stroke-width':'1'});
      mk('circle',{cx:cx,cy:cy,r:'2',fill:LC});
    } else {
      mk('line',{x1:pad,y1:pad,x2:pad+pw,y2:pad,stroke:LC,'stroke-width':'1.2'});
      mk('line',{x1:pad,y1:pad+ph,x2:pad+pw,y2:pad+ph,stroke:LC,'stroke-width':'1.2'});
      mk('line',{x1:cx,y1:pad,x2:cx,y2:pad+ph,stroke:LC,'stroke-width':'1'});
      mk('circle',{cx:cx,cy:cy,r:Math.round(ph*0.2),fill:'none',stroke:LC,'stroke-width':'1'});
      mk('circle',{cx:cx,cy:cy,r:'2',fill:LC});
    }
  } else if (size === 'full') {
    mk('rect',{x:pad,y:pad,width:pw,height:ph,fill:'none',stroke:LC,'stroke-width':'1.2'});
    if (isV) {
      mk('line',{x1:pad,y1:cy,x2:pad+pw,y2:cy,stroke:LC,'stroke-width':'1'});
      mk('circle',{cx:cx,cy:cy,r:Math.round(pw*0.2),fill:'none',stroke:LC,'stroke-width':'1'});
      mk('circle',{cx:cx,cy:cy,r:'2',fill:LC});
      const pbW = Math.round(pw*0.54), gaW = Math.round(pw*0.25);
      mk('rect',{x:cx-pbW/2,y:pad,width:pbW,height:Math.round(ph*0.15),fill:'none',stroke:LC,'stroke-width':'0.8'});
      mk('rect',{x:cx-gaW/2,y:pad,width:gaW,height:Math.round(ph*0.06),fill:'none',stroke:LC,'stroke-width':'0.8'});
      mk('rect',{x:cx-pbW/2,y:pad+ph-Math.round(ph*0.15),width:pbW,height:Math.round(ph*0.15),fill:'none',stroke:LC,'stroke-width':'0.8'});
      mk('rect',{x:cx-gaW/2,y:pad+ph-Math.round(ph*0.06),width:gaW,height:Math.round(ph*0.06),fill:'none',stroke:LC,'stroke-width':'0.8'});
      if (hasGoals) {
        const gW = Math.round(pw*0.12), gH = 6;
        mk('rect',{x:cx-gW/2,y:pad-gH,width:gW,height:gH,fill:'none',stroke:LC,'stroke-width':'0.8',rx:'1'});
        mk('rect',{x:cx-gW/2,y:pad+ph,width:gW,height:gH,fill:'none',stroke:LC,'stroke-width':'0.8',rx:'1'});
      }
    } else {
      mk('line',{x1:cx,y1:pad,x2:cx,y2:pad+ph,stroke:LC,'stroke-width':'1'});
      mk('circle',{cx:cx,cy:cy,r:Math.round(ph*0.2),fill:'none',stroke:LC,'stroke-width':'1'});
      mk('circle',{cx:cx,cy:cy,r:'2',fill:LC});
      const pbH = Math.round(ph*0.54), gaH = Math.round(ph*0.25);
      mk('rect',{x:pad,y:cy-pbH/2,width:Math.round(pw*0.15),height:pbH,fill:'none',stroke:LC,'stroke-width':'0.8'});
      mk('rect',{x:pad,y:cy-gaH/2,width:Math.round(pw*0.06),height:gaH,fill:'none',stroke:LC,'stroke-width':'0.8'});
      mk('rect',{x:pad+pw-Math.round(pw*0.15),y:cy-pbH/2,width:Math.round(pw*0.15),height:pbH,fill:'none',stroke:LC,'stroke-width':'0.8'});
      mk('rect',{x:pad+pw-Math.round(pw*0.06),y:cy-gaH/2,width:Math.round(pw*0.06),height:gaH,fill:'none',stroke:LC,'stroke-width':'0.8'});
      if (hasGoals) {
        const gW = 6, gH = Math.round(ph*0.12);
        mk('rect',{x:pad-gW,y:cy-gH/2,width:gW,height:gH,fill:'none',stroke:LC,'stroke-width':'0.8',rx:'1'});
        mk('rect',{x:pad+pw,y:cy-gH/2,width:gW,height:gH,fill:'none',stroke:LC,'stroke-width':'0.8',rx:'1'});
      }
    }
  } else if (size === 'half') {
    if (isV) {
      mk('rect',{x:pad,y:pad,width:pw,height:ph,fill:'none',stroke:LC,'stroke-width':'1.2'});
      const pbW = Math.round(pw*0.54), gaW = Math.round(pw*0.25);
      mk('rect',{x:cx-pbW/2,y:pad+ph-Math.round(ph*0.3),width:pbW,height:Math.round(ph*0.3),fill:'none',stroke:LC,'stroke-width':'0.8'});
      mk('rect',{x:cx-gaW/2,y:pad+ph-Math.round(ph*0.12),width:gaW,height:Math.round(ph*0.12),fill:'none',stroke:LC,'stroke-width':'0.8'});
      mk('path',{d:`M${cx-Math.round(pw*0.2)},${pad} A${Math.round(pw*0.2)},${Math.round(pw*0.2)} 0 0,0 ${cx+Math.round(pw*0.2)},${pad}`,fill:'none',stroke:LC,'stroke-width':'0.8'});
      if (hasGoals) {
        const gW = Math.round(pw*0.12), gH = 6;
        mk('rect',{x:cx-gW/2,y:pad+ph,width:gW,height:gH,fill:'none',stroke:LC,'stroke-width':'0.8',rx:'1'});
      }
    } else {
      mk('rect',{x:pad,y:pad,width:pw,height:ph,fill:'none',stroke:LC,'stroke-width':'1.2'});
      const pbH = Math.round(ph*0.54), gaH = Math.round(ph*0.25);
      mk('rect',{x:pad+pw-Math.round(pw*0.3),y:cy-pbH/2,width:Math.round(pw*0.3),height:pbH,fill:'none',stroke:LC,'stroke-width':'0.8'});
      mk('rect',{x:pad+pw-Math.round(pw*0.12),y:cy-gaH/2,width:Math.round(pw*0.12),height:gaH,fill:'none',stroke:LC,'stroke-width':'0.8'});
      mk('path',{d:`M${pad},${cy-Math.round(ph*0.2)} A${Math.round(ph*0.2)},${Math.round(ph*0.2)} 0 0,1 ${pad},${cy+Math.round(ph*0.2)}`,fill:'none',stroke:LC,'stroke-width':'0.8'});
      if (hasGoals) {
        const gW = 6, gH = Math.round(ph*0.12);
        mk('rect',{x:pad+pw,y:cy-gH/2,width:gW,height:gH,fill:'none',stroke:LC,'stroke-width':'0.8',rx:'1'});
      }
    }
  } else if (size === '3q') {
    if (isV) {
      mk('line',{x1:pad,y1:pad,x2:pad+pw,y2:pad,stroke:LC,'stroke-width':'1.2'});
      mk('line',{x1:pad,y1:pad,x2:pad,y2:pad+ph,stroke:LC,'stroke-width':'1.2'});
      mk('line',{x1:pad+pw,y1:pad,x2:pad+pw,y2:pad+ph,stroke:LC,'stroke-width':'1.2'});
      const halfY = pad + Math.round(ph*0.33);
      mk('line',{x1:pad,y1:halfY,x2:pad+pw,y2:halfY,stroke:LC,'stroke-width':'1'});
      mk('circle',{cx:cx,cy:halfY,r:Math.round(pw*0.2),fill:'none',stroke:LC,'stroke-width':'1'});
      const pbW = Math.round(pw*0.54), gaW = Math.round(pw*0.25);
      mk('rect',{x:cx-pbW/2,y:pad+ph-Math.round(ph*0.2),width:pbW,height:Math.round(ph*0.2),fill:'none',stroke:LC,'stroke-width':'0.8'});
      mk('rect',{x:cx-gaW/2,y:pad+ph-Math.round(ph*0.08),width:gaW,height:Math.round(ph*0.08),fill:'none',stroke:LC,'stroke-width':'0.8'});
      mk('line',{x1:pad,y1:pad+ph,x2:pad+pw,y2:pad+ph,stroke:LC,'stroke-width':'1.2'});
      if (hasGoals) {
        const gW = Math.round(pw*0.12), gH = 6;
        mk('rect',{x:cx-gW/2,y:pad+ph,width:gW,height:gH,fill:'none',stroke:LC,'stroke-width':'0.8',rx:'1'});
      }
    } else {
      mk('line',{x1:pad,y1:pad,x2:pad,y2:pad+ph,stroke:LC,'stroke-width':'1.2'});
      mk('line',{x1:pad,y1:pad,x2:pad+pw,y2:pad,stroke:LC,'stroke-width':'1.2'});
      mk('line',{x1:pad,y1:pad+ph,x2:pad+pw,y2:pad+ph,stroke:LC,'stroke-width':'1.2'});
      const halfX = pad + Math.round(pw*0.33);
      mk('line',{x1:halfX,y1:pad,x2:halfX,y2:pad+ph,stroke:LC,'stroke-width':'1'});
      mk('circle',{cx:halfX,cy:cy,r:Math.round(ph*0.2),fill:'none',stroke:LC,'stroke-width':'1'});
      const pbH = Math.round(ph*0.54), gaH = Math.round(ph*0.25);
      mk('rect',{x:pad+pw-Math.round(pw*0.2),y:cy-pbH/2,width:Math.round(pw*0.2),height:pbH,fill:'none',stroke:LC,'stroke-width':'0.8'});
      mk('rect',{x:pad+pw-Math.round(pw*0.12),y:cy-gaH/2,width:Math.round(pw*0.12),height:gaH,fill:'none',stroke:LC,'stroke-width':'0.8'});
      mk('line',{x1:pad+pw,y1:pad,x2:pad+pw,y2:pad+ph,stroke:LC,'stroke-width':'1.2'});
      if (hasGoals) {
        const gW = 6, gH = Math.round(ph*0.12);
        mk('rect',{x:pad+pw,y:cy-gH/2,width:gW,height:gH,fill:'none',stroke:LC,'stroke-width':'0.8',rx:'1'});
      }
    }
  }

  // Add interactive layers for elements
  const objLayer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  objLayer.setAttribute('id', 'mp-objects-layer');
  svg.appendChild(objLayer);
  const plLayer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  plLayer.setAttribute('id', 'mp-players-layer');
  svg.appendChild(plLayer);

  // Restore preserved elements
  for (const item of savedElements) {
    const targetLayer = item.layer === 'players' ? plLayer : objLayer;
    targetLayer.appendChild(item.el);
  }

  // Store reference and bind interaction
  _miniSvg = svg;
  _bindMiniPitchInteraction(svg);

  wrap.appendChild(svg);
  pc.appendChild(wrap);
}

// ─── Mini-pitch interaction ──────────────────────────────────────────────────
function _getMiniSVGPoint(e) {
  if (!_miniSvg) return null;
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  const pt = _miniSvg.createSVGPoint();
  pt.x = clientX; pt.y = clientY;
  return pt.matrixTransform(_miniSvg.getScreenCTM().inverse());
}

// Arrow drawing state for mini-pitch
let _mpArrowDrawing = false;
let _mpArrowStart = null;
let _mpArrowPreview = null;

function _bindMiniPitchInteraction(svgEl) {
  // Click handler — mirrors main SVG click handler for element placement
  svgEl.addEventListener('click', e => {
    if (S.dragMoved) return;
    const pt = _getMiniSVGPoint(e);
    if (!pt) return;

    let placed = null;
    const mpObjLayer = svgEl.querySelector('#mp-objects-layer');
    const mpPlLayer = svgEl.querySelector('#mp-players-layer');
    if (!mpObjLayer || !mpPlLayer) return;

    if (S.tool !== 'select' && S.tool !== 'arrow') S.pushUndo();

    if (S.tool === 'player-a') placed = addPlayer(pt.x, pt.y, 'a');
    else if (S.tool === 'player-b') placed = addPlayer(pt.x, pt.y, 'b');
    else if (S.tool === 'player-joker') placed = addPlayer(pt.x, pt.y, 'joker');
    else if (S.tool === 'ball') placed = addBall(pt.x, pt.y);
    else if (S.tool === 'cone') placed = addCone(pt.x, pt.y);
    else if (S.tool === 'referee') placed = addReferee(pt.x, pt.y);
    else if (S.tool === 'shadow-circle') placed = addShadow(pt.x, pt.y, 'shadow-circle');
    else if (S.tool === 'shadow-rect') placed = addShadow(pt.x, pt.y, 'shadow-rect');
    else if (S.tool === 'spotlight') placed = addSpotlight(pt.x, pt.y);
    else if (S.tool === 'textbox') placed = addTextBox(pt.x, pt.y);
    else if (S.tool === 'headline') placed = addHeadline(pt.x, pt.y);
    else if (S.tool === 'tag') placed = addTag(pt.x, pt.y);

    if (placed) {
      // Move element from main SVG layers to mini-pitch layers
      const t = placed.dataset.type;
      const isPlayerType = (t === 'player' || t === 'referee' || t === 'ball' || t === 'cone');
      const targetLayer = isPlayerType ? mpPlLayer : mpObjLayer;
      targetLayer.appendChild(placed); // automatically removes from old parent

      // Scale down for mini-pitch
      const currentScale = parseFloat(placed.dataset.scale || '1');
      placed.dataset.scale = String(currentScale * MINI_ELEMENT_SCALE);
      placed.dataset.miniPitch = '1'; // mark as belonging to mini-pitch
      applyTransform(placed);

      trackElementInserted(t);

      // Players stay in placement mode
      if (S.tool === 'player-a' || S.tool === 'player-b' || S.tool === 'player-joker') {
        // Stay in player mode
      } else {
        S.setTool('select'); select(placed);
      }
    } else if (S.tool === 'select') {
      if (!e.target.closest('[data-type]')) deselect();
    }
  });

  // Arrow drawing on mini-pitch
  svgEl.addEventListener('mousedown', e => {
    if (S.tool !== 'arrow') return;
    e.preventDefault();
    const pt = _getMiniSVGPoint(e);
    if (!pt) return;
    _mpArrowDrawing = true;
    _mpArrowStart = { x: pt.x, y: pt.y };
    const st = S.ARROW_STYLES[S.arrowType] || S.ARROW_STYLES.run;
    const preview = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    preview.setAttribute('x1', pt.x); preview.setAttribute('y1', pt.y);
    preview.setAttribute('x2', pt.x); preview.setAttribute('y2', pt.y);
    preview.setAttribute('stroke', st.color); preview.setAttribute('stroke-width', '2');
    if (st.dash) preview.setAttribute('stroke-dasharray', st.dash);
    if (st.marker !== 'none') preview.setAttribute('marker-end', st.marker);
    preview.setAttribute('opacity', '0.6'); preview.setAttribute('pointer-events', 'none');
    const mpObjLayer = svgEl.querySelector('#mp-objects-layer');
    if (mpObjLayer) mpObjLayer.appendChild(preview);
    _mpArrowPreview = preview;
  });
  svgEl.addEventListener('touchstart', e => {
    if (S.tool !== 'arrow') return;
    e.preventDefault();
    svgEl.dispatchEvent(new MouseEvent('mousedown', { clientX: e.touches[0].clientX, clientY: e.touches[0].clientY }));
  }, { passive: false });

  svgEl.addEventListener('mousemove', e => {
    if (!_mpArrowDrawing || !_mpArrowPreview) return;
    const pt = _getMiniSVGPoint(e);
    if (!pt) return;
    _mpArrowPreview.setAttribute('x2', pt.x);
    _mpArrowPreview.setAttribute('y2', pt.y);
  });

  svgEl.addEventListener('mouseup', e => {
    if (!_mpArrowDrawing || !_mpArrowPreview) return;
    _mpArrowDrawing = false;
    const pt = _getMiniSVGPoint(e);
    if (_mpArrowPreview) { _mpArrowPreview.remove(); _mpArrowPreview = null; }
    if (!pt || !_mpArrowStart) return;
    const dx = pt.x - _mpArrowStart.x, dy = pt.y - _mpArrowStart.y;
    if (Math.sqrt(dx*dx + dy*dy) > 8) {
      S.pushUndo();
      const arrow = addArrow(_mpArrowStart.x, _mpArrowStart.y, pt.x, pt.y, S.arrowType);
      if (arrow) {
        // Move arrow to mini-pitch and scale
        const mpObjLayer = svgEl.querySelector('#mp-objects-layer');
        if (mpObjLayer) mpObjLayer.appendChild(arrow);
        const sc = parseFloat(arrow.dataset.scale || '1');
        arrow.dataset.scale = String(sc * MINI_ELEMENT_SCALE);
        arrow.dataset.miniPitch = '1';
        // Don't applyTransform for arrows — they use updateArrowVisual
        S.setTool('select'); select(arrow);
      }
    }
    _mpArrowStart = null;
  });
  svgEl.addEventListener('touchend', e => {
    if (!_mpArrowDrawing) return;
    const touch = e.changedTouches?.[0];
    if (touch) svgEl.dispatchEvent(new MouseEvent('mouseup', { clientX: touch.clientX, clientY: touch.clientY }));
  });
}

export function cleanupMiniPitch() {
  miniPitchVisible = false;
  _miniSvg = null;
  const wrap = document.getElementById('mini-pitch-wrap');
  if (wrap) wrap.remove();
  const toggle = document.getElementById('mini-pitch-toggle');
  if (toggle) toggle.checked = false;
  const opts = document.getElementById('mini-pitch-options');
  if (opts) opts.style.display = 'none';
  const pc = document.getElementById('pitch-container');
  if (pc) { pc.style.display = ''; pc.style.gap = ''; }
  // Restore main SVG size
  _restoreMainSvgSize();
}

// ─── Grab-to-pan scrolling on pitch-wrap ──────────────────────────────────────
let _panState = null;
function _initPanScroll() {
  const pw = document.getElementById('pitch-wrap');
  if (!pw || pw._panBound) return;
  pw._panBound = true;

  pw.addEventListener('mousedown', e => {
    // Only pan when clicking on empty area (not on SVG elements or the SVG itself with a tool active)
    if (e.target.closest('[data-type]')) return;
    // Don't pan if a drawing tool is active and click is inside an SVG
    if (S.tool !== 'select' && e.target.closest('svg')) return;
    // Only start pan if there's actually overflow to scroll
    if (pw.scrollWidth <= pw.clientWidth) return;
    _panState = { startX: e.clientX, scrollLeft: pw.scrollLeft };
    pw.style.cursor = 'grabbing';
    e.preventDefault();
  });
  document.addEventListener('mousemove', e => {
    if (!_panState) return;
    const dx = e.clientX - _panState.startX;
    const pw2 = document.getElementById('pitch-wrap');
    if (pw2) pw2.scrollLeft = _panState.scrollLeft - dx;
  });
  document.addEventListener('mouseup', () => {
    if (!_panState) return;
    _panState = null;
    const pw2 = document.getElementById('pitch-wrap');
    if (pw2) pw2.style.cursor = '';
  });
}

// ─── Update UI for image mode ─────────────────────────────────────────────────
function updateImageModeUI(isImageMode) {
  // Show/hide pitch-specific controls
  const pitchPane = document.getElementById('pane-pitch');
  const imagePlaceholder = document.getElementById('image-mode-info');
  const uploadPane = document.getElementById('image-upload-pane');
  if (pitchPane) pitchPane.style.display = isImageMode ? 'none' : '';
  if (imagePlaceholder) imagePlaceholder.style.display = isImageMode ? '' : 'none';
  if (uploadPane) uploadPane.style.display = 'none'; // always hide upload pane when entering/exiting

  // Sync mode bar tab buttons
  const pitchBtn = document.getElementById('mode-pitch-btn');
  const imageBtn = document.getElementById('mode-image-btn');
  if (pitchBtn && imageBtn) {
    pitchBtn.classList.toggle('active', !isImageMode);
    imageBtn.classList.toggle('active', isImageMode);
  }
}

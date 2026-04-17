import * as S from './state.js';
import { rebuildPitch } from './pitch.js';
import { deselect, switchTab } from './interaction.js';
import { trackModeSwitch } from './analytics.js';

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

export function toggleMiniPitch(show) {
  miniPitchVisible = show;
  const opts = document.getElementById('mini-pitch-options');
  if (opts) opts.style.display = show ? '' : 'none';

  if (show) {
    renderMiniPitch();
  } else {
    const existing = document.getElementById('mini-pitch-wrap');
    if (existing) existing.remove();
    // Remove flex layout from pitch container
    const pc = document.getElementById('pitch-container');
    if (pc) { pc.style.display = ''; pc.style.gap = ''; }
  }
}

export function setMiniPitchType(el) {
  document.querySelectorAll('.mini-pitch-grid .pitch-visual-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  miniPitchType.orient = el.dataset.mpOrient;
  miniPitchType.size = el.dataset.mpSize;
  if (miniPitchVisible) renderMiniPitch();
}

function renderMiniPitch() {
  // Remove old
  let wrap = document.getElementById('mini-pitch-wrap');
  if (wrap) wrap.remove();

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

  // Dimensions — small enough to sit beside the image
  let W, H;
  if (size === 'half') {
    W = isV ? 200 : 170; H = isV ? 170 : 200;
  } else if (size === 'middle') {
    W = isV ? 200 : 150; H = isV ? 150 : 200;
  } else if (size === '3q') {
    W = isV ? 200 : 230; H = isV ? 230 : 200;
  } else {
    W = isV ? 200 : 280; H = isV ? 280 : 200;
  }

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', W);
  svg.setAttribute('height', H);
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.style.borderRadius = '6px';
  svg.style.flexShrink = '0';

  // Background
  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  bg.setAttribute('width', W); bg.setAttribute('height', H);
  bg.setAttribute('fill', '#2d5a27'); bg.setAttribute('rx', '6');
  svg.appendChild(bg);

  // Stripes
  const stripe = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  stripe.setAttribute('width', W); stripe.setAttribute('height', H);
  stripe.setAttribute('fill', '#2d5a27');
  svg.appendChild(stripe);

  const LC = 'rgba(255,255,255,0.5)';
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
      // Top penalty
      const pbW = Math.round(pw*0.54), gaW = Math.round(pw*0.25);
      mk('rect',{x:cx-pbW/2,y:pad,width:pbW,height:Math.round(ph*0.15),fill:'none',stroke:LC,'stroke-width':'0.8'});
      mk('rect',{x:cx-gaW/2,y:pad,width:gaW,height:Math.round(ph*0.06),fill:'none',stroke:LC,'stroke-width':'0.8'});
      // Bottom penalty
      mk('rect',{x:cx-pbW/2,y:pad+ph-Math.round(ph*0.15),width:pbW,height:Math.round(ph*0.15),fill:'none',stroke:LC,'stroke-width':'0.8'});
      mk('rect',{x:cx-gaW/2,y:pad+ph-Math.round(ph*0.06),width:gaW,height:Math.round(ph*0.06),fill:'none',stroke:LC,'stroke-width':'0.8'});
    } else {
      mk('line',{x1:cx,y1:pad,x2:cx,y2:pad+ph,stroke:LC,'stroke-width':'1'});
      mk('circle',{cx:cx,cy:cy,r:Math.round(ph*0.2),fill:'none',stroke:LC,'stroke-width':'1'});
      mk('circle',{cx:cx,cy:cy,r:'2',fill:LC});
      const pbH = Math.round(ph*0.54), gaH = Math.round(ph*0.25);
      mk('rect',{x:pad,y:cy-pbH/2,width:Math.round(pw*0.15),height:pbH,fill:'none',stroke:LC,'stroke-width':'0.8'});
      mk('rect',{x:pad,y:cy-gaH/2,width:Math.round(pw*0.06),height:gaH,fill:'none',stroke:LC,'stroke-width':'0.8'});
      mk('rect',{x:pad+pw-Math.round(pw*0.15),y:cy-pbH/2,width:Math.round(pw*0.15),height:pbH,fill:'none',stroke:LC,'stroke-width':'0.8'});
      mk('rect',{x:pad+pw-Math.round(pw*0.06),y:cy-gaH/2,width:Math.round(pw*0.06),height:gaH,fill:'none',stroke:LC,'stroke-width':'0.8'});
    }
  } else if (size === 'half') {
    if (isV) {
      mk('rect',{x:pad,y:pad,width:pw,height:ph,fill:'none',stroke:LC,'stroke-width':'1.2'});
      const pbW = Math.round(pw*0.54), gaW = Math.round(pw*0.25);
      mk('rect',{x:cx-pbW/2,y:pad+ph-Math.round(ph*0.3),width:pbW,height:Math.round(ph*0.3),fill:'none',stroke:LC,'stroke-width':'0.8'});
      mk('rect',{x:cx-gaW/2,y:pad+ph-Math.round(ph*0.12),width:gaW,height:Math.round(ph*0.12),fill:'none',stroke:LC,'stroke-width':'0.8'});
      mk('path',{d:`M${cx-Math.round(pw*0.2)},${pad} A${Math.round(pw*0.2)},${Math.round(pw*0.2)} 0 0,0 ${cx+Math.round(pw*0.2)},${pad}`,fill:'none',stroke:LC,'stroke-width':'0.8'});
    } else {
      mk('rect',{x:pad,y:pad,width:pw,height:ph,fill:'none',stroke:LC,'stroke-width':'1.2'});
      const pbH = Math.round(ph*0.54), gaH = Math.round(ph*0.25);
      mk('rect',{x:pad+pw-Math.round(pw*0.3),y:cy-pbH/2,width:Math.round(pw*0.3),height:pbH,fill:'none',stroke:LC,'stroke-width':'0.8'});
      mk('rect',{x:pad+pw-Math.round(pw*0.12),y:cy-gaH/2,width:Math.round(pw*0.12),height:gaH,fill:'none',stroke:LC,'stroke-width':'0.8'});
      mk('path',{d:`M${pad},${cy-Math.round(ph*0.2)} A${Math.round(ph*0.2)},${Math.round(ph*0.2)} 0 0,1 ${pad},${cy+Math.round(ph*0.2)}`,fill:'none',stroke:LC,'stroke-width':'0.8'});
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
    }
  }

  wrap.appendChild(svg);
  pc.appendChild(wrap);
}

export function cleanupMiniPitch() {
  miniPitchVisible = false;
  const wrap = document.getElementById('mini-pitch-wrap');
  if (wrap) wrap.remove();
  const toggle = document.getElementById('mini-pitch-toggle');
  if (toggle) toggle.checked = false;
  const opts = document.getElementById('mini-pitch-options');
  if (opts) opts.style.display = 'none';
  const pc = document.getElementById('pitch-container');
  if (pc) { pc.style.display = ''; pc.style.gap = ''; }
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

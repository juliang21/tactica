import * as S from './state.js';
import { deselect, deleteSelected, switchTab, select, applyTransform, updateArrowVisual, registerRewrap, registerVisionUpdate, makeDraggable } from './interaction.js';
import { addPlayer, addBall, addCone, addArrow, addShadow, addSpotlight, addTextBox, updateTextBoxBg, rewrapTextBox, addVision, updateVisionPolygon } from './elements.js';
import { setTool, setArrowType, selectTeamContext, applyKit, applyColor, placeFormation,
         liveUpdateNumber, confirmNumber, liveUpdateName, confirmName,
         applyNameSize, applyNameColor, applyNameBg, updatePlayerNameBg,
         applyPlayerFill, applyPlayerBorder,
         openColorPicker, closeColorPicker, confirmColorPicker,
         applyArrowColor, applyArrowStyle, applyArrowWidth,
         applySpotlightColor, setSpotlightColor, applyVisionColor,
         liveUpdateSpotName, confirmSpotName, applySpotNameSize, applySpotNameColor, applySpotNameBg,
         applyZoneFill, applyZoneBorder, applyZoneBorderStyle,
         liveUpdateTextBox, confirmTextBox, applyTextBoxSize, applyTextBoxColor, applyTextBoxBg, applyTextBoxAlign,
         applySize, applyRotation, clearAll } from './ui.js';
import { setPitch, setPitchColor } from './pitch.js';
import { exportImage, selectFmt, closeExport, doExport } from './export.js';
import { triggerImageUpload, handleImageUpload, enterImageMode, exitImageMode } from './imagemode.js';
import { trackElementInserted, trackModeSwitch, trackElementEdited, trackSignUp, trackSignIn, trackSignOut } from './analytics.js';
import { saveAnalysis, loadAnalysis, deleteAnalysis, duplicateAnalysis, listAnalyses, getCurrentId, clearCurrentId, formatDate, quickSave, migrateLocalToCloud } from './storage.js';
import { onAuthChange, signInWithGoogle, signUpWithEmail, signInWithEmail, sendPasswordReset, signOut, getCurrentUser } from './auth.js';

// ─── Wire up cross-module callbacks ─────────────────────────────────────────
registerRewrap(rewrapTextBox);
registerVisionUpdate(updateVisionPolygon);

// ─── Undo ────────────────────────────────────────────────────────────────────
function undo() {
  if (!S.undoStack.length) return;
  deselect();
  const snap = S.undoStack.pop();
  S.objectsLayer.innerHTML = snap.objects;
  S.playersLayer.innerHTML = snap.players;
  S.playerCounts.a = snap.playerCounts.a;
  S.playerCounts.b = snap.playerCounts.b;
  S.setObjectCounter(snap.objectCounter);

  // Re-attach event listeners to all restored elements
  S.objectsLayer.querySelectorAll('[data-type]').forEach(g => {
    makeDraggable(g);
    g.addEventListener('click', e => { if (S.tool === 'select') { e.stopPropagation(); select(g); } });
  });
  S.playersLayer.querySelectorAll('[data-type]').forEach(g => {
    makeDraggable(g);
    g.addEventListener('click', e => { if (S.tool === 'select') { e.stopPropagation(); select(g); } });
    if (g.dataset.type === 'textbox') {
      g.addEventListener('dblclick', e => {
        e.stopPropagation();
        // Trigger inline edit via import
        try { import('./elements.js').then(m => m.openTextBoxEditFn?.(g)); } catch(err) {}
      });
    }
  });
}
window.undo = undo;

// ─── Layer Order ────────────────────────────────────────────────────────────
// SVG renders in document order. objects-layer comes first, then players-layer.
// We treat them as one unified list: [...objects-layer children, ...players-layer children]
// "Forward" moves toward end of players-layer (visually on top).
// "Backward" moves toward start of objects-layer (visually behind).

function getAllOrdered() {
  return [
    ...Array.from(S.objectsLayer.children),
    ...Array.from(S.playersLayer.children)
  ];
}

function layerBringToFront() {
  if (!S.selectedEl) return;
  S.pushUndo();
  S.playersLayer.appendChild(S.selectedEl);
  trackElementEdited(S.selectedEl.dataset.type, 'layer_to_front');
}

function layerBringForward() {
  if (!S.selectedEl) return;
  const all = getAllOrdered();
  const idx = all.indexOf(S.selectedEl);
  if (idx === all.length - 1) return; // already at front
  S.pushUndo();
  const next = all[idx + 1];
  const nextParent = next.parentNode;
  // Insert selected element after next (= before next's next sibling)
  if (next.nextElementSibling) {
    nextParent.insertBefore(S.selectedEl, next.nextElementSibling);
  } else {
    nextParent.appendChild(S.selectedEl);
  }
  trackElementEdited(S.selectedEl.dataset.type, 'layer_forward');
}

function layerSendBackward() {
  if (!S.selectedEl) return;
  const all = getAllOrdered();
  const idx = all.indexOf(S.selectedEl);
  if (idx === 0) return; // already at back
  S.pushUndo();
  const prev = all[idx - 1];
  const prevParent = prev.parentNode;
  prevParent.insertBefore(S.selectedEl, prev);
  trackElementEdited(S.selectedEl.dataset.type, 'layer_backward');
}

function layerSendToBack() {
  if (!S.selectedEl) return;
  S.pushUndo();
  S.objectsLayer.insertBefore(S.selectedEl, S.objectsLayer.firstChild);
  trackElementEdited(S.selectedEl.dataset.type, 'layer_to_back');
}

window.layerBringToFront = layerBringToFront;
window.layerBringForward = layerBringForward;
window.layerSendBackward = layerSendBackward;
window.layerSendToBack = layerSendToBack;

// ─── Expose to inline HTML handlers ──────────────────────────────────────────
// (These bridge the onclick="" attributes in the HTML to the module functions)
window.setTool = setTool;
window.setArrowType = setArrowType;
window.selectTeamContext = selectTeamContext;
window.applyKit = applyKit;
window.applyColor = applyColor;
window.placeFormation = placeFormation;
window.liveUpdateNumber = liveUpdateNumber;
window.confirmNumber = confirmNumber;
window.liveUpdateName = liveUpdateName;
window.confirmName = confirmName;
window.applySize = applySize;
window.applyRotation = applyRotation;
window.clearAll = clearAll;
window.deleteSelected = deleteSelected;
window.switchTab = switchTab;
window.setPitch = setPitch;
window.setPitchColor = setPitchColor;
window.exportImage = exportImage;
window.selectFmt = selectFmt;
window.closeExport = closeExport;
window.doExport = doExport;
window.applyNameSize = applyNameSize;
window.applyNameColor = applyNameColor;
window.applyNameBg = applyNameBg;
window.updatePlayerNameBg = updatePlayerNameBg;
window.applyPlayerFill = applyPlayerFill;
window.applyPlayerBorder = applyPlayerBorder;
window.openColorPicker = openColorPicker;
window.closeColorPicker = closeColorPicker;
window.confirmColorPicker = confirmColorPicker;
window.applyArrowColor = applyArrowColor;
window.applyArrowStyle = applyArrowStyle;
window.applyArrowWidth = applyArrowWidth;
window.applySpotlightColor = applySpotlightColor;
window.applyVisionColor = applyVisionColor;
window.liveUpdateSpotName = liveUpdateSpotName;
window.confirmSpotName = confirmSpotName;
window.applySpotNameSize = applySpotNameSize;
window.applySpotNameColor = applySpotNameColor;
window.applySpotNameBg = applySpotNameBg;
window.applyZoneFill = applyZoneFill;
window.applyZoneBorder = applyZoneBorder;
window.applyZoneBorderStyle = applyZoneBorderStyle;
window.liveUpdateTextBox = liveUpdateTextBox;
window.confirmTextBox = confirmTextBox;
window.applyTextBoxSize = applyTextBoxSize;
window.applyTextBoxColor = applyTextBoxColor;
window.applyTextBoxBg = applyTextBoxBg;
window.applyTextBoxAlign = applyTextBoxAlign;
window.triggerImageUpload = triggerImageUpload;
window.handleImageUpload = handleImageUpload;
window.enterImageMode = enterImageMode;
window.exitImageMode = exitImageMode;

// ─── Mode Switching (Tactical Board vs Image Upload) ────────────────────────
function hasCanvasWork() {
  return S.objectsLayer.children.length > 0 || S.playersLayer.children.length > 0;
}

function switchMode(mode) {
  const pitchBtn = document.getElementById('mode-pitch-btn');
  const imageBtn = document.getElementById('mode-image-btn');

  if (mode === 'image') {
    if (S.appMode === 'image') return;
    // If there's work on the tactical board, confirm before switching
    if (hasCanvasWork()) {
      showModeSwitchModal('Switching to Upload Image will erase all elements on your tactical board. Are you sure?', () => {
        pitchBtn.classList.remove('active');
        imageBtn.classList.add('active');
        triggerImageUpload();
      });
      return;
    }
    pitchBtn.classList.remove('active');
    imageBtn.classList.add('active');
    triggerImageUpload();
  } else {
    if (S.appMode !== 'image') return;
    // If there's work on the image, confirm before switching
    if (hasCanvasWork()) {
      showModeSwitchModal('Switching to Tactical Board will erase all elements on your image. Are you sure?', () => {
        exitImageMode();
        pitchBtn.classList.add('active');
        imageBtn.classList.remove('active');
      });
      return;
    }
    exitImageMode();
    pitchBtn.classList.add('active');
    imageBtn.classList.remove('active');
  }
}
window.switchMode = switchMode;

function showModeSwitchModal(message, onConfirm) {
  const modal = document.getElementById('mode-switch-modal');
  const msg = document.getElementById('mode-switch-msg');
  const confirmBtn = document.getElementById('mode-switch-confirm-btn');
  msg.textContent = message;
  modal.style.display = 'flex';
  // Replace confirm button listener (remove old ones)
  const newBtn = confirmBtn.cloneNode(true);
  confirmBtn.parentNode.replaceChild(newBtn, confirmBtn);
  newBtn.addEventListener('click', () => {
    modal.style.display = 'none';
    onConfirm();
  });
}

function closeModeSwitch() {
  document.getElementById('mode-switch-modal').style.display = 'none';
}
window.closeModeSwitch = closeModeSwitch;

// ─── Mobile Mode Dropdown ────────────────────────────────────────────────────
function toggleModeDropdown() {
  const menu = document.getElementById('mode-dropdown-menu');
  menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
}
window.toggleModeDropdown = toggleModeDropdown;

function selectModeDropdown(mode) {
  document.getElementById('mode-dropdown-menu').style.display = 'none';
  const label = document.getElementById('mode-dropdown-label');
  const options = document.querySelectorAll('.mode-dropdown-option');
  options.forEach(o => o.classList.toggle('active', o.dataset.mode === mode));
  label.textContent = mode === 'pitch' ? 'Tactical Board' : 'Upload Image';
  // Also sync with the desktop tab bar buttons
  switchMode(mode);
}
window.selectModeDropdown = selectModeDropdown;

// Close dropdown when tapping elsewhere
document.addEventListener('click', e => {
  const dd = document.getElementById('mode-dropdown');
  if (dd && !dd.contains(e.target)) {
    document.getElementById('mode-dropdown-menu').style.display = 'none';
  }
});

// Expose teamContext as a live getter so inline onclick handlers can read it
Object.defineProperty(window, 'teamContext', { get: () => S.teamContext });

// ─── SVG Click ────────────────────────────────────────────────────────────────
S.svg.addEventListener('click', e => {
  if (S.dragMoved) return;
  const pt = S.getSVGPoint(e);
  let placed = null;
  if (S.tool !== 'select' && S.tool !== 'arrow') S.pushUndo();
  if (S.tool === 'player-a') placed = addPlayer(pt.x, pt.y, 'a');
  else if (S.tool === 'player-b') placed = addPlayer(pt.x, pt.y, 'b');
  else if (S.tool === 'ball') placed = addBall(pt.x, pt.y);
  else if (S.tool === 'cone') placed = addCone(pt.x, pt.y);
  else if (S.tool === 'shadow-circle') placed = addShadow(pt.x, pt.y, 'shadow-circle');
  else if (S.tool === 'shadow-rect') placed = addShadow(pt.x, pt.y, 'shadow-rect');
  else if (S.tool === 'spotlight') placed = addSpotlight(pt.x, pt.y);
  else if (S.tool === 'vision') placed = addVision(pt.x, pt.y);
  else if (S.tool === 'textbox') placed = addTextBox(pt.x, pt.y);
  if (placed) {
    trackElementInserted(placed.dataset.type);
    // Players stay in placement mode so you can keep adding
    if (S.tool === 'player-a' || S.tool === 'player-b') {
      // Don't switch tool — stay in player mode
    } else {
      setTool('select'); select(placed);
    }
  }
  else if (S.tool === 'select') {
    // Only deselect if click was on empty pitch, not on an element
    if (!e.target.closest('[data-type]')) deselect();
  }
});

// ─── Arrow Drawing ────────────────────────────────────────────────────────────
// Helper: get SVG point from mouse or touch event
function getEventPoint(e) {
  if (e.touches && e.touches.length) return S.getSVGPoint(e.touches[0]);
  if (e.changedTouches && e.changedTouches.length) return S.getSVGPoint(e.changedTouches[0]);
  return S.getSVGPoint(e);
}

function arrowStart(e) {
  if (S.tool !== 'arrow') return;
  e.preventDefault();
  const pt = getEventPoint(e);
  S.setArrowDrawing(true);
  S.setArrowStart(pt);
  const st = S.ARROW_STYLES[S.arrowType];
  const preview = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  preview.setAttribute('x1', pt.x); preview.setAttribute('y1', pt.y);
  preview.setAttribute('x2', pt.x); preview.setAttribute('y2', pt.y);
  preview.setAttribute('stroke', st.color); preview.setAttribute('stroke-width', '2.5');
  preview.setAttribute('stroke-linecap', 'round');
  if (st.dash) preview.setAttribute('stroke-dasharray', st.dash);
  if (st.marker !== 'none') preview.setAttribute('marker-end', st.marker);
  preview.setAttribute('opacity', '0.6'); preview.setAttribute('pointer-events', 'none');
  S.objectsLayer.appendChild(preview);
  S.setArrowPreview(preview);
}
S.svg.addEventListener('mousedown', arrowStart);
S.svg.addEventListener('touchstart', arrowStart, { passive: false });

function arrowMove(e) {
  if (!S.arrowDrawing || !S.arrowPreview) return;
  const pt = getEventPoint(e);
  S.arrowPreview.setAttribute('x2', pt.x); S.arrowPreview.setAttribute('y2', pt.y);
}
S.svg.addEventListener('mousemove', arrowMove);
S.svg.addEventListener('touchmove', arrowMove, { passive: false });

function arrowEnd(e) {
  if (!S.arrowDrawing || !S.arrowPreview) return;
  S.setArrowDrawing(false);
  const pt = getEventPoint(e);
  S.arrowPreview.remove();
  S.setArrowPreview(null);
  const dx = pt.x - S.arrowStart.x, dy = pt.y - S.arrowStart.y;
  if (Math.sqrt(dx*dx + dy*dy) > 10) {
    S.pushUndo();
    const arrow = addArrow(S.arrowStart.x, S.arrowStart.y, pt.x, pt.y, S.arrowType);
    if (arrow) { setTool('select'); select(arrow); }
  }
}
S.svg.addEventListener('mouseup', arrowEnd);
S.svg.addEventListener('touchend', arrowEnd);

// ─── Copy / Paste ────────────────────────────────────────────────────────────
let clipboard = null;
let lastMouseSVG = { x: 350, y: 240 }; // default to center

S.svg.addEventListener('mousemove', e => {
  const pt = S.getSVGPoint(e);
  lastMouseSVG.x = pt.x; lastMouseSVG.y = pt.y;
});

function copySelected() {
  if (!S.selectedEl) return;
  const el = S.selectedEl;
  const t = el.dataset.type;
  const data = { type: t };

  if (t === 'player') {
    const circ = el.querySelector('circle:not(.hit-area)');
    data.team = el.dataset.team;
    data.label = el.dataset.label;
    data.isGK = el.dataset.isGK === '1';
    data.fill = circ?.getAttribute('fill');
    data.stroke = circ?.getAttribute('stroke');
    data.borderColor = el.dataset.borderColor;
    data.playerName = el.dataset.playerName || '';
    data.nameSize = el.dataset.nameSize || '11';
    data.nameColor = el.querySelector('.player-name')?.getAttribute('fill') || 'rgba(255,255,255,0.9)';
    data.scale = el.dataset.scale || '1';
  } else if (t === 'ball') {
    data.scale = el.dataset.scale || '0.7';
  } else if (t === 'cone') {
    data.scale = el.dataset.scale || '1';
  } else if (t === 'arrow') {
    const line = el.querySelector('line');
    data.arrowType = el.dataset.arrowType;
    data.color = line?.getAttribute('stroke');
    data.dash = line?.getAttribute('stroke-dasharray') || '';
    data.width = el.dataset.arrowWidth || '2.5';
    data.marker = line?.getAttribute('marker-end') || '';
    data.dx1 = el.dataset.dx1; data.dy1 = el.dataset.dy1;
    data.dx2 = el.dataset.dx2; data.dy2 = el.dataset.dy2;
  } else if (t === 'textbox') {
    data.textContent = el.dataset.textContent || 'Text';
    data.textSize = el.dataset.textSize || '14';
    data.textColor = el.dataset.textColor || 'rgba(255,255,255,0.9)';
    data.textBg = el.dataset.textBg || 'rgba(0,0,0,0.5)';
    data.textAlign = el.dataset.textAlign || 'center';
    data.hw = el.dataset.hw || '60'; data.hh = el.dataset.hh || '20';
    data.rotation = el.dataset.rotation || '0';
  } else if (t === 'spotlight') {
    data.rx = el.dataset.rx || '28';
    data.ry = el.dataset.ry || '5';
    data.spotColor = el.dataset.spotColor || 'rgba(255,255,255,0.85)';
    data.spotName = el.dataset.spotName || '';
    data.spotNameSize = el.dataset.spotNameSize || '11';
    data.spotNameColor = el.dataset.spotNameColor || 'rgba(255,255,255,0.9)';
    data.spotNameBg = el.dataset.spotNameBg || 'rgba(0,0,0,0.5)';
    data.scale = el.dataset.scale || '1';
  } else if (t === 'vision') {
    data.scale = el.dataset.scale || '1';
    data.rotation = el.dataset.rotation || '0';
    data.visionColor = el.dataset.visionColor || 'rgba(147,197,253,0.5)';
    data.visionLength = el.dataset.visionLength || '80';
    data.visionSpread = el.dataset.visionSpread || '35';
  } else if (t?.startsWith('shadow')) {
    const shape = el.querySelector('rect,ellipse');
    data.hw = el.dataset.hw || '30'; data.hh = el.dataset.hh || '20';
    data.rotation = el.dataset.rotation || '0';
    data.fill = shape?.getAttribute('fill');
    // Use savedStroke (real color) since stroke is overwritten by selection highlight
    data.stroke = el.dataset.savedStroke || shape?.getAttribute('stroke');
    data.dash = shape?.getAttribute('stroke-dasharray') || '';
  }
  clipboard = data;
}

function pasteClipboard() {
  if (!clipboard) return;
  S.pushUndo();
  const d = clipboard;
  const x = lastMouseSVG.x, y = lastMouseSVG.y;
  let placed = null;

  if (d.type === 'player') {
    placed = addPlayer(x, y, d.team, d.label, d.isGK);
    if (placed) {
      const circ = placed.querySelector('circle:not(.hit-area)');
      if (circ && d.fill) { circ.setAttribute('fill', d.fill); circ.setAttribute('stroke', d.stroke || ''); }
      if (d.borderColor) placed.dataset.borderColor = d.borderColor;
      if (d.playerName) {
        placed.dataset.playerName = d.playerName;
        const nameEl = placed.querySelector('.player-name');
        if (nameEl) { nameEl.textContent = d.playerName; nameEl.style.display = ''; nameEl.setAttribute('fill', d.nameColor); }
      }
      placed.dataset.nameSize = d.nameSize;
      placed.dataset.scale = d.scale;
    }
  } else if (d.type === 'ball') {
    placed = addBall(x, y);
    if (placed) placed.dataset.scale = d.scale;
  } else if (d.type === 'cone') {
    placed = addCone(x, y);
    if (placed) placed.dataset.scale = d.scale;
  } else if (d.type === 'arrow') {
    const dx = parseFloat(d.dx2) - parseFloat(d.dx1);
    const dy = parseFloat(d.dy2) - parseFloat(d.dy1);
    placed = addArrow(x - dx/2, y - dy/2, x + dx/2, y + dy/2, d.arrowType);
    if (placed) {
      const line = placed.querySelector('line');
      if (line && d.color) {
        line.setAttribute('stroke', d.color);
        if (d.dash) line.setAttribute('stroke-dasharray', d.dash);
        else line.removeAttribute('stroke-dasharray');
        if (d.marker) line.setAttribute('marker-end', d.marker);
        line.setAttribute('stroke-width', d.width);
      }
      placed.dataset.arrowWidth = d.width;
    }
  } else if (d.type === 'textbox') {
    placed = addTextBox(x, y, d.textContent);
    if (placed) {
      placed.dataset.textSize = d.textSize;
      placed.dataset.textColor = d.textColor;
      placed.dataset.textBg = d.textBg;
      placed.dataset.textAlign = d.textAlign;
      placed.dataset.hw = d.hw; placed.dataset.hh = d.hh;
      placed.dataset.rotation = d.rotation;
      const txt = placed.querySelector('text');
      if (txt) txt.setAttribute('fill', d.textColor);
      rewrapTextBox(placed);
    }
  } else if (d.type === 'spotlight') {
    placed = addSpotlight(x, y);
    if (placed) {
      placed.dataset.rx = d.rx; placed.dataset.ry = d.ry;
      placed.dataset.scale = d.scale;
      // Apply color
      if (d.spotColor !== 'rgba(255,255,255,0.85)') {
        setSpotlightColor(placed, d.spotColor);
      }
      // Apply name
      if (d.spotName) {
        placed.dataset.spotName = d.spotName;
        placed.dataset.spotNameSize = d.spotNameSize;
        placed.dataset.spotNameColor = d.spotNameColor;
        placed.dataset.spotNameBg = d.spotNameBg;
        const nameEl = placed.querySelector('.spotlight-name');
        if (nameEl) {
          nameEl.textContent = d.spotName;
          nameEl.style.display = '';
          nameEl.setAttribute('fill', d.spotNameColor);
          nameEl.setAttribute('font-size', d.spotNameSize);
        }
        const nameBg = placed.querySelector('.spotlight-name-bg');
        if (nameBg && d.spotNameBg !== 'none') {
          nameBg.setAttribute('fill', d.spotNameBg);
          nameBg.style.display = '';
        }
      }
    }
  } else if (d.type === 'vision') {
    placed = addVision(x, y);
    if (placed) {
      placed.dataset.scale = d.scale;
      placed.dataset.rotation = d.rotation;
      placed.dataset.visionColor = d.visionColor;
      placed.dataset.visionLength = d.visionLength;
      placed.dataset.visionSpread = d.visionSpread;
      const shape = placed.querySelector('.vision-shape');
      if (shape) shape.setAttribute('fill', d.visionColor);
    }
  } else if (d.type?.startsWith('shadow')) {
    placed = addShadow(x, y, d.type);
    if (placed) {
      placed.dataset.hw = d.hw; placed.dataset.hh = d.hh;
      placed.dataset.rotation = d.rotation;
      const shape = placed.querySelector('rect,ellipse');
      if (shape) {
        if (d.fill) shape.setAttribute('fill', d.fill);
        if (d.stroke) shape.setAttribute('stroke', d.stroke);
        if (d.dash) shape.setAttribute('stroke-dasharray', d.dash);
        else shape.removeAttribute('stroke-dasharray');
      }
    }
  }

  if (placed) {
    if (d.type === 'arrow') {
      updateArrowVisual(placed);
    } else {
      applyTransform(placed);
    }
    setTool('select');
    select(placed);
  }
}

// ─── Keyboard Shortcuts ───────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  const typing = document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA');
  if (e.key === 'Escape') { if (typing) document.activeElement.blur(); else { setTool('select'); deselect(); } }
  if ((e.key === 'Delete' || e.key === 'Backspace') && S.selectedEl && !typing) deleteSelected();

  // Undo (Cmd+Z)
  if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !typing) { e.preventDefault(); undo(); return; }
  // Copy / Paste (Cmd+C / Cmd+V)
  if ((e.metaKey || e.ctrlKey) && e.key === 'c' && !typing) { e.preventDefault(); copySelected(); return; }
  if ((e.metaKey || e.ctrlKey) && e.key === 'v' && !typing) { e.preventDefault(); pasteClipboard(); return; }

  if (typing) return;
  if (e.key === 'v') setTool('select');
  if (e.key === 'a') setTool('player-a');
  if (e.key === 'b') setTool('player-b');
  if (e.key === '1') { setArrowType('run'); setTool('arrow'); }
  if (e.key === '2') { setArrowType('pass'); setTool('arrow'); }
  if (e.key === '3') { setArrowType('line'); setTool('arrow'); }
  if (e.key === 'l') setTool('ball');
  if (e.key === 'c') setTool('cone');
  if (e.key === 'z') setTool('shadow-circle');
  if (e.key === 'x') setTool('shadow-rect');
  if (e.key === 't') setTool('textbox');
});

// ─── Export Modal Backdrop Click ──────────────────────────────────────────────
document.addEventListener('click', e => {
  const modal = document.getElementById('export-modal');
  if (e.target === modal) closeExport();
  const cpModal = document.getElementById('color-picker-modal');
  if (e.target === cpModal) closeColorPicker();
  const msModal = document.getElementById('mode-switch-modal');
  if (e.target === msModal) closeModeSwitch();
});

// ─── Feedback Widget ─────────────────────────────────────────────────────────
let feedbackType = 'improvement';

function toggleFeedback() {
  const panel = document.getElementById('feedback-panel');
  panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
  // Reset on open
  if (panel.style.display === 'block') {
    document.getElementById('fb-email').value = '';
    document.getElementById('fb-message').value = '';
    document.getElementById('fb-status').style.display = 'none';
    document.getElementById('fb-submit').disabled = false;
    document.getElementById('fb-submit').textContent = 'Send Feedback';
    document.getElementById('fb-file').value = '';
    document.getElementById('fb-upload-text').textContent = 'Attach screenshot (optional)';
    document.getElementById('fb-upload-label').classList.remove('has-file');
    feedbackFile = null;
  }
}

function setFeedbackType(btn) {
  document.querySelectorAll('.fb-type-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  feedbackType = btn.dataset.fbtype;
}

let feedbackFile = null;

function onFeedbackFile(input) {
  const label = document.getElementById('fb-upload-label');
  const textEl = document.getElementById('fb-upload-text');
  if (input.files && input.files[0]) {
    feedbackFile = input.files[0];
    textEl.textContent = feedbackFile.name;
    label.classList.add('has-file');
  } else {
    feedbackFile = null;
    textEl.textContent = 'Attach screenshot (optional)';
    label.classList.remove('has-file');
  }
}

function compressImage(file, maxWidth, quality) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxWidth / img.width);
      const canvas = document.createElement('canvas');
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(blob => resolve(blob), 'image/jpeg', quality);
    };
    img.src = URL.createObjectURL(file);
  });
}

async function submitFeedback() {
  const msg = document.getElementById('fb-message').value.trim();
  if (!msg) { document.getElementById('fb-message').focus(); return; }

  const btn = document.getElementById('fb-submit');
  const status = document.getElementById('fb-status');
  btn.disabled = true;
  btn.textContent = 'Sending…';
  status.style.display = 'none';

  const email = document.getElementById('fb-email').value.trim();

  try {
    const formData = new FormData();
    formData.append('access_key', '315e7f89-890f-4b05-8b81-605325f4f8e4');
    formData.append('subject', `Táctica Feedback: ${feedbackType}`);
    formData.append('type', feedbackType);
    formData.append('message', msg);
    formData.append('from_name', 'Táctica Feedback');
    if (email) formData.append('email', email);

    // Upload screenshot to temp host and include URL
    if (feedbackFile) {
      btn.textContent = 'Uploading image…';
      const compressed = await compressImage(feedbackFile, 800, 0.6);
      const uploadData = new FormData();
      uploadData.append('reqtype', 'fileupload');
      uploadData.append('time', '72h');
      uploadData.append('fileToUpload', compressed, 'screenshot.jpg');
      const uploadRes = await fetch('https://litterbox.catbox.moe/resources/internals/api.php', { method: 'POST', body: uploadData });
      if (uploadRes.ok) {
        const imageUrl = (await uploadRes.text()).trim();
        formData.set('message', msg + `\n\nScreenshot: ${imageUrl}`);
      }
    }

    btn.textContent = 'Sending…';
    const res = await fetch('https://api.web3forms.com/submit', {
      method: 'POST',
      headers: { 'Accept': 'application/json' },
      body: formData,
    });

    const data = await res.json().catch(() => ({}));
    if (res.ok && data.success) {
      status.textContent = 'Thanks! Feedback sent.';
      status.className = 'success';
      status.style.display = 'block';
      btn.textContent = 'Sent ✓';
      setTimeout(() => toggleFeedback(), 1800);
    } else {
      throw new Error(data.message || 'Send failed');
    }
  } catch(e) {
    console.error('Feedback error:', e);
    status.textContent = e.message || 'Failed to send. Please try again.';
    status.className = 'error';
    status.style.display = 'block';
    btn.textContent = 'Send Feedback';
    btn.disabled = false;
  }
}

window.toggleFeedback = toggleFeedback;
window.setFeedbackType = setFeedbackType;
window.submitFeedback = submitFeedback;
window.onFeedbackFile = onFeedbackFile;

// ─── Save Menu & Analysis Management ────────────────────────────────────────
function toggleSaveMenu() {
  const menu = document.getElementById('save-menu');
  const btn = document.querySelector('.save-btn');
  if (menu.style.display === 'none') {
    menu.style.display = 'block';
    // Position relative to save button
    const rect = btn.getBoundingClientRect();
    const isMobile = window.innerWidth <= 768;
    if (isMobile) {
      menu.style.left = rect.left + 'px';
      menu.style.bottom = (window.innerHeight - rect.top + 12) + 'px';
      menu.style.top = 'auto';
      menu.style.right = 'auto';
    } else {
      menu.style.left = (rect.right + 8) + 'px';
      menu.style.bottom = Math.max(8, window.innerHeight - rect.bottom) + 'px';
      menu.style.top = 'auto';
    }
  } else {
    menu.style.display = 'none';
  }
}
window.toggleSaveMenu = toggleSaveMenu;

function closeSaveMenu() {
  document.getElementById('save-menu').style.display = 'none';
}
window.closeSaveMenu = closeSaveMenu;

// Close save menu when clicking elsewhere
document.addEventListener('click', e => {
  const wrapper = document.querySelector('.save-wrapper');
  if (wrapper && !wrapper.contains(e.target)) {
    document.getElementById('save-menu').style.display = 'none';
  }
});

function openSaveAnalysis() {
  closeSaveMenu();
  const modal = document.getElementById('save-analysis-modal');
  const input = document.getElementById('save-analysis-name');
  // Pre-fill with current name if editing existing
  const currentId = getCurrentId();
  if (currentId) {
    const analyses = listAnalyses();
    const current = analyses.find(a => a.id === currentId);
    if (current) input.value = current.name;
    else input.value = '';
  } else {
    input.value = '';
  }
  modal.style.display = 'flex';
  setTimeout(() => input.focus(), 100);
}
window.openSaveAnalysis = openSaveAnalysis;

function closeSaveAnalysis() {
  document.getElementById('save-analysis-modal').style.display = 'none';
}
window.closeSaveAnalysis = closeSaveAnalysis;

async function confirmSaveAnalysis() {
  const input = document.getElementById('save-analysis-name');
  const name = input.value.trim();
  if (!name) { input.focus(); return; }

  await saveAnalysis(name);
  closeSaveAnalysis();
  showSaveToast('Analysis saved');
  await updateCurrentBar();
}
window.confirmSaveAnalysis = confirmSaveAnalysis;

function showSaveToast(msg) {
  const toast = document.getElementById('save-toast');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2200);
}

// ─── Top Notification Bar ────────────────────────────────────────────────────
let _notifTimeout = null;
function showNotification(message, type = 'info', duration = 5000) {
  const bar = document.getElementById('notif-bar');
  const msg = document.getElementById('notif-message');
  if (!bar || !msg) return;
  // Clear any pending hide
  if (_notifTimeout) { clearTimeout(_notifTimeout); _notifTimeout = null; }
  // Set message and type
  msg.textContent = message;
  bar.className = 'notif-bar notif-' + type;
  // Force reflow then show
  void bar.offsetHeight;
  bar.classList.add('show');
  // Auto-hide after duration (0 = stay until closed)
  if (duration > 0) {
    _notifTimeout = setTimeout(() => hideNotification(), duration);
  }
}
window.showNotification = showNotification;

function hideNotification() {
  const bar = document.getElementById('notif-bar');
  if (!bar) return;
  bar.classList.remove('show');
  if (_notifTimeout) { clearTimeout(_notifTimeout); _notifTimeout = null; }
}
window.hideNotification = hideNotification;

// ─── Analyses Dashboard ──────────────────────────────────────────────────────
function openMyAnalyses() {
  closeSaveMenu();
  const dashboard = document.getElementById('analyses-dashboard');
  dashboard.style.display = 'flex';
  renderAnalysesGrid();
}
window.openMyAnalyses = openMyAnalyses;

function closeMyAnalyses() {
  document.getElementById('analyses-dashboard').style.display = 'none';
}
window.closeMyAnalyses = closeMyAnalyses;

async function renderAnalysesGrid() {
  const grid = document.getElementById('analyses-grid');
  const emptyState = document.getElementById('analyses-empty');
  const countBadge = document.getElementById('analyses-count');
  const analyses = await listAnalyses();

  countBadge.textContent = analyses.length + (analyses.length === 1 ? ' analysis' : ' analyses');

  if (analyses.length === 0) {
    grid.style.display = 'none';
    emptyState.style.display = 'flex';
    return;
  }

  grid.style.display = 'grid';
  emptyState.style.display = 'none';
  const currentId = getCurrentId();

  grid.innerHTML = analyses.map(a => `
    <div class="analysis-card${a.id === currentId ? ' current' : ''}" data-id="${a.id}" onclick="loadAnalysisFromCard('${a.id}')">
      <div class="analysis-card-thumb">
        ${a.thumbnail ? `<img src="${a.thumbnail}" alt="${a.name}">` : '<span class="no-thumb">No preview</span>'}
      </div>
      <div class="analysis-card-info">
        <div class="analysis-card-name" title="${a.name}">${a.name}</div>
        <div class="analysis-card-meta">
          <span class="analysis-card-date">${formatDate(a.updatedAt)}</span>
          <div class="analysis-card-actions">
            <button class="analysis-card-action" onclick="event.stopPropagation();duplicateFromCard('${a.id}')" title="Duplicate">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="4" y="4" width="8" height="8" rx="1" stroke="currentColor" stroke-width="1.2"/><path d="M10 4V3a1 1 0 00-1-1H3a1 1 0 00-1 1v6a1 1 0 001 1h1" stroke="currentColor" stroke-width="1.2"/></svg>
            </button>
            <button class="analysis-card-action delete" onclick="event.stopPropagation();askDeleteAnalysis('${a.id}','${a.name.replace(/'/g, "\\'")}')" title="Delete">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2.5 4h9M5 4V2.5h4V4M3.5 4v7.5a1 1 0 001 1h5a1 1 0 001-1V4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  `).join('');
}

async function loadAnalysisFromCard(id) {
  const analysis = await loadAnalysis(id, reattachListeners);
  if (analysis) {
    closeMyAnalyses();
    showNotification('Analysis loaded: ' + analysis.name, 'info', 4000);
    await updateCurrentBar();
  }
}
window.loadAnalysisFromCard = loadAnalysisFromCard;

function reattachListeners() {
  // Re-attach drag + click listeners to all restored elements
  [S.objectsLayer, S.playersLayer].forEach(layer => {
    layer.querySelectorAll('[data-type]').forEach(g => {
      makeDraggable(g);
      g.addEventListener('click', e => { if (S.tool === 'select') { e.stopPropagation(); select(g); } });
      if (g.dataset.type === 'textbox') {
        g.addEventListener('dblclick', e => {
          e.stopPropagation();
          try { import('./elements.js').then(m => m.openTextBoxEditFn?.(g)); } catch(err) {}
        });
      }
    });
  });
}

async function duplicateFromCard(id) {
  const copy = await duplicateAnalysis(id);
  if (copy) {
    await renderAnalysesGrid();
    showSaveToast('Duplicated');
  }
}
window.duplicateFromCard = duplicateFromCard;

let pendingDeleteId = null;
function askDeleteAnalysis(id, name) {
  pendingDeleteId = id;
  document.getElementById('delete-analysis-msg').textContent = `Delete "${name}"? This cannot be undone.`;
  document.getElementById('delete-analysis-modal').style.display = 'flex';
}
window.askDeleteAnalysis = askDeleteAnalysis;

function closeDeleteAnalysis() {
  document.getElementById('delete-analysis-modal').style.display = 'none';
  pendingDeleteId = null;
}
window.closeDeleteAnalysis = closeDeleteAnalysis;

async function confirmDeleteAnalysis() {
  if (pendingDeleteId) {
    await deleteAnalysis(pendingDeleteId);
    pendingDeleteId = null;
  }
  closeDeleteAnalysis();
  await renderAnalysesGrid();
  await updateCurrentBar();
}
window.confirmDeleteAnalysis = confirmDeleteAnalysis;

function newAnalysisFromDashboard() {
  // Clear the board
  clearCurrentId();
  S.objectsLayer.innerHTML = '';
  S.playersLayer.innerHTML = '';
  S.playerCounts.a = 0;
  S.playerCounts.b = 0;
  S.setObjectCounter(0);
  S.undoStack.length = 0;
  closeMyAnalyses();
  updateCurrentBar();
  showSaveToast('New analysis');
}
window.newAnalysisFromDashboard = newAnalysisFromDashboard;

// ─── Current Analysis Bar ────────────────────────────────────────────────────
async function updateCurrentBar() {
  const bar = document.getElementById('current-analysis-bar');
  if (!bar) return;
  const currentId = getCurrentId();
  if (currentId) {
    const analyses = await listAnalyses();
    const current = analyses.find(a => a.id === currentId);
    if (current) {
      bar.querySelector('span').textContent = current.name;
      bar.classList.add('show');
      return;
    }
  }
  bar.classList.remove('show');
}

// Initialize bar on load
updateCurrentBar();

// ─── Auto-save on Cmd+S ──────────────────────────────────────────────────────
document.addEventListener('keydown', async e => {
  if ((e.metaKey || e.ctrlKey) && e.key === 's') {
    e.preventDefault();
    const saved = await quickSave();
    if (saved) {
      showSaveToast('Auto-saved');
    } else {
      openSaveAnalysis();
    }
  }
});

// ─── Modal backdrop close ────────────────────────────────────────────────────
document.addEventListener('click', e => {
  if (e.target === document.getElementById('save-analysis-modal')) closeSaveAnalysis();
  if (e.target === document.getElementById('delete-analysis-modal')) closeDeleteAnalysis();
});

// ─── Mobile panel toggle ──────────────────────────────────────────────────────
function toggleMobilePanel() {
  const panel = document.getElementById('side-panel');
  const backdrop = document.getElementById('mobile-backdrop');
  const isOpen = panel.classList.toggle('open');
  if (backdrop) backdrop.classList.toggle('show', isOpen);
}
window.toggleMobilePanel = toggleMobilePanel;

// ─── Mobile: auto-switch to vertical pitch for better fit ─────────────────────
if (window.innerWidth <= 768 && S.currentPitchLayout === 'full-h' && S.appMode !== 'image') {
  setPitch('full-v');
}

// ─── Auth UI ────────────────────────────────────────────────────────────────
function updateAuthUI(user) {
  const menuIcon = document.getElementById('app-menu-icon');
  const menuAvatarImg = document.getElementById('app-menu-avatar-img');
  const menuAvatarInitials = document.getElementById('app-menu-avatar-initials');
  const menuUserInfo = document.getElementById('app-menu-user-info');
  const menuUserName = document.getElementById('app-menu-user-name');
  const menuUserEmail = document.getElementById('app-menu-user-email');
  const menuUserDivider = document.getElementById('app-menu-user-divider');
  const menuSignin = document.getElementById('app-menu-signin');
  const menuSignout = document.getElementById('app-menu-signout');
  const menuSignoutDivider = document.getElementById('app-menu-signout-divider');
  const menuBtn = document.getElementById('app-menu-btn');

  if (user) {
    // Show avatar, hide hamburger icon
    menuIcon.style.display = 'none';
    menuBtn.style.borderColor = 'var(--accent)';

    if (user.photoURL) {
      menuAvatarImg.src = user.photoURL;
      menuAvatarImg.style.display = 'block';
      menuAvatarInitials.style.display = 'none';
    } else {
      menuAvatarImg.style.display = 'none';
      menuAvatarInitials.style.display = 'flex';
      const name = user.displayName || user.email || 'U';
      menuAvatarInitials.textContent = name.charAt(0).toUpperCase();
    }

    // Dropdown: show user info, hide sign-in, show sign-out
    menuUserInfo.style.display = 'block';
    menuUserName.textContent = user.displayName || 'User';
    menuUserEmail.textContent = user.email || '';
    menuUserDivider.style.display = 'block';
    menuSignin.style.display = 'none';
    menuSignout.style.display = 'flex';
    menuSignoutDivider.style.display = 'block';
  } else {
    // Show hamburger icon, hide avatar
    menuIcon.style.display = 'flex';
    menuAvatarImg.style.display = 'none';
    menuAvatarInitials.style.display = 'none';
    menuBtn.style.borderColor = '';

    // Dropdown: hide user info, show sign-in, hide sign-out
    menuUserInfo.style.display = 'none';
    menuUserDivider.style.display = 'none';
    menuSignin.style.display = 'flex';
    menuSignout.style.display = 'none';
    menuSignoutDivider.style.display = 'none';
  }
}

function toggleAppMenu() {
  const dd = document.getElementById('app-menu-dropdown');
  const isOpen = dd.style.display !== 'none';
  dd.style.display = isOpen ? 'none' : 'block';
}
window.toggleAppMenu = toggleAppMenu;

// Close app menu when clicking outside
document.addEventListener('click', (e) => {
  const wrapper = document.getElementById('app-menu-wrapper');
  const dd = document.getElementById('app-menu-dropdown');
  if (wrapper && dd && !wrapper.contains(e.target)) {
    dd.style.display = 'none';
  }
});

function openAuthModal() {
  document.getElementById('auth-modal').style.display = 'flex';
  switchAuthTab('signin');
  clearAuthMessage();
}
window.openAuthModal = openAuthModal;

function closeAuthModal() {
  document.getElementById('auth-modal').style.display = 'none';
  clearAuthMessage();
}
window.closeAuthModal = closeAuthModal;

function switchAuthTab(tab) {
  document.getElementById('auth-form-signin').style.display = tab === 'signin' ? 'flex' : 'none';
  document.getElementById('auth-form-signup').style.display = tab === 'signup' ? 'flex' : 'none';
  document.getElementById('auth-form-forgot').style.display = tab === 'forgot' ? 'flex' : 'none';

  const tabSignin = document.getElementById('auth-tab-signin');
  const tabSignup = document.getElementById('auth-tab-signup');
  tabSignin.classList.toggle('active', tab === 'signin' || tab === 'forgot');
  tabSignup.classList.toggle('active', tab === 'signup');

  // Show/hide Google button and divider for forgot
  const googleBtn = document.querySelector('.auth-google-btn');
  const divider = document.querySelector('.auth-divider');
  if (googleBtn) googleBtn.style.display = tab === 'forgot' ? 'none' : 'flex';
  if (divider) divider.style.display = tab === 'forgot' ? 'none' : 'flex';

  clearAuthMessage();
}
window.switchAuthTab = switchAuthTab;

function showAuthMessage(msg, type) {
  const el = document.getElementById('auth-message');
  el.textContent = msg;
  el.className = 'auth-message ' + type;
  el.style.display = 'block';
}

function clearAuthMessage() {
  const el = document.getElementById('auth-message');
  el.style.display = 'none';
  el.textContent = '';
}

async function doGoogleSignIn() {
  clearAuthMessage();
  const { user, error } = await signInWithGoogle();
  if (error) showAuthMessage(error, 'error');
  else if (user) trackSignIn('google');
}
window.doGoogleSignIn = doGoogleSignIn;

async function doEmailSignIn() {
  clearAuthMessage();
  const email = document.getElementById('auth-email-in').value.trim();
  const pass = document.getElementById('auth-pass-in').value;
  if (!email || !pass) { showAuthMessage('Please fill in all fields.', 'error'); return; }
  const { user, error } = await signInWithEmail(email, pass);
  if (error) showAuthMessage(error, 'error');
  else if (user) trackSignIn('email');
}
window.doEmailSignIn = doEmailSignIn;

async function doEmailSignUp() {
  clearAuthMessage();
  const name = document.getElementById('auth-name-up').value.trim();
  const email = document.getElementById('auth-email-up').value.trim();
  const pass = document.getElementById('auth-pass-up').value;
  if (!email || !pass) { showAuthMessage('Please fill in email and password.', 'error'); return; }
  const { user, error } = await signUpWithEmail(email, pass, name);
  if (error) showAuthMessage(error, 'error');
  else if (user) trackSignUp('email');
}
window.doEmailSignUp = doEmailSignUp;

async function doPasswordReset() {
  clearAuthMessage();
  const email = document.getElementById('auth-email-reset').value.trim();
  if (!email) { showAuthMessage('Please enter your email.', 'error'); return; }
  const { success, error } = await sendPasswordReset(email);
  if (error) showAuthMessage(error, 'error');
  else showAuthMessage('Reset link sent! Check your inbox.', 'success');
}
window.doPasswordReset = doPasswordReset;

async function doSignOut() {
  await signOut();
  trackSignOut();
  const dropdown = document.getElementById('user-dropdown');
  if (dropdown) dropdown.style.display = 'none';
  showNotification('You have been signed out', 'info', 4000);
}
window.doSignOut = doSignOut;

// (toggleUserMenu removed — replaced by toggleAppMenu)

// ─── Auth State Listener ────────────────────────────────────────────────────
let _authInitialized = false;
onAuthChange(async (user) => {
  updateAuthUI(user);
  closeAuthModal();
  if (user) {
    // Migrate localStorage to cloud on first sign-in
    try { await migrateLocalToCloud(user.uid); } catch (e) { console.warn('Migration error:', e); }
    // Show welcome notification (skip on initial page load auto-restore)
    if (_authInitialized) {
      const name = user.displayName || user.email || 'User';
      showNotification('Welcome back, ' + name + '!', 'success', 4000);
    }
  }
  _authInitialized = true;
  await updateCurrentBar();
});

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

  // Remove CSS class
  document.body.classList.remove('image-mode');

  // Restore pitch
  rebuildPitch();

  updateImageModeUI(false);

  // Switch to players tab
  switchTab('players');
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

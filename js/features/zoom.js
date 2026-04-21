// ─── Pitch Zoom ─────────────────────────────────────────────────────────────
// Extracted from app.js — controls pitch zoom level via buttons and Ctrl/Cmd+scroll.

let _zoomLevel = 1;
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 2.5;
const ZOOM_STEP = 0.1;

function applyZoom() {
  const container = document.getElementById('pitch-container');
  if (!container) return;
  container.style.transform = `scale(${_zoomLevel})`;
  container.style.transformOrigin = 'center center';
  document.getElementById('zoom-level').textContent = Math.round(_zoomLevel * 100) + '%';
}

export function zoomIn() {
  _zoomLevel = Math.min(ZOOM_MAX, _zoomLevel + ZOOM_STEP);
  applyZoom();
}
window.zoomIn = zoomIn;

export function zoomOut() {
  _zoomLevel = Math.max(ZOOM_MIN, _zoomLevel - ZOOM_STEP);
  applyZoom();
}
window.zoomOut = zoomOut;

export function zoomReset() {
  _zoomLevel = 1;
  applyZoom();
}
window.zoomReset = zoomReset;

// Scroll wheel zoom (Ctrl/Cmd + scroll)
document.getElementById('canvas-wrap')?.addEventListener('wheel', (e) => {
  if (!e.ctrlKey && !e.metaKey) return;
  e.preventDefault();
  if (e.deltaY < 0) zoomIn();
  else zoomOut();
}, { passive: false });

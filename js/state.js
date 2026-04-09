// ─── Global State ─────────────────────────────────────────────────────────────
export let tool = 'select';
export let arrowType = 'run';
export let visionType = 'pointed';
export function setVisionType(v) { visionType = v; }
export let selectedEl = null;
export const selectedEls = new Set();
export let teamContext = 'a';
export let teamColors = { a: '#8B5CF6', b: '#FBBF24', joker: '#EF4444' };
export let gkColors   = { a: '#a8f0d0', b: '#f4cca8', joker: '#fca5a5' };
export let objectCounter = 0;
export let playerCounts = { a: 0, b: 0, joker: 0 };
export let isDragging = false;
export let dragMoved = false;
export let dragOffX = 0;
export let dragOffY = 0;
export let endpointDragging = null;   // 'start' | 'end' | null
export function setEndpointDragging(v) { endpointDragging = v; }
export let arrowDrawing = false;
export let arrowStart = null;
export let arrowPreview = null;
export let currentPitchLayout = 'full-h';
export let pitchColors = { s1: '#3a7a38', s2: '#367035', line: 'rgba(255,255,255,0.55)' };
export let exportFmt = 'png';

// ─── Image Analysis Mode ─────────────────────────────────────────────────────
export let appMode = 'pitch';           // 'pitch' | 'image'
export let imageData = null;            // base64 data URL of uploaded image
export let imageDimensions = null;      // { width, height }
export function setAppMode(v) { appMode = v; }
export function setImageData(v) { imageData = v; }
export function setImageDimensions(v) { imageDimensions = v; }

// ─── Undo Stack ──────────────────────────────────────────────────────────────
export const undoStack = [];
const MAX_UNDO = 40;

export function pushUndo() {
  const objLayer = document.getElementById('objects-layer');
  const plLayer = document.getElementById('players-layer');
  undoStack.push({
    objects: objLayer.innerHTML,
    players: plLayer.innerHTML,
    playerCounts: { ...playerCounts },
    objectCounter: objectCounter
  });
  if (undoStack.length > MAX_UNDO) undoStack.shift();
}

// Setters for primitives (modules can't reassign imports)
export function setTool(v) { tool = v; }
export function setArrowType(v) { arrowType = v; }
export function setSelectedEl(v) { selectedEl = v; }
export function addSelectedEl(el) { selectedEls.add(el); }
export function removeSelectedEl(el) { selectedEls.delete(el); }
export function clearSelectedEls() { selectedEls.clear(); }
export function setTeamContext(v) { teamContext = v; }
export function setObjectCounter(v) { objectCounter = v; }
export function nextObjectId() { return ++objectCounter; }
export function setIsDragging(v) { isDragging = v; }
export function setDragMoved(v) { dragMoved = v; }
export function setDragOffX(v) { dragOffX = v; }
export function setDragOffY(v) { dragOffY = v; }
export function setArrowDrawing(v) { arrowDrawing = v; }
export function setArrowStart(v) { arrowStart = v; }
export function setArrowPreview(v) { arrowPreview = v; }
export function setCurrentPitchLayout(v) { currentPitchLayout = v; }
export function setExportFmt(v) { exportFmt = v; }

// ─── Constants ────────────────────────────────────────────────────────────────
export const FORMATIONS = {
  '4-3-3':   [[.06,.50],[.22,.15],[.22,.38],[.22,.62],[.22,.85],[.42,.22],[.42,.50],[.42,.78],[.62,.15],[.62,.50],[.62,.85]],
  '4-4-2':   [[.06,.50],[.22,.15],[.22,.38],[.22,.62],[.22,.85],[.42,.15],[.42,.38],[.42,.62],[.42,.85],[.62,.35],[.62,.65]],
  '4-3-1-2': [[.06,.50],[.22,.15],[.22,.38],[.22,.62],[.22,.85],[.38,.20],[.38,.50],[.38,.80],[.52,.50],[.64,.35],[.64,.65]],
  '4-2-1-3': [[.06,.50],[.22,.15],[.22,.38],[.22,.62],[.22,.85],[.36,.35],[.36,.65],[.50,.50],[.64,.15],[.64,.50],[.64,.85]],
  '3-5-2':   [[.06,.50],[.22,.25],[.22,.50],[.22,.75],[.40,.10],[.40,.30],[.40,.50],[.40,.70],[.40,.90],[.60,.35],[.60,.65]],
  '5-3-2':   [[.06,.50],[.18,.10],[.18,.30],[.18,.50],[.18,.70],[.18,.90],[.42,.20],[.42,.50],[.42,.80],[.62,.35],[.62,.65]],
};

export const ARROW_STYLES = {
  run:  { color: '#FFFFFF', dash: '6,4',  marker: 'url(#mRun)'  },
  pass: { color: '#F59E0B', dash: '',     marker: 'url(#mPass)' },
  line: { color: '#f94f4f', dash: '',     marker: 'none'         },
};

// ─── DOM References ───────────────────────────────────────────────────────────
export const svg = document.getElementById('pitch-svg');
export const playersLayer = document.getElementById('players-layer');
export const objectsLayer = document.getElementById('objects-layer');
export const selInfo = document.getElementById('selection-info');

// ─── SVG Coordinates ──────────────────────────────────────────────────────────
export function getSVGPoint(e) {
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  const pt = svg.createSVGPoint();
  pt.x = clientX; pt.y = clientY;
  return pt.matrixTransform(svg.getScreenCTM().inverse());
}

export function isDarkColor(hex) {
  if (!hex || !hex.startsWith('#')) return false;
  const r = parseInt(hex.slice(1,3), 16);
  const g = parseInt(hex.slice(3,5), 16);
  const b = parseInt(hex.slice(5,7), 16);
  return (0.299*r + 0.587*g + 0.114*b) < 128;
}

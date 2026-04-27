// ─── Analysis Storage (Router: Firestore when signed in, localStorage fallback)
import * as S from './state.js';
import { getCurrentUser } from './auth.js';
import { deselectVisual } from './interaction.js';
import { getOrCreateMarker } from './ui.js';
import {
  saveAnalysisToCloud, loadAnalysisFromCloud, listAnalysesFromCloud,
  deleteAnalysisFromCloud, duplicateAnalysisInCloud, migrateLocalToCloud,
  saveFolderToCloud, listFoldersFromCloud, deleteFolderFromCloud,
} from './firestore.js';

const STORAGE_KEY = 'tactica_analyses';
const CURRENT_KEY = 'tactica_current_id';
const FOLDERS_KEY = 'tactica_folders';

// ─── Helpers ────────────────────────────────────────────────────────────────
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function getLocalAnalyses() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
  catch { return []; }
}

function saveLocalAnalyses(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

function isSignedIn() {
  return !!getCurrentUser();
}

function getUid() {
  const u = getCurrentUser();
  return u ? u.uid : null;
}

// ─── Capture current state ──────────────────────────────────────────────────
export function captureState() {
  // Deselect before serializing to avoid saving selection artifacts (e.g. inflated stroke-width)
  if (S.selectedEl) deselectVisual(S.selectedEl);
  // Normalize url() references to relative form before saving
  const cleanHTML = html => html.replace(/url\(["']?[^)]*?(#[\w-]+)["']?\)/g, 'url($1)');
  return {
    appMode: S.appMode,
    pitchLayout: S.currentPitchLayout,
    pitchFlipped: S.pitchFlipped || false,
    pitchColors: { ...S.pitchColors },
    teamColors: { ...S.teamColors },
    gkColors: { ...S.gkColors },
    objectsHTML: cleanHTML(S.objectsLayer.innerHTML).replace(/<g id="step-trails"[\s\S]*?<\/g>/g, ''),
    playersHTML: cleanHTML(S.playersLayer.innerHTML),
    playerCounts: { ...S.playerCounts },
    objectCounter: S.objectCounter,
    imageData: S.imageData || null,
    frames: typeof window._getFramesForSave === 'function' ? window._getFramesForSave() : [],
    currentFrame: typeof window._getCurrentFrame === 'function' ? window._getCurrentFrame() : 0,
    notes: typeof window._getNotesText === 'function' ? window._getNotesText() : '',
  };
}

// ─── Generate thumbnail ─────────────────────────────────────────────────────
export function generateThumbnail() {
  try {
    const svgEl = S.svg;
    const W = svgEl.viewBox.baseVal.width || 700;
    const H = svgEl.viewBox.baseVal.height || 480;
    const SCALE = 1.5;

    // Clone the SVG so we don't mutate the live DOM
    const clone = svgEl.cloneNode(true);

    // Remove any selection rings / hit-areas that shouldn't be in the thumbnail
    clone.querySelectorAll('.selection-ring, .hit-area, .resize-handle, .rotate-handle').forEach(el => el.remove());

    // Inline all computed styles needed for rendering
    clone.setAttribute('width', W);
    clone.setAttribute('height', H);
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

    // Inline essential styles so the serialised SVG renders correctly in <img>
    const styleEl = document.createElementNS('http://www.w3.org/2000/svg', 'style');
    styleEl.textContent = `
      text { font-family: 'Manrope', Arial, sans-serif; }
      .freeform-shape { vector-effect: non-scaling-stroke; }
    `;
    clone.insertBefore(styleEl, clone.firstChild);

    // Copy computed fill/stroke/opacity from live elements to clone for inline rendering
    const liveEls = svgEl.querySelectorAll('rect, circle, ellipse, line, path, text, g');
    const cloneEls = clone.querySelectorAll('rect, circle, ellipse, line, path, text, g');
    liveEls.forEach((liveEl, i) => {
      if (!cloneEls[i]) return;
      const cs = getComputedStyle(liveEl);
      const cloneEl = cloneEls[i];
      // Copy key presentation attributes if set via CSS
      ['fill', 'stroke', 'opacity', 'stroke-width', 'stroke-dasharray', 'font-size', 'font-weight', 'font-family'].forEach(prop => {
        const val = cs.getPropertyValue(prop);
        if (val && val !== 'none' && val !== '' && !cloneEl.getAttribute(prop)) {
          cloneEl.setAttribute(prop, val);
        }
      });
    });

    // Serialize SVG to data URI
    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(clone);
    const svgDataUri = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgString);

    // Draw SVG onto canvas
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = W * SCALE;
        canvas.height = H * SCALE;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, W * SCALE, H * SCALE);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = () => {
        console.error('Thumbnail SVG image load failed');
        resolve('');
      };
      img.src = svgDataUri;
    });
  } catch (e) {
    console.error('Thumbnail generation failed:', e);
    return Promise.resolve('');
  }
}

// ─── Save Analysis ──────────────────────────────────────────────────────────
export async function saveAnalysis(name) {
  const analyses = getLocalAnalyses();
  const currentId = localStorage.getItem(CURRENT_KEY);
  const existing = currentId ? analyses.find(a => a.id === currentId) : null;

  let analysisObj;
  if (existing) {
    existing.name = name;
    existing.updatedAt = Date.now();
    existing.data = captureState();
    existing.thumbnail = await generateThumbnail();
    analysisObj = existing;
  } else {
    analysisObj = {
      id: generateId(),
      name,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      thumbnail: await generateThumbnail(),
      data: captureState(),
    };
    analyses.unshift(analysisObj);
    localStorage.setItem(CURRENT_KEY, analysisObj.id);
  }
  saveLocalAnalyses(analyses);

  // Sync to cloud
  if (isSignedIn()) {
    try { await saveAnalysisToCloud(getUid(), analysisObj); }
    catch (e) { console.warn('Cloud save failed, saved locally:', e); }
  }
  return true;
}

// ─── Load Analysis ──────────────────────────────────────────────────────────
export async function loadAnalysis(id, onReady) {
  let analysis;

  if (isSignedIn()) {
    try { analysis = await loadAnalysisFromCloud(getUid(), id); }
    catch (e) { console.warn('Cloud load failed, trying local:', e); }
  }

  if (!analysis) {
    const analyses = getLocalAnalyses();
    analysis = analyses.find(a => a.id === id);
  }
  if (!analysis) return false;

  const d = analysis.data;
  if (d.pitchLayout) {
    import('./pitch.js').then(({ setPitch }) => {
      setPitch(d.pitchLayout, d.pitchFlipped);
      if (d.pitchColors) {
        S.pitchColors.s1 = d.pitchColors.s1;
        S.pitchColors.s2 = d.pitchColors.s2;
        S.pitchColors.line = d.pitchColors.line;
        // Sync stripes toggle
        const stripesEl = document.getElementById('pitch-toggle-stripes');
        if (stripesEl) stripesEl.checked = d.pitchColors.s1 !== d.pitchColors.s2;
      }
    });
  }

  if (d.teamColors) { S.teamColors.a = d.teamColors.a; S.teamColors.b = d.teamColors.b; }
  if (d.gkColors) { S.gkColors.a = d.gkColors.a; S.gkColors.b = d.gkColors.b; }

  // Normalize url() references that browsers may serialize as absolute URLs
  const fixUrls = html => html.replace(/url\(["']?[^)]*?(#[\w-]+)["']?\)/g, 'url($1)');
  S.objectsLayer.innerHTML = fixUrls(d.objectsHTML || '');
  S.playersLayer.innerHTML = fixUrls(d.playersHTML || '');

  // Restore arrow markers from data attributes (bypasses URL serialization issues)
  S.objectsLayer.querySelectorAll('[data-type="arrow"]').forEach(g => {
    const aType = g.dataset.arrowType || 'run';
    const line = g.querySelector('.arrow-line');
    if (!line || aType === 'line') return;
    // Also restore original stroke-width in case arrow was saved while selected
    const w = g.dataset.arrowWidth || '2.5';
    line.setAttribute('stroke-width', w);
    const customColor = g.dataset.arrowColor;
    const headScale = g.dataset.arrowHeadScale || '1';
    const hasCustomScale = parseFloat(headScale) !== 1;
    const st = S.ARROW_STYLES[aType];
    if ((customColor && customColor !== st?.color) || hasCustomScale) {
      const color = customColor || st?.color || '#FFFFFF';
      line.setAttribute('marker-end', getOrCreateMarker(color, headScale, g.ownerSVGElement || S.svg));
    } else if (st?.marker && st.marker !== 'none') {
      line.setAttribute('marker-end', st.marker);
    }
  });
  // Restore filter references on players and objects
  [S.objectsLayer, S.playersLayer].forEach(layer => {
    layer.querySelectorAll('[filter]').forEach(el => {
      const val = el.getAttribute('filter');
      const match = val.match(/#([\w-]+)/);
      if (match) el.setAttribute('filter', `url(#${match[1]})`);
    });
  });

  S.playerCounts.a = d.playerCounts?.a || 0;
  S.playerCounts.b = d.playerCounts?.b || 0;
  S.playerCounts.joker = d.playerCounts?.joker || 0;
  S.setObjectCounter(d.objectCounter || 0);
  S.undoStack.length = 0;

  // Restore notes
  if (typeof window._setNotesText === 'function') window._setNotesText(d.notes || '');

  localStorage.setItem(CURRENT_KEY, id);
  if (onReady) onReady();
  return analysis;
}

// ─── Delete Analysis ────────────────────────────────────────────────────────
export async function deleteAnalysis(id) {
  let analyses = getLocalAnalyses();
  analyses = analyses.filter(a => a.id !== id);
  saveLocalAnalyses(analyses);
  if (localStorage.getItem(CURRENT_KEY) === id) localStorage.removeItem(CURRENT_KEY);

  if (isSignedIn()) {
    try { await deleteAnalysisFromCloud(getUid(), id); }
    catch (e) { console.warn('Cloud delete failed:', e); }
  }
}

// ─── Rename Analysis ───────────────────────────────────────────────────────
export async function renameAnalysis(id, newName) {
  const analyses = getLocalAnalyses();
  const analysis = analyses.find(a => a.id === id);
  if (!analysis) return;
  analysis.name = newName;
  analysis.updatedAt = Date.now();
  saveLocalAnalyses(analyses);

  if (isSignedIn()) {
    try { await saveAnalysisToCloud(getUid(), analysis); }
    catch (e) { console.warn('Cloud rename failed:', e); }
  }
}

// ─── Duplicate Analysis ─────────────────────────────────────────────────────
export async function duplicateAnalysis(id) {
  let original;
  if (isSignedIn()) {
    try { original = await loadAnalysisFromCloud(getUid(), id); }
    catch (e) { /* fall through */ }
  }
  if (!original) {
    const analyses = getLocalAnalyses();
    original = analyses.find(a => a.id === id);
  }
  if (!original) return null;

  const copy = {
    id: generateId(),
    name: original.name + ' (copy)',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    thumbnail: original.thumbnail || '',
    data: JSON.parse(JSON.stringify(original.data)),
  };

  // Save locally
  const analyses = getLocalAnalyses();
  analyses.unshift(copy);
  saveLocalAnalyses(analyses);

  // Sync to cloud
  if (isSignedIn()) {
    try { await duplicateAnalysisInCloud(getUid(), copy); }
    catch (e) { console.warn('Cloud duplicate failed:', e); }
  }
  return copy;
}

// ─── List Analyses ──────────────────────────────────────────────────────────
export async function listAnalyses() {
  if (isSignedIn()) {
    try {
      const cloudList = await listAnalysesFromCloud(getUid());
      // Also cache locally
      saveLocalAnalyses(cloudList);
      return cloudList;
    } catch (e) {
      console.warn('Cloud list failed, using local:', e);
    }
  }
  return getLocalAnalyses();
}

// ─── Quick Save ─────────────────────────────────────────────────────────────
export async function quickSave() {
  const currentId = localStorage.getItem(CURRENT_KEY);
  if (!currentId) return false;

  const analyses = getLocalAnalyses();
  const existing = analyses.find(a => a.id === currentId);
  if (!existing) return false;

  existing.updatedAt = Date.now();
  existing.data = captureState();
  existing.thumbnail = await generateThumbnail();
  saveLocalAnalyses(analyses);

  if (isSignedIn()) {
    try { await saveAnalysisToCloud(getUid(), existing); }
    catch (e) { console.warn('Cloud quick-save failed:', e); }
  }
  return true;
}

// ─── Folders ───────────────────────────────────────────────────────────────
function getLocalFolders() {
  try { return JSON.parse(localStorage.getItem(FOLDERS_KEY) || '[]'); }
  catch { return []; }
}

function saveLocalFolders(list) {
  localStorage.setItem(FOLDERS_KEY, JSON.stringify(list));
}

export async function listFolders() {
  if (isSignedIn()) {
    try {
      const cloudList = await listFoldersFromCloud(getUid());
      saveLocalFolders(cloudList);
      return cloudList;
    } catch (e) { console.warn('Cloud folders list failed, using local:', e); }
  }
  return getLocalFolders();
}

export async function createFolder(name) {
  const folder = {
    id: generateId(),
    name,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  const folders = getLocalFolders();
  folders.unshift(folder);
  saveLocalFolders(folders);

  if (isSignedIn()) {
    try { await saveFolderToCloud(getUid(), folder); }
    catch (e) { console.warn('Cloud folder create failed:', e); }
  }
  return folder;
}

export async function renameFolder(id, newName) {
  const folders = getLocalFolders();
  const folder = folders.find(f => f.id === id);
  if (!folder) return;
  folder.name = newName;
  folder.updatedAt = Date.now();
  saveLocalFolders(folders);

  if (isSignedIn()) {
    try { await saveFolderToCloud(getUid(), folder); }
    catch (e) { console.warn('Cloud folder rename failed:', e); }
  }
}

export async function deleteFolder(id) {
  // Move all analyses in this folder back to unfiled
  const analyses = getLocalAnalyses();
  analyses.forEach(a => { if (a.folderId === id) delete a.folderId; });
  saveLocalAnalyses(analyses);

  let folders = getLocalFolders();
  folders = folders.filter(f => f.id !== id);
  saveLocalFolders(folders);

  if (isSignedIn()) {
    try {
      await deleteFolderFromCloud(getUid(), id);
      // Update analyses that were in this folder
      for (const a of analyses.filter(a => !a.folderId)) {
        await saveAnalysisToCloud(getUid(), a);
      }
    } catch (e) { console.warn('Cloud folder delete failed:', e); }
  }
}

export async function moveAnalysisToFolder(analysisId, folderId) {
  const analyses = getLocalAnalyses();
  const analysis = analyses.find(a => a.id === analysisId);
  if (!analysis) return;

  if (folderId) {
    analysis.folderId = folderId;
  } else {
    delete analysis.folderId;
  }
  analysis.updatedAt = Date.now();
  saveLocalAnalyses(analyses);

  if (isSignedIn()) {
    try { await saveAnalysisToCloud(getUid(), analysis); }
    catch (e) { console.warn('Cloud move failed:', e); }
  }
}

// ─── Utilities ──────────────────────────────────────────────────────────────
export function getCurrentId() { return localStorage.getItem(CURRENT_KEY); }
export function clearCurrentId() { localStorage.removeItem(CURRENT_KEY); }
export { migrateLocalToCloud };

export function formatDate(ts) {
  const d = new Date(ts);
  const now = new Date();
  const diffMs = now - d;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ─── Analysis Storage (Router: Firestore when signed in, localStorage fallback)
import * as S from './state.js';
import { getCurrentUser } from './auth.js';
import {
  saveAnalysisToCloud, loadAnalysisFromCloud, listAnalysesFromCloud,
  deleteAnalysisFromCloud, duplicateAnalysisInCloud, migrateLocalToCloud,
} from './firestore.js';

const STORAGE_KEY = 'tactica_analyses';
const CURRENT_KEY = 'tactica_current_id';

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
  return {
    appMode: S.appMode,
    pitchLayout: S.currentPitchLayout,
    pitchColors: { ...S.pitchColors },
    teamColors: { ...S.teamColors },
    gkColors: { ...S.gkColors },
    objectsHTML: S.objectsLayer.innerHTML,
    playersHTML: S.playersLayer.innerHTML,
    playerCounts: { ...S.playerCounts },
    objectCounter: S.objectCounter,
    imageData: S.imageData || null,
  };
}

// ─── Generate thumbnail ─────────────────────────────────────────────────────
export function generateThumbnail() {
  try {
    const svgEl = S.svg;
    const W = svgEl.viewBox.baseVal.width || 700;
    const H = svgEl.viewBox.baseVal.height || 480;
    const SCALE = 0.6;
    const canvas = document.createElement('canvas');
    canvas.width = W * SCALE;
    canvas.height = H * SCALE;
    const ctx = canvas.getContext('2d');
    ctx.scale(SCALE, SCALE);

    const s1 = S.pitchColors.s1, s2 = S.pitchColors.s2;
    const isV = S.currentPitchLayout.endsWith('-v');
    if (isV) {
      for (let y = 0; y < H; y += 40) {
        ctx.fillStyle = s1; ctx.fillRect(0, y, W, 20);
        ctx.fillStyle = s2; ctx.fillRect(0, y + 20, W, 20);
      }
    } else {
      for (let x = 0; x < W; x += 40) {
        ctx.fillStyle = s1; ctx.fillRect(x, 0, 20, H);
        ctx.fillStyle = s2; ctx.fillRect(x + 20, 0, 20, H);
      }
    }

    ctx.strokeStyle = S.pitchColors.line;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(30, 20, W - 60, H - 40);

    S.playersLayer.querySelectorAll('[data-type="player"]').forEach(g => {
      const cx = parseFloat(g.dataset.cx), cy = parseFloat(g.dataset.cy);
      const circ = g.querySelector('circle:not(.hit-area)');
      ctx.beginPath();
      ctx.arc(cx, cy, 12, 0, Math.PI * 2);
      ctx.fillStyle = circ ? circ.getAttribute('fill') : '#8B5CF6';
      ctx.fill();
    });

    S.objectsLayer.querySelectorAll('[data-type="arrow"]').forEach(g => {
      const line = g.querySelector('line');
      if (!line) return;
      ctx.beginPath();
      ctx.moveTo(parseFloat(line.getAttribute('x1')), parseFloat(line.getAttribute('y1')));
      ctx.lineTo(parseFloat(line.getAttribute('x2')), parseFloat(line.getAttribute('y2')));
      ctx.strokeStyle = line.getAttribute('stroke') || '#F59E0B';
      ctx.lineWidth = 2;
      ctx.stroke();
    });

    return canvas.toDataURL('image/jpeg', 0.5);
  } catch (e) {
    console.error('Thumbnail generation failed:', e);
    return '';
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
    existing.thumbnail = generateThumbnail();
    analysisObj = existing;
  } else {
    analysisObj = {
      id: generateId(),
      name,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      thumbnail: generateThumbnail(),
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
      setPitch(d.pitchLayout);
      if (d.pitchColors) {
        S.pitchColors.s1 = d.pitchColors.s1;
        S.pitchColors.s2 = d.pitchColors.s2;
        S.pitchColors.line = d.pitchColors.line;
      }
    });
  }

  if (d.teamColors) { S.teamColors.a = d.teamColors.a; S.teamColors.b = d.teamColors.b; }
  if (d.gkColors) { S.gkColors.a = d.gkColors.a; S.gkColors.b = d.gkColors.b; }

  S.objectsLayer.innerHTML = d.objectsHTML || '';
  S.playersLayer.innerHTML = d.playersHTML || '';
  S.playerCounts.a = d.playerCounts?.a || 0;
  S.playerCounts.b = d.playerCounts?.b || 0;
  S.setObjectCounter(d.objectCounter || 0);
  S.undoStack.length = 0;

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
  existing.thumbnail = generateThumbnail();
  saveLocalAnalyses(analyses);

  if (isSignedIn()) {
    try { await saveAnalysisToCloud(getUid(), existing); }
    catch (e) { console.warn('Cloud quick-save failed:', e); }
  }
  return true;
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

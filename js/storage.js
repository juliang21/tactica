// ─── Analysis Storage (Router: Firestore when signed in, localStorage fallback)
import * as S from './state.js';
import { getCurrentUser } from './auth.js';
import { deselectVisual } from './interaction.js';
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
    const isV = (/full-v|half-v/).test(S.currentPitchLayout);
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
      const circ = g.querySelector('circle:not(.hit-area):not(.player-arm)');
      const color = circ ? circ.getAttribute('fill') : '#8B5CF6';
      if (g.dataset.arms === '1') {
        const rot = parseFloat(g.dataset.rotation || '0') * Math.PI / 180;
        const r = 12;
        const cosR = Math.cos(rot), sinR = Math.sin(rot);
        function rp(x, y) { return [x*cosR - y*sinR, x*sinR + y*cosR]; }
        ctx.save(); ctx.translate(cx, cy);
        // Arms behind
        ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 1.8; ctx.lineCap = 'round';
        for (const side of [-1, 1]) {
          const [sx,sy] = rp(side * r * 0.55, r * 0.45);
          const [ex,ey] = rp(side * (r * 0.55 + r * 0.85), r * 0.45 + r * 0.7);
          const [cpx,cpy] = rp(side * (r * 0.55 + r * 0.425), r * 0.45 + r * 0.105);
          ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo(cpx, cpy, ex, ey); ctx.stroke();
        }
        // Body on top
        ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(cx, cy, 12, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
      }
    });

    S.objectsLayer.querySelectorAll('[data-type="arrow"]').forEach(g => {
      const line = g.querySelector('.arrow-line');
      if (!line) return;
      const cx = parseFloat(g.dataset.cx), cy = parseFloat(g.dataset.cy);
      const dx1 = parseFloat(g.dataset.dx1), dy1 = parseFloat(g.dataset.dy1);
      const dx2 = parseFloat(g.dataset.dx2), dy2 = parseFloat(g.dataset.dy2);
      const sc = parseFloat(g.dataset.scale || '1');
      const rot = parseFloat(g.dataset.rotation || '0') * Math.PI / 180;
      const k = parseFloat(g.dataset.curve || '0');
      const tfm = (dx, dy) => ({
        x: cx + (dx*sc)*Math.cos(rot) - (dy*sc)*Math.sin(rot),
        y: cy + (dx*sc)*Math.sin(rot) + (dy*sc)*Math.cos(rot)
      });
      const p1 = tfm(dx1, dy1), p2 = tfm(dx2, dy2);
      const midX = (p1.x+p2.x)/2, midY = (p1.y+p2.y)/2;
      let perpX = -(p2.y-p1.y), perpY = p2.x-p1.x;
      const pLen = Math.sqrt(perpX*perpX+perpY*perpY);
      if (pLen > 1) { perpX /= pLen; perpY /= pLen; }
      const cpX = midX + k*perpX, cpY = midY + k*perpY;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      if (Math.abs(k) < 1) { ctx.lineTo(p2.x, p2.y); }
      else { ctx.quadraticCurveTo(cpX, cpY, p2.x, p2.y); }
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
    const st = S.ARROW_STYLES[aType];
    if (customColor && customColor !== st?.color) {
      // Custom color — ensure marker def exists
      const safeId = 'marker-' + customColor.replace('#', '');
      if (!document.getElementById(safeId)) {
        const defs = S.svg.querySelector('defs');
        const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
        marker.setAttribute('id', safeId);
        marker.setAttribute('markerWidth', '7'); marker.setAttribute('markerHeight', '6');
        marker.setAttribute('refX', '5.5'); marker.setAttribute('refY', '3');
        marker.setAttribute('orient', 'auto');
        const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        poly.setAttribute('points', '0 0, 7 3, 0 6'); poly.setAttribute('fill', customColor);
        marker.appendChild(poly); defs.appendChild(marker);
      }
      line.setAttribute('marker-end', `url(#${safeId})`);
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
  existing.thumbnail = generateThumbnail();
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

// ─── Training Mode UI Controller ────────────────────────────────────────────
// Manages the training landing screen + drill editor view.
// All training state is kept here so the feature stays decoupled.
// ─────────────────────────────────────────────────────────────────────────────

import { captureState } from '../../storage.js';
import * as S from '../../state.js';
import { getCurrentUser } from '../../auth.js';
// Same ?v= as app.js so we share ONE firestore.js module instance — otherwise
// this is a separate instance whose _sessionId is never set, and every training
// event gets logged with sessionId: null (breaking session-level analytics).
import { logAction } from '../../firestore.js?v=8';
import {
  saveDrillCloudOrLocal, listDrills, loadDrill, deleteDrill,
  saveSessionCloudOrLocal, listSessions, loadSession, deleteSession,
} from './training-storage.js';

// ─── Tracking helper ────────────────────────────────────────────────────────
// Centralises all Training analytics. Force mode='training' so admin always
// groups these under the Training section regardless of active-mode timing.
function track(action, meta = {}) {
  const u = getCurrentUser();
  if (!u) return; // tracking only for signed-in users
  logAction(u.uid, u.email, action, { ...meta, mode: 'training' }).catch(() => {});
}

let _shellEl = null;
let _currentDrill = null; // working draft (full drill object incl. boardState)
let _editingDrillId = null;
let _currentSession = null; // working session draft
let _editingSessionId = null;
let _savedTacticalState = null;

function getShell() {
  if (!_shellEl) _shellEl = document.getElementById('training-shell');
  return _shellEl;
}

// ─── Shell show/hide (called by mode registry) ──────────────────────────────
const WELCOME_KEY = 'tactica_training_welcome_seen_v1';

export function showTrainingShell() {
  const shell = getShell();
  if (!shell) return;
  // Snapshot the tactical board state before we hijack the pitch
  if (!_savedTacticalState) {
    try { _savedTacticalState = captureState(); } catch (e) { _savedTacticalState = null; }
  }
  silentClearPitch(); // start fresh so the user doesn't see board work in the drill
  shell.style.display = 'flex';
  const pitchContainer = document.getElementById('pitch-container');
  if (pitchContainer) pitchContainer.style.display = 'none';
  document.body.classList.add('training-mode');
  showView('landing');
  renderLibrary();
  // Show the welcome overlay on first entry
  maybeShowWelcome();
}

function maybeShowWelcome() {
  try {
    if (localStorage.getItem(WELCOME_KEY)) return;
  } catch (e) {}
  const overlay = document.getElementById('training-welcome-overlay');
  if (overlay) overlay.style.display = 'flex';
  track('training_welcome_shown');
}

export function dismissTrainingWelcome() {
  const overlay = document.getElementById('training-welcome-overlay');
  if (overlay) overlay.style.display = 'none';
  try { localStorage.setItem(WELCOME_KEY, '1'); } catch (e) {}
  track('training_welcome_dismissed');
}
window.dismissTrainingWelcome = dismissTrainingWelcome;

export function hideTrainingShell() {
  const shell = getShell();
  if (!shell) return;
  shell.style.display = 'none';
  // Make sure pitch is back in its original home if we left mid-edit
  restorePitchToOriginal();
  restoreAnalysisNameInput();
  const pitchContainer = document.getElementById('pitch-container');
  if (pitchContainer) pitchContainer.style.display = '';
  document.body.classList.remove('training-mode', 'training-drill-mode', 'training-session-mode');
  // Restore the tactical board state that was snapshotted on entry
  if (_savedTacticalState) {
    silentClearPitch();
    applyBoardState(_savedTacticalState).then(() => {});
    _savedTacticalState = null;
  } else {
    silentClearPitch();
  }
}

// Does the drill editor currently hold unsaved work?
export function hasUnsavedDrillWork() {
  if (!document.body.classList.contains('training-drill-mode')) return false;
  const layer = document.getElementById('players-layer');
  const obj = document.getElementById('objects-layer');
  const nameEl = drillNameEl();
  const hasName = nameEl && nameEl.value.trim();
  const hasElements = (layer && layer.children.length > 0) || (obj && obj.children.length > 0);
  return !!(hasName || hasElements);
}
window.hasUnsavedDrillWork = hasUnsavedDrillWork;

// ─── View routing ───────────────────────────────────────────────────────────
function showView(name) {
  const shell = getShell();
  if (!shell) return;
  shell.querySelectorAll('[data-training-view]').forEach(v => {
    v.style.display = v.dataset.trainingView === name ? '' : 'none';
  });
  document.body.classList.toggle('training-drill-mode', name === 'drill-editor');
  document.body.classList.toggle('training-session-mode', name === 'session-editor');
}

// ─── Pitch relocation (move existing #pitch-container + #motion-controls into drill slot) ─────
let _pitchOriginalParent = null;
let _pitchOriginalNextSibling = null;
let _motionOriginalParent = null;
let _motionOriginalNextSibling = null;

function relocatePitchToCanvas() {
  const pitch = document.getElementById('pitch-container');
  const motion = document.getElementById('motion-controls');
  const slot = document.querySelector('.drill-canvas-slot');
  if (!pitch || !slot) return;
  if (pitch.parentElement !== slot) {
    _pitchOriginalParent = pitch.parentElement;
    _pitchOriginalNextSibling = pitch.nextSibling;
    slot.appendChild(pitch);
    pitch.style.display = '';
  }
  if (motion && motion.parentElement !== slot) {
    _motionOriginalParent = motion.parentElement;
    _motionOriginalNextSibling = motion.nextSibling;
    slot.appendChild(motion);
  }
  // Resize the SVG to fit the slot — reuses the same logic the Tactical Board uses.
  import('../../pitch.js').then(m => m.fitPitchToViewport());
}

function restorePitchToOriginal() {
  const pitch = document.getElementById('pitch-container');
  const motion = document.getElementById('motion-controls');
  if (pitch && _pitchOriginalParent) {
    if (_pitchOriginalNextSibling && _pitchOriginalNextSibling.parentNode === _pitchOriginalParent) {
      _pitchOriginalParent.insertBefore(pitch, _pitchOriginalNextSibling);
    } else {
      _pitchOriginalParent.appendChild(pitch);
    }
  }
  if (motion && _motionOriginalParent) {
    if (_motionOriginalNextSibling && _motionOriginalNextSibling.parentNode === _motionOriginalParent) {
      _motionOriginalParent.insertBefore(motion, _motionOriginalNextSibling);
    } else {
      _motionOriginalParent.appendChild(motion);
    }
  }
  _pitchOriginalParent = null;
  _pitchOriginalNextSibling = null;
  _motionOriginalParent = null;
  _motionOriginalNextSibling = null;
}

// ─── Clear pitch state without triggering the confirmation modal ───────────
function silentClearPitch() {
  if (S.playersLayer) S.playersLayer.innerHTML = '';
  if (S.objectsLayer) S.objectsLayer.innerHTML = '';
  S.playerCounts.a = 0;
  S.playerCounts.b = 0;
  S.playerCounts.joker = 0;
  S.setObjectCounter(0);
  S.undoStack.length = 0;
  // Also clear any animation frames
  if (typeof window._setFramesFromLoad === 'function') {
    window._setFramesFromLoad([], 0);
  }
}

// ─── State restoration (mirrors the relevant parts of loadAnalysis) ────────
async function applyBoardState(state) {
  if (!state) { silentClearPitch(); return; }
  // Pitch layout/colors are global; we restore them too so the drill loads consistently.
  if (state.pitchLayout) {
    const { setPitch } = await import('../../pitch.js');
    setPitch(state.pitchLayout, state.pitchFlipped);
  }
  if (state.pitchColors) {
    S.pitchColors.s1 = state.pitchColors.s1;
    S.pitchColors.s2 = state.pitchColors.s2;
    S.pitchColors.line = state.pitchColors.line;
    const stripesEl = document.getElementById('pitch-toggle-stripes');
    if (stripesEl) stripesEl.checked = state.pitchColors.s1 !== state.pitchColors.s2;
  }
  if (state.teamColors) { S.teamColors.a = state.teamColors.a; S.teamColors.b = state.teamColors.b; }
  if (state.gkColors) { S.gkColors.a = state.gkColors.a; S.gkColors.b = state.gkColors.b; }

  // Normalize url(...) references that browsers may serialize as absolute URLs
  const fixUrls = html => (html || '').replace(/url\(["']?[^)]*?(#[\w-]+)["']?\)/g, 'url($1)');
  S.objectsLayer.innerHTML = fixUrls(state.objectsHTML);
  S.playersLayer.innerHTML = fixUrls(state.playersHTML);

  S.playerCounts.a = state.playerCounts?.a || 0;
  S.playerCounts.b = state.playerCounts?.b || 0;
  S.playerCounts.joker = state.playerCounts?.joker || 0;
  S.setObjectCounter(state.objectCounter || 0);
  S.undoStack.length = 0;

  // Re-wire interactivity on restored elements (drag, select, etc.)
  if (typeof window.rewireRestoredElements === 'function') {
    try { window.rewireRestoredElements(); } catch (e) { console.warn(e); }
  }

  // Restore animation frames
  if (typeof window._setFramesFromLoad === 'function') {
    window._setFramesFromLoad(state.frames || [], state.currentFrame || 0);
  }
}

// ─── New Drill ──────────────────────────────────────────────────────────────
export function startNewDrill() {
  _currentDrill = blankDrill();
  _editingDrillId = null;
  applyDrillToForm(_currentDrill);
  silentClearPitch();
  showView('drill-editor');
  track('training_drill_started');
  // Move the pitch into the canvas slot, then default the right panel to Drill.
  // We leave the pitch layout untouched — defaults to whatever the app uses
  // (full horizontal). Users can switch to "Plain" via the Pitch tab.
  requestAnimationFrame(() => {
    relocatePitchToCanvas();
    window.switchTab?.('drill');
  });
  setTimeout(() => drillNameEl()?.focus(), 50);
}

export function exitDrillEditor() {
  _currentDrill = null;
  _editingDrillId = null;
  restorePitchToOriginal();
  silentClearPitch();
  restoreAnalysisNameInput();
  showView('landing');
  renderLibrary();
}

// ─── Session editor ────────────────────────────────────────────────────────
function blankSession() {
  return {
    id: null,
    name: '',
    numPlayers: 14,
    objectives: { general: [], offensive: [], defensive: [] },
    drillIds: [],
    createdAt: null,
    updatedAt: null,
  };
}

function applySessionToForm(session) {
  document.getElementById('session-name-input').value = session.name || '';
  document.getElementById('session-num-players').value = session.numPlayers ?? 14;
  ['general', 'offensive', 'defensive'].forEach(g => {
    renderSessionTagChips(g, session.objectives?.[g] || []);
  });
}

function readSessionFromForm() {
  return {
    name: (document.getElementById('session-name-input').value || '').trim(),
    numPlayers: parseInt(document.getElementById('session-num-players').value, 10) || 0,
    objectives: {
      general: sessionTagsFor('general'),
      offensive: sessionTagsFor('offensive'),
      defensive: sessionTagsFor('defensive'),
    },
  };
}

function sessionTagsFor(group) {
  const wrap = document.querySelector(`[data-session-tag-group="${group}"]`);
  if (!wrap) return [];
  return [...wrap.querySelectorAll('.drill-tag-chip > span')].map(s => s.textContent);
}

function renderSessionTagChips(group, tags) {
  const wrap = document.querySelector(`[data-session-tag-group="${group}"]`);
  if (!wrap) return;
  wrap.innerHTML = '';
  tags.forEach((t, idx) => {
    const chip = document.createElement('span');
    chip.className = 'drill-tag-chip';
    chip.innerHTML = `<span>${escapeHtml(t)}</span><button class="drill-tag-remove" type="button" aria-label="Remove">&times;</button>`;
    chip.querySelector('.drill-tag-remove').onclick = () => {
      const current = sessionTagsFor(group);
      current.splice(idx, 1);
      renderSessionTagChips(group, current);
    };
    wrap.appendChild(chip);
  });
}

function addSessionTag(group, value) {
  const v = (value || '').trim();
  if (!v) return;
  const current = sessionTagsFor(group);
  if (current.includes(v)) return;
  current.push(v);
  renderSessionTagChips(group, current);
}

export function startNewSession() {
  _currentSession = blankSession();
  _editingSessionId = null;
  applySessionToForm(_currentSession);
  showView('session-editor');
  renderSessionDrillList();
  track('training_session_started');
  setTimeout(() => document.getElementById('session-name-input')?.focus(), 50);
}

export function exitSessionEditor() {
  _currentSession = null;
  _editingSessionId = null;
  showView('landing');
  renderLibrary();
}

export async function saveSession() {
  const formData = readSessionFromForm();
  if (!formData.name) {
    const nameEl = document.getElementById('session-name-input');
    if (nameEl) {
      nameEl.classList.add('input-error');
      const clear = () => {
        nameEl.classList.remove('input-error');
        nameEl.removeEventListener('input', clear);
      };
      nameEl.addEventListener('input', clear);
      nameEl.focus();
    }
    window.showNotification?.('Please give your session a name.', 'error', 3000);
    return;
  }
  const now = Date.now();
  const session = {
    id: _editingSessionId || ('sess_' + now + '_' + Math.random().toString(36).slice(2, 7)),
    ...formData,
    drillIds: _currentSession?.drillIds || [],
    createdAt: _currentSession?.createdAt || now,
    updatedAt: now,
  };
  try {
    const { storedIn } = await saveSessionCloudOrLocal(session);
    const where = storedIn === 'cloud' ? 'cloud' : 'this device';
    window.showNotification?.(`Session "${session.name}" saved to ${where}.`, 'success', 3000);
    track('training_session_saved', {
      isNew: !_editingSessionId,
      drillCount: session.drillIds.length,
      numPlayers: session.numPlayers,
      tagCount: (session.objectives.general.length + session.objectives.offensive.length + session.objectives.defensive.length),
      storedIn,
    });
  } catch (e) {
    console.error(e);
    window.showNotification?.('Could not save session. Please try again.', 'error', 4000);
    return;
  }
  _currentSession = null;
  _editingSessionId = null;
  showView('landing');
  renderLibrary();
}

async function openSession(id) {
  const session = await loadSession(id);
  if (!session) { window.showNotification?.('Could not load session.', 'error', 3000); return; }
  _currentSession = session;
  _editingSessionId = id;
  applySessionToForm(session);
  showView('session-editor');
  track('training_session_opened', { sessionId: id });
  await renderSessionDrillList();
}

// ─── Session drill list ────────────────────────────────────────────────────
async function renderSessionDrillList() {
  const list = document.getElementById('session-drill-list');
  const empty = document.getElementById('session-empty');
  if (!list) return;
  list.innerHTML = '';
  const drillIds = _currentSession?.drillIds || [];
  if (!drillIds.length) {
    empty.style.display = '';
    return;
  }
  empty.style.display = 'none';
  // Resolve drill summaries
  const allDrills = await listDrills();
  const byId = Object.fromEntries(allDrills.map(d => [d.id, d]));
  drillIds.forEach((did, idx) => {
    const d = byId[did];
    const card = document.createElement('div');
    card.className = 'session-drill-card';
    if (!d) {
      card.innerHTML = `
        <div class="session-drill-num">${idx + 1}</div>
        <div class="session-drill-body">
          <div class="session-drill-title session-drill-missing">Missing drill</div>
          <div class="session-drill-meta">This drill was deleted.</div>
        </div>
        <div class="session-drill-actions">
          <button class="session-drill-iconbtn" onclick="sessionRemoveDrill(${idx})" title="Remove">&times;</button>
        </div>`;
    } else {
      const tags = [
        ...(d.objectives?.general || []),
        ...(d.objectives?.offensive || []),
        ...(d.objectives?.defensive || []),
      ].slice(0, 3);
      const dur = d.duration ? `${d.duration} min` : '';
      const cat = d.category ? `<span class="session-drill-phase">${escapeHtml(d.category)}</span>` : '';
      const metaBits = [d.numPlayers ? `${d.numPlayers} players` : '', dur, ...tags.map(escapeHtml)].filter(Boolean);
      card.innerHTML = `
        <div class="session-drill-num">${idx + 1}</div>
        <div class="session-drill-body">
          <div class="session-drill-title">${cat}${escapeHtml(d.name)}</div>
          <div class="session-drill-meta">${metaBits.join(' · ')}</div>
        </div>
        <div class="session-drill-actions">
          <button class="session-drill-iconbtn" ${idx === 0 ? 'disabled' : ''} onclick="sessionMoveDrill(${idx}, -1)" title="Move up">↑</button>
          <button class="session-drill-iconbtn" ${idx === drillIds.length - 1 ? 'disabled' : ''} onclick="sessionMoveDrill(${idx}, 1)" title="Move down">↓</button>
          <button class="session-drill-iconbtn" onclick="sessionRemoveDrill(${idx})" title="Remove">&times;</button>
        </div>`;
    }
    list.appendChild(card);
  });
  _updateSessionSummary(drillIds.map(id => byId[id]).filter(Boolean));
}

// Session total time + aggregate equipment, shown in the session header.
function _updateSessionSummary(drills) {
  const totalMin = drills.reduce((a, d) => a + (parseInt(d.duration, 10) || 0), 0);
  const agg = {};
  drills.forEach(d => { Object.entries(d.equipment || {}).forEach(([t, n]) => { agg[t] = (agg[t] || 0) + n; }); });
  const totalEl = document.getElementById('session-total-time');
  if (totalEl) totalEl.textContent = totalMin ? `${totalMin} min` : '—';
  const equipEl = document.getElementById('session-total-equip');
  if (equipEl) equipEl.textContent = equipmentText(agg);
}

export function sessionRemoveDrill(idx) {
  if (!_currentSession) return;
  _currentSession.drillIds.splice(idx, 1);
  renderSessionDrillList();
  track('training_session_drill_removed');
}
window.sessionRemoveDrill = sessionRemoveDrill;

export function sessionMoveDrill(idx, dir) {
  if (!_currentSession) return;
  const ids = _currentSession.drillIds;
  const newIdx = idx + dir;
  if (newIdx < 0 || newIdx >= ids.length) return;
  [ids[idx], ids[newIdx]] = [ids[newIdx], ids[idx]];
  renderSessionDrillList();
  track('training_session_drill_reordered', { direction: dir > 0 ? 'down' : 'up' });
}
window.sessionMoveDrill = sessionMoveDrill;

// ─── Drill picker modal ────────────────────────────────────────────────────
export async function openDrillPicker() {
  const modal = document.getElementById('drill-picker-modal');
  const list = document.getElementById('drill-picker-list');
  if (!modal || !list) return;
  list.innerHTML = '<div class="drill-picker-empty">Loading…</div>';
  modal.style.display = 'flex';
  const drills = await listDrills();
  if (!drills.length) {
    list.innerHTML = '<div class="drill-picker-empty">You have no drills yet. Save a drill first, then come back here to add it to your session.</div>';
    return;
  }
  list.innerHTML = '';
  drills.forEach(d => {
    const item = document.createElement('button');
    item.className = 'drill-picker-item';
    item.type = 'button';
    const tags = [...(d.objectives?.general || []), ...(d.objectives?.offensive || []), ...(d.objectives?.defensive || [])].slice(0, 3);
    item.innerHTML = `
      <div class="drill-picker-item-title">${escapeHtml(d.name)}</div>
      <div class="drill-picker-item-meta">${d.numPlayers || '?'} players${tags.length ? ' · ' + tags.map(escapeHtml).join(' · ') : ''}</div>`;
    item.onclick = () => {
      if (!_currentSession) return;
      _currentSession.drillIds.push(d.id);
      closeDrillPicker();
      renderSessionDrillList();
      track('training_session_drill_added', { drillId: d.id });
    };
    list.appendChild(item);
  });
}
window.openDrillPicker = openDrillPicker;

export function closeDrillPicker() {
  const modal = document.getElementById('drill-picker-modal');
  if (modal) modal.style.display = 'none';
}
window.closeDrillPicker = closeDrillPicker;

// ─── Drill model ────────────────────────────────────────────────────────────
function blankDrill() {
  return {
    id: null,
    name: '',
    numPlayers: 10,
    duration: 15,                 // minutes — powers the session total
    category: '',                 // Warm-up / Technical / … — phase + library filter
    description: '',              // organisation + instructions
    coachingPoints: '',          // what to look for / correct
    objectives: { general: [], offensive: [], defensive: [] },
    variants: '',
    equipment: {},               // { cone: 6, 'small-goal': 2, … } auto-counted
    boardState: null,
    createdAt: null,
    updatedAt: null,
  };
}

// The drill name input lives at the top of the Drill tab in the left panel.
function drillNameEl() { return document.getElementById('drill-name-input-panel'); }

function applyDrillToForm(drill) {
  const nameEl = drillNameEl();
  if (nameEl) nameEl.value = drill.name || '';
  document.getElementById('drill-num-players').value = drill.numPlayers ?? 10;
  const dur = document.getElementById('drill-duration'); if (dur) dur.value = drill.duration ?? 15;
  const cat = document.getElementById('drill-category'); if (cat) cat.value = drill.category || '';
  const desc = document.getElementById('drill-description'); if (desc) desc.value = drill.description || '';
  const cp = document.getElementById('drill-coaching-points'); if (cp) cp.value = drill.coachingPoints || '';
  document.getElementById('drill-variants').value = drill.variants || '';
  ['general', 'offensive', 'defensive'].forEach(g => {
    renderTagChips(g, drill.objectives?.[g] || []);
  });
  ensureEquipObserver();
  updateEquipmentReadout();
}

function readDrillFromForm() {
  const name = (drillNameEl()?.value || '').trim();
  const numPlayers = parseInt(document.getElementById('drill-num-players').value, 10) || 0;
  const duration = Math.max(0, parseInt(document.getElementById('drill-duration')?.value, 10) || 0);
  const category = document.getElementById('drill-category')?.value || '';
  const description = (document.getElementById('drill-description')?.value || '').trim();
  const coachingPoints = (document.getElementById('drill-coaching-points')?.value || '').trim();
  const variants = document.getElementById('drill-variants').value.trim();
  const objectives = {
    general: tagsFor('general'),
    offensive: tagsFor('offensive'),
    defensive: tagsFor('defensive'),
  };
  return { name, numPlayers, duration, category, description, coachingPoints, variants, objectives, equipment: countEquipment() };
}

// ─── Auto equipment list ─────────────────────────────────────────────────────
// Counts the physical gear on the pitch so a coach gets a setup checklist for
// free. Players and pure annotations (arrows, zones, text) are excluded.
const EQUIP_LABELS = {
  ball: 'ball', cone: 'cone', 'disc-cone': 'disc cone', 'small-goal': 'goal',
  ladder: 'ladder', pole: 'pole', hoop: 'hoop',
};
const EQUIP_ORDER = ['ball','cone','disc-cone','small-goal','ladder','pole','hoop'];
export function countEquipment() {
  const counts = {};
  const scan = (layer) => { if (!layer) return; layer.querySelectorAll('[data-type]').forEach(el => {
    const t = el.dataset.type; if (EQUIP_LABELS[t]) counts[t] = (counts[t] || 0) + 1;
  }); };
  scan(S.playersLayer); scan(S.objectsLayer);
  return counts;
}
export function equipmentText(counts) {
  if (!counts) return 'No equipment';
  const parts = EQUIP_ORDER.filter(t => counts[t]).map(t => {
    const n = counts[t], lbl = EQUIP_LABELS[t];
    return `${n} ${lbl}${n > 1 ? 's' : ''}`;
  });
  return parts.length ? parts.join(' · ') : 'No equipment';
}
function updateEquipmentReadout() {
  const el = document.getElementById('drill-equipment-readout');
  if (el) el.textContent = equipmentText(countEquipment());
}
// Keep the readout live while a drill is being edited: any element added or
// removed from the board updates it. Cheap — only fires when the readout exists.
let _equipObserver = null;
function ensureEquipObserver() {
  if (_equipObserver || !S.playersLayer || !S.objectsLayer) return;
  _equipObserver = new MutationObserver(() => {
    if (document.getElementById('drill-equipment-readout')) updateEquipmentReadout();
  });
  _equipObserver.observe(S.playersLayer, { childList: true });
  _equipObserver.observe(S.objectsLayer, { childList: true });
}

// Clear the drill name input when leaving the editor.
function restoreAnalysisNameInput() {
  const nameEl = drillNameEl();
  if (nameEl) nameEl.value = '';
}

// ─── Left-panel tab switching (drill editor only) ──────────────────────────
export function switchDrillTab(name, btn) {
  const editor = document.querySelector('.training-drill-editor');
  if (!editor) return;
  editor.querySelectorAll('.drill-left-tab').forEach(t => t.classList.remove('active'));
  if (btn) btn.classList.add('active');
  else editor.querySelector(`.drill-left-tab[data-drill-tab="${name}"]`)?.classList.add('active');
  // Only toggle panes that have a data-drill-pane attribute (drill editor's panes).
  editor.querySelectorAll('.drill-left-pane[data-drill-pane]').forEach(p => {
    p.style.display = p.dataset.drillPane === name ? '' : 'none';
  });
}
window.switchDrillTab = switchDrillTab;

// ─── Tag chip logic ─────────────────────────────────────────────────────────
function renderTagChips(group, tags) {
  const wrap = document.querySelector(`[data-tag-group="${group}"]`);
  if (!wrap) return;
  wrap.innerHTML = '';
  tags.forEach((t, idx) => {
    const chip = document.createElement('span');
    chip.className = 'drill-tag-chip';
    chip.dataset.idx = idx;
    chip.innerHTML = `<span>${escapeHtml(t)}</span><button class="drill-tag-remove" type="button" aria-label="Remove">&times;</button>`;
    chip.querySelector('.drill-tag-remove').onclick = () => removeTag(group, idx);
    wrap.appendChild(chip);
  });
}

function tagsFor(group) {
  const wrap = document.querySelector(`[data-tag-group="${group}"]`);
  if (!wrap) return [];
  return [...wrap.querySelectorAll('.drill-tag-chip > span')].map(s => s.textContent);
}

function addTag(group, value) {
  const v = (value || '').trim();
  if (!v) return;
  const current = tagsFor(group);
  if (current.includes(v)) return;
  current.push(v);
  renderTagChips(group, current);
}

function removeTag(group, idx) {
  const current = tagsFor(group);
  current.splice(idx, 1);
  renderTagChips(group, current);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

// ─── Save drill ─────────────────────────────────────────────────────────────
// Rasterise the current board into a small JPEG for the drill-library card.
// Serialise-and-draw, same technique as the mini-pitch export. Never blocks a
// save: any failure returns null and the drill saves without a thumbnail.
async function captureBoardThumb() {
  try {
    const svg = document.getElementById('pitch-svg');
    if (!svg) return null;
    const clone = svg.cloneNode(true);
    clone.querySelectorAll('.selection-outline, .sel-handle, .resize-handle, #element-handles, .marquee-rect, [data-handle]').forEach(n => n.remove());
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
    const vb = svg.viewBox && svg.viewBox.baseVal;
    const w = (vb && vb.width) || parseFloat(svg.getAttribute('width')) || 700;
    const h = (vb && vb.height) || parseFloat(svg.getAttribute('height')) || 480;
    const img = new Image();
    await new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error('thumb timeout')), 3000);
      img.onload = () => { clearTimeout(t); res(); };
      img.onerror = () => { clearTimeout(t); rej(new Error('thumb decode failed')); };
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(clone));
    });
    const W = 340, H = Math.max(1, Math.round(W * h / w));
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#1a1f2e'; ctx.fillRect(0, 0, W, H);
    ctx.drawImage(img, 0, 0, W, H);
    return canvas.toDataURL('image/jpeg', 0.65);
  } catch (e) {
    console.warn('[training] thumb capture failed:', e);
    return null;
  }
}

export async function saveDrill() {
  const formData = readDrillFromForm();
  if (!formData.name) {
    const nameEl = drillNameEl();
    if (nameEl) {
      nameEl.classList.add('input-error');
      // Auto-switch to the Drill tab so the error is visible
      window.switchTab?.('drill');
      // Clear the error styling as soon as the user starts typing
      const clear = () => {
        nameEl.classList.remove('input-error');
        nameEl.removeEventListener('input', clear);
      };
      nameEl.addEventListener('input', clear);
      nameEl.focus();
    }
    window.showNotification?.('Please give your drill a name.', 'error', 3000);
    return;
  }

  window.deselect?.();   // selection strokes would bake into the thumbnail
  const thumb = await captureBoardThumb();

  const now = Date.now();
  const drill = {
    id: _editingDrillId || ('drill_' + now + '_' + Math.random().toString(36).slice(2, 7)),
    ...formData,
    boardState: captureState(),
    thumb: thumb || _currentDrill?.thumb || null,   // keep the old thumb if capture fails
    createdAt: _currentDrill?.createdAt || now,
    updatedAt: now,
  };

  try {
    const { storedIn } = await saveDrillCloudOrLocal(drill);
    const where = storedIn === 'cloud' ? 'cloud' : 'this device';
    window.showNotification?.(`Drill "${drill.name}" saved to ${where}.`, 'success', 3000);
    track('training_drill_saved', {
      isNew: !_editingDrillId,
      numPlayers: drill.numPlayers,
      tagCount: (drill.objectives.general.length + drill.objectives.offensive.length + drill.objectives.defensive.length),
      frameCount: drill.boardState?.frames?.length || 0,
      storedIn,
    });
  } catch (e) {
    console.error(e);
    window.showNotification?.('Could not save drill. Please try again.', 'error', 4000);
    return;
  }

  _currentDrill = null;
  _editingDrillId = null;
  restorePitchToOriginal();
  silentClearPitch();
  restoreAnalysisNameInput();
  showView('landing');
  renderLibrary();
}

// ─── Library ────────────────────────────────────────────────────────────────
async function renderLibrary() {
  await renderDrillLibrary();
  await renderSessionLibrary();
}

async function renderDrillLibrary() {
  const wrap = document.querySelectorAll('.training-library-section')[0];
  if (!wrap) return;
  wrap.querySelectorAll('.training-empty, .drill-card-list').forEach(n => n.remove());

  let drills = [];
  try { drills = await listDrills(); } catch (e) { console.warn(e); }

  if (!drills.length) {
    const empty = document.createElement('div');
    empty.className = 'training-empty';
    empty.innerHTML = 'No drills yet. Click <strong>New Drill</strong> above to create your first one.';
    wrap.appendChild(empty);
    return;
  }

  const list = document.createElement('div');
  list.className = 'drill-card-list';
  drills.forEach(d => {
    const card = document.createElement('div');
    card.className = 'drill-card';
    const objTags = [
      ...(d.objectives?.general || []),
      ...(d.objectives?.offensive || []),
      ...(d.objectives?.defensive || []),
    ].slice(0, 3);
    card.dataset.search = [d.name, d.category,
      ...(d.objectives?.general||[]), ...(d.objectives?.offensive||[]), ...(d.objectives?.defensive||[])
    ].join(' ').toLowerCase();
    const cat = d.category ? `<span class="drill-card-phase">${escapeHtml(d.category)}</span>` : '';
    const dur = d.duration ? `${d.duration} min` : '';
    const metaBits = [d.numPlayers ? `${d.numPlayers} players` : '', dur, ...objTags.map(t => escapeHtml(t))].filter(Boolean);
    const thumbHtml = (typeof d.thumb === 'string' && d.thumb.startsWith('data:image'))
      ? `<img class="drill-card-thumb" src="${d.thumb}" alt="" loading="lazy">`
      : `<div class="drill-card-thumb drill-card-thumb-empty">
           <svg width="34" height="24" viewBox="0 0 34 24" fill="none"><rect x="1" y="1" width="32" height="22" rx="2" stroke="currentColor" stroke-width="1.4"/><line x1="17" y1="1" x2="17" y2="23" stroke="currentColor" stroke-width="1"/><circle cx="17" cy="12" r="4" stroke="currentColor" stroke-width="1"/></svg>
         </div>`;
    card.innerHTML = `
      ${thumbHtml}
      <div class="drill-card-body">
        <div class="drill-card-title">${cat}${escapeHtml(d.name || 'Untitled drill')}</div>
        <div class="drill-card-meta">${metaBits.length ? metaBits.join(' · ') : 'no details yet'}</div>
      </div>
      <button class="drill-card-delete" type="button" aria-label="Delete drill">&times;</button>
    `;
    card.onclick = (e) => {
      if (e.target.closest('.drill-card-delete')) return;
      openDrill(d.id);
    };
    card.querySelector('.drill-card-delete').onclick = async (e) => {
      e.stopPropagation();
      if (!confirm(`Delete drill "${d.name || 'Untitled'}"?`)) return;
      await deleteDrill(d.id);
      track('training_drill_deleted', { drillId: d.id });
      renderDrillLibrary();
    };
    list.appendChild(card);
  });
  wrap.appendChild(list);
}

async function renderSessionLibrary() {
  const wrap = document.querySelectorAll('.training-library-section')[1];
  if (!wrap) return;
  wrap.querySelectorAll('.training-empty, .drill-card-list').forEach(n => n.remove());

  let sessions = [];
  try { sessions = await listSessions(); } catch (e) { console.warn(e); }

  if (!sessions.length) {
    const empty = document.createElement('div');
    empty.className = 'training-empty';
    empty.innerHTML = 'No sessions yet. Click <strong>New Session</strong> above to plan your first session.';
    wrap.appendChild(empty);
    return;
  }

  const list = document.createElement('div');
  list.className = 'drill-card-list';
  sessions.forEach(s => {
    const card = document.createElement('div');
    card.className = 'drill-card';
    card.dataset.search = [s.name,
      ...(s.objectives?.general||[]), ...(s.objectives?.offensive||[]), ...(s.objectives?.defensive||[])
    ].join(' ').toLowerCase();
    const count = (s.drillIds || []).length;
    const tags = [
      ...(s.objectives?.general || []),
      ...(s.objectives?.offensive || []),
      ...(s.objectives?.defensive || []),
    ].slice(0, 3);
    card.innerHTML = `
      <div class="drill-card-title">${escapeHtml(s.name || 'Untitled session')}</div>
      <div class="drill-card-meta">${count} ${count === 1 ? 'drill' : 'drills'} · ${s.numPlayers || '?'} players${tags.length ? ' · ' + tags.map(escapeHtml).join(' · ') : ''}</div>
      <button class="drill-card-delete" type="button" aria-label="Delete session">&times;</button>
    `;
    card.onclick = (e) => {
      if (e.target.closest('.drill-card-delete')) return;
      openSession(s.id);
    };
    card.querySelector('.drill-card-delete').onclick = async (e) => {
      e.stopPropagation();
      if (!confirm(`Delete session "${s.name || 'Untitled'}"?`)) return;
      await deleteSession(s.id);
      track('training_session_deleted', { sessionId: s.id });
      renderSessionLibrary();
    };
    list.appendChild(card);
  });
  wrap.appendChild(list);
}

async function openDrill(id) {
  const drill = await loadDrill(id);
  if (!drill) {
    window.showNotification?.('Could not load drill.', 'error', 3000);
    return;
  }
  _currentDrill = drill;
  _editingDrillId = id;
  applyDrillToForm(drill);
  silentClearPitch();
  showView('drill-editor');
  track('training_drill_opened', { drillId: id });
  requestAnimationFrame(async () => {
    relocatePitchToCanvas();
    await applyBoardState(drill.boardState);
    window.switchTab?.('drill');
  });
}

// ─── Tag input wiring (set up once) ─────────────────────────────────────────
let _tagInputsWired = false;
function wireTagInputs() {
  if (_tagInputsWired) return;
  _tagInputsWired = true;
  // Drill tag inputs
  document.querySelectorAll('[data-tag-input]').forEach(input => {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        addTag(input.dataset.tagInput, input.value);
        input.value = '';
      }
    });
    input.addEventListener('blur', () => {
      if (input.value.trim()) { addTag(input.dataset.tagInput, input.value); input.value = ''; }
    });
  });
  // Session tag inputs
  document.querySelectorAll('[data-session-tag-input]').forEach(input => {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        addSessionTag(input.dataset.sessionTagInput, input.value);
        input.value = '';
      }
    });
    input.addEventListener('blur', () => {
      if (input.value.trim()) { addSessionTag(input.dataset.sessionTagInput, input.value); input.value = ''; }
    });
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', wireTagInputs);
} else {
  wireTagInputs();
}

// ─── Window exposure ────────────────────────────────────────────────────────
// ─── Library search ──────────────────────────────────────────────────────────
export function filterTrainingLibrary(query) {
  const q = (query || '').trim().toLowerCase();
  document.querySelectorAll('.training-library-section').forEach(section => {
    const cards = section.querySelectorAll('.drill-card');
    let shown = 0;
    cards.forEach(card => {
      const match = !q || (card.dataset.search || '').includes(q);
      card.style.display = match ? '' : 'none';
      if (match) shown++;
    });
    // toggle a "no matches" line per section when searching
    let none = section.querySelector('.training-search-empty');
    if (q && cards.length && shown === 0) {
      if (!none) {
        none = document.createElement('div');
        none.className = 'training-empty training-search-empty';
        section.appendChild(none);
      }
      none.textContent = 'No matches.';
      none.style.display = '';
    } else if (none) { none.style.display = 'none'; }
  });
}
window.filterTrainingLibrary = filterTrainingLibrary;

// ─── Printable session sheet (Print / Save as PDF) ───────────────────────────
export async function printSession() {
  const session = readSessionFromForm();
  const ids = _currentSession?.drillIds || [];
  if (!ids.length) { window.showNotification?.('Add at least one drill before printing.', 'error', 3000); return; }
  const all = await listDrills();
  const byId = Object.fromEntries(all.map(d => [d.id, d]));
  const drills = ids.map(id => byId[id]).filter(Boolean);
  const totalMin = drills.reduce((a, d) => a + (parseInt(d.duration, 10) || 0), 0);
  const agg = {}; drills.forEach(d => Object.entries(d.equipment || {}).forEach(([t, n]) => agg[t] = (agg[t] || 0) + n));
  const objAll = [...session.objectives.general, ...session.objectives.offensive, ...session.objectives.defensive];

  const esc = (x) => escapeHtml(String(x ?? ''));
  const block = (label, val) => val ? `<div class="ps-field"><span class="ps-flabel">${label}</span><span class="ps-fval">${esc(val).replace(/\n/g,'<br>')}</span></div>` : '';
  const drillHTML = drills.map((d, i) => {
    const objs = [...(d.objectives?.general||[]),...(d.objectives?.offensive||[]),...(d.objectives?.defensive||[])];
    const meta = [d.category, d.duration ? d.duration + ' min' : '', d.numPlayers ? d.numPlayers + ' players' : ''].filter(Boolean).join(' · ');
    return `<section class="ps-drill">
      <h3><span class="ps-num">${i+1}</span> ${esc(d.name || 'Untitled drill')}</h3>
      ${meta ? `<div class="ps-meta">${esc(meta)}</div>` : ''}
      ${block('Objectives', objs.join(', '))}
      ${block('Description', d.description)}
      ${block('Coaching points', d.coachingPoints)}
      ${block('Progression / variants', d.variants)}
      ${block('Equipment', equipmentText(d.equipment))}
    </section>`;
  }).join('');

  let host = document.getElementById('session-print-sheet');
  if (host) host.remove();
  host = document.createElement('div');
  host.id = 'session-print-sheet';
  host.innerHTML = `
    <div class="ps-page">
      <header class="ps-head">
        <div>
          <div class="ps-brand">TÁCTICA · Training session</div>
          <h1>${esc(session.name || 'Untitled session')}</h1>
        </div>
        <div class="ps-stats">
          <div><b>${totalMin || '—'}${totalMin ? ' min' : ''}</b><span>Total</span></div>
          <div><b>${session.numPlayers || '—'}</b><span>Players</span></div>
          <div><b>${drills.length}</b><span>${drills.length === 1 ? 'Drill' : 'Drills'}</span></div>
        </div>
      </header>
      ${objAll.length ? `<div class="ps-objectives"><b>Objectives:</b> ${esc(objAll.join(', '))}</div>` : ''}
      <div class="ps-equip"><b>Equipment for the session:</b> ${esc(equipmentText(agg))}</div>
      ${drillHTML}
      <footer class="ps-foot">Made with Táctica · tactica.football</footer>
    </div>`;
  document.body.appendChild(host);
  track('training_session_printed', { drills: drills.length, totalMin });
  window.print();
  // clean up shortly after the print dialog closes
  setTimeout(() => host.remove(), 500);
}
window.printSession = printSession;

window.startNewDrill = startNewDrill;
window.startNewSession = startNewSession;
window.exitDrillEditor = exitDrillEditor;
window.exitSessionEditor = exitSessionEditor;
window.saveDrill = saveDrill;
window.saveSession = saveSession;
window.drillClearPitch = silentClearPitch;

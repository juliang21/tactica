import * as S from './state.js';
import { deselect, deleteSelected, switchTab, select, applyTransform, updateArrowVisual, registerRewrap, registerHeadlineRewrap, registerVisionUpdate, registerFreeformUpdate, registerMotionUpdate, registerTagReposition, registerLinkUpdate, registerShadowLabelUpdate, registerZonePanelSync, registerDragEnd, makeDraggable, registerSelectTracker, registerSelectTeamContext, startMarquee, updateMarquee, endMarquee, cleanupMarquee, forEachSelected } from './interaction.js';
import { addPlayer, addReferee, addBall, addCone, addArrow, addShadow, addMarker, addSpotlight, addTextBox, updateTextBoxBg, rewrapTextBox, addHeadline, rewrapHeadline, openHeadlineEdit, addVision, updateVisionPolygon, addFreeformZone, updateFreeformPath, addMotion, updateMotionVisual, updatePlayerArms, addTag, openTagEdit, repositionTag, addLink, updateLink, updateAllLinks, addPair, updatePair, updateAllPairs, addNetZone, addFreeNetZone, updateNetZone, updateAllNetZones, updateShadowLabel} from './elements.js';
import { setTool, setArrowType, selectTeamContext, applyKit, applyColor, placeFormation,
         liveUpdateNumber, confirmNumber, liveUpdateName, confirmName,
         applyNameSize, applyNameColor, applyNameBg, updatePlayerNameBg,
         applyPlayerFill, applyPlayerBorder, togglePlayerArms,
         liveUpdateRefName, confirmRefName, applyRefFill, applyRefBorder,
         openColorPicker, closeColorPicker, confirmColorPicker,
         applyArrowColor, applyArrowStyle, applyArrowWidth, applyArrowCurve, applyArrowOpacity, applyArrowHeadScale,
         applySpotlightColor, setSpotlightColor, applyVisionColor, applyVisionBorder, applyVisionOpacity,
         liveUpdateSpotName, confirmSpotName, applySpotNameSize, applySpotNameColor, applySpotNameBg,
         applyZoneFill, applyZoneBorder, applyZoneBorderStyle, applyZoneOpacity,
         liveUpdateTextBox, confirmTextBox, applyTextBoxSize, applyTextBoxColor, applyTextBoxBg, applyTextBoxAlign,
         liveUpdateHeadline, applyHeadlineBarColor, applyHeadlineTitleSize, applyHeadlineBodySize, applyHeadlineTextColor, applyHeadlineBg,
         liveUpdateTagLabel, liveUpdateTagValue, applyTagLabelColor, applyTagValueColor, applyTagLineColor, applyTagLineDash, applyTagLineLen, applyTagLineAngle, applyTagTextAnchor,
         applyMarkerBorderColor, applyMarkerBgColor, applyMarkerLineColor, applyMarkerOpacity, liveUpdateMarkerName, confirmMarkerName,
         applySize, applyRotation, clearAll } from './ui.js';
import { setPitch, setPitchColor, setPitchOpt, setPitchVisual, togglePitchFlip, updatePitchFromToggles, setPitchLineColor, toggleStripes, rebuildPitch } from './pitch.js';
import { exportImage, selectFmt, closeExport, doExport } from './export.js?v=5';
import { triggerImageUpload, handleImageUpload, enterImageMode, exitImageMode, toggleMiniPitch, setMiniPitchType, setMiniPitchColor, setMiniPitchLine, updateMiniPitch } from './imagemode.js?v=6';
import { trackElementInserted, trackModeSwitch, trackElementEdited, trackElementDragged, trackToolActivated, trackSignIn, registerAnalysisTracker } from './analytics.js';
import { saveAnalysis, loadAnalysis, deleteAnalysis, duplicateAnalysis, renameAnalysis, listAnalyses, getCurrentId, clearCurrentId, formatDate, quickSave, migrateLocalToCloud, captureState, generateThumbnail, listFolders, createFolder, renameFolder, deleteFolder, moveAnalysisToFolder } from './storage.js';
import { onAuthChange, getCurrentUser } from './auth.js';
import { shouldBlockUser, shouldBlockAnonymous, showMaintenanceOverlay, isBlockedEmail } from './access-check.js';
import { logSession, logAction, setSessionId, saveSharedAnalysis, loadSharedAnalysis, markUserReviewed } from './firestore.js?v=5';
import { hideUpgradePrompt, setUserTier, updateLockedUI } from './subscription.js';
import './features/feedback.js';
import './features/bundles.js';
import './features/zoom.js';
import './features/notes.js';
import { updateAuthUI, openAuthModal, closeAuthModal } from './features/auth-ui.js';
import { registerMode, activateMode, getActiveModeId, switchTabForMode } from './core/mode-registry.js';
import { pitchMode } from './modes/pitch/config.js';
import { imageMode } from './modes/image/config.js';

// ─── Register Modes & activate default ─────────────────────────────────────
registerMode('pitch', pitchMode);
registerMode('image', imageMode);
activateMode('pitch');  // set initial toolbar + side panel state

// ─── Wire up cross-module callbacks ─────────────────────────────────────────
registerRewrap(rewrapTextBox);
registerHeadlineRewrap(rewrapHeadline);
registerSelectTeamContext(selectTeamContext);
registerVisionUpdate(updateVisionPolygon);
registerFreeformUpdate(updateFreeformPath);
registerMotionUpdate(updateMotionVisual);
registerShadowLabelUpdate(updateShadowLabel);
registerZonePanelSync(_syncZonePanelState);
registerTagReposition(repositionTag);
registerLinkUpdate(updateAllLinks);
// ─── Initialize subscription UI ────────────────────────────────────────────
updateLockedUI();

// ─── "Analysis started" session tracker ────────────────────────────────────
registerAnalysisTracker(() => {
  const u = getCurrentUser();
  if (u) logAction(u.uid, u.email, 'analysis_started', { mode: S.appMode || 'pitch' }).catch(() => {});
});
registerSelectTracker((type) => {
  const u = getCurrentUser();
  if (u) logAction(u.uid, u.email, 'element_selected', { element: type }).catch(() => {});
});

registerDragEnd((el) => {
  trackElementDragged();
  // When a player is dragged in a step > 0, save and redraw trails
  if (el.dataset.type === 'player' && frames.length > 0) {
    saveCurrentToFrame();
    drawTrails();
  }
});

// ─── Undo ────────────────────────────────────────────────────────────────────
function undo() {
  if (!S.undoStack.length) return;
  deselect();
  const snap = S.undoStack.pop();
  S.objectsLayer.innerHTML = snap.objects;
  S.playersLayer.innerHTML = snap.players;
  S.playerCounts.a = snap.playerCounts.a;
  S.playerCounts.b = snap.playerCounts.b;
  S.playerCounts.joker = snap.playerCounts.joker || 0;
  S.setObjectCounter(snap.objectCounter);

  // Restore animation frame elementIds if saved (from animation-mode delete)
  if (snap._frameIds && frames.length === snap._frameIds.length) {
    snap._frameIds.forEach((ids, i) => { frames[i].elementIds = ids; });
  }

  // Re-attach event listeners to all restored elements
  S.objectsLayer.querySelectorAll('[data-type]').forEach(g => {
    const isFreeNz = g.dataset.type === 'net-zone' && g.dataset.freeZone === 'true';
    if (g.dataset.type !== 'link' && (g.dataset.type !== 'net-zone' || isFreeNz)) makeDraggable(g);
    g.addEventListener('click', e => { if (S.tool === 'select') { e.stopPropagation(); select(g, { additive: e.ctrlKey || e.metaKey }); } });
    // Shadow zones: dblclick to edit label
    if (g.dataset.type?.startsWith('shadow')) {
      g.addEventListener('dblclick', e => {
        e.stopPropagation(); select(g);
        setTimeout(() => { const inp = document.getElementById('zone-label-input'); if (inp) { inp.focus(); inp.select(); } }, 50);
      });
    }
    // Net-zone: mousedown selects group + starts drag
    if (g.dataset.type === 'net-zone') {
      g.addEventListener('mousedown', e => {
        if (S.tool !== 'select') return;
        e.stopPropagation(); e.preventDefault();
        const pids = g.dataset.players.split(',').filter(Boolean);
        let first = true;
        for (const pid of pids) {
          const pEl = document.getElementById(pid);
          if (!pEl) continue;
          if (first) { select(pEl, { additive: false }); first = false; }
          else select(pEl, { additive: true });
        }
        const p1 = document.getElementById(pids[0]);
        if (p1) {
          p1.dispatchEvent(new MouseEvent('mousedown', {
            bubbles: false, clientX: e.clientX, clientY: e.clientY,
            ctrlKey: e.ctrlKey, metaKey: e.metaKey
          }));
        }
      });
    }
  });
  S.playersLayer.querySelectorAll('[data-type]').forEach(g => {
    makeDraggable(g);
    g.addEventListener('click', e => { if (S.tool === 'select') { e.stopPropagation(); select(g, { additive: e.ctrlKey || e.metaKey }); } });
    if (g.dataset.type === 'textbox') {
      g.addEventListener('dblclick', e => {
        e.stopPropagation();
        // Trigger inline edit via import
        try { import('./elements.js').then(m => m.openTextBoxEditFn?.(g)); } catch(err) {}
      });
    }
    if (g.dataset.type === 'headline') {
      g.addEventListener('dblclick', e => {
        e.stopPropagation();
        openHeadlineEdit(g, e);
      });
    }
    if (g.dataset.type === 'tag') {
      g.addEventListener('dblclick', e => {
        e.stopPropagation();
        openTagEdit(g, e);
      });
    }
  });
  // Refresh link positions after restoring
  updateAllLinks();
  // Re-apply current frame if in animation mode
  if (frames.length > 0) applyFrame(currentFrame);
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

// ─── Systematized Post-Insert Selection ─────────────────────────────────────
// After any element is inserted, we want to:
//   1) Switch to the select tool
//   2) Select the new element (which shows its properties panel + Selection tab)
//
// For drag-based insertions (arrow, freeform zone), a stray 'click' event
// follows the mouseup on the SVG canvas, which the click handler at line ~1684
// interprets as a click on empty pitch and calls deselect() — instantly hiding
// the properties panel we just opened. Setting S.dragMoved(true) makes that
// handler bail out (it already has `if (S.dragMoved) return;`).
function finishInsert(el, opts = {}) {
  if (!el) return;
  if (opts.dragBased) {
    S.setDragMoved(true);
    setTimeout(() => S.setDragMoved(false), 0);
  }
  setTool('select');
  select(el);
}

// ─── Expose to inline HTML handlers ──────────────────────────────────────────
// (These bridge the onclick="" attributes in the HTML to the module functions)
// Wrap setTool to clean up freeform preview when switching tools
const _baseSetTool = setTool;
window.setTool = function(t) {
  // Clean up freeform if leaving freeform mode
  if (S.tool === 'freeform' && t !== 'freeform') {
    freeformPts = [];
    if (freeformPreview) { freeformPreview.remove(); freeformPreview = null; }
    const dotsG = document.getElementById('freeform-dots');
    if (dotsG) dotsG.remove();
  }
  // Clean up link tool state if leaving link mode
  if (S.tool === 'link' && t !== 'link') {
    _linkStartPlayer = null;
    clearLinkHighlight();
  }
  // Clean up pair tool state if leaving pair mode
  if (S.tool === 'pair' && t !== 'pair') {
    _pairStartPlayer = null;
    clearLinkHighlight();
  }
  // Clean up marker chain state if leaving marker mode
  if (S.tool === 'marker' && t !== 'marker') {
    _lastChainMarker = null;
  }
  // Clean up net-zone tool state if leaving net-zone mode
  if (S.tool === 'net-zone' && t !== 'net-zone') {
    cancelNetZone();
  }
  _baseSetTool(t);

  // ── Show element properties panel when a tool is selected ──────────────
  // Maps tool names to their panel section + hint text so the user can
  // pre-configure settings before placing the element on the pitch.
  const _toolPanelMap = {
    'shadow-rect':  { panel: 'zone-edit-section',      label: 'Zone',          hint: 'Click on the pitch to place' },
    'shadow-circle':{ panel: 'zone-edit-section',      label: 'Zone',          hint: 'Click on the pitch to place' },
    'spotlight':    { panel: 'spotlight-edit-section',  label: 'Highlight',     hint: 'Click on the pitch to place' },
    'vision':       { panel: 'vision-edit-section',     label: 'Vision',        hint: 'Click on the pitch to place' },
    'arrow':        { panel: 'arrow-edit-section',      label: 'Arrow',         hint: 'Click and drag to draw' },
    'textbox':      { panel: 'textbox-edit-section',    label: 'Text',          hint: 'Click on the pitch to place' },
    'headline':     { panel: 'headline-edit-section',   label: 'Headline',      hint: 'Click on the pitch to place' },
    'tag':          { panel: 'tag-edit-section',        label: 'Callout',       hint: 'Click on the pitch to place' },
    'marker':       { panel: 'marker-edit-section',     label: 'Marker',        hint: 'Click on the pitch to place' },
    'referee':      { panel: 'referee-edit-section',    label: 'Referee',       hint: 'Click on the pitch to place' },
    // Hint-only entries: switch to Selection tab + show hint, but no dedicated panel
    // (these elements have no settable defaults pre-placement)
    'player-joker': { panel: null, label: 'Joker', hint: 'Click on the pitch to place' },
    'ball':         { panel: null, label: 'Ball',  hint: 'Click on the pitch to place' },
    'cone':         { panel: null, label: 'Cone',  hint: 'Click on the pitch to place' },
    'net-zone':     null, // handled separately below
    'link':         null,
    'pair':         null,
  };

  const toolPanel = _toolPanelMap[t];
  if (toolPanel) {
    switchTab('element');
    // Hide all edit sections first
    document.querySelectorAll('.panel-section[id$="-edit-section"]').forEach(s => s.style.display = 'none');
    document.getElementById('del-section').style.display = 'none';
    document.getElementById('layer-section').style.display = 'none';
    document.getElementById('size-section').style.display = 'none';
    document.getElementById('rotation-section').style.display = 'none';
    // Show the relevant panel (if one is defined)
    if (toolPanel.panel) {
      const sec = document.getElementById(toolPanel.panel);
      if (sec) sec.style.display = '';
    }
    S.selInfo.innerHTML = `<strong>${toolPanel.label}</strong><br><span style="font-size:10px;color:var(--text-muted)">${toolPanel.hint}</span>`;
    // Reflect the current default variant as the active card
    if (t === 'vision') {
      const v = S.visionType || 'pointed';
      document.querySelectorAll('#vision-edit-section .shape-card[data-vstyle]').forEach(c =>
        c.classList.toggle('active', c.dataset.vstyle === v));
    } else if (t === 'arrow') {
      const a = S.arrowType || 'run';
      document.querySelectorAll('#arrow-edit-section .shape-card[data-atype]').forEach(c =>
        c.classList.toggle('active', c.dataset.atype === a));
    }
  } else if (t === 'net-zone') {
    switchTab('element');
    _showNetZoneHint();
  } else if (t === 'link') {
    switchTab('element');
    S.selInfo.innerHTML = '<strong>Connect</strong><br><span style="font-size:10px;color:var(--text-muted)">Click a player, then click another to connect them.</span>';
  } else if (t === 'pair') {
    switchTab('element');
    S.selInfo.innerHTML = '<strong>Pair</strong><br><span style="font-size:10px;color:var(--text-muted)">Click a player, then click another to pair them.</span>';
  }
};
// Legacy aliases (kept for backward compat; panel Type cards are the primary path now)
window.setArrowType = setArrowType;
window.setVisionType = S.setVisionType;
window.selectTeamContext = selectTeamContext;
window.trackToolActivated = trackToolActivated;
window.applyKit = function(el) {
  applyKit(el);
  const teamName = el.dataset.trackName || el.getAttribute('title') || el.querySelector('.kit-label')?.textContent || 'unknown';
  const isNational = !!el.closest('#kit-grid-national');
  const action = isNational ? 'feature_national_team' : 'feature_club_team';
  const u = getCurrentUser();
  if (u) logAction(u.uid, u.email, action, { team: teamName }).catch(() => {});
  if (typeof window.gtag === 'function') window.gtag('event', action, { team_name: teamName, tool_name: 'tactica' });
};
window.applyColor = function(swatchEl) {
  applyColor(swatchEl);
  const u = getCurrentUser();
  if (u) logAction(u.uid, u.email, 'feature_custom_color', { color: swatchEl.dataset.color }).catch(() => {});
};
// ─── Bulk Player Appearance ──────────────────────────────────────────────────
window.applyBulkPlayerSize = function(val) {
  const scale = (val / 100).toFixed(2);
  document.getElementById('bulk-size-val').textContent = scale + 'x';
  const team = S.teamContext;
  S.playersLayer.querySelectorAll('[data-type="player"]').forEach(g => {
    if (g.dataset.team === team) {
      g.dataset.scale = scale;
      applyTransform(g);
    }
  });
};

window.applyBulkPlayerBorder = function(swatchEl) {
  const color = swatchEl.dataset.color;
  const team = S.teamContext;
  S.playersLayer.querySelectorAll('[data-type="player"]').forEach(g => {
    if (g.dataset.team === team) {
      const circ = g.querySelector('circle:not(.hit-area):not(.player-arm):not(.player-shadow)');
      if (!circ) return;
      if (color === 'none') {
        circ.setAttribute('stroke', 'transparent');
        circ.setAttribute('stroke-width', '0');
      } else {
        circ.setAttribute('stroke', color);
        circ.setAttribute('stroke-width', '2');
      }
      g.dataset.borderColor = color;
    }
  });
};

window.switchKitTab = function(tab, btn) {
  document.getElementById('kit-grid-clubs').style.display = tab === 'clubs' ? '' : 'none';
  document.getElementById('kit-grid-national').style.display = tab === 'national' ? '' : 'none';
  const search = document.getElementById('kit-search');
  if (search) search.style.display = tab === 'clubs' ? '' : 'none';
  document.querySelectorAll('.kit-tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
};

// ─── Searchable Teams Database ──────────────────────────────────────────────
let _teamsDB = null;
let _popularNames = null;
let _popularOrder = null;

async function loadTeamsDB() {
  try {
    const resp = await fetch('data/teams.json');
    const data = await resp.json();
    _teamsDB = data.clubs;
    _popularNames = new Set(data.popular);
    _popularOrder = data.popular; // preserve display order
    const byName = Object.fromEntries(_teamsDB.map(t => [t.name, t]));
    renderKitGrid(_popularOrder.map(n => byName[n]).filter(Boolean));
    // Show search input now that data is loaded
    const search = document.getElementById('kit-search');
    if (search) search.style.display = '';
  } catch (e) {
    console.warn('[teams] Failed to load teams.json:', e);
  }
}

function renderKitGrid(teams) {
  const grid = document.getElementById('kit-grid-clubs');
  if (!grid) return;
  grid.innerHTML = '';
  teams.forEach(t => {
    const btn = document.createElement('div');
    btn.className = 'kit-btn';
    btn.dataset.color = t.color;
    btn.dataset.gk = t.gk || '#ffd700';
    if (t.border) btn.dataset.border = t.border;
    if (t.svgPattern) btn.dataset.pattern = t.svgPattern;
    btn.dataset.trackName = t.name;
    btn.title = t.name;
    btn.onclick = function() { applyKit(this); };

    // Label (created early so previewClass path can style it)
    const label = document.createElement('div');
    label.className = 'kit-label';
    label.textContent = t.code;

    // Teams with special CSS preview classes (Arsenal, PSG, Boca, River)
    if (t.previewClass) {
      btn.classList.add(t.previewClass);
      // CSS handles background + label styling for these
      btn.appendChild(label);
      grid.appendChild(btn);
      return;
    }

    // Build background style
    let bg;
    if ((t.pattern === 'stripes' || t.pattern === 'stripes-rw') && t.stripe) {
      bg = `repeating-linear-gradient(90deg,${t.color} 0 5px,${t.stripe} 5px 10px)`;
    } else if (t.pattern === 'stripes-h' && t.stripe) {
      bg = `repeating-linear-gradient(0deg,${t.color} 0 5px,${t.stripe} 5px 10px)`;
    } else if (t.pattern === 'half' && t.stripe) {
      bg = `linear-gradient(90deg,${t.color} 50%,${t.stripe} 50%)`;
    } else if (t.pattern === 'sash' && t.stripe) {
      bg = `linear-gradient(135deg, ${t.color} 35%, ${t.stripe} 35%, ${t.stripe} 65%, ${t.color} 65%)`;
    } else {
      bg = t.color;
    }
    btn.style.background = bg;
    if (t.border && t.border !== 'none') btn.style.border = `2px solid ${t.border}`;

    // Label styling
    if (t.labelDark) label.style.color = '#000';
    // For striped kits with white stripes, add bg to label for readability
    if ((t.pattern === 'stripes' || t.pattern === 'stripes-rw') && t.stripe === '#ffffff') {
      label.style.color = t.labelColor || t.color;
      label.style.fontWeight = '700';
      label.style.background = 'rgba(255,255,255,0.85)';
      label.style.borderRadius = '2px';
      label.style.padding = '0 3px';
    }
    if ((t.pattern === 'stripes' || t.pattern === 'stripes-rw') && t.stripe === '#000000') {
      label.style.fontWeight = '700';
      if (t.labelDark) {
        // Dark text on a yellow/light kit gets lost on black stripes.
        // Add a kit-color pill behind the label so it always sits on a
        // solid swatch that contrasts with the text.
        label.style.background = t.color;
        label.style.borderRadius = '2px';
        label.style.padding = '0 3px';
      } else {
        label.style.textShadow = '0 0 3px rgba(0,0,0,0.7)';
      }
    }
    if (t.pattern === 'half' || t.pattern === 'sash') {
      label.style.fontWeight = '700';
      label.style.textShadow = '0 1px 2px rgba(0,0,0,0.6)';
    }
    btn.appendChild(label);
    grid.appendChild(btn);
  });
}

window.searchKits = function(query) {
  if (!_teamsDB) return;
  const q = query.trim().toLowerCase();
  if (!q) {
    // Show popular teams in curated order when search is empty
    const byName = Object.fromEntries(_teamsDB.map(t => [t.name, t]));
    renderKitGrid(_popularOrder.map(n => byName[n]).filter(Boolean));
    return;
  }
  // Search by name, code, or league
  const results = _teamsDB.filter(t =>
    t.name.toLowerCase().includes(q) ||
    t.code.toLowerCase().includes(q) ||
    t.league.toLowerCase().includes(q)
  );
  renderKitGrid(results.slice(0, 30)); // Cap at 30 results
};

// Load teams DB on startup
loadTeamsDB();

// ─── Review Modal ────────────────────────────────────────────────────────────
// Called from onAuthChange after logSession resolves with real Firestore count.
let _currentSessionCount = 0;
function maybeShowReview(sessionCount, hasReviewed) {
  _currentSessionCount = sessionCount;
  const SESSIONS_BEFORE_PROMPT = 5;
  const SESSIONS_BETWEEN_PROMPTS = 10;
  const KEY_REVIEWED = 'tactica_reviewed';
  const KEY_SHOWN_AT = 'tactica_review_shown_at';

  // Server-side flag (cross-device): user has submitted a review on any device.
  if (hasReviewed) {
    // Sync local cache so subsequent sessions on this device take the fast path.
    localStorage.setItem(KEY_REVIEWED, '1');
    return;
  }

  // Local cache (fast path on the same device).
  if (localStorage.getItem(KEY_REVIEWED)) return;

  // Shown before (skip, dismiss, or just closed the tab)? Wait 10 more sessions.
  const shownAt = parseInt(localStorage.getItem(KEY_SHOWN_AT) || '0');
  if (shownAt > 0 && sessionCount < shownAt + SESSIONS_BETWEEN_PROMPTS) return;

  // Not enough sessions yet
  if (sessionCount < SESSIONS_BEFORE_PROMPT) return;

  // Mark as shown NOW — even if user closes the tab, we wait 10 sessions
  localStorage.setItem(KEY_SHOWN_AT, String(sessionCount));

  // Show review modal after a short delay
  setTimeout(() => {
    const modal = document.getElementById('review-modal');
    if (modal) {
      modal.style.display = 'flex';
      if (typeof window.gtag === 'function') window.gtag('event', 'review_modal_shown', { tool_name: 'tactica', sessions: sessionCount });
      const u = getCurrentUser();
      if (u) logAction(u.uid, u.email, 'review_modal_shown', { sessions: sessionCount }).catch(() => {});
    }
  }, 4000);
}

let _reviewRating = 0;

window.hoverReviewStar = function(n) {
  document.querySelectorAll('.review-star').forEach(s => {
    const v = parseInt(s.dataset.star);
    s.classList.toggle('hovered', v <= n);
  });
};

window.resetReviewStars = function() {
  document.querySelectorAll('.review-star').forEach(s => {
    s.classList.remove('hovered');
  });
};

window.selectReviewStar = function(n) {
  _reviewRating = n;
  document.querySelectorAll('.review-star').forEach(s => {
    const v = parseInt(s.dataset.star);
    s.classList.toggle('lit', v <= n);
  });
  // Tailor prompt based on rating
  const prompt = document.getElementById('review-prompt');
  const textarea = document.getElementById('review-text');
  if (n >= 4) {
    prompt.textContent = 'Glad you like it! What stands out most to you?';
    textarea.placeholder = 'e.g. "I use Táctica to prepare every match day — it saves me hours compared to drawing on paper..."';
  } else if (n === 3) {
    prompt.textContent = "We're getting there! What would make it a 5?";
    textarea.placeholder = 'What features or improvements would make the biggest difference for you?';
  } else {
    prompt.textContent = "We want to do better. What's not working?";
    textarea.placeholder = "Tell us what's frustrating — we read every review.";
  }
  // Show comment section
  document.getElementById('review-comment-section').style.display = 'block';
  document.querySelector('.review-skip').style.display = 'none';
  textarea.focus();
};

window.submitReview = async function() {
  if (!_reviewRating) return;
  const btn = document.getElementById('review-submit-btn');
  const status = document.getElementById('review-status');
  const text = document.getElementById('review-text').value.trim();

  btn.disabled = true;
  btn.textContent = 'Sending…';
  status.style.display = 'none';

  const user = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
  const userEmail = user ? user.email : 'anonymous';
  const userName = user ? (user.displayName || user.email) : 'anonymous';

  try {
    const formData = new FormData();
    formData.append('access_key', '315e7f89-890f-4b05-8b81-605325f4f8e4');
    formData.append('subject', `Táctica Review: ${'★'.repeat(_reviewRating)}${'☆'.repeat(5 - _reviewRating)} (${_reviewRating}/5)`);
    formData.append('from_name', 'Táctica Reviews');
    formData.append('email', userEmail);
    formData.append('message', [
      `Rating: ${'★'.repeat(_reviewRating)}${'☆'.repeat(5 - _reviewRating)} (${_reviewRating}/5)`,
      `User: ${userName} (${userEmail})`,
      `Sessions: ${_currentSessionCount || '?'}`,
      '',
      text ? `Review:\n${text}` : '(No written review)',
    ].join('\n'));

    const res = await fetch('https://api.web3forms.com/submit', {
      method: 'POST',
      headers: { 'Accept': 'application/json' },
      body: formData,
    });

    const data = await res.json().catch(() => ({}));
    if (res.ok && data.success) {
      localStorage.setItem('tactica_reviewed', '1');
      // Persist a server-side flag so the prompt is never shown again, even on
      // a different device/browser where localStorage is empty. Awaited so a
      // silent failure can't leave the user prompted again on another device.
      if (user) {
        try { await markUserReviewed(user.uid); }
        catch (e) { console.warn('Failed to persist review flag — may re-prompt on other devices:', e); }
      }
      if (typeof window.gtag === 'function') window.gtag('event', 'review_submitted', { tool_name: 'tactica', rating: _reviewRating, has_text: !!text });
      if (user) logAction(user.uid, user.email, 'review_submitted', { rating: _reviewRating, has_text: !!text, text: text || '' }).catch(() => {});
      status.textContent = 'Thanks for your review! 🙌';
      status.className = 'success';
      status.style.display = 'block';
      btn.textContent = 'Sent ✓';
      setTimeout(() => {
        document.getElementById('review-modal').style.display = 'none';
      }, 2000);
    } else {
      throw new Error(data.message || 'Failed to send');
    }
  } catch(e) {
    console.error('Review error:', e);
    status.textContent = 'Failed to send. Try again.';
    status.className = 'error';
    status.style.display = 'block';
    btn.textContent = 'Submit Review';
    btn.disabled = false;
  }
};

window.skipReview = function() {
  if (typeof window.gtag === 'function') window.gtag('event', 'review_modal_closed', { tool_name: 'tactica', method: 'skip' });
  const u = getCurrentUser();
  if (u) logAction(u.uid, u.email, 'review_modal_closed', { method: 'skip' }).catch(() => {});
  document.getElementById('review-modal').style.display = 'none';
};

window.dismissReview = function() {
  if (typeof window.gtag === 'function') window.gtag('event', 'review_modal_closed', { tool_name: 'tactica', method: 'close' });
  const u = getCurrentUser();
  if (u) logAction(u.uid, u.email, 'review_modal_closed', { method: 'close' }).catch(() => {});
  document.getElementById('review-modal').style.display = 'none';
};

window.placeFormation = function(name) {
  placeFormation(name);
  maybeSendPitchSnapshot();
  const u = getCurrentUser();
  if (u) logAction(u.uid, u.email, 'feature_formation', { formation: name }).catch(() => {});
  if (typeof window.gtag === 'function') window.gtag('event', 'feature_formation', { formation_name: name, tool_name: 'tactica' });
};
window.liveUpdateNumber = liveUpdateNumber;
window.confirmNumber = confirmNumber;
window.liveUpdateName = liveUpdateName;
window.confirmName = confirmName;
window.applySize = applySize;
window.applyRotation = applyRotation;
// Wrap clearAll with a themed confirm modal (replaces the native confirm() popup)
window.clearAll = async function() {
  const confirmed = await showConfirmModal({
    icon: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z" stroke="#EF4444" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><line x1="10" y1="11" x2="10" y2="17" stroke="#EF4444" stroke-width="1.5" stroke-linecap="round"/><line x1="14" y1="11" x2="14" y2="17" stroke="#EF4444" stroke-width="1.5" stroke-linecap="round"/></svg>',
    title: 'Clear all elements?',
    desc: 'This will remove every player, zone, arrow, and annotation from the pitch. This cannot be undone.',
    confirmLabel: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg> Clear All',
    confirmClass: 'danger',
  });
  if (!confirmed) return;
  clearAll();
};
window.toggleToolbar = function() {
  const tb = document.getElementById('toolbar');
  const btn = document.getElementById('toolbar-toggle');
  tb.classList.toggle('collapsed');
  btn.classList.toggle('collapsed');
  const isCollapsed = tb.classList.contains('collapsed');
  document.body.classList.toggle('toolbar-collapsed', isCollapsed);
  // Persist preference
  try { localStorage.setItem('tactica_toolbar_collapsed', isCollapsed ? '1' : '0'); } catch(e) {}
  // Track
  const action = isCollapsed ? 'hide' : 'show';
  const u = getCurrentUser();
  if (u) logAction(u.uid, u.email, 'feature_toolbar_toggle', { type: action }).catch(() => {});
  if (typeof window.gtag === 'function') window.gtag('event', 'toolbar_toggle', { type: action });
};
window.deleteSelected = function() {
  // In animation mode: hide element from current + future steps instead of removing from DOM
  if (frames.length > 0) {
    const elsToHide = [];
    if (S.selectedEls.size > 0) {
      for (const el of S.selectedEls) elsToHide.push(el);
    } else if (S.selectedEl) {
      elsToHide.push(S.selectedEl);
    }
    if (elsToHide.length === 0) return;
    // Save frame elementIds snapshot for undo
    const frameIdsBefore = frames.map(f => new Set(f.elementIds));
    S.pushUndo();
    // Attach frame snapshot to the undo entry so we can restore it
    S.undoStack[S.undoStack.length - 1]._frameIds = frameIdsBefore;
    for (const el of elsToHide) {
      el.style.display = 'none';
      // Remove from current frame and all future frames
      for (let i = currentFrame; i < frames.length; i++) {
        frames[i].elementIds.delete(el.id);
      }
    }
    S.clearSelectedEls();
    S.setSelectedEl(null);
    deselect();
    return;
  }
  // Normal mode: permanently remove
  deleteSelected();
};
window.switchTab = switchTab;
// ─── Pitch state snapshot (once per session, on first meaningful interaction) ──
let _pitchSnapshotSent = false;
function maybeSendPitchSnapshot() {
  if (_pitchSnapshotSent) return;
  const u = getCurrentUser();
  if (!u) return;
  _pitchSnapshotSent = true;
  const lay = S.currentPitchLayout;
  const isV = (/full-v|half-v/).test(lay);
  const stripes = document.getElementById('pitch-toggle-stripes')?.checked ?? true;
  const selectedColor = document.querySelector('.pitch-color-dot.selected');
  const selectedLine = document.querySelector('.pitch-line-dot.selected');
  logAction(u.uid, u.email, 'pitch_state_snapshot', {
    layout: lay,
    orientation: isV ? 'vertical' : 'horizontal',
    size: lay.startsWith('half') ? 'half' : 'full',
    goals: !lay.includes('-ng'),
    gridH: lay.includes('-grid') && !lay.includes('-gridv') || lay.includes('-gridh'),
    gridV: lay.includes('-grid') && !lay.includes('-gridh') || lay.includes('-gridv'),
    stripes,
    color: selectedColor?.dataset.trackName || selectedColor?.getAttribute('title') || 'Classic Green',
    lineColor: selectedLine?.getAttribute('title') || 'White',
  }).catch(() => {});
}

// Parse layout string into granular fields for tracking
function parsePitchLayout(lay) {
  const isV = (/full-v|half-v|middle-v|3q-v/).test(lay);
  const size = lay.startsWith('middle') ? 'middle' : lay.startsWith('3q') ? 'three-quarter' : lay.startsWith('half') ? 'half' : 'full';
  return {
    type: lay,
    orientation: isV ? 'vertical' : 'horizontal',
    size,
    goals: !lay.includes('-ng'),
    gridH: lay.includes('-grid') && !lay.includes('-gridv') || lay.includes('-gridh'),
    gridV: lay.includes('-grid') && !lay.includes('-gridh') || lay.includes('-gridv'),
  };
}

window.setPitch = function(layout) {
  setPitch(layout);
  const u = getCurrentUser();
  if (u) logAction(u.uid, u.email, 'feature_pitch_change', parsePitchLayout(S.currentPitchLayout)).catch(() => {});
  if (typeof window.gtag === 'function') window.gtag('event', 'feature_pitch_type', { pitch_type: layout, tool_name: 'tactica' });
};
window.setPitchColor = function(dotEl) {
  setPitchColor(dotEl);
  const colorName = dotEl.dataset.trackName || dotEl.getAttribute('title') || 'unknown';
  const stripes = document.getElementById('pitch-toggle-stripes')?.checked ?? true;
  const u = getCurrentUser();
  if (u) logAction(u.uid, u.email, 'feature_pitch_color', { color: colorName, stripes }).catch(() => {});
  if (typeof window.gtag === 'function') window.gtag('event', 'feature_pitch_color', { color_name: colorName, tool_name: 'tactica' });
};
window.setPitchOpt = function(el) {
  setPitchOpt(el);
  const u = getCurrentUser();
  if (u) logAction(u.uid, u.email, 'feature_pitch_change', parsePitchLayout(S.currentPitchLayout)).catch(() => {});
  if (typeof window.gtag === 'function') window.gtag('event', 'feature_pitch_type', { pitch_type: S.currentPitchLayout, tool_name: 'tactica' });
};
window.setPitchVisual = function(el) {
  setPitchVisual(el);
  const u = getCurrentUser();
  if (u) logAction(u.uid, u.email, 'feature_pitch_change', parsePitchLayout(S.currentPitchLayout)).catch(() => {});
  if (typeof window.gtag === 'function') window.gtag('event', 'feature_pitch_type', { pitch_type: S.currentPitchLayout, tool_name: 'tactica' });
};
window.togglePitchFlip = function() {
  togglePitchFlip();
  const u = getCurrentUser();
  if (u) logAction(u.uid, u.email, 'feature_pitch_change', { ...parsePitchLayout(S.currentPitchLayout), flipped: S.pitchFlipped }).catch(() => {});
  if (typeof window.gtag === 'function') window.gtag('event', 'feature_pitch_flip', { pitch_type: S.currentPitchLayout, flipped: S.pitchFlipped, tool_name: 'tactica' });
};
window.updatePitchFromToggles = function() {
  updatePitchFromToggles();
  const stripes = document.getElementById('pitch-toggle-stripes')?.checked ?? true;
  const u = getCurrentUser();
  if (u) logAction(u.uid, u.email, 'feature_pitch_change', { ...parsePitchLayout(S.currentPitchLayout), stripes }).catch(() => {});
  if (typeof window.gtag === 'function') window.gtag('event', 'feature_pitch_type', { pitch_type: S.currentPitchLayout, tool_name: 'tactica' });
};
window.setPitchLineColor = function(dotEl) {
  setPitchLineColor(dotEl);
  const colorName = dotEl.getAttribute('title') || 'unknown';
  const u = getCurrentUser();
  if (u) logAction(u.uid, u.email, 'feature_pitch_change', { line_color: colorName }).catch(() => {});
};
window.openPitchColorPicker = function(target) {
  openColorPicker('pitch-' + target);
};
window.toggleStripes = function() {
  toggleStripes();
  const stripes = document.getElementById('pitch-toggle-stripes')?.checked;
  const u = getCurrentUser();
  if (u) logAction(u.uid, u.email, 'feature_pitch_change', { stripes }).catch(() => {});
};
window.hideUpgradePrompt = hideUpgradePrompt;
window.setUserTier = setUserTier;
window.exportImage = exportImage;
window.selectFmt = selectFmt;
window.closeExport = closeExport;
window.doExport = function() {
  doExport();
  const u = getCurrentUser();
  if (u) logAction(u.uid, u.email, 'export', { format: document.querySelector('.fmt-btn.active')?.dataset?.fmt || 'png' }).catch(() => {});
};
window.applyNameSize = applyNameSize;
window.applyNameColor = applyNameColor;
window.applyNameBg = applyNameBg;
window.updatePlayerNameBg = updatePlayerNameBg;
window.applyPlayerFill = function(swatchEl) {
  applyPlayerFill(swatchEl);
  const u = getCurrentUser();
  if (u) logAction(u.uid, u.email, 'feature_custom_color', { color: swatchEl.dataset.color, source: 'player_fill' }).catch(() => {});
};
window.applyPlayerBorder = applyPlayerBorder;
window.togglePlayerArms = togglePlayerArms;
window.liveUpdateRefName = liveUpdateRefName;
window.confirmRefName = confirmRefName;
window.applyRefFill = applyRefFill;
window.applyRefBorder = applyRefBorder;
window.openColorPicker = openColorPicker;
window.closeColorPicker = closeColorPicker;
window.confirmColorPicker = confirmColorPicker;
window.applyArrowColor = applyArrowColor;
window.applyArrowStyle = applyArrowStyle;
window.applyArrowWidth = applyArrowWidth;
window.applyArrowCurve = applyArrowCurve;
window.applyArrowOpacity = applyArrowOpacity;
window.applyArrowHeadScale = applyArrowHeadScale;
window.applySpotlightColor = applySpotlightColor;
window.applyVisionColor = applyVisionColor;
window.applyVisionBorder = applyVisionBorder;
window.applyVisionOpacity = applyVisionOpacity;
window.liveUpdateSpotName = liveUpdateSpotName;
window.confirmSpotName = confirmSpotName;
window.applySpotNameSize = applySpotNameSize;
window.applySpotNameColor = applySpotNameColor;
window.applySpotNameBg = applySpotNameBg;
window.applyZoneFill = function(dotEl) {
  applyZoneFill(dotEl);
  // Also update label color to match border
  if (S.selectedEl) updateShadowLabel(S.selectedEl);
};
window.applyZoneBorder = function(dotEl) {
  applyZoneBorder(dotEl);
  // Update label color to match border
  if (S.selectedEl) updateShadowLabel(S.selectedEl);
};
window.applyZoneBorderStyle = applyZoneBorderStyle;
window.applyZoneOpacity = applyZoneOpacity;

// Zone label editing
window.liveUpdateZoneLabel = function(val) {
  if (!S.selectedEl || !S.selectedEl.dataset.type?.startsWith('shadow')) return;
  S.selectedEl.dataset.zoneLabel = val;
  updateShadowLabel(S.selectedEl);
};
window.confirmZoneLabel = function() {
  if (!S.selectedEl || !S.selectedEl.dataset.type?.startsWith('shadow')) return;
  S.pushUndo();
  trackElementEdited(S.selectedEl.dataset.type, 'label');
  const hasLabel = !!S.selectedEl.dataset.zoneLabel?.trim();
  const u = getCurrentUser();
  if (u) logAction(u.uid, u.email, 'zone_label', { has_text: hasLabel, shape: S.selectedEl.dataset.type }).catch(() => {});
};

// ── Unified Zone panel functions ─────────────────────────────────────────────
const _zonePurposes = {
  press:  { color: '#D8FF3C', label: 'Pressing zone', fillStyle: 'soft', border: 'dashed' },
  possession: { color: '#ffffff', label: '4v3', fillStyle: 'faded', border: 'dashed', textColor: '#ffffff', labelSize: 23, labelPos: 'bottom-left' },
  space:  { color: '#4ade80', label: 'Space',          fillStyle: 'soft', border: 'dashed' },
  danger: { color: '#f87171', label: 'Danger zone',    fillStyle: 'strong', border: 'solid', textColor: '#f87171', borderColor: '#f87171' },
};

const _fillStyles = {
  faded:   { fillAlpha: 0.08, strokeAlpha: 0.40, strokeWidth: 1.5 },
  soft:    { fillAlpha: 0.15, strokeAlpha: 0.55, strokeWidth: 2 },
  strong:  { fillAlpha: 0.30, strokeAlpha: 0.80, strokeWidth: 2.5 },
  outline: { fillAlpha: 0,    strokeAlpha: 0.65, strokeWidth: 2 },
};

function _hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1,3), 16);
  const g = parseInt(hex.slice(3,5), 16);
  const b = parseInt(hex.slice(5,7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function _applyZoneColorAndStyle(el, hex, styleName) {
  if (!el) return;
  const shape = el.querySelector('rect,ellipse,.freeform-shape,.pair-ellipse');
  if (!shape) return;
  const fs = _fillStyles[styleName] || _fillStyles.soft;
  shape.setAttribute('fill', _hexToRgba(hex, fs.fillAlpha));
  // Use independent border colour if set, otherwise derive from fill
  const borderHex = el.dataset.zoneBorderHex || hex;
  const strokeVal = _hexToRgba(borderHex, fs.strokeAlpha);
  shape.setAttribute('stroke', strokeVal);
  shape.setAttribute('stroke-width', fs.strokeWidth);
  // Keep savedStroke in sync so deselect restores the correct colour
  if (el.dataset.savedStroke) el.dataset.savedStroke = strokeVal;
  el.dataset.zoneHex = hex;
  el.dataset.zoneFillStyle = styleName;
  updateShadowLabel(el);
  _syncZonePanelState(el);
}

window.applyZonePurpose = function(purpose) {
  const el = S.selectedEl;
  if (!el || !el.dataset.type?.startsWith('shadow') && el.dataset.type !== 'freeform') return;
  S.pushUndo();
  const p = _zonePurposes[purpose];
  if (!p) return;
  el.dataset.zonePurpose = purpose;
  el.dataset.zoneLabel = p.label;
  _applyZoneColorAndStyle(el, p.color, p.fillStyle);
  applyZoneBorderStyle(p.border);
  // Apply preset text color (if specified, otherwise auto)
  if (p.textColor) {
    el.dataset.zoneTextColor = p.textColor;
  } else {
    delete el.dataset.zoneTextColor;
  }
  // Apply preset border color (if specified, otherwise reset to auto/match fill)
  if (p.borderColor) {
    _applyBorderColorToShape(el, p.borderColor);
  } else {
    delete el.dataset.zoneBorderHex;
    // Re-apply fill colour to border (since _applyZoneColorAndStyle already ran)
    const shape = el.querySelector('rect,ellipse,.freeform-shape,.pair-ellipse');
    if (shape) {
      const fs = _fillStyles[p.fillStyle] || _fillStyles.soft;
      const strokeVal = _hexToRgba(p.color, fs.strokeAlpha);
      shape.setAttribute('stroke', strokeVal);
      if (el.dataset.savedStroke) el.dataset.savedStroke = strokeVal;
    }
  }
  // Apply label size and position (if specified, otherwise reset to defaults)
  if (p.labelSize) {
    el.dataset.zoneLabelSize = p.labelSize;
  } else {
    delete el.dataset.zoneLabelSize;
  }
  if (p.labelPos) {
    el.dataset.zoneLabelPos = p.labelPos;
  } else {
    delete el.dataset.zoneLabelPos;
  }
  // Update label input
  const inp = document.getElementById('zone-label-input');
  if (inp) inp.value = p.label;
  // Ensure label is visible
  el.dataset.zoneLabelVisible = 'true';
  const lt = document.getElementById('zone-label-toggle');
  if (lt) lt.checked = true;
  const lr = document.getElementById('zone-label-row');
  if (lr) lr.style.display = '';
  updateShadowLabel(el);
  _syncZonePanelState(el);
  // Analytics
  trackElementEdited(el.dataset.type, 'zone_purpose');
  const u = getCurrentUser();
  if (u) logAction(u.uid, u.email, 'zone_purpose', { purpose, shape: el.dataset.type }).catch(() => {});
};

window.applyZoneLabelSize = function(val) {
  const el = S.selectedEl;
  if (!el) return;
  el.dataset.zoneLabelSize = val;
  document.getElementById('zone-label-size-val').textContent = val + 'px';
  updateShadowLabel(el);
};

window.applyZoneLabelPos = function(pos) {
  const el = S.selectedEl;
  if (!el) return;
  el.dataset.zoneLabelPos = pos;
  updateShadowLabel(el);
  _syncZonePanelState(el);
};

window.applyZoneColour = function(dotEl) {
  const el = S.selectedEl;
  if (!el) return;
  S.pushUndo();
  const hex = dotEl.dataset.color;
  const styleName = el.dataset.zoneFillStyle || 'soft';
  _applyZoneColorAndStyle(el, hex, styleName);
};

window.applyZoneFillStyle = function(styleName) {
  const el = S.selectedEl;
  if (!el) return;
  S.pushUndo();
  const hex = el.dataset.zoneHex || '#D8FF3C';
  _applyZoneColorAndStyle(el, hex, styleName);
};

// ── Zone text colour ──
window.applyZoneTextColour = function(dotEl) {
  const el = S.selectedEl;
  if (!el) return;
  S.pushUndo();
  const color = dotEl.dataset.color;
  if (color === 'auto') {
    delete el.dataset.zoneTextColor;
  } else {
    el.dataset.zoneTextColor = color;
  }
  updateShadowLabel(el);
  _syncZonePanelState(el);
};

// ── Zone border colour (independent of fill) ──
function _applyBorderColorToShape(el, hex) {
  const shape = el.querySelector('rect,ellipse,.freeform-shape,.pair-ellipse');
  if (!shape) return;
  const fs = _fillStyles[el.dataset.zoneFillStyle || 'soft'];
  const strokeVal = _hexToRgba(hex, fs.strokeAlpha);
  shape.setAttribute('stroke', strokeVal);
  // Keep savedStroke in sync so deselect restores the correct colour
  if (el.dataset.savedStroke) el.dataset.savedStroke = strokeVal;
  el.dataset.zoneBorderHex = hex;
  updateShadowLabel(el);
}

window.applyZoneBorderColour = function(dotEl) {
  const el = S.selectedEl;
  if (!el) return;
  S.pushUndo();
  const color = dotEl.dataset.color;
  if (color === 'auto') {
    // Reset to match fill colour
    delete el.dataset.zoneBorderHex;
    const hex = el.dataset.zoneHex || '#D8FF3C';
    const styleName = el.dataset.zoneFillStyle || 'soft';
    _applyZoneColorAndStyle(el, hex, styleName);
  } else {
    _applyBorderColorToShape(el, color);
  }
  _syncZonePanelState(el);
};

window.applyVisionType = function(style) {
  S.setVisionType(style);
  const el = S.selectedEl;
  if (el && el.dataset.type === 'vision') {
    S.pushUndo();
    el.dataset.visionStyle = style;
    updateVisionPolygon(el);
    trackElementEdited('vision', 'type');
  }
  document.querySelectorAll('#vision-edit-section .shape-card[data-vstyle]').forEach(c =>
    c.classList.toggle('active', c.dataset.vstyle === style));
};

window.applyArrowType = function(type) {
  S.setArrowType(type);
  const el = S.selectedEl;
  if (el && el.dataset.type === 'arrow') {
    S.pushUndo();
    el.dataset.arrowType = type;
    const line = el.querySelector('.arrow-line');
    const st = S.ARROW_STYLES[type];
    if (line && st) {
      // Apply new color (unless user had a custom one — arrow color is part of type)
      line.setAttribute('stroke', st.color);
      el.dataset.arrowColor = st.color;
      // Apply dash pattern
      if (st.dash) line.setAttribute('stroke-dasharray', st.dash);
      else line.removeAttribute('stroke-dasharray');
      el.dataset.arrowDash = st.dash || '';
      // Apply marker (arrowhead)
      if (type === 'line') {
        line.removeAttribute('marker-end');
      } else {
        line.setAttribute('marker-end', st.marker);
      }
    }
    trackElementEdited('arrow', 'type');
    // Sync the Style buttons + Color swatches active state based on new values
    const style = type === 'run' ? 'dashed' : 'solid';
    document.querySelectorAll('#arrow-edit-section .style-btn[data-style]').forEach(b =>
      b.classList.toggle('active', b.dataset.style === style));
    document.querySelectorAll('#arrow-edit-section .color-swatch.mini').forEach(s =>
      s.classList.toggle('active', (s.dataset.color || '').toLowerCase() === (st?.color || '').toLowerCase()));
  }
  document.querySelectorAll('#arrow-edit-section .shape-card[data-atype]').forEach(c =>
    c.classList.toggle('active', c.dataset.atype === type));
};

window.applyZoneShape = function(shapeType) {
  const el = S.selectedEl;
  if (!el) return;
  const currentType = el.dataset.type;
  if (currentType === shapeType) return;

  // Convert to freeform (custom corners)
  if (shapeType === 'freeform') {
    _convertZoneToFreeform(el);
    return;
  }
  // Convert FROM freeform to rect/oval
  if (currentType === 'freeform') {
    _convertFreeformToShape(el, shapeType);
    return;
  }

  S.pushUndo();
  const ns = 'http://www.w3.org/2000/svg';
  const oldShape = el.querySelector('rect,ellipse');
  if (!oldShape) return;

  // Read current visual properties
  const fill = oldShape.getAttribute('fill');
  const stroke = oldShape.getAttribute('stroke');
  const strokeWidth = oldShape.getAttribute('stroke-width');
  const dashArray = oldShape.getAttribute('stroke-dasharray');
  const cx = parseFloat(el.dataset.cx);
  const cy = parseFloat(el.dataset.cy);
  const hw = parseFloat(el.dataset.hw || '30');
  const hh = parseFloat(el.dataset.hh || '20');
  const scale = parseFloat(el.dataset.scale || '1');

  let newShape;
  if (shapeType === 'shadow-circle') {
    // Create ellipse
    newShape = document.createElementNS(ns, 'ellipse');
    newShape.setAttribute('cx', cx);
    newShape.setAttribute('cy', cy);
    newShape.setAttribute('rx', hw * scale);
    newShape.setAttribute('ry', hh * scale);
  } else {
    // Create rect
    newShape = document.createElementNS(ns, 'rect');
    newShape.setAttribute('x', cx - hw * scale);
    newShape.setAttribute('y', cy - hh * scale);
    newShape.setAttribute('width', hw * 2 * scale);
    newShape.setAttribute('height', hh * 2 * scale);
    newShape.setAttribute('rx', el.dataset.zoneCorners === 'sharp' ? 0 : el.dataset.zoneCorners === 'very-round' ? 20 : 4);
  }

  // Copy visual properties
  newShape.setAttribute('fill', fill);
  newShape.setAttribute('stroke', stroke);
  newShape.setAttribute('stroke-width', strokeWidth);
  if (dashArray) newShape.setAttribute('stroke-dasharray', dashArray);

  // Swap elements
  oldShape.replaceWith(newShape);
  el.dataset.type = shapeType;

  // Refresh label position
  updateShadowLabel(el);

  // Update panel state
  _syncZonePanelState(el);
  // Analytics
  trackElementEdited(shapeType, 'zone_shape');
  const u = getCurrentUser();
  if (u) logAction(u.uid, u.email, 'zone_shape', { shape: shapeType, from: currentType }).catch(() => {});
};

// Convert rect/oval zone to freeform (draggable corners)
function _convertZoneToFreeform(el) {
  const cx = parseFloat(el.dataset.cx);
  const cy = parseFloat(el.dataset.cy);
  const hw = parseFloat(el.dataset.hw || '30');
  const hh = parseFloat(el.dataset.hh || '20');
  const scale = parseFloat(el.dataset.scale || '1');
  const rot = parseFloat(el.dataset.rotation || '0') * Math.PI / 180;
  const cosR = Math.cos(rot), sinR = Math.sin(rot);

  // Get visual properties from old shape.
  // Note: when an element is selected, its stroke is temporarily overridden with
  // a blue selection highlight — the real stroke is preserved in dataset.savedStroke.
  // Read that instead so the converted shape keeps its actual colour.
  const oldShape = el.querySelector('rect,ellipse');
  const fill = oldShape?.getAttribute('fill') || 'rgba(79,156,249,0.18)';
  const stroke = el.dataset.savedStroke || oldShape?.getAttribute('stroke') || 'rgba(255,255,255,0.5)';
  const strokeWidth = oldShape?.getAttribute('stroke-width') || '1.5';
  const dashArray = oldShape?.getAttribute('stroke-dasharray') || '';
  const label = el.dataset.zoneLabel || '';
  const zoneHex = el.dataset.zoneHex || '';
  const zoneFillStyle = el.dataset.zoneFillStyle || '';
  const zonePurpose = el.dataset.zonePurpose || '';

  // Compute corner points (apply rotation)
  const corners = [
    { dx: -hw * scale, dy: -hh * scale },
    { dx:  hw * scale, dy: -hh * scale },
    { dx:  hw * scale, dy:  hh * scale },
    { dx: -hw * scale, dy:  hh * scale },
  ];
  const worldPts = corners.map(c => ({
    x: cx + c.dx * cosR - c.dy * sinR,
    y: cy + c.dx * sinR + c.dy * cosR,
  }));

  S.pushUndo();
  el.remove();

  const fz = addFreeformZone(worldPts);
  if (!fz) return;

  // Copy visual properties
  const shape = fz.querySelector('.freeform-shape');
  if (shape) {
    shape.setAttribute('fill', fill);
    shape.setAttribute('stroke', stroke);
    shape.setAttribute('stroke-width', strokeWidth);
    if (dashArray) shape.setAttribute('stroke-dasharray', dashArray);
  }
  fz.dataset.zoneLabel = label;
  fz.dataset.zoneHex = zoneHex;
  fz.dataset.zoneFillStyle = zoneFillStyle;
  fz.dataset.zonePurpose = zonePurpose;

  // Add label element
  if (label) {
    const ns = 'http://www.w3.org/2000/svg';
    const lbl = document.createElementNS(ns, 'text');
    lbl.classList.add('zone-label');
    lbl.setAttribute('font-size', '14');
    lbl.setAttribute('font-family', 'Inter, system-ui, sans-serif');
    lbl.setAttribute('font-weight', '600');
    lbl.setAttribute('pointer-events', 'none');
    lbl.setAttribute('dominant-baseline', 'central');
    lbl.setAttribute('text-anchor', 'middle');
    lbl.setAttribute('x', fz.dataset.cx);
    lbl.setAttribute('y', fz.dataset.cy);
    lbl.textContent = label;
    if (stroke) lbl.setAttribute('fill', stroke);
    fz.appendChild(lbl);
  }

  select(fz);
}

// Convert freeform back to rect/oval
function _convertFreeformToShape(el, shapeType) {
  const cx = parseFloat(el.dataset.cx);
  const cy = parseFloat(el.dataset.cy);
  const deltas = JSON.parse(el.dataset.freeformPts || '[]');
  if (deltas.length < 3) return;

  // Compute bounding box of points to get hw/hh
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  deltas.forEach(d => {
    if (d.dx < minX) minX = d.dx;
    if (d.dx > maxX) maxX = d.dx;
    if (d.dy < minY) minY = d.dy;
    if (d.dy > maxY) maxY = d.dy;
  });
  const hw = Math.max(20, (maxX - minX) / 2);
  const hh = Math.max(15, (maxY - minY) / 2);

  // Get visual properties — see note in _convertZoneToFreeform: a selected
  // element's stroke is overridden with the blue selection highlight, so we
  // read from savedStroke first.
  const oldShape = el.querySelector('.freeform-shape');
  const fill = oldShape?.getAttribute('fill') || 'rgba(79,156,249,0.18)';
  const stroke = el.dataset.savedStroke || oldShape?.getAttribute('stroke') || 'rgba(255,255,255,0.5)';
  const strokeWidth = oldShape?.getAttribute('stroke-width') || '1.5';
  const dashArray = oldShape?.getAttribute('stroke-dasharray') || '';
  const label = el.dataset.zoneLabel || '';
  const zoneHex = el.dataset.zoneHex || '';
  const zoneFillStyle = el.dataset.zoneFillStyle || '';
  const zonePurpose = el.dataset.zonePurpose || '';

  S.pushUndo();
  el.remove();

  const newZone = addShadow(cx, cy, shapeType);
  if (!newZone) return;

  // Apply stored size
  newZone.dataset.hw = String(hw);
  newZone.dataset.hh = String(hh);

  // Update shape geometry
  const shape = newZone.querySelector('rect,ellipse');
  if (shape) {
    if (shapeType === 'shadow-rect') {
      shape.setAttribute('x', cx - hw); shape.setAttribute('y', cy - hh);
      shape.setAttribute('width', hw * 2); shape.setAttribute('height', hh * 2);
    } else {
      shape.setAttribute('cx', cx); shape.setAttribute('cy', cy);
      shape.setAttribute('rx', hw); shape.setAttribute('ry', hh);
    }
    shape.setAttribute('fill', fill);
    shape.setAttribute('stroke', stroke);
    shape.setAttribute('stroke-width', strokeWidth);
    if (dashArray) shape.setAttribute('stroke-dasharray', dashArray);
  }

  newZone.dataset.zoneLabel = label;
  newZone.dataset.zoneHex = zoneHex;
  newZone.dataset.zoneFillStyle = zoneFillStyle;
  newZone.dataset.zonePurpose = zonePurpose;
  updateShadowLabel(newZone);

  select(newZone);
}

window.toggleZoneAdvanced = function() {
  const body = document.getElementById('zone-advanced-body');
  const toggle = document.querySelector('.zone-advanced-toggle');
  if (!body) return;
  const open = body.style.display === 'none';
  body.style.display = open ? 'block' : 'none';
  toggle?.classList.toggle('zone-advanced-open', open);
};

window.applyZoneCorners = function(style) {
  const el = S.selectedEl;
  if (!el || el.dataset.type !== 'shadow-rect') return;
  S.pushUndo();
  const rect = el.querySelector('rect');
  if (!rect) return;
  const rx = style === 'sharp' ? 0 : style === 'rounded' ? 8 : 20;
  rect.setAttribute('rx', rx);
  rect.setAttribute('ry', rx);
  el.dataset.zoneCorners = style;
  // Update active button
  document.querySelectorAll('#zone-edit-section [data-corners]').forEach(b =>
    b.classList.toggle('active', b.dataset.corners === style));
};

window.toggleZoneLabelVisibility = function(show) {
  const el = S.selectedEl;
  if (!el) return;
  const label = el.querySelector('.zone-label');
  if (label) label.setAttribute('display', show ? '' : 'none');
  el.dataset.zoneLabelVisible = show ? 'true' : 'false';
  // Show/hide the text input row and label options
  const row = document.getElementById('zone-label-row');
  if (row) row.style.display = show ? '' : 'none';
  const opts = document.getElementById('zone-label-opts');
  if (opts) opts.style.display = show ? '' : 'none';
};

function _syncZonePanelState(el) {
  if (!el) return;
  // Purpose buttons
  const purpose = el.dataset.zonePurpose || '';
  document.querySelectorAll('#zone-edit-section .purpose-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.purpose === purpose));
  // Fill style buttons
  const fs = el.dataset.zoneFillStyle || 'soft';
  document.querySelectorAll('#zone-edit-section [data-fillstyle]').forEach(b =>
    b.classList.toggle('active', b.dataset.fillstyle === fs));
  // Colour swatches (fill)
  const hex = (el.dataset.zoneHex || '').toLowerCase();
  document.querySelectorAll('#zone-edit-section .picker-row:not(#zone-text-color-row):not(#zone-border-color-row) .color-swatch.round').forEach(s => {
    s.classList.toggle('active', s.dataset.color?.toLowerCase() === hex);
    if (s.classList.contains('active')) s.style.color = hex;
  });
  // Text colour swatches
  const textColor = (el.dataset.zoneTextColor || '').toLowerCase();
  const isAutoText = !el.dataset.zoneTextColor;
  document.querySelectorAll('#zone-text-color-row .color-swatch.round').forEach(s => {
    if (s.dataset.color === 'auto') {
      s.classList.toggle('active', isAutoText);
    } else {
      s.classList.toggle('active', s.dataset.color?.toLowerCase() === textColor);
    }
  });
  // Border colour swatches
  const borderHex = (el.dataset.zoneBorderHex || '').toLowerCase();
  const isAutoBorder = !el.dataset.zoneBorderHex;
  document.querySelectorAll('#zone-border-color-row .color-swatch.round').forEach(s => {
    if (s.dataset.color === 'auto') {
      s.classList.toggle('active', isAutoBorder);
    } else {
      s.classList.toggle('active', s.dataset.color?.toLowerCase() === borderHex);
    }
  });
  // Shape cards
  const type = el.dataset.type || '';
  document.querySelectorAll('#zone-edit-section .shape-card[data-shape]').forEach(c =>
    c.classList.toggle('active', c.dataset.shape === type));
  // Border style cards
  const bstyle = el.querySelector('rect,ellipse,.freeform-shape')?.getAttribute('stroke-dasharray');
  const bs = !bstyle ? 'solid' : bstyle.startsWith('2') ? 'dotted' : 'dashed';
  document.querySelectorAll('#zone-edit-section .shape-card[data-zstyle]').forEach(c =>
    c.classList.toggle('active', c.dataset.zstyle === bs));
  // Corners
  const corners = el.dataset.zoneCorners || 'rounded';
  document.querySelectorAll('#zone-edit-section [data-corners]').forEach(b =>
    b.classList.toggle('active', b.dataset.corners === corners));
  // Corners group visibility (only for rects)
  const cornersGroup = document.getElementById('zone-corners-group');
  if (cornersGroup) cornersGroup.style.display = type === 'shadow-rect' ? '' : 'none';
  // Label toggle + input visibility + label opts
  const labelVisible = el.dataset.zoneLabelVisible !== 'false';
  const lt = document.getElementById('zone-label-toggle');
  if (lt) lt.checked = labelVisible;
  const lr = document.getElementById('zone-label-row');
  if (lr) lr.style.display = labelVisible ? '' : 'none';
  const opts = document.getElementById('zone-label-opts');
  if (opts) opts.style.display = labelVisible ? '' : 'none';
  // Label size slider
  const labelSize = el.dataset.zoneLabelSize || '14';
  const lsSlider = document.getElementById('zone-label-size');
  const lsVal = document.getElementById('zone-label-size-val');
  if (lsSlider) lsSlider.value = labelSize;
  if (lsVal) lsVal.textContent = labelSize + 'px';
  // Label position buttons
  const labelPos = el.dataset.zoneLabelPos || 'top-left';
  document.querySelectorAll('#zone-edit-section [data-labelpos]').forEach(b =>
    b.classList.toggle('active', b.dataset.labelpos === labelPos));
}

window.liveUpdateTextBox = liveUpdateTextBox;
window.confirmTextBox = confirmTextBox;
window.applyTextBoxSize = applyTextBoxSize;
window.applyTextBoxColor = applyTextBoxColor;
window.applyTextBoxBg = applyTextBoxBg;
window.applyTextBoxAlign = applyTextBoxAlign;
window.liveUpdateHeadline = liveUpdateHeadline;
window.applyHeadlineBarColor = applyHeadlineBarColor;
window.applyHeadlineTitleSize = applyHeadlineTitleSize;
window.applyHeadlineBodySize = applyHeadlineBodySize;
window.applyHeadlineTextColor = applyHeadlineTextColor;
window.applyHeadlineBg = applyHeadlineBg;
window.liveUpdateTagLabel = liveUpdateTagLabel;
window.liveUpdateTagValue = liveUpdateTagValue;
window.applyTagLabelColor = applyTagLabelColor;
window.applyTagValueColor = applyTagValueColor;
window.applyTagLineColor = applyTagLineColor;
window.applyTagLineDash = applyTagLineDash;
window.applyTagLineLen = applyTagLineLen;
window.applyTagLineAngle = applyTagLineAngle;
window.applyTagTextAnchor = applyTagTextAnchor;
window.addMarker = addMarker;
window.applyMarkerBorderColor = applyMarkerBorderColor;
window.applyMarkerBgColor = applyMarkerBgColor;
window.applyMarkerLineColor = applyMarkerLineColor;
window.applyMarkerOpacity = applyMarkerOpacity;
window.liveUpdateMarkerName = liveUpdateMarkerName;
window.confirmMarkerName = confirmMarkerName;
window.setLinkStyle = function(style) {
  if (!S.selectedEl || S.selectedEl.dataset.type !== 'link') return;
  S.pushUndo();
  S.selectedEl.dataset.linkStyle = style;
  updateLink(S.selectedEl);
  trackElementEdited('connect', 'style');
  const u = getCurrentUser();
  if (u) logAction(u.uid, u.email, 'element_edited', { element: 'connect', property: 'style', value: style }).catch(() => {});
  // Update active button state
  const sec = document.getElementById('link-edit-section');
  if (sec) sec.querySelectorAll('.formation-btn').forEach(b => b.classList.toggle('active', b.dataset.linkstyle === style));
};
window.applyLinkColor = function(dotEl) {
  if (!S.selectedEl || S.selectedEl.dataset.type !== 'link') return;
  S.pushUndo();
  const color = dotEl.dataset.linkColor;
  S.selectedEl.dataset.linkColor = color;
  updateLink(S.selectedEl);
  trackElementEdited('connect', 'color');
  const u = getCurrentUser();
  if (u) logAction(u.uid, u.email, 'element_edited', { element: 'connect', property: 'color' }).catch(() => {});
  // Also update the visible selection stroke
  const linkLine = S.selectedEl.querySelector('.link-line');
  if (linkLine) linkLine.setAttribute('stroke', 'rgba(79,156,249,0.9)');
};
// ─── Net-Zone edit panel functions ──────────────────────────────────────────
window.applyNzColor = function(dotEl) {
  if (!S.selectedEl || S.selectedEl.dataset.type !== 'net-zone') return;
  S.pushUndo();
  S.selectedEl.dataset.zoneColor = dotEl.dataset.nzColor;
  updateNetZone(S.selectedEl);
  trackElementEdited('net-zone', 'color');
  const u = getCurrentUser();
  if (u) logAction(u.uid, u.email, 'element_edited', { element: 'net-zone', property: 'color' }).catch(() => {});
};
window.applyNzBorder = function(dotEl) {
  if (!S.selectedEl || S.selectedEl.dataset.type !== 'net-zone') return;
  S.pushUndo();
  S.selectedEl.dataset.zoneBorder = dotEl.dataset.nzBorder;
  updateNetZone(S.selectedEl);
  trackElementEdited('net-zone', 'border');
};
window.applyNzBorderStyle = function(style) {
  if (!S.selectedEl || S.selectedEl.dataset.type !== 'net-zone') return;
  S.pushUndo();
  S.selectedEl.dataset.zoneBorderStyle = style;
  updateNetZone(S.selectedEl);
  trackElementEdited('net-zone', 'border-style');
};
window.applyNzOpacity = function(val) {
  if (!S.selectedEl || S.selectedEl.dataset.type !== 'net-zone') return;
  const color = S.selectedEl.dataset.zoneColor || 'rgba(79,156,249,0.15)';
  const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (match) {
    S.selectedEl.dataset.zoneColor = `rgba(${match[1]},${match[2]},${match[3]},${val})`;
    updateNetZone(S.selectedEl);
  }
  const lbl = document.getElementById('nz-opacity-value');
  if (lbl) lbl.textContent = Math.round(val * 100) + '%';
};

window.triggerImageUpload = triggerImageUpload;
window.handleImageUpload = function(input) {
  handleImageUpload(input);
  const u = getCurrentUser();
  if (u) logAction(u.uid, u.email, 'feature_image_upload').catch(() => {});
};
window.enterImageMode = enterImageMode;
window.exitImageMode = exitImageMode;
window.toggleMiniPitch = toggleMiniPitch;
window.setMiniPitchType = setMiniPitchType;
window.setMiniPitchColor = setMiniPitchColor;
window.setMiniPitchLine = setMiniPitchLine;
window.updateMiniPitch = updateMiniPitch;

// ─── Mode Switching (Tactical Board vs Image Upload) ────────────────────────
function hasCanvasWork() {
  return S.objectsLayer.children.length > 0 || S.playersLayer.children.length > 0;
}

function showImageUploadPane() {
  // Show the upload overlay on the canvas area, hide the pitch
  const overlay = document.getElementById('image-upload-overlay');
  const pitchContainer = document.getElementById('pitch-container');
  if (overlay) overlay.classList.add('visible');
  if (pitchContainer) pitchContainer.style.display = 'none';
  // Also hide sidebar pitch pane and show nothing (upload is on canvas)
  switchTab('pitch');
  const pitchPane = document.getElementById('pane-pitch');
  const uploadPane = document.getElementById('image-upload-pane');
  if (pitchPane) pitchPane.style.display = 'none';
  if (uploadPane) uploadPane.style.display = 'none';
}
window.showImageUploadPane = showImageUploadPane;

function hideImageUploadPane() {
  const overlay = document.getElementById('image-upload-overlay');
  const pitchContainer = document.getElementById('pitch-container');
  if (overlay) overlay.classList.remove('visible');
  if (pitchContainer) pitchContainer.style.display = '';
  const uploadPane = document.getElementById('image-upload-pane');
  if (uploadPane) uploadPane.style.display = 'none';
}

// ─── Drag-and-drop on canvas upload overlay ─────────────────────────────────
{
  const dz = document.getElementById('upload-dropzone');
  if (dz) {
    dz.addEventListener('click', (e) => {
      if (e.target.closest('.upload-dropzone-btn')) return; // btn already has onclick
      triggerImageUpload();
    });
    dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('dragover'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('dragover'));
    dz.addEventListener('drop', (e) => {
      e.preventDefault();
      dz.classList.remove('dragover');
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result;
          const img = new Image();
          img.onload = () => enterImageMode(dataUrl, img.naturalWidth, img.naturalHeight);
          img.src = dataUrl;
        };
        reader.readAsDataURL(file);
      }
    });
  }
}

function switchMode(mode) {
  if (mode === 'image') {
    if (S.appMode === 'image') return;
    // If there's work on the tactical board, confirm before switching
    if (hasCanvasWork()) {
      showModeSwitchModal('Switching to Image Analysis will erase all elements on your tactical board. Are you sure?', () => {
        _doSwitchToImage();
      });
      return;
    }
    _doSwitchToImage();
  } else {
    // Hide upload pane if it's showing (user clicked back to pitch before uploading)
    hideImageUploadPane();
    if (S.appMode !== 'image') {
      // Already in pitch mode — restore toolbar + side panel via mode registry
      activateMode('pitch');
      return;
    }
    // If there's work on the image, confirm before switching
    if (hasCanvasWork()) {
      showModeSwitchModal('Switching to Tactical Board will erase all elements on your image. Are you sure?', () => {
        exitImageMode(); // exitImageMode calls activateMode('pitch')
      });
      return;
    }
    exitImageMode(); // exitImageMode calls activateMode('pitch')
  }
}
window.switchMode = switchMode;

function _doSwitchToImage() {
  // Apply image mode toolbar + side panel + mode buttons immediately
  activateMode('image');
  showImageUploadPane();
}

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
  // switchMode handles button/label sync via the mode registry
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

// ─── Link Tool State ────────────────────────────────────────────────────────
let _linkStartPlayer = null;
let _linkHighlight = null;

// ─── Marker Chain State ────────────────────────────────────────────────────
// Each click with the marker tool places a circle and auto-connects it to
// the previously placed marker, forming a chain.
let _lastChainMarker = null;

// ─── Pair Tool State ────────────────────────────────────────────────────────
let _pairStartPlayer = null;

// ─── Net-Zone Tool State ──────────────────────────────────────────────────
let _netZonePlayers = [];       // accumulated player IDs (Tactical Board mode)
let _netZoneHighlights = [];    // highlight ring SVG elements
let _netZonePreview = null;     // live preview polygon
let _netZoneCoords = [];        // accumulated {x,y} points (Image Analysis mode)
let _netZoneVertexDots = [];    // small vertex marker SVGs for image mode

function clearLinkHighlight() {
  if (_linkHighlight) {
    _linkHighlight.remove();
    _linkHighlight = null;
  }
}

function highlightLinkStart(playerEl) {
  clearLinkHighlight();
  const cx = parseFloat(playerEl.dataset.cx);
  const cy = parseFloat(playerEl.dataset.cy);
  const ns = 'http://www.w3.org/2000/svg';
  const g = document.createElementNS(ns, 'g');
  g.setAttribute('id', 'link-start-ring');
  g.setAttribute('pointer-events', 'none');
  // White glow background
  const bg = document.createElementNS(ns, 'circle');
  bg.setAttribute('cx', cx); bg.setAttribute('cy', cy);
  bg.setAttribute('r', '24');
  bg.setAttribute('fill', 'rgba(255,255,255,0.25)');
  bg.setAttribute('stroke', 'none');
  // Thick animated border ring
  const ring = document.createElementNS(ns, 'circle');
  ring.setAttribute('cx', cx); ring.setAttribute('cy', cy);
  ring.setAttribute('r', '24');
  ring.setAttribute('fill', 'none');
  ring.setAttribute('stroke', 'rgba(255,255,255,0.85)');
  ring.setAttribute('stroke-width', '3.5');
  ring.setAttribute('stroke-dasharray', '6,4');
  g.appendChild(bg);
  g.appendChild(ring);
  S.playersLayer.appendChild(g);
  _linkHighlight = g;
}

// ─── SVG Click ────────────────────────────────────────────────────────────────
S.svg.addEventListener('click', e => {
  if (S.dragMoved) return;
  if (S.tool === 'freeform') return; // handled by freeform click handler

  // ── Link tool handling ────────────────────────────────────────────────────
  if (S.tool === 'link') {
    const clickedEl = e.target.closest('[data-type="player"]') || e.target.closest('[data-type="referee"]') || e.target.closest('[data-type="marker"]');
    if (!clickedEl) {
      // Clicked on empty area — cancel link
      _linkStartPlayer = null;
      clearLinkHighlight();
      return;
    }
    if (!_linkStartPlayer) {
      // First click — store the start player
      _linkStartPlayer = clickedEl;
      highlightLinkStart(clickedEl);
      return;
    }
    // Second click
    if (clickedEl === _linkStartPlayer || clickedEl.id === _linkStartPlayer.id) {
      // Same player — cancel
      _linkStartPlayer = null;
      clearLinkHighlight();
      return;
    }
    // Create the connection and continue chain — second player becomes new start
    S.pushUndo();
    const link = addLink(_linkStartPlayer.id, clickedEl.id);
    if (link) {
      trackElementInserted('connect');
      maybeSendPitchSnapshot();
      const u = getCurrentUser();
      if (u) logAction(u.uid, u.email, 'element_inserted', { element: 'connect' }).catch(() => {});
    }
    // Chain: make the second player the new start for the next connection
    _linkStartPlayer = clickedEl;
    clearLinkHighlight();
    highlightLinkStart(clickedEl);
    return;
  }

  // ── Pair tool handling ───────────────────────────────────────────────────
  if (S.tool === 'pair') {
    const clickedEl = e.target.closest('[data-type="player"]') || e.target.closest('[data-type="referee"]');
    if (!clickedEl) {
      _pairStartPlayer = null;
      clearLinkHighlight();
      return;
    }
    if (!_pairStartPlayer) {
      _pairStartPlayer = clickedEl;
      highlightLinkStart(clickedEl);
      return;
    }
    if (clickedEl === _pairStartPlayer || clickedEl.id === _pairStartPlayer.id) {
      _pairStartPlayer = null;
      clearLinkHighlight();
      return;
    }
    S.pushUndo();
    const pair = addPair(_pairStartPlayer.id, clickedEl.id);
    if (pair) {
      trackElementInserted('pair');
      maybeSendPitchSnapshot();
      const u = getCurrentUser();
      if (u) logAction(u.uid, u.email, 'element_inserted', { element: 'pair' }).catch(() => {});
    }
    _pairStartPlayer = null;
    clearLinkHighlight();
    setTool('select');
    if (pair) select(pair);
    return;
  }

  // ── Net-Zone tool handling ─────────────────────────────────────────────
  if (S.tool === 'net-zone') {
    // ── Image Analysis mode: click anywhere to place polygon vertices ────
    if (S.appMode === 'image') {
      const pt = S.getSVGPoint(e);
      // Add vertex
      _netZoneCoords.push({ x: pt.x, y: pt.y });
      _addVertexDot(pt.x, pt.y);
      updateNetZonePreview();
      // Update hint
      const n = _netZoneCoords.length;
      if (n < 3) {
        S.selInfo.innerHTML = `<strong>Player Zone</strong><br><span style="font-size:10px;color:var(--text-muted)">${n}/3 points placed · click ${3 - n} more on the image</span>`;
      } else {
        S.selInfo.innerHTML = `<strong>Player Zone</strong><br><span style="font-size:10px;color:var(--text-muted)">${n} points · click more or double-click to close</span>`;
      }
      return;
    }

    // ── Tactical Board mode: click on players to anchor zone ─────────────
    const clickedEl = e.target.closest('[data-type="player"]') || e.target.closest('[data-type="referee"]');
    if (!clickedEl) {
      // Click on empty area: close zone if 3+ players, else cancel
      if (_netZonePlayers.length >= 3) {
        closeNetZone();
      } else {
        cancelNetZone();
        _showNetZoneHint();
      }
      return;
    }
    const pid = clickedEl.id;
    // Click first player again to close (if 3+)
    if (_netZonePlayers.length >= 3 && pid === _netZonePlayers[0]) {
      closeNetZone();
      return;
    }
    // Skip if already in the list
    if (_netZonePlayers.includes(pid)) return;
    // Add player to zone
    _netZonePlayers.push(pid);
    highlightLinkStart(clickedEl);
    _netZoneHighlights.push(_linkHighlight);
    _linkHighlight = null;
    updateNetZonePreview();
    // Update hint
    const n = _netZonePlayers.length;
    if (n < 3) {
      S.selInfo.innerHTML = `<strong>Player Zone</strong><br><span style="font-size:10px;color:var(--text-muted)">${n}/3 players selected · click ${3 - n} more</span>`;
    } else {
      S.selInfo.innerHTML = `<strong>Player Zone</strong><br><span style="font-size:10px;color:var(--text-muted)">${n} players · click more or click pitch to close</span>`;
    }
    return;
  }

  const pt = S.getSVGPoint(e);
  let placed = null;
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
  else if (S.tool === 'vision') placed = addVision(pt.x, pt.y);
  else if (S.tool === 'textbox') placed = addTextBox(pt.x, pt.y);
  else if (S.tool === 'headline') placed = addHeadline(pt.x, pt.y);
  else if (S.tool === 'tag') placed = addTag(pt.x, pt.y);
  else if (S.tool === 'marker') {
    // ── Chain-connect: place marker + auto-link to previous ─────────────
    placed = addMarker(pt.x, pt.y);
    if (placed && _lastChainMarker) {
      const link = addLink(_lastChainMarker.id, placed.id);
      if (link) {
        trackElementInserted('connect');
        const u2 = getCurrentUser();
        if (u2) logAction(u2.uid, u2.email, 'element_inserted', { element: 'connect' }).catch(() => {});
      }
    }
    _lastChainMarker = placed;
    // Stay in marker tool (don't switch to select) — handled below
  }
  if (placed) {
    const elType = placed.dataset.type;
    trackElementInserted(elType);
    maybeSendPitchSnapshot();
    // Log element insertion to Firestore
    const u = getCurrentUser();
    if (u) logAction(u.uid, u.email, 'element_inserted', { element: elType }).catch(() => {});
    // Players and markers stay in placement mode so you can keep adding
    if (S.tool === 'player-a' || S.tool === 'player-b' || S.tool === 'player-joker' || S.tool === 'marker') {
      // Don't switch tool — stay in placement/chain mode
    } else {
      finishInsert(placed);
    }
  }
  else if (S.tool === 'select') {
    // Only deselect if click was on empty pitch, not on an element, and no marquee just ended
    if (!e.target.closest('[data-type]') && !_marqueeJustEnded) deselect();
  }
  _marqueeJustEnded = false;
});

// ─── Marquee Selection ──────────────────────────────────────────────────────
let _isMarqueeing = false;
let _marqueeJustEnded = false;
let _marqueeDidDrag = false;

S.svg.addEventListener('mousedown', e => {
  if (S.tool !== 'select') return;
  // Don't start marquee if clicking on an element or handle
  if (e.target.closest('[data-type]') || e.target.closest('[data-handle]')) return;
  // Don't start if dragging
  if (S.isDragging) return;
  _isMarqueeing = true;
  _marqueeDidDrag = false;
  startMarquee(e);
});

S.svg.addEventListener('mousemove', e => {
  if (!_isMarqueeing) return;
  _marqueeDidDrag = true;
  updateMarquee(e);
});

S.svg.addEventListener('mouseup', e => {
  if (!_isMarqueeing) return;
  _isMarqueeing = false;
  if (_marqueeDidDrag) {
    endMarquee(e);
    // Only block click-to-deselect if a real marquee drag happened
    _marqueeJustEnded = true;
    setTimeout(() => { _marqueeJustEnded = false; }, 50);
  } else {
    // Was just a click (no drag) — clean up marquee rect and let click handler deselect
    endMarquee(e); // this removes the rect; returns early if too small
  }
});

// Also clean up if mouseup happens outside SVG
document.addEventListener('mouseup', () => {
  if (_isMarqueeing) {
    _isMarqueeing = false;
    _marqueeDidDrag = false;
    cleanupMarquee();
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
    if (arrow) finishInsert(arrow, { dragBased: true });
  }
}
S.svg.addEventListener('mouseup', arrowEnd);
S.svg.addEventListener('touchend', arrowEnd);

// ─── Freeform Zone Drawing ───────────────────────────────────────────────────
let freeformPts = [];          // accumulating click points
let freeformPreview = null;    // SVG preview path element

function closeFreeform() {
  if (freeformPts.length >= 3) {
    S.pushUndo();
    const zone = addFreeformZone([...freeformPts]);
    if (zone) finishInsert(zone);
  }
  // Clean up
  freeformPts = [];
  if (freeformPreview) { freeformPreview.remove(); freeformPreview = null; }
  const dotsG = document.getElementById('freeform-dots');
  if (dotsG) dotsG.remove();
}

S.svg.addEventListener('click', e => {
  if (S.tool !== 'freeform' || S.dragMoved) return;
  const pt = S.getSVGPoint(e);
  // Close if clicking near the first point
  if (freeformPts.length >= 3) {
    const d = Math.hypot(pt.x - freeformPts[0].x, pt.y - freeformPts[0].y);
    if (d < 15) { closeFreeform(); return; }
  }
  freeformPts.push({ x: pt.x, y: pt.y });
  updateFreeformPreview();
});

S.svg.addEventListener('dblclick', e => {
  if (S.tool === 'freeform') { e.preventDefault(); closeFreeform(); return; }
  if (S.tool === 'net-zone') {
    // Image mode: close if 3+ coords
    if (S.appMode === 'image' && _netZoneCoords.length >= 3) { e.preventDefault(); closeNetZone(); return; }
    // Tactical Board: close if 3+ players
    if (_netZonePlayers.length >= 3) { e.preventDefault(); closeNetZone(); return; }
  }
});

S.svg.addEventListener('mousemove', e => {
  if (S.tool !== 'freeform' || freeformPts.length === 0) return;
  const pt = S.getSVGPoint(e);
  updateFreeformPreview(pt);
});

// ─── Net-Zone helpers ──────────────────────────────────────────────────────
function closeNetZone() {
  // Image mode: create free (non-anchored) polygon from raw coords
  if (S.appMode === 'image') {
    if (_netZoneCoords.length < 3) { cancelNetZone(); return; }
    S.pushUndo();
    const zone = addFreeNetZone([..._netZoneCoords]);
    cancelNetZone();
    if (zone) {
      trackElementInserted('net-zone');
      maybeSendPitchSnapshot();
      const u = getCurrentUser();
      if (u) logAction(u.uid, u.email, 'element_inserted', { element: 'net-zone' }).catch(() => {});
      setTool('select');
      select(zone);
    }
    return;
  }
  // Tactical Board mode: create player-anchored polygon
  if (_netZonePlayers.length < 3) { cancelNetZone(); return; }
  S.pushUndo();
  const zone = addNetZone([..._netZonePlayers]);
  cancelNetZone();
  if (zone) {
    trackElementInserted('net-zone');
    maybeSendPitchSnapshot();
    const u = getCurrentUser();
    if (u) logAction(u.uid, u.email, 'element_inserted', { element: 'net-zone' }).catch(() => {});
    setTool('select');
    select(zone);
  }
}

function cancelNetZone() {
  _netZonePlayers = [];
  _netZoneHighlights.forEach(h => h.remove());
  _netZoneHighlights = [];
  _netZoneCoords = [];
  _netZoneVertexDots.forEach(d => d.remove());
  _netZoneVertexDots = [];
  if (_netZonePreview) { _netZonePreview.remove(); _netZonePreview = null; }
}

// Small dot to mark each clicked vertex in image mode
function _addVertexDot(x, y) {
  const ns = 'http://www.w3.org/2000/svg';
  const c = document.createElementNS(ns, 'circle');
  c.setAttribute('cx', x);
  c.setAttribute('cy', y);
  c.setAttribute('r', '4');
  c.setAttribute('fill', 'rgba(79,156,249,0.9)');
  c.setAttribute('stroke', '#fff');
  c.setAttribute('stroke-width', '1.5');
  c.setAttribute('pointer-events', 'none');
  S.playersLayer.appendChild(c);
  _netZoneVertexDots.push(c);
}

function _showNetZoneHint() {
  switchTab('element');
  const msg = S.appMode === 'image'
    ? 'Click on the image to place 3+ points.<br>Double-click to close the zone.'
    : 'Click 3+ players to create a zone.<br>Place players first, then click each one.';
  S.selInfo.innerHTML = `<strong>Player Zone</strong><br><span style="font-size:10px;color:var(--text-muted)">${msg}</span>`;
  // Hide all edit sections so only the hint shows
  ['player-edit-section','referee-edit-section','arrow-edit-section','zone-edit-section',
   'textbox-edit-section','headline-edit-section','spotlight-edit-section','vision-edit-section',
   'tag-edit-section','link-edit-section','marker-edit-section','nz-edit-section',
   'size-section','rotation-section','del-section','layer-section'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
}

function updateNetZonePreview() {
  // Determine point count based on mode
  const count = S.appMode === 'image' ? _netZoneCoords.length : _netZonePlayers.length;
  if (count < 2) {
    if (_netZonePreview) _netZonePreview.setAttribute('points', '');
    return;
  }
  if (!_netZonePreview) {
    _netZonePreview = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    _netZonePreview.setAttribute('fill', 'rgba(79,156,249,0.1)');
    _netZonePreview.setAttribute('stroke', 'rgba(79,156,249,0.5)');
    _netZonePreview.setAttribute('stroke-width', '1.5');
    _netZonePreview.setAttribute('stroke-dasharray', '4,3');
    _netZonePreview.setAttribute('stroke-linejoin', 'round');
    _netZonePreview.setAttribute('pointer-events', 'none');
    S.objectsLayer.appendChild(_netZonePreview);
  }
  let pts;
  if (S.appMode === 'image') {
    pts = _netZoneCoords.map(c => `${c.x},${c.y}`);
  } else {
    pts = _netZonePlayers.map(id => {
      const el = document.getElementById(id);
      return el ? `${el.dataset.cx},${el.dataset.cy}` : null;
    }).filter(Boolean);
  }
  _netZonePreview.setAttribute('points', pts.join(' '));
}

function updateFreeformPreview(cursor) {
  if (!freeformPreview) {
    freeformPreview = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    freeformPreview.setAttribute('fill', 'rgba(79,156,249,0.12)');
    freeformPreview.setAttribute('stroke', 'rgba(79,156,249,0.6)');
    freeformPreview.setAttribute('stroke-width', '1.5');
    freeformPreview.setAttribute('stroke-dasharray', '4,3');
    freeformPreview.setAttribute('pointer-events', 'none');
    S.objectsLayer.appendChild(freeformPreview);
  }
  // Build preview with current points + optional cursor point
  const pts = [...freeformPts];
  if (cursor) pts.push(cursor);
  if (pts.length < 2) {
    freeformPreview.setAttribute('d', '');
    return;
  }
  // Simple polygon path for preview (straight lines)
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) d += ` L ${pts[i].x} ${pts[i].y}`;
  if (pts.length >= 3) d += ' Z';
  freeformPreview.setAttribute('d', d);

  // Draw vertex dots
  const dotsId = 'freeform-dots';
  let dotsG = document.getElementById(dotsId);
  if (!dotsG) {
    dotsG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    dotsG.setAttribute('id', dotsId);
    dotsG.setAttribute('pointer-events', 'none');
    S.objectsLayer.appendChild(dotsG);
  }
  dotsG.innerHTML = '';
  freeformPts.forEach((p, i) => {
    const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    c.setAttribute('cx', p.x); c.setAttribute('cy', p.y);
    c.setAttribute('r', i === 0 && freeformPts.length >= 3 ? '5' : '3');
    c.setAttribute('fill', i === 0 ? 'rgba(79,156,249,0.9)' : 'rgba(79,156,249,0.6)');
    c.setAttribute('stroke', 'white'); c.setAttribute('stroke-width', '0.8');
    dotsG.appendChild(c);
  });
}

// ─── Keyframe / Step Animation System ────────────────────────────────────────
// Each frame stores:
//   positions: { elementId: {x, y} }   — positions of ALL elements
//   elementIds: Set<string>             — which element IDs exist in this frame
let frames = [];
let currentFrame = 0;
let animationRunning = false;
let animationId = null;
let trailsGroup = null;

// Expose frame data for captureState serialization
window._getFramesForSave = () => frames.map(f => ({
  positions: f.positions,
  elementIds: Array.from(f.elementIds),
}));
window._getCurrentFrame = () => currentFrame;

// Gather all annotatable elements (players + objects)
function getAllElements() {
  const els = [];
  S.playersLayer.querySelectorAll('[data-type]').forEach(e => els.push(e));
  S.objectsLayer.querySelectorAll('[data-type]').forEach(e => {
    if (e.id && e.id !== 'step-trails') els.push(e);
  });
  return els;
}

// Keys whose numeric values should be interpolated between animation steps
const _numericKeys = new Set([
  'cx','cy','dx1','dy1','dx2','dy2','scale','rotation','curve',
  'hw','hh','rx','ry','visionLength','visionSpread'
]);

function snapshotPositions() {
  const positions = {};
  getAllElements().forEach(el => {
    // Capture ALL dataset properties so arrows, zones, visions etc. restore fully per step
    const snap = {};
    for (const key in el.dataset) {
      snap[key] = el.dataset[key];
    }
    // Also store cx/cy as numbers for interpolation
    snap._x = parseFloat(el.dataset.cx);
    snap._y = parseFloat(el.dataset.cy);
    positions[el.id] = snap;
  });
  return positions;
}

// Interpolate all dataset properties between two snapshots
function _interpolateSnap(el, from, to, ease) {
  for (const key in to) {
    if (key.startsWith('_')) continue;
    if (_numericKeys.has(key)) {
      const a = parseFloat(from[key]);
      const b = parseFloat(to[key]);
      if (!isNaN(a) && !isNaN(b)) {
        el.dataset[key] = a + (b - a) * ease;
      } else {
        el.dataset[key] = to[key];
      }
    } else {
      // Non-numeric: snap to target value at halfway
      el.dataset[key] = ease < 0.5 ? (from[key] ?? to[key]) : to[key];
    }
  }
}

function snapshotElementIds() {
  // Only include visible elements — hidden ones were "deleted" from this step
  return new Set(getAllElements().filter(e => e.style.display !== 'none').map(e => e.id));
}

function applyFrame(idx) {
  if (idx < 0 || idx >= frames.length) return;
  const f = frames[idx];

  // Show/hide elements based on which exist in this frame
  getAllElements().forEach(el => {
    if (f.elementIds.has(el.id)) {
      el.style.display = '';
      const snap = f.positions[el.id];
      if (snap) {
        // Restore ALL dataset properties so arrows, zones, visions etc. are fully correct per step
        for (const key in snap) {
          if (key.startsWith('_')) continue; // skip internal keys
          el.dataset[key] = snap[key];
        }
        applyTransform(el);
        // Re-render arrow visuals if the element is an arrow (endpoints may have changed)
        if (el.dataset.type === 'arrow') updateArrowVisual(el);
      }
    } else {
      el.style.display = 'none';
    }
  });
  // Update connection lines to follow player positions in this frame
  updateAllLinks();
}

function saveCurrentToFrame() {
  if (currentFrame >= 0 && currentFrame < frames.length) {
    frames[currentFrame].positions = snapshotPositions();
    frames[currentFrame].elementIds = snapshotElementIds();
  }
}

function addStep() {
  // First step: just capture current state as Step 1
  if (frames.length === 0) {
    frames.push({ positions: snapshotPositions(), elementIds: snapshotElementIds() });
    currentFrame = 0;
    renderStepBar();
    drawTrails();
    const u = getCurrentUser();
    if (u) logAction(u.uid, u.email, 'feature_animation', { trigger: 'add_step', step: 1 }).catch(() => {});
    return;
  }
  saveCurrentToFrame();
  frames.push({ positions: snapshotPositions(), elementIds: snapshotElementIds() });
  currentFrame = frames.length - 1;
  renderStepBar();
  drawTrails();
  // Track animation feature usage
  const u = getCurrentUser();
  if (u) logAction(u.uid, u.email, 'feature_animation', { trigger: 'add_step', step: currentFrame + 1 }).catch(() => {});
}

function goToStep(idx) {
  if (animationRunning) return;
  saveCurrentToFrame();
  currentFrame = idx;
  applyFrame(idx);
  renderStepBar();
  drawTrails();
  deselect();
}

function deleteStep(idx) {
  if (frames.length <= 1) return; // can't delete the only step
  const u = getCurrentUser();
  if (u) logAction(u.uid, u.email, 'feature_animation', { trigger: 'delete_step', step: idx + 1, totalSteps: frames.length }).catch(() => {});
  frames.splice(idx, 1);
  if (currentFrame >= frames.length) currentFrame = frames.length - 1;
  applyFrame(currentFrame);
  renderStepBar();
  drawTrails();
}

async function clearAllSteps() {
  if (frames.length === 0) return;
  const stepCount = frames.length;
  const confirmed = await showConfirmModal({
    icon: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z" stroke="#EF4444" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><line x1="10" y1="11" x2="10" y2="17" stroke="#EF4444" stroke-width="1.5" stroke-linecap="round"/><line x1="14" y1="11" x2="14" y2="17" stroke="#EF4444" stroke-width="1.5" stroke-linecap="round"/></svg>',
    title: `Clear all ${stepCount} step${stepCount > 1 ? 's' : ''}?`,
    desc: 'This will remove all animation steps and restore the pitch to its original state. This cannot be undone.',
    confirmLabel: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg> Clear All',
    confirmClass: 'danger',
  });
  if (!confirmed) return;

  const u = getCurrentUser();
  if (u) logAction(u.uid, u.email, 'feature_animation', { trigger: 'clear_all', steps: stepCount }).catch(() => {});

  if (animationRunning) {
    cancelAnimationFrame(animationId);
    animationRunning = false;
    getAllElements().forEach(el => { el.style.opacity = ''; });
  }
  // Restore to first frame before clearing
  if (frames.length > 0) {
    applyFrame(0);
    // Remove elements that didn't exist in Step 1
    const startIds = frames[0].elementIds;
    getAllElements().forEach(el => {
      el.style.display = startIds.has(el.id) ? '' : 'none';
    });
    // Actually remove elements that were added in later steps
    getAllElements().forEach(el => {
      if (!startIds.has(el.id)) el.remove();
    });
  }
  frames = [];
  currentFrame = 0;
  if (trailsGroup) { trailsGroup.remove(); trailsGroup = null; }
  const container = document.getElementById('motion-controls');
  if (container) container.style.display = 'none';
}

function drawTrails() {
  if (trailsGroup) trailsGroup.remove();
  if (frames.length < 2) { trailsGroup = null; return; }
  // Never draw trails in shared view
  if (document.body.classList.contains('shared-view')) { trailsGroup = null; return; }

  const ns = 'http://www.w3.org/2000/svg';
  trailsGroup = document.createElementNS(ns, 'g');
  trailsGroup.setAttribute('id', 'step-trails');
  trailsGroup.setAttribute('pointer-events', 'none');

  const prevIdx = currentFrame > 0 ? currentFrame - 1 : 0;
  if (prevIdx === currentFrame) { S.objectsLayer.appendChild(trailsGroup); return; }

  const prev = frames[prevIdx].positions;
  const curr = frames[currentFrame].positions;
  const currIds = frames[currentFrame].elementIds;

  // Draw trails for elements that exist in both frames
  getAllElements().forEach(el => {
    const id = el.id;
    if (!currIds.has(id)) return;
    const pPrev = prev[id], pCurr = curr[id];
    if (!pPrev || !pCurr) return;
    const dx = parseFloat(pCurr.cx) - parseFloat(pPrev.cx), dy = parseFloat(pCurr.cy) - parseFloat(pPrev.cy);
    if (Math.hypot(dx, dy) < 3) return;

    // Determine color
    const circ = el.querySelector('circle:not(.hit-area):not(.player-shadow)');
    const color = circ ? circ.getAttribute('fill') : 'rgba(255,255,255,0.5)';

    const prevX = parseFloat(pPrev.cx), prevY = parseFloat(pPrev.cy);
    const currX = parseFloat(pCurr.cx), currY = parseFloat(pCurr.cy);

    const trail = document.createElementNS(ns, 'line');
    trail.setAttribute('x1', prevX); trail.setAttribute('y1', prevY);
    trail.setAttribute('x2', currX); trail.setAttribute('y2', currY);
    trail.setAttribute('stroke', color); trail.setAttribute('stroke-width', '2');
    trail.setAttribute('stroke-dasharray', '6,4'); trail.setAttribute('opacity', '0.5');
    trail.setAttribute('stroke-linecap', 'round');

    const mx = (prevX + currX) / 2, my = (prevY + currY) / 2;
    const angle = Math.atan2(dy, dx);
    const sz = 5;
    const chev = document.createElementNS(ns, 'polygon');
    const tipX = mx + sz * Math.cos(angle), tipY = my + sz * Math.sin(angle);
    const lx = mx - sz * Math.cos(angle - 0.5), ly = my - sz * Math.sin(angle - 0.5);
    const rx = mx - sz * Math.cos(angle + 0.5), ry = my - sz * Math.sin(angle + 0.5);
    chev.setAttribute('points', `${tipX},${tipY} ${lx},${ly} ${rx},${ry}`);
    chev.setAttribute('fill', color); chev.setAttribute('opacity', '0.4');

    const ghost = document.createElementNS(ns, 'circle');
    ghost.setAttribute('cx', prevX); ghost.setAttribute('cy', prevY);
    ghost.setAttribute('r', '8'); ghost.setAttribute('fill', color);
    ghost.setAttribute('opacity', '0.15');
    ghost.setAttribute('stroke', color); ghost.setAttribute('stroke-width', '1');
    ghost.setAttribute('stroke-dasharray', '3,2');

    trailsGroup.appendChild(ghost);
    trailsGroup.appendChild(trail);
    trailsGroup.appendChild(chev);
  });

  S.objectsLayer.appendChild(trailsGroup);
}

function renderStepBar() {
  const bar = document.getElementById('step-bar');
  if (!bar) return;
  const container = document.getElementById('motion-controls');
  if (container) container.style.display = 'flex';

  let html = '';
  frames.forEach((f, i) => {
    const active = i === currentFrame ? ' active' : '';
    const label = i + 1; // Steps start at 1
    const removeBtn = frames.length > 1
      ? `<span class="step-remove" onclick="event.stopPropagation(); deleteStep(${i})" title="Remove step ${label}">&minus;</span>`
      : '';
    html += `<button class="step-pill${active}" onclick="goToStep(${i})"><span class="step-label">${label}</span>${removeBtn}</button>`;
  });
  html += `<button class="step-pill step-add" onclick="addStep()">+</button>`;

  bar.innerHTML = html;

  const playBtn = document.getElementById('motion-play-btn');
  const resetBtn = document.getElementById('motion-reset-btn');
  const exportBtn = document.getElementById('motion-export-btn');
  const exportVideoBtn = document.getElementById('motion-export-video-btn');
  const clearBtn = document.getElementById('motion-clear-btn');
  const separator = document.getElementById('motion-separator');
  const hasMultiple = frames.length >= 2;
  if (playBtn) playBtn.style.display = hasMultiple ? 'flex' : 'none';
  if (resetBtn) resetBtn.style.display = (hasMultiple && currentFrame > 0) ? 'flex' : 'none';
  if (separator) separator.style.display = hasMultiple ? 'inline-block' : 'none';
  if (exportBtn) exportBtn.style.display = hasMultiple ? 'flex' : 'none';
  if (exportVideoBtn) exportVideoBtn.style.display = hasMultiple ? 'flex' : 'none';
  if (clearBtn) clearBtn.style.display = frames.length >= 1 ? 'flex' : 'none';
}

function playAllSteps() {
  if (animationRunning || frames.length < 2) return;
  deselect();
  saveCurrentToFrame();

  animationRunning = true;
  renderStepBar();
  if (trailsGroup) trailsGroup.style.display = 'none';
  // Track animation play
  const u = getCurrentUser();
  if (u) logAction(u.uid, u.email, 'feature_animation', { trigger: 'play', steps: frames.length }).catch(() => {});

  const stepDuration = 1200;
  const pauseDuration = 300;
  let stepIdx = 0;

  function animateStep() {
    if (stepIdx >= frames.length - 1) {
      animationRunning = false;
      currentFrame = frames.length - 1;
      applyFrame(currentFrame);
      renderStepBar();
      if (trailsGroup) trailsGroup.style.display = '';
      drawTrails();
      return;
    }

    const fromFrame = frames[stepIdx];
    const toFrame = frames[stepIdx + 1];
    const startTime = performance.now();

    currentFrame = stepIdx;
    renderStepBar();

    // Show elements that exist in the target frame
    const toIds = toFrame.elementIds;
    const fromIds = fromFrame.elementIds;

    function tick(now) {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / stepDuration, 1);
      const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

      getAllElements().forEach(el => {
        const id = el.id;
        const inFrom = fromIds.has(id), inTo = toIds.has(id);

        if (inFrom && inTo) {
          el.style.display = '';
          const from = fromFrame.positions[id], to = toFrame.positions[id];
          if (from && to) {
            // Interpolate all numeric dataset properties between steps
            _interpolateSnap(el, from, to, ease);
            applyTransform(el);
            if (el.dataset.type === 'arrow') updateArrowVisual(el);
          }
        } else if (!inFrom && inTo) {
          el.style.display = '';
          el.style.opacity = ease;
          const snap = toFrame.positions[id];
          if (snap) {
            for (const key in snap) { if (!key.startsWith('_')) el.dataset[key] = snap[key]; }
            applyTransform(el);
            if (el.dataset.type === 'arrow') updateArrowVisual(el);
          }
        } else if (inFrom && !inTo) {
          el.style.opacity = 1 - ease;
        } else {
          el.style.display = 'none';
        }
      });

      // Update connection lines to follow animated player positions
      updateAllLinks();

      if (t < 1) {
        animationId = requestAnimationFrame(tick);
      } else {
        // Reset opacity
        getAllElements().forEach(el => { el.style.opacity = ''; });
        stepIdx++;
        currentFrame = stepIdx;
        applyFrame(currentFrame);
        renderStepBar();
        setTimeout(animateStep, pauseDuration);
      }
    }
    animationId = requestAnimationFrame(tick);
  }

  applyFrame(0);
  currentFrame = 0;
  renderStepBar();
  setTimeout(animateStep, 200);
}

function resetToBase() {
  if (animationRunning) {
    cancelAnimationFrame(animationId);
    animationRunning = false;
    getAllElements().forEach(el => { el.style.opacity = ''; });
  }
  const u = getCurrentUser();
  if (u) logAction(u.uid, u.email, 'feature_animation', { trigger: 'reset', steps: frames.length }).catch(() => {});
  currentFrame = 0;
  applyFrame(0);
  renderStepBar();
  drawTrails();
}

// ─── GIF Export ──────────────────────────────────────────────────────────────
function exportAnimation() {
  if (frames.length < 2) { showNotification('Add at least 2 steps before exporting.', 'error', 4000); return; }
  saveCurrentToFrame();
  // Track animation export
  const u = getCurrentUser();
  if (u) logAction(u.uid, u.email, 'feature_animation', { trigger: 'export_gif', steps: frames.length }).catch(() => {});
  if (typeof window.gtag === 'function') window.gtag('event', 'export_gif', { steps: frames.length });

  const svgEl = S.svg;
  const w = parseInt(svgEl.getAttribute('width'));
  const h = parseInt(svgEl.getAttribute('height'));
  const scale = 2; // retina quality
  const canvas = document.createElement('canvas');
  canvas.width = w * scale;
  canvas.height = h * scale;
  const ctx = canvas.getContext('2d');

  // Show an export-in-progress indicator
  const exportBtn = document.getElementById('motion-export-btn');
  const origText = exportBtn ? exportBtn.innerHTML : '';
  if (exportBtn) exportBtn.innerHTML = '<span style="animation:pulse 1s infinite">Exporting…</span>';

  // Hide trails during capture
  if (trailsGroup) trailsGroup.style.display = 'none';

  const frameImages = [];
  let captureIdx = 0;

  function captureFrame() {
    if (captureIdx >= frames.length) {
      // All frames captured — encode GIF
      buildGIF(frameImages, w * scale, h * scale, () => {
        if (trailsGroup) trailsGroup.style.display = '';
        if (exportBtn) exportBtn.innerHTML = origText;
        applyFrame(currentFrame);
      });
      return;
    }

    applyFrame(captureIdx);

    // Serialize SVG to image
    const svgData = new XMLSerializer().serializeToString(svgEl);
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);

      // Copy the canvas pixels
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      frameImages.push(imageData);
      captureIdx++;
      // Small delay to let the browser render
      setTimeout(captureFrame, 50);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      console.error('SVG render failed for frame', captureIdx);
      if (exportBtn) exportBtn.innerHTML = origText;
      if (trailsGroup) trailsGroup.style.display = '';
    };
    img.src = url;
  }

  captureFrame();
}

// Minimal GIF89a encoder — no external dependencies
function buildGIF(frameImages, width, height, onDone) {
  // Quantize each frame to 256 colors and encode
  const delay = 120; // centiseconds (1.2s per frame)
  const holdLast = 200; // hold last frame longer

  // Use median-cut quantization for each frame
  function quantizeFrame(imageData) {
    const pixels = imageData.data;
    const n = width * height;
    const indexed = new Uint8Array(n);
    // Simple uniform quantization: 6 bits R, 7 bits G, 5 bits B → 256 colors
    const palette = [];
    const colorMap = new Map();
    let colorIdx = 0;

    for (let i = 0; i < n; i++) {
      const r = pixels[i * 4], g = pixels[i * 4 + 1], b = pixels[i * 4 + 2];
      // Reduce to 6-6-6 level
      const qr = Math.round(r / 51) * 51;
      const qg = Math.round(g / 51) * 51;
      const qb = Math.round(b / 51) * 51;
      const key = (qr << 16) | (qg << 8) | qb;

      if (colorMap.has(key)) {
        indexed[i] = colorMap.get(key);
      } else if (colorIdx < 256) {
        colorMap.set(key, colorIdx);
        palette.push(qr, qg, qb);
        indexed[i] = colorIdx;
        colorIdx++;
      } else {
        // Find closest existing color
        let bestDist = Infinity, bestIdx = 0;
        for (let c = 0; c < palette.length / 3; c++) {
          const dr = palette[c * 3] - r, dg = palette[c * 3 + 1] - g, db = palette[c * 3 + 2] - b;
          const dist = dr * dr + dg * dg + db * db;
          if (dist < bestDist) { bestDist = dist; bestIdx = c; }
        }
        indexed[i] = bestIdx;
      }
    }

    // Pad palette to 256
    while (palette.length < 768) palette.push(0);
    return { indexed, palette };
  }

  // LZW compress indexed data
  function lzwEncode(indexed, minCodeSize) {
    const clearCode = 1 << minCodeSize;
    const eoiCode = clearCode + 1;
    let codeSize = minCodeSize + 1;
    let nextCode = eoiCode + 1;
    const maxCode = 4096;

    const output = [];
    let buffer = 0, bitsInBuffer = 0;

    function writeBits(code, size) {
      buffer |= code << bitsInBuffer;
      bitsInBuffer += size;
      while (bitsInBuffer >= 8) {
        output.push(buffer & 0xFF);
        buffer >>= 8;
        bitsInBuffer -= 8;
      }
    }

    // Initialize table
    let table = new Map();
    for (let i = 0; i < clearCode; i++) table.set(String(i), i);

    writeBits(clearCode, codeSize);
    let current = String(indexed[0]);

    for (let i = 1; i < indexed.length; i++) {
      const next = String(indexed[i]);
      const combined = current + ',' + next;
      if (table.has(combined)) {
        current = combined;
      } else {
        writeBits(table.get(current), codeSize);
        if (nextCode < maxCode) {
          table.set(combined, nextCode++);
          if (nextCode > (1 << codeSize) && codeSize < 12) codeSize++;
        } else {
          writeBits(clearCode, codeSize);
          table = new Map();
          for (let j = 0; j < clearCode; j++) table.set(String(j), j);
          nextCode = eoiCode + 1;
          codeSize = minCodeSize + 1;
        }
        current = next;
      }
    }
    writeBits(table.get(current), codeSize);
    writeBits(eoiCode, codeSize);
    if (bitsInBuffer > 0) output.push(buffer & 0xFF);

    return new Uint8Array(output);
  }

  // Build GIF binary
  const parts = [];
  function writeBytes(arr) { parts.push(new Uint8Array(arr)); }
  function writeString(s) { parts.push(new TextEncoder().encode(s)); }
  function writeU16LE(v) { writeBytes([v & 0xFF, (v >> 8) & 0xFF]); }

  // Header
  writeString('GIF89a');
  writeU16LE(width); writeU16LE(height);
  // No global color table
  writeBytes([0x70, 0x00, 0x00]); // GCT flag=0, bg=0, aspect=0

  // Netscape looping extension (loop forever)
  writeBytes([0x21, 0xFF, 0x0B]);
  writeString('NETSCAPE2.0');
  writeBytes([0x03, 0x01, 0x00, 0x00, 0x00]); // loop count 0 = infinite

  frameImages.forEach((imgData, fi) => {
    const { indexed, palette } = quantizeFrame(imgData);

    // Graphic control extension
    const d = fi === frameImages.length - 1 ? holdLast : delay;
    writeBytes([0x21, 0xF9, 0x04, 0x00]);
    writeU16LE(d);
    writeBytes([0x00, 0x00]); // transparent index, terminator

    // Image descriptor with local color table
    writeBytes([0x2C]);
    writeU16LE(0); writeU16LE(0); // left, top
    writeU16LE(width); writeU16LE(height);
    writeBytes([0x87]); // local color table, 256 colors (2^(7+1))

    // Local color table
    writeBytes(palette);

    // LZW data
    const minCodeSize = 8;
    writeBytes([minCodeSize]);
    const lzwData = lzwEncode(indexed, minCodeSize);
    // Write in sub-blocks of max 255 bytes
    let offset = 0;
    while (offset < lzwData.length) {
      const chunkSize = Math.min(255, lzwData.length - offset);
      writeBytes([chunkSize]);
      parts.push(lzwData.slice(offset, offset + chunkSize));
      offset += chunkSize;
    }
    writeBytes([0x00]); // block terminator
  });

  // Trailer
  writeBytes([0x3B]);

  const blob = new Blob(parts, { type: 'image/gif' });
  const url = URL.createObjectURL(blob);
  const filename = `tactica-${Date.now()}.gif`;

  // Show a download modal so the user can click directly (avoids popup blockers)
  let overlay = document.getElementById('gif-download-overlay');
  if (overlay) overlay.remove();
  overlay = document.createElement('div');
  overlay.id = 'gif-download-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;';
  const modal = document.createElement('div');
  modal.style.cssText = 'background:#1e1e2a;border-radius:16px;padding:28px 32px;text-align:center;color:#fff;max-width:360px;box-shadow:0 12px 40px rgba(0,0,0,0.5);';
  const preview = document.createElement('img');
  preview.src = url;
  preview.style.cssText = 'max-width:280px;max-height:200px;border-radius:8px;margin-bottom:16px;border:1px solid rgba(255,255,255,0.1);';
  const title = document.createElement('div');
  title.textContent = 'Your GIF is ready!';
  title.style.cssText = 'font-size:16px;font-weight:600;margin-bottom:16px;';
  const dlBtn = document.createElement('a');
  dlBtn.href = url;
  dlBtn.download = filename;
  dlBtn.textContent = 'Download GIF';
  dlBtn.style.cssText = 'display:inline-block;padding:10px 28px;background:#c8a94e;color:#1a1a2e;font-weight:700;border-radius:8px;text-decoration:none;font-size:14px;cursor:pointer;';
  const closeBtn = document.createElement('button');
  closeBtn.textContent = 'Close';
  closeBtn.style.cssText = 'display:block;margin:12px auto 0;background:none;border:1px solid rgba(255,255,255,0.2);color:rgba(255,255,255,0.6);padding:6px 20px;border-radius:6px;cursor:pointer;font-size:13px;';
  closeBtn.onclick = () => { overlay.remove(); URL.revokeObjectURL(url); };
  overlay.onclick = (e) => { if (e.target === overlay) { overlay.remove(); URL.revokeObjectURL(url); } };
  modal.append(preview, title, dlBtn, closeBtn);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  onDone();
}

// ─── Video (WebM) Export ────────────────────────────────────────────────────
async function exportVideo() {
  if (frames.length < 2) { showNotification('Add at least 2 steps before exporting.', 'error', 4000); return; }
  saveCurrentToFrame();

  const u = getCurrentUser();
  if (u) logAction(u.uid, u.email, 'feature_animation', { trigger: 'export_video', steps: frames.length }).catch(() => {});
  if (typeof window.gtag === 'function') window.gtag('event', 'export_video', { steps: frames.length });

  const svgEl = S.svg;
  const w = parseInt(svgEl.getAttribute('width'));
  const h = parseInt(svgEl.getAttribute('height'));
  const scale = 2;
  // Ensure dimensions are even (required by H.264)
  const cw = Math.round(w * scale / 2) * 2;
  const ch = Math.round(h * scale / 2) * 2;

  const canvas = document.createElement('canvas');
  canvas.width = cw; canvas.height = ch;
  const ctx = canvas.getContext('2d');

  // Show progress
  const exportBtn = document.getElementById('motion-export-video-btn');
  const origText = exportBtn ? exportBtn.innerHTML : '';
  if (exportBtn) exportBtn.innerHTML = '<span style="animation:pulse 1s infinite">Exporting…</span>';

  // Hide trails during capture
  if (trailsGroup) trailsGroup.style.display = 'none';

  const fps = 30;
  const frameDuration = 1000 / fps;
  const stepDuration = 1200;
  const pauseDuration = 400;
  const framesPerStep = Math.ceil(stepDuration / frameDuration);
  const pauseFrames = Math.ceil(pauseDuration / frameDuration);

  // Try MP4 via WebCodecs + mp4-muxer, fall back to WebM
  const useMP4 = typeof VideoEncoder !== 'undefined';
  let mp4Muxer = null, videoEncoder = null;
  let recorder = null, stream = null, chunks = [];
  let frameIndex = 0;

  if (useMP4) {
    try {
      const mp4Module = await import('https://cdn.jsdelivr.net/npm/mp4-muxer@5.1.3/build/mp4-muxer.mjs');
      mp4Muxer = new mp4Module.Muxer({
        target: new mp4Module.ArrayBufferTarget(),
        video: {
          codec: 'avc',
          width: cw,
          height: ch,
        },
        fastStart: 'in-memory',
      });

      videoEncoder = new VideoEncoder({
        output: (chunk, meta) => mp4Muxer.addVideoChunk(chunk, meta),
        error: (e) => console.error('VideoEncoder error:', e),
      });

      videoEncoder.configure({
        codec: 'avc1.640028',
        width: cw,
        height: ch,
        bitrate: 5_000_000,
        framerate: fps,
      });
    } catch (e) {
      console.warn('MP4 setup failed, falling back to WebM:', e);
      mp4Muxer = null;
      videoEncoder = null;
    }
  }

  // Fall back to WebM if MP4 not available
  if (!mp4Muxer) {
    stream = canvas.captureStream(0);
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9' : 'video/webm';
    recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 5000000 });
    recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    recorder.start();
  }

  // Helper: render current SVG state to canvas
  function renderSVGToCanvas() {
    return new Promise((resolve, reject) => {
      const svgData = new XMLSerializer().serializeToString(svgEl);
      const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
      const blobUrl = URL.createObjectURL(svgBlob);
      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, cw, ch);
        ctx.drawImage(img, 0, 0, cw, ch);
        URL.revokeObjectURL(blobUrl);
        resolve();
      };
      img.onerror = () => { URL.revokeObjectURL(blobUrl); reject(new Error('SVG render failed')); };
      img.src = blobUrl;
    });
  }

  async function captureVideoFrame() {
    await renderSVGToCanvas();
    if (mp4Muxer && videoEncoder) {
      const vf = new VideoFrame(canvas, { timestamp: frameIndex * (1_000_000 / fps) });
      const isKey = frameIndex % (fps * 2) === 0; // keyframe every 2s
      videoEncoder.encode(vf, { keyFrame: isKey });
      vf.close();
      frameIndex++;
    } else if (stream) {
      stream.getVideoTracks()[0].requestFrame();
    }
  }

  // Helper: interpolate between two frames
  function interpolate(fromIdx, toIdx, ease) {
    const fromFrame = frames[fromIdx];
    const toFrame = frames[toIdx];
    const fromIds = fromFrame.elementIds;
    const toIds = toFrame.elementIds;

    getAllElements().forEach(el => {
      const id = el.id;
      const inFrom = fromIds.has(id), inTo = toIds.has(id);

      if (inFrom && inTo) {
        el.style.display = '';
        el.style.opacity = '';
        const from = fromFrame.positions[id], to = toFrame.positions[id];
        if (from && to) {
          _interpolateSnap(el, from, to, ease);
          applyTransform(el);
          if (el.dataset.type === 'arrow') updateArrowVisual(el);
        }
      } else if (!inFrom && inTo) {
        el.style.display = '';
        el.style.opacity = ease;
        const snap = toFrame.positions[id];
        if (snap) {
          for (const key in snap) { if (!key.startsWith('_')) el.dataset[key] = snap[key]; }
          applyTransform(el);
          if (el.dataset.type === 'arrow') updateArrowVisual(el);
        }
      } else if (inFrom && !inTo) {
        el.style.display = '';
        el.style.opacity = 1 - ease;
      } else {
        el.style.display = 'none';
      }
    });
    updateAllLinks();
  }

  const delay = ms => new Promise(r => setTimeout(r, ms));

  try {
    for (let i = 0; i < frames.length; i++) {
      applyFrame(i);
      for (let p = 0; p < pauseFrames; p++) {
        await captureVideoFrame();
        await delay(frameDuration);
      }

      if (i < frames.length - 1) {
        for (let f = 1; f <= framesPerStep; f++) {
          const t = f / framesPerStep;
          const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
          interpolate(i, i + 1, ease);
          await captureVideoFrame();
          await delay(frameDuration);
        }
        getAllElements().forEach(el => { el.style.opacity = ''; });
      }
    }

    // Hold last frame longer
    applyFrame(frames.length - 1);
    for (let p = 0; p < pauseFrames * 3; p++) {
      await captureVideoFrame();
      await delay(frameDuration);
    }
  } catch (err) {
    console.error('Video export error:', err);
    showNotification('Video export failed.', 'error', 4000);
    if (recorder) recorder.stop();
    if (trailsGroup) trailsGroup.style.display = '';
    if (exportBtn) exportBtn.innerHTML = origText;
    applyFrame(currentFrame);
    return;
  }

  // Finalize
  let blob, filename;
  if (mp4Muxer && videoEncoder) {
    await videoEncoder.flush();
    mp4Muxer.finalize();
    const buf = mp4Muxer.target.buffer;
    blob = new Blob([buf], { type: 'video/mp4' });
    filename = `tactica-${Date.now()}.mp4`;
  } else {
    recorder.stop();
    await new Promise(resolve => { recorder.onstop = resolve; });
    blob = new Blob(chunks, { type: 'video/webm' });
    filename = `tactica-${Date.now()}.webm`;
  }

  // Restore state
  if (trailsGroup) trailsGroup.style.display = '';
  getAllElements().forEach(el => { el.style.opacity = ''; });
  applyFrame(currentFrame);
  if (exportBtn) exportBtn.innerHTML = origText;

  const url = URL.createObjectURL(blob);

  // Show download modal
  let overlay = document.getElementById('video-download-overlay');
  if (overlay) overlay.remove();
  overlay = document.createElement('div');
  overlay.id = 'video-download-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;';
  const modal = document.createElement('div');
  modal.style.cssText = 'background:#1e1e2a;border-radius:16px;padding:28px 32px;text-align:center;color:#fff;max-width:360px;box-shadow:0 12px 40px rgba(0,0,0,0.5);';
  const preview = document.createElement('video');
  preview.src = url;
  preview.autoplay = true;
  preview.loop = true;
  preview.muted = true;
  preview.playsInline = true;
  preview.style.cssText = 'max-width:280px;max-height:200px;border-radius:8px;margin-bottom:16px;border:1px solid rgba(255,255,255,0.1);';
  const title = document.createElement('div');
  title.textContent = 'Your video is ready!';
  title.style.cssText = 'font-size:16px;font-weight:600;margin-bottom:16px;';
  const formatNote = document.createElement('div');
  formatNote.textContent = mp4Muxer ? 'MP4 format — share anywhere' : 'WebM format';
  formatNote.style.cssText = 'font-size:11px;color:rgba(255,255,255,0.4);margin-bottom:12px;';
  const dlBtn = document.createElement('a');
  dlBtn.href = url;
  dlBtn.download = filename;
  dlBtn.textContent = 'Download Video';
  dlBtn.style.cssText = 'display:inline-block;padding:10px 28px;background:#c8a94e;color:#1a1a2e;font-weight:700;border-radius:8px;text-decoration:none;font-size:14px;cursor:pointer;';
  const closeBtn = document.createElement('button');
  closeBtn.textContent = 'Close';
  closeBtn.style.cssText = 'display:block;margin:12px auto 0;background:none;border:1px solid rgba(255,255,255,0.2);color:rgba(255,255,255,0.6);padding:6px 20px;border-radius:6px;cursor:pointer;font-size:13px;';
  closeBtn.onclick = () => { overlay.remove(); URL.revokeObjectURL(url); };
  overlay.onclick = (e) => { if (e.target === overlay) { overlay.remove(); URL.revokeObjectURL(url); } };
  modal.append(preview, title, formatNote, dlBtn, closeBtn);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
}

window.addStep = addStep;
window.goToStep = goToStep;
window.deleteStep = deleteStep;
window.playAllSteps = playAllSteps;
window.resetToBase = resetToBase;
window.exportAnimation = exportAnimation;
window.exportVideo = exportVideo;
window.clearAllSteps = clearAllSteps;

// ─── Kit tooltip (name-of-team on hover) ────────────────────────────────────
(function setupKitTooltip() {
  let tip = null;
  function ensureTip() {
    if (tip) return tip;
    tip = document.createElement('div');
    tip.className = 'kit-tooltip';
    tip.setAttribute('role', 'tooltip');
    document.body.appendChild(tip);
    return tip;
  }
  document.addEventListener('mouseover', e => {
    const btn = e.target.closest('.kit-btn');
    if (!btn) return;
    const name = btn.dataset.trackName || btn.getAttribute('title') || '';
    if (!name) return;
    // Suppress native tooltip while our custom one is visible
    if (btn.hasAttribute('title')) {
      btn.dataset._savedTitle = btn.getAttribute('title');
      btn.removeAttribute('title');
    }
    const t = ensureTip();
    t.textContent = name;
    const r = btn.getBoundingClientRect();
    t.style.visibility = 'hidden';
    t.style.display = 'block';
    const tw = t.offsetWidth;
    let left = r.left + r.width / 2 - tw / 2;
    // Keep within viewport
    left = Math.max(6, Math.min(left, window.innerWidth - tw - 6));
    const top = r.top - t.offsetHeight - 6;
    t.style.left = left + 'px';
    t.style.top = top + 'px';
    t.style.visibility = 'visible';
    t.classList.add('show');
  });
  document.addEventListener('mouseout', e => {
    const btn = e.target.closest('.kit-btn');
    if (!btn) return;
    if (btn.dataset._savedTitle != null) {
      btn.setAttribute('title', btn.dataset._savedTitle);
      delete btn.dataset._savedTitle;
    }
    if (tip) tip.classList.remove('show');
  });
})();

// ─── Copy / Paste ────────────────────────────────────────────────────────────
let clipboard = null;
let clipboardMulti = null;

// Helper: extract copy data from a single element (used by both single & multi copy)
function _copyElementData(el) {
  const t = el.dataset.type;
  const data = { type: t, cx: parseFloat(el.dataset.cx), cy: parseFloat(el.dataset.cy) };
  if (t === 'player') {
    const circ = el.querySelector('circle:not(.hit-area):not(.player-arm):not(.player-shadow)');
    data.team = el.dataset.team; data.label = el.dataset.label;
    data.isGK = el.dataset.isGK === '1';
    data.fill = circ?.getAttribute('fill'); data.stroke = circ?.getAttribute('stroke');
    data.borderColor = el.dataset.borderColor;
    data.playerName = el.dataset.playerName || '';
    data.nameSize = el.dataset.nameSize || '11';
    data.nameColor = el.querySelector('.player-name')?.getAttribute('fill') || 'rgba(255,255,255,0.9)';
    data.scale = el.dataset.scale || '1';
    data.arms = el.dataset.arms || '0'; data.rotation = el.dataset.rotation || '0';
  } else if (t === 'referee') {
    data.label = el.dataset.label;
    data.fillColor = el.dataset.fillColor || '#1a1a1a';
    data.borderColor = el.dataset.borderColor || '#FBBF24';
    data.scale = el.dataset.scale || '0.9';
  } else if (t === 'ball') {
    data.scale = el.dataset.scale || '0.7';
  } else if (t === 'cone') {
    data.scale = el.dataset.scale || '1';
  } else if (t === 'arrow') {
    const line = el.querySelector('.arrow-line');
    data.arrowType = el.dataset.arrowType;
    data.color = line?.getAttribute('stroke'); data.dash = line?.getAttribute('stroke-dasharray') || '';
    data.width = el.dataset.arrowWidth || '2.5'; data.marker = line?.getAttribute('marker-end') || '';
    data.dx1 = el.dataset.dx1; data.dy1 = el.dataset.dy1;
    data.dx2 = el.dataset.dx2; data.dy2 = el.dataset.dy2;
    data.curve = el.dataset.curve || '0';
  } else if (t === 'textbox') {
    data.textContent = el.dataset.textContent || 'Text'; data.textSize = el.dataset.textSize || '14';
    data.textColor = el.dataset.textColor || 'rgba(255,255,255,0.9)';
    data.textBg = el.dataset.textBg || 'rgba(0,0,0,0.5)';
    data.textAlign = el.dataset.textAlign || 'center';
    data.hw = el.dataset.hw || '60'; data.hh = el.dataset.hh || '20';
    data.rotation = el.dataset.rotation || '0';
  } else if (t === 'spotlight') {
    data.rx = el.dataset.rx || '28'; data.ry = el.dataset.ry || '5';
    data.spotColor = el.dataset.spotColor || 'rgba(255,255,255,0.85)';
    data.spotName = el.dataset.spotName || ''; data.spotNameSize = el.dataset.spotNameSize || '11';
    data.scale = el.dataset.scale || '1';
  } else if (t === 'vision') {
    data.scale = el.dataset.scale || '1'; data.rotation = el.dataset.rotation || '0';
    data.visionColor = el.dataset.visionColor || 'rgba(147,197,253,0.5)';
    data.visionLength = el.dataset.visionLength || '80'; data.visionSpread = el.dataset.visionSpread || '35';
    data.visionStyle = el.dataset.visionStyle || 'pointed';
    data.visionBorder = el.dataset.visionBorder || '';
    data.visionOpacity = el.dataset.visionOpacity || '';
  } else if (t === 'tag') {
    data.tagLabel = el.dataset.tagLabel || 'TOP SPEED'; data.tagValue = el.dataset.tagValue || '8.7km/h';
    data.tagLineLen = el.dataset.tagLineLen || '80'; data.tagLineAngle = el.dataset.tagLineAngle || '-35';
    data.tagTextAnchor = el.dataset.tagTextAnchor || 'bottom';
    data.scale = el.dataset.scale || '1';
  } else if (t === 'link') {
    data.player1 = el.dataset.player1; data.player2 = el.dataset.player2;
    data.linkColor = el.dataset.linkColor || 'rgba(255,255,255,0.4)';
    data.linkStyle = el.dataset.linkStyle || 'dashed';
  } else if (t?.startsWith('shadow')) {
    const shape = el.querySelector('rect,ellipse');
    data.hw = el.dataset.hw || '30'; data.hh = el.dataset.hh || '20';
    data.rotation = el.dataset.rotation || '0';
    data.fill = shape?.getAttribute('fill');
    data.stroke = el.dataset.savedStroke || shape?.getAttribute('stroke');
    data.dash = shape?.getAttribute('stroke-dasharray') || '';
  }
  return data;
}
let lastMouseSVG = { x: 350, y: 240 }; // default to center

S.svg.addEventListener('mousemove', e => {
  const pt = S.getSVGPoint(e);
  lastMouseSVG.x = pt.x; lastMouseSVG.y = pt.y;
});

function copySelected() {
  if (!S.selectedEl && S.selectedEls.size === 0) return;
  // Multi-copy: store all selected elements' data
  if (S.selectedEls.size > 1) {
    clipboardMulti = [];
    for (const el of S.selectedEls) {
      clipboardMulti.push(_copyElementData(el));
    }
    clipboard = null;
    return;
  }
  clipboardMulti = null;
  const el = S.selectedEl;
  const t = el.dataset.type;
  const data = { type: t };

  if (t === 'player') {
    const circ = el.querySelector('circle:not(.hit-area):not(.player-arm):not(.player-shadow)');
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
    data.arms = el.dataset.arms || '0';
    data.rotation = el.dataset.rotation || '0';
  } else if (t === 'referee') {
    const circ = el.querySelector('circle:not(.hit-area):not(.player-shadow)');
    data.label = el.dataset.label;
    data.fillColor = el.dataset.fillColor || '#1a1a1a';
    data.borderColor = el.dataset.borderColor || '#FBBF24';
    data.scale = el.dataset.scale || '0.9';
  } else if (t === 'ball') {
    data.scale = el.dataset.scale || '0.7';
  } else if (t === 'cone') {
    data.scale = el.dataset.scale || '1';
  } else if (t === 'arrow') {
    const line = el.querySelector('.arrow-line');
    data.arrowType = el.dataset.arrowType;
    data.color = line?.getAttribute('stroke');
    data.dash = line?.getAttribute('stroke-dasharray') || '';
    data.width = el.dataset.arrowWidth || '2.5';
    data.marker = line?.getAttribute('marker-end') || '';
    data.dx1 = el.dataset.dx1; data.dy1 = el.dataset.dy1;
    data.dx2 = el.dataset.dx2; data.dy2 = el.dataset.dy2;
    data.curve = el.dataset.curve || '0';
  } else if (t === 'textbox') {
    data.textContent = el.dataset.textContent || 'Text';
    data.textSize = el.dataset.textSize || '14';
    data.textColor = el.dataset.textColor || 'rgba(255,255,255,0.9)';
    data.textBg = el.dataset.textBg || 'rgba(0,0,0,0.5)';
    data.textAlign = el.dataset.textAlign || 'center';
    data.hw = el.dataset.hw || '60'; data.hh = el.dataset.hh || '20';
    data.rotation = el.dataset.rotation || '0';
  } else if (t === 'headline') {
    data.hlTitle = el.dataset.hlTitle || '';
    data.hlBody = el.dataset.hlBody || '';
    data.hlBarColor = el.dataset.hlBarColor || '#4FC3F7';
    data.hlTitleSize = el.dataset.hlTitleSize || '16';
    data.hlBodySize = el.dataset.hlBodySize || '12';
    data.hlTextColor = el.dataset.hlTextColor || 'rgba(255,255,255,0.9)';
    data.hlBg = el.dataset.hlBg || 'none';
    data.hw = el.dataset.hw || '130'; data.hh = el.dataset.hh || '40';
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
    data.visionStyle = el.dataset.visionStyle || 'pointed';
    data.visionBorder = el.dataset.visionBorder || '';
    data.visionOpacity = el.dataset.visionOpacity || '';
  } else if (t === 'tag') {
    data.tagLabel = el.dataset.tagLabel || 'TOP SPEED';
    data.tagValue = el.dataset.tagValue || '8.7km/h';
    data.tagLabelColor = el.dataset.tagLabelColor || 'rgba(255,255,255,0.9)';
    data.tagValueColor = el.dataset.tagValueColor || '#39FF14';
    data.tagLineColor = el.dataset.tagLineColor || 'rgba(255,255,255,0.7)';
    data.tagLineDash = el.dataset.tagLineDash || '6,4';
    data.tagLineLen = el.dataset.tagLineLen || '80';
    data.tagLineAngle = el.dataset.tagLineAngle || '-35';
    data.tagTextAnchor = el.dataset.tagTextAnchor || 'bottom';
    data.scale = el.dataset.scale || '1';
  } else if (t === 'link') {
    data.player1 = el.dataset.player1;
    data.player2 = el.dataset.player2;
    data.linkColor = el.dataset.linkColor || 'rgba(255,255,255,0.4)';
    data.linkStyle = el.dataset.linkStyle || 'dashed';
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
  // Multi-paste
  if (clipboardMulti && clipboardMulti.length > 0) {
    S.pushUndo();
    deselect();
    const x = lastMouseSVG.x, y = lastMouseSVG.y;
    // Find center of copied group
    const avgX = clipboardMulti.reduce((a, d) => a + d.cx, 0) / clipboardMulti.length;
    const avgY = clipboardMulti.reduce((a, d) => a + d.cy, 0) / clipboardMulti.length;
    for (const d of clipboardMulti) {
      const ox = x + (d.cx - avgX), oy = y + (d.cy - avgY);
      const placed = _pasteOne(d, ox, oy);
      if (placed) {
        S.addSelectedEl(placed);
        S.setSelectedEl(placed);
        // Apply highlight
        const circ = placed.querySelector('circle:not(.hit-area):not(.player-shadow),polygon');
        if (circ) circ.setAttribute('stroke-width', '3');
        if (placed.dataset.type === 'player' || placed.dataset.type === 'referee') {
          placed.querySelector('circle:not(.hit-area):not(.player-shadow)')?.setAttribute('stroke', 'rgba(79,156,249,0.8)');
        }
      }
    }
    if (S.selectedEls.size > 1) {
      // Import to trigger multi-select UI
      import('./interaction.js').then(m => {
        // Force re-trigger multi-select UI via select
      });
      // Inline multi-select UI update
      S.selInfo.innerHTML = `<strong>${S.selectedEls.size} elements selected</strong><br><span style="font-size:10px;color:var(--text-muted)">Drag to move · Ctrl+click to toggle</span>`;
      document.getElementById('del-section').style.display = '';
    }
    return;
  }
  if (!clipboard) return;
  S.pushUndo();
  const d = clipboard;
  const x = lastMouseSVG.x, y = lastMouseSVG.y;
  let placed = _pasteOne(d, x, y);

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

function _pasteOne(d, x, y) {
  let placed = null;

  if (d.type === 'player') {
    placed = addPlayer(x, y, d.team, d.label, d.isGK);
    if (placed) {
      const circ = placed.querySelector('circle:not(.hit-area):not(.player-arm):not(.player-shadow)');
      if (circ && d.fill) {
        circ.setAttribute('fill', d.fill); circ.setAttribute('stroke', d.stroke || '');
        const shadow = placed.querySelector('.player-shadow');
        if (shadow) shadow.setAttribute('fill', d.fill);
      }
      if (d.borderColor) placed.dataset.borderColor = d.borderColor;
      if (d.playerName) {
        placed.dataset.playerName = d.playerName;
        const nameEl = placed.querySelector('.player-name');
        if (nameEl) { nameEl.textContent = d.playerName; nameEl.style.display = ''; nameEl.setAttribute('fill', d.nameColor); }
      }
      placed.dataset.nameSize = d.nameSize;
      placed.dataset.scale = d.scale;
      if (d.arms === '1') {
        placed.dataset.arms = '1';
        placed.dataset.rotation = d.rotation || '0';
        updatePlayerArms(placed);
        applyTransform(placed);
      }
    }
  } else if (d.type === 'referee') {
    placed = addReferee(x, y, d.label, d.fillColor, d.borderColor);
    if (placed) placed.dataset.scale = d.scale;
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
      const line = placed.querySelector('.arrow-line');
      if (line && d.color) {
        line.setAttribute('stroke', d.color);
        if (d.dash) line.setAttribute('stroke-dasharray', d.dash);
        else line.removeAttribute('stroke-dasharray');
        if (d.marker) line.setAttribute('marker-end', d.marker);
        line.setAttribute('stroke-width', d.width);
      }
      placed.dataset.arrowWidth = d.width;
      if (d.curve && d.curve !== '0') {
        placed.dataset.curve = d.curve;
        updateArrowVisual(placed);
      }
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
  } else if (d.type === 'headline') {
    placed = addHeadline(x, y, d.hlTitle, d.hlBody);
    if (placed) {
      placed.dataset.hlBarColor = d.hlBarColor;
      placed.dataset.hlTitleSize = d.hlTitleSize;
      placed.dataset.hlBodySize = d.hlBodySize;
      placed.dataset.hlTextColor = d.hlTextColor;
      placed.dataset.hlBg = d.hlBg;
      placed.dataset.hw = d.hw; placed.dataset.hh = d.hh;
      placed.dataset.rotation = d.rotation;
      rewrapHeadline(placed);
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
      placed.dataset.visionStyle = d.visionStyle || 'pointed';
      if (d.visionBorder) placed.dataset.visionBorder = d.visionBorder;
      if (d.visionOpacity) placed.dataset.visionOpacity = d.visionOpacity;
      const shape = placed.querySelector('.vision-shape');
      if (shape) {
        shape.setAttribute('fill', d.visionColor);
        if (d.visionBorder) { shape.setAttribute('stroke', d.visionBorder); placed.dataset.savedStroke = d.visionBorder; }
        if (d.visionOpacity) shape.setAttribute('opacity', d.visionOpacity);
      }
      updateVisionPolygon(placed);
    }
  } else if (d.type === 'tag') {
    placed = addTag(x, y, d.tagLabel, d.tagValue);
    if (placed) {
      placed.dataset.tagLabelColor = d.tagLabelColor;
      placed.dataset.tagValueColor = d.tagValueColor;
      placed.dataset.tagLineColor = d.tagLineColor;
      placed.dataset.tagLineDash = d.tagLineDash;
      placed.dataset.tagLineLen = d.tagLineLen;
      placed.dataset.tagLineAngle = d.tagLineAngle;
      placed.dataset.tagTextAnchor = d.tagTextAnchor;
      placed.dataset.scale = d.scale;
      repositionTag(placed);
    }
  } else if (d.type === 'link') {
    // Only paste link if both players still exist
    if (document.getElementById(d.player1) && document.getElementById(d.player2)) {
      placed = addLink(d.player1, d.player2, { color: d.linkColor, style: d.linkStyle });
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
  }
  return placed;
}

// ─── Keyboard Shortcuts ───────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  const typing = document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA');
  if (e.key === 'Escape') { if (typing) document.activeElement.blur(); else { setTool('select'); deselect(); } }
  if ((e.key === 'Delete' || e.key === 'Backspace') && (S.selectedEl || S.selectedEls.size > 0) && !typing) deleteSelected();

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
  if (e.key === 'z') setTool('shadow-rect');
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

// ─── Save Menu & Analysis Management ────────────────────────────────────────
function toggleSaveMenu() {
  const menu = document.getElementById('save-menu');
  const btn = document.getElementById('topbar-export-btn') || document.querySelector('.save-btn');
  if (menu.style.display === 'none') {
    // Show/hide animation export items based on whether steps exist
    const hasAnim = typeof frames !== 'undefined' && frames.length >= 2;
    menu.querySelectorAll('.save-menu-anim').forEach(el => {
      el.style.display = hasAnim ? '' : 'none';
    });
    // On mobile, move menu to body so it escapes toolbar overflow
    const isMobile = window.innerWidth <= 768;
    if (isMobile && menu.parentElement !== document.body) {
      document.body.appendChild(menu);
    }
    menu.style.display = 'block';
    // Position relative to save button
    const rect = btn.getBoundingClientRect();
    const isTopHalf = rect.top < window.innerHeight / 2;
    if (isMobile) {
      menu.style.left = rect.left + 'px';
      menu.style.bottom = (window.innerHeight - rect.top + 12) + 'px';
      menu.style.top = 'auto';
      menu.style.right = 'auto';
    } else if (isTopHalf) {
      // Top-right CTA: open downward, right-aligned to the button
      menu.style.right = Math.max(8, window.innerWidth - rect.right) + 'px';
      menu.style.top = (rect.bottom + 8) + 'px';
      menu.style.left = 'auto';
      menu.style.bottom = 'auto';
    } else {
      // Legacy (bottom-of-sidebar): open to the right
      menu.style.left = (rect.right + 8) + 'px';
      menu.style.bottom = Math.max(8, window.innerHeight - rect.bottom) + 'px';
      menu.style.top = 'auto';
      menu.style.right = 'auto';
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

async function openSaveAnalysis() {
  closeSaveMenu();
  const modal = document.getElementById('save-analysis-modal');
  const input = document.getElementById('save-analysis-name');
  const headerInput = document.getElementById('analysis-name-input');
  // Pre-fill with current name if editing existing, or header name for new
  const currentId = getCurrentId();
  if (currentId) {
    const analyses = await listAnalyses();
    const current = analyses.find(a => a.id === currentId);
    if (current) input.value = current.name;
    else input.value = headerInput ? headerInput.value.trim() : '';
  } else {
    const headerName = headerInput ? headerInput.value.trim() : '';
    input.value = (headerName && headerName !== 'New analysis') ? headerName : '';
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
  showNotification('Analysis saved', 'success', 3000);
  await updateCurrentBar();
  const u = getCurrentUser();
  if (u) logAction(u.uid, u.email, 'save').catch(() => {});
}
window.confirmSaveAnalysis = confirmSaveAnalysis;

// showSaveToast removed — all notifications now use showNotification()

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

// ─── Reusable Feature Announcement Tooltip ──────────────────────────────────
// Usage: showFeatureAnnounce({ id, anchorEl, img, title, text, cta })
//   id:       unique string — shown only once per user via localStorage
//   anchorEl: DOM element to point at (tooltip appears to its right)
//   img:      image URL or data URI for the header visual
//   title:    headline string
//   text:     description string
//   cta:      button label (default "Got it")
//   onCta:    optional callback when CTA is clicked
//   position: 'right' (default) or 'above' — where tooltip appears relative to anchor
//   skipCheck: if true, skip the localStorage "already seen" check (for chained tooltips)
let _activeAnnounce = null;
function showFeatureAnnounce({ id, anchorEl, img, title, text, cta = 'Got it', onCta, position = 'right', skipCheck = false, maxShows = 1 }) {
  const key = 'tactica_announce_' + id;
  if (!skipCheck) {
    const seen = parseInt(localStorage.getItem(key) || '0', 10);
    if (seen >= maxShows) return; // already seen enough times
  }

  // Close any existing announcement
  if (_activeAnnounce) { _activeAnnounce.remove(); _activeAnnounce = null; }

  const el = document.createElement('div');
  el.className = 'feature-announce';

  let imgHTML = '';
  if (img) imgHTML = `<img class="feature-announce-img" src="${img}" alt="">`;

  el.innerHTML = `
    <button class="feature-announce-close" aria-label="Close">&times;</button>
    ${imgHTML}
    <div class="feature-announce-body">
      <div class="feature-announce-badge">New</div>
      <div class="feature-announce-title">${title}</div>
      <div class="feature-announce-text">${text}</div>
      <button class="feature-announce-cta">${cta}</button>
    </div>
  `;

  document.body.appendChild(el);
  _activeAnnounce = el;

  // Position relative to the anchor element
  function positionTooltip() {
    if (!anchorEl || !el.parentNode) return;
    const rect = anchorEl.getBoundingClientRect();
    const tooltipH = el.offsetHeight;
    const tooltipW = el.offsetWidth;

    if (position === 'above') {
      // Position above the anchor, arrow points down
      el.classList.add('feature-announce--above');
      let left = rect.left + rect.width / 2 - tooltipW / 2;
      if (left < 12) left = 12;
      if (left + tooltipW > window.innerWidth - 12) left = window.innerWidth - tooltipW - 12;
      el.style.left = left + 'px';
      el.style.top = (rect.top - tooltipH - 14) + 'px';
    } else if (position === 'below') {
      // Position below the anchor, arrow points up
      el.classList.add('feature-announce--below');
      let left = rect.left + rect.width / 2 - tooltipW / 2;
      if (left < 12) left = 12;
      if (left + tooltipW > window.innerWidth - 12) left = window.innerWidth - tooltipW - 12;
      el.style.left = left + 'px';
      el.style.top = (rect.bottom + 14) + 'px';
    } else {
      // Position to the right, arrow points left
      let top = rect.top + rect.height / 2 - 28;
      if (top + tooltipH > window.innerHeight - 12) top = window.innerHeight - tooltipH - 12;
      if (top < 12) top = 12;
      el.style.left = (rect.right + 14) + 'px';
      el.style.top = top + 'px';
    }
  }
  positionTooltip();

  // Track announcement shown
  if (typeof window.gtag === 'function') window.gtag('event', 'feature_announce_shown', { feature_id: id });
  const au = getCurrentUser();
  if (au) logAction(au.uid, au.email, 'feature_announce_shown', { feature: id }).catch(() => {});

  function dismiss(action) {
    const prev = parseInt(localStorage.getItem(key) || '0', 10);
    localStorage.setItem(key, String(prev + 1));
    if (anchorEl) anchorEl.classList.remove('announce-highlight');
    if (typeof window.gtag === 'function') window.gtag('event', 'feature_announce_' + action, { feature_id: id });
    const du = getCurrentUser();
    if (du) logAction(du.uid, du.email, 'feature_announce_' + action, { feature: id }).catch(() => {});
    el.style.transition = 'opacity 0.2s, transform 0.2s';
    el.style.opacity = '0';
    el.style.transform = 'translateY(4px) scale(0.97)';
    setTimeout(() => { el.remove(); _activeAnnounce = null; }, 200);
  }

  el.querySelector('.feature-announce-close').addEventListener('click', () => dismiss('dismissed'));
  el.querySelector('.feature-announce-cta').addEventListener('click', () => {
    if (onCta) onCta();
    dismiss('cta_clicked');
  });
}
window.showFeatureAnnounce = showFeatureAnnounce;

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

// Track which folders are expanded (persists within session)
const _expandedFolders = new Set();

// Cache folders for card rendering (set during renderAnalysesGrid)
let _cachedFolders = [];

function renderAnalysisCard(a, currentId) {
  const inFolder = !!a.folderId;
  const safeName = a.name.replace(/'/g, "\\'");
  return `
    <div class="analysis-card${a.id === currentId ? ' current' : ''}" data-id="${a.id}" draggable="true" onclick="loadAnalysisFromCard('${a.id}')">
      <div class="analysis-card-thumb">
        ${a.thumbnail ? `<img src="${a.thumbnail}" alt="${a.name}">` : '<span class="no-thumb">No preview</span>'}
        <div class="analysis-card-actions">
          <button class="analysis-card-action" onclick="event.stopPropagation();toggleMoveMenu('${a.id}')" title="Move to folder">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1.5 3.5A1.5 1.5 0 013 2h2.382a1 1 0 01.894.553L6.882 4H11A1.5 1.5 0 0112.5 5.5v5A1.5 1.5 0 0111 12H3A1.5 1.5 0 011.5 10.5v-7z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>${inFolder ? '<path d="M7 6v4M5 8h4" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" transform="rotate(45 7 8)"/>' : '<path d="M7 6v4M5 8h4" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>'}</svg>
          </button>
          <button class="analysis-card-action" onclick="event.stopPropagation();duplicateFromCard('${a.id}')" title="Duplicate">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="4" y="4" width="8" height="8" rx="1" stroke="currentColor" stroke-width="1.2"/><path d="M10 4V3a1 1 0 00-1-1H3a1 1 0 00-1 1v6a1 1 0 001 1h1" stroke="currentColor" stroke-width="1.2"/></svg>
          </button>
          <button class="analysis-card-action delete" onclick="event.stopPropagation();askDeleteAnalysis('${a.id}','${safeName}')" title="Delete">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2.5 4h9M5 4V2.5h4V4M3.5 4v7.5a1 1 0 001 1h5a1 1 0 001-1V4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
        </div>
      </div>
      <div class="analysis-card-info">
        <div class="analysis-card-name" title="${a.name}">${a.name}</div>
        <div class="analysis-card-meta">
          <span class="analysis-card-date">${formatDate(a.updatedAt)}</span>
        </div>
      </div>
    </div>`;
}

function toggleMoveMenu(analysisId) {
  // Close any existing menu
  const existing = document.querySelector('.move-menu');
  if (existing) { existing.remove(); return; }

  const card = document.querySelector(`.analysis-card[data-id="${analysisId}"]`);
  if (!card) return;
  const btn = card.querySelector('.analysis-card-action');
  const rect = btn.getBoundingClientRect();

  // Find current folderId for this analysis
  const analyses = JSON.parse(localStorage.getItem('tactica_analyses') || '[]');
  const analysis = analyses.find(a => a.id === analysisId);
  const currentFolderId = analysis?.folderId || null;

  let menuHtml = '<div class="move-menu-title">Move to</div>';
  // Unfiled option
  menuHtml += `<button class="move-menu-item${!currentFolderId ? ' active' : ''}" onclick="event.stopPropagation();doMoveAnalysis('${analysisId}', null)">
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><rect x="1" y="1" width="10" height="10" rx="2" stroke="currentColor" stroke-width="1" stroke-dasharray="2 2"/></svg>
    Unfiled
  </button>`;
  // Folder options
  for (const f of _cachedFolders) {
    menuHtml += `<button class="move-menu-item${currentFolderId === f.id ? ' active' : ''}" onclick="event.stopPropagation();doMoveAnalysis('${analysisId}', '${f.id}')">
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M1.5 3A1 1 0 012.5 2h1.764a.75.75 0 01.67.415L5.382 3.5H9.5a1 1 0 011 1v4a1 1 0 01-1 1h-7a1 1 0 01-1-1V3z" stroke="currentColor" stroke-width="1"/></svg>
      ${f.name}
    </button>`;
  }

  const menu = document.createElement('div');
  menu.className = 'move-menu';
  menu.innerHTML = menuHtml;
  document.body.appendChild(menu);

  // Position near button
  const mw = 180;
  let left = rect.left - mw + rect.width;
  let top = rect.bottom + 4;
  if (left < 8) left = 8;
  if (top + 200 > window.innerHeight) top = rect.top - 200;
  menu.style.left = left + 'px';
  menu.style.top = top + 'px';

  // Close on click outside
  setTimeout(() => {
    const close = (e) => { if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('click', close); } };
    document.addEventListener('click', close);
  }, 10);
}
window.toggleMoveMenu = toggleMoveMenu;

async function doMoveAnalysis(analysisId, folderId) {
  document.querySelector('.move-menu')?.remove();
  await moveAnalysisToFolder(analysisId, folderId);
  if (folderId) _expandedFolders.add(folderId);
  await renderAnalysesGrid();
}
window.doMoveAnalysis = doMoveAnalysis;

async function renderAnalysesGrid() {
  const grid = document.getElementById('analyses-grid');
  const emptyState = document.getElementById('analyses-empty');
  const countBadge = document.getElementById('analyses-count');
  const [analyses, folders] = await Promise.all([listAnalyses(), listFolders()]);
  _cachedFolders = folders;

  countBadge.textContent = analyses.length + (analyses.length === 1 ? ' analysis' : ' analyses');

  if (analyses.length === 0 && folders.length === 0) {
    grid.style.display = 'none';
    emptyState.style.display = 'flex';
    return;
  }

  grid.style.display = 'block';
  emptyState.style.display = 'none';
  const currentId = getCurrentId();

  // Group analyses by folder
  const foldered = {};
  const unfiled = [];
  for (const a of analyses) {
    if (a.folderId && folders.some(f => f.id === a.folderId)) {
      (foldered[a.folderId] = foldered[a.folderId] || []).push(a);
    } else {
      unfiled.push(a);
    }
  }

  let html = '';

  // Render folders
  for (const folder of folders) {
    const items = foldered[folder.id] || [];
    const isOpen = _expandedFolders.has(folder.id);
    html += `
      <div class="folder-section" data-folder-id="${folder.id}">
        <div class="folder-header" onclick="toggleFolder('${folder.id}')" data-folder-drop="${folder.id}">
          <div class="folder-header-left">
            <svg class="folder-chevron${isOpen ? ' open' : ''}" width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M4 2.5l4 3.5-4 3.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
            <svg class="folder-icon" width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2.5 4A1.5 1.5 0 014 2.5h2.382a1 1 0 01.894.553L7.882 4.5H12A1.5 1.5 0 0113.5 6v5.5A1.5 1.5 0 0112 13H4A1.5 1.5 0 012.5 11.5V4z" stroke="currentColor" stroke-width="1.1" fill="${isOpen ? 'rgba(30,215,96,0.15)' : 'none'}"/></svg>
            <span class="folder-name" id="folder-name-${folder.id}">${folder.name}</span>
            <span class="folder-count">${items.length}</span>
          </div>
          <div class="folder-actions">
            <button class="folder-action-btn" onclick="event.stopPropagation();startRenameFolder('${folder.id}')" title="Rename">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M8.5 1.5l2 2M1 11l.5-2L8.793 1.707a1 1 0 011.414 0l.586.586a1 1 0 010 1.414L3.5 10.5 1 11z" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
            <button class="folder-action-btn delete" onclick="event.stopPropagation();askDeleteFolder('${folder.id}','${folder.name.replace(/'/g, "\\'")}')" title="Delete folder">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 3.5h8M4.5 3.5V2h3v1.5M3 3.5v6a1 1 0 001 1h4a1 1 0 001-1v-6" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
          </div>
        </div>
        ${isOpen ? `<div class="folder-body" data-folder-drop="${folder.id}"><div class="folder-grid">${items.length > 0 ? items.map(a => renderAnalysisCard(a, currentId)).join('') : '<div class="folder-empty">Drag analyses here or use the folder icon on a card</div>'}</div></div>` : ''}
      </div>`;
  }

  // Render unfiled analyses
  if (unfiled.length > 0) {
    if (folders.length > 0) {
      html += '<div class="unfiled-divider" data-folder-drop="unfiled"><span>Unfiled</span></div>';
    }
    html += `<div class="analyses-card-grid" data-folder-drop="unfiled">${unfiled.map(a => renderAnalysisCard(a, currentId)).join('')}</div>`;
  }

  grid.innerHTML = html;

  // Attach drag-and-drop listeners
  initDragAndDrop();
}

function toggleFolder(folderId) {
  if (_expandedFolders.has(folderId)) _expandedFolders.delete(folderId);
  else _expandedFolders.add(folderId);
  renderAnalysesGrid();
}
window.toggleFolder = toggleFolder;

// ─── Folder CRUD from UI ─────────────────────────────────────────────────────
async function createNewFolder() {
  const name = 'New Folder';
  const folder = await createFolder(name);
  _expandedFolders.add(folder.id);
  await renderAnalysesGrid();
  // Auto-start rename
  startRenameFolder(folder.id);
}
window.createNewFolder = createNewFolder;

function startRenameFolder(folderId) {
  const nameEl = document.getElementById('folder-name-' + folderId);
  if (!nameEl) return;
  const current = nameEl.textContent;
  nameEl.innerHTML = `<input type="text" class="folder-rename-input" value="${current}" maxlength="40" />`;
  const input = nameEl.querySelector('input');
  input.focus();
  input.select();

  const finish = async () => {
    const newName = input.value.trim();
    if (newName && newName !== current) {
      await renameFolder(folderId, newName);
    }
    await renderAnalysesGrid();
  };

  input.addEventListener('blur', finish);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
    if (e.key === 'Escape') { input.value = current; input.blur(); }
  });
  // Prevent folder toggle when clicking input
  input.addEventListener('click', e => e.stopPropagation());
}
window.startRenameFolder = startRenameFolder;

async function askDeleteFolder(folderId, name) {
  const result = await showConfirmModal({
    icon: 'trash',
    title: 'Delete Folder?',
    desc: `Delete "${name}"? Analyses inside will be moved to unfiled.`,
    confirmLabel: 'Delete',
    confirmClass: 'danger',
  });
  if (result && result.confirmed) {
    await deleteFolder(folderId);
    _expandedFolders.delete(folderId);
    await renderAnalysesGrid();
    showNotification('Folder deleted', 'info', 3000);
  }
}
window.askDeleteFolder = askDeleteFolder;

// ─── Drag and Drop ──────────────────────────────────────────────────────────
function initDragAndDrop() {
  const grid = document.getElementById('analyses-grid');

  // Make cards draggable
  grid.querySelectorAll('.analysis-card[draggable]').forEach(card => {
    card.addEventListener('dragstart', e => {
      e.dataTransfer.setData('text/plain', card.dataset.id);
      e.dataTransfer.effectAllowed = 'move';
      card.classList.add('dragging');
      // Show all drop targets
      grid.classList.add('drag-active');
    });
    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
      grid.classList.remove('drag-active');
      grid.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
    });
  });

  // All elements with data-folder-drop are drop targets (folder headers, folder bodies, unfiled area)
  grid.querySelectorAll('[data-folder-drop]').forEach(target => {
    target.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      // Highlight the closest visual target (header or unfiled divider)
      const header = target.closest('.folder-section')?.querySelector('.folder-header') || target;
      header.classList.add('drag-over');
    });
    target.addEventListener('dragleave', e => {
      if (!target.contains(e.relatedTarget)) {
        const header = target.closest('.folder-section')?.querySelector('.folder-header') || target;
        header.classList.remove('drag-over');
      }
    });
    target.addEventListener('drop', async e => {
      e.preventDefault();
      e.stopPropagation();
      grid.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
      grid.classList.remove('drag-active');
      const analysisId = e.dataTransfer.getData('text/plain');
      const folderId = target.dataset.folderDrop;
      if (!analysisId) return;
      await moveAnalysisToFolder(analysisId, folderId === 'unfiled' ? null : folderId);
      if (folderId !== 'unfiled') _expandedFolders.add(folderId);
      await renderAnalysesGrid();
    });
  });
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
      // Free net-zones (image mode) are draggable; player-anchored net-zones are not
      const isFreeZone = g.dataset.type === 'net-zone' && g.dataset.freeZone === 'true';
      if (g.dataset.type !== 'link' && (g.dataset.type !== 'net-zone' || isFreeZone)) makeDraggable(g);
      g.addEventListener('click', e => { if (S.tool === 'select') { e.stopPropagation(); select(g, { additive: e.ctrlKey || e.metaKey }); } });
      if (g.dataset.type === 'textbox') {
        g.addEventListener('dblclick', e => {
          e.stopPropagation();
          try { import('./elements.js').then(m => m.openTextBoxEditFn?.(g)); } catch(err) {}
        });
      }
      // Shadow zones: dblclick to edit label
      if (g.dataset.type?.startsWith('shadow')) {
        g.addEventListener('dblclick', e => {
          e.stopPropagation(); select(g);
          setTimeout(() => { const inp = document.getElementById('zone-label-input'); if (inp) { inp.focus(); inp.select(); } }, 50);
        });
      }
      // Net-zone: mousedown selects group + starts drag via synthetic event
      if (g.dataset.type === 'net-zone') {
        g.addEventListener('mousedown', e => {
          if (S.tool !== 'select') return;
          e.stopPropagation(); e.preventDefault();
          // Select all referenced players
          const pids = g.dataset.players.split(',').filter(Boolean);
          let first = true;
          for (const pid of pids) {
            const pEl = document.getElementById(pid);
            if (!pEl) continue;
            if (first) { select(pEl, { additive: false }); first = false; }
            else select(pEl, { additive: true });
          }
          // Dispatch synthetic mousedown on first player for drag
          const p1 = document.getElementById(pids[0]);
          if (p1) {
            const synth = new MouseEvent('mousedown', {
              bubbles: false, clientX: e.clientX, clientY: e.clientY,
              ctrlKey: e.ctrlKey, metaKey: e.metaKey
            });
            p1.dispatchEvent(synth);
          }
        });
      }
    });
  });
  // Refresh link positions after loading
  updateAllLinks();
}

async function duplicateFromCard(id) {
  const copy = await duplicateAnalysis(id);
  if (copy) {
    await renderAnalysesGrid();
    showNotification('Duplicated', 'success', 3000);
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
  S.playerCounts.joker = 0;
  S.setObjectCounter(0);
  S.undoStack.length = 0;
  closeMyAnalyses();
  updateCurrentBar();
  showNotification('New analysis', 'info', 3000);
}
window.newAnalysisFromDashboard = newAnalysisFromDashboard;

// ─── Current Analysis Bar ────────────────────────────────────────────────────
async function updateCurrentBar() {
  const bar = document.getElementById('current-analysis-bar');
  if (!bar) return;
  const input = document.getElementById('analysis-name-input');
  const currentId = getCurrentId();
  if (currentId) {
    const analyses = await listAnalyses();
    const current = analyses.find(a => a.id === currentId);
    if (current) {
      if (input) {
        input.value = current.name;
        input.style.width = Math.min(Math.max(input.value.length * 7 + 24, 80), 200) + 'px';
      }
      bar.classList.add('show');
      return;
    }
  }
  // Only show name field for saved analyses — hide for fresh/unsaved sessions
  bar.classList.remove('show');
}

// Initialize bar on load
updateCurrentBar();

// ─── Editable analysis name in header ───────────────────────────────────────
(() => {
  const input = document.getElementById('analysis-name-input');
  if (!input) return;
  let originalValue = '';

  input.addEventListener('click', () => {
    originalValue = input.value;
    input.removeAttribute('readonly');
    input.focus();
    input.select();
    // Track click on analysis name
    const u = getCurrentUser();
    if (u) logAction(u.uid, u.email, 'feature_rename_analysis', { trigger: 'click' }).catch(() => {});
  });

  input.addEventListener('blur', async () => {
    input.setAttribute('readonly', '');
    const newName = input.value.trim();
    // If empty or unchanged, revert to original value
    if (!newName || newName === originalValue) {
      input.value = originalValue;
      input.style.width = Math.min(Math.max(input.value.length * 7 + 24, 80), 200) + 'px';
      return;
    }
    const currentId = getCurrentId();
    if (currentId) {
      await renameAnalysis(currentId, newName);
      const u = getCurrentUser();
      if (u) logAction(u.uid, u.email, 'feature_rename_analysis', { trigger: 'rename', newName }).catch(() => {});
    }
  });

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
    if (e.key === 'Escape') { input.value = originalValue; input.blur(); }
  });

  input.addEventListener('input', () => {
    input.style.width = Math.min(Math.max(input.value.length * 8.5 + 24, 120), 400) + 'px';
  });
})();

function showSaveReminder() {
  // Remove any existing reminder
  const old = document.getElementById('save-reminder-hint');
  if (old) old.remove();
  const hint = document.createElement('span');
  hint.id = 'save-reminder-hint';
  hint.textContent = 'Remember to save!';
  hint.style.cssText = 'font-size:11px;color:#888;margin-left:10px;opacity:1;transition:opacity 0.5s;white-space:nowrap;';
  const bar = document.getElementById('current-analysis-bar');
  if (bar) bar.appendChild(hint);
  // Fade out after 3s then remove
  setTimeout(() => { hint.style.opacity = '0'; }, 3000);
  setTimeout(() => { hint.remove(); }, 3500);
}

// ─── Auto-save on Cmd+S ──────────────────────────────────────────────────────
document.addEventListener('keydown', async e => {
  if ((e.metaKey || e.ctrlKey) && e.key === 's') {
    e.preventDefault();
    const saved = await quickSave();
    if (saved) {
      showNotification('Auto-saved', 'success', 2000);
      const u = getCurrentUser();
      if (u) logAction(u.uid, u.email, 'save').catch(() => {});
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
  const toggle = document.getElementById('mobile-panel-toggle');
  const isOpen = panel.classList.toggle('open');
  if (backdrop) backdrop.classList.toggle('show', isOpen);
  if (toggle) toggle.classList.toggle('hidden', isOpen);
}
window.toggleMobilePanel = toggleMobilePanel;

// ─── Mobile: auto-switch to vertical pitch for better fit ─────────────────────
if (window.innerWidth <= 768 && S.currentPitchLayout === 'full-h' && S.appMode !== 'image') {
  setPitch('full-v');
} else if (S.appMode !== 'image') {
  rebuildPitch();  // ensure initial pitch matches rebuildPitch output (no size jump on first toggle)
}

// ─── Mobile Hint Modal ──────────────────────────────────────────────────────
function showMobileHint() {
  const overlay = document.createElement('div');
  overlay.className = 'mobile-hint-overlay';
  overlay.innerHTML = `
    <div class="mobile-hint-modal">
      <div class="mobile-hint-icon">🖥️</div>
      <h2>Best on Desktop</h2>
      <p>Táctica is optimised for desktop screens. For the best experience, open it on a computer :)</p>
      <button class="mobile-hint-btn" onclick="this.closest('.mobile-hint-overlay').remove()">Understood!</button>
    </div>`;
  document.body.appendChild(overlay);
}

function showDesktopWelcome() {
  const overlay = document.createElement('div');
  overlay.className = 'mobile-hint-overlay';
  overlay.innerHTML = `
    <div class="mobile-hint-modal">
      <div class="mobile-hint-icon">⚽</div>
      <h2>Welcome to Táctica!</h2>
      <p>Thanks for trying the beta! The product is still in early development, so you may encounter some bugs along the way.</p>
      <p style="margin-top:8px;opacity:0.7;font-size:12px;">I'd love to hear what you think — use the <strong>Feedback</strong> button to tell me what I should build next :)</p>
      <button class="mobile-hint-btn" onclick="this.closest('.mobile-hint-overlay').remove()">Let's go!</button>
    </div>`;
  document.body.appendChild(overlay);
}

// ─── Sharing ────────────────────────────────────────────────────────────────
let _pendingShareId = null;
let _sharedData = null;

function getShareIdFromHash() {
  const match = window.location.hash.match(/^#\/s\/(.+)$/);
  return match ? match[1] : null;
}

// Check for share link on page load
_pendingShareId = getShareIdFromHash();
if (_pendingShareId) {
  sessionStorage.setItem('tactica_share_ref', _pendingShareId);
}

async function enterSharedView(shareId) {
  const banner = document.getElementById('share-banner');
  const gate = document.getElementById('landing-gate');
  try {
    _sharedData = await loadSharedAnalysis(shareId);
    if (!_sharedData) {
      if (gate) gate.style.display = 'flex';
      showNotification('This shared analysis no longer exists.', 'error', 5000);
      history.replaceState(null, '', window.location.pathname);
      _pendingShareId = null;
      return;
    }
    // Hide landing gate, show share banner
    if (gate) gate.style.display = 'none';
    document.body.classList.add('shared-view');
    // Render the pitch from shared data
    renderSharedPitch(_sharedData.data);
    // Show banner
    if (banner) {
      const textEl = document.getElementById('share-banner-text');
      const creatorName = _sharedData.creatorName;
      if (textEl) textEl.textContent = creatorName
        ? `Shared by ${creatorName}`
        : 'Shared analysis';
      banner.style.display = 'block';
    }
    // Track view
    try {
      const u = getCurrentUser();
      logAction(u ? u.uid : 'anon', u ? u.email : '', 'share_viewed', {
        shareId, creatorUid: _sharedData.creatorUid, authenticated: !!u
      }).catch(() => {});
    } catch (e) { /* anon tracking may fail without auth, that's ok */ }
  } catch (e) {
    console.warn('Failed to load shared analysis:', e);
    history.replaceState(null, '', window.location.pathname);
    _pendingShareId = null;
    if (gate) gate.style.display = 'flex';
    showNotification('Could not load shared analysis. Please try again.', 'error', 5000);
  }
}

function renderSharedPitch(data) {
  if (!data) return;
  // Use the same restore logic as loadAnalysis in storage.js
  import('./pitch.js').then(({ setPitch }) => {
    setPitch(data.pitchLayout || 'full-h');
    if (data.pitchColors) {
      S.pitchColors.s1 = data.pitchColors.s1;
      S.pitchColors.s2 = data.pitchColors.s2;
      S.pitchColors.line = data.pitchColors.line;
    }
    import('./pitch.js').then(({ rebuildPitch }) => rebuildPitch());
  });
  if (data.teamColors) {
    S.teamColors.a = data.teamColors.a;
    S.teamColors.b = data.teamColors.b;
    S.teamColors.joker = data.teamColors.joker;
  }
  if (data.gkColors) {
    S.gkColors.a = data.gkColors.a;
    S.gkColors.b = data.gkColors.b;
    S.gkColors.joker = data.gkColors.joker;
  }
  // Fix url() references
  const fixUrls = html => (html || '').replace(/url\(["']?[^)]*?(#[\w-]+)["']?\)/g, 'url($1)');
  // Strip baked-in trail lines and fix url() references
  const stripTrails = html => html.replace(/<g id="step-trails"[\s\S]*?<\/g>/g, '');
  S.objectsLayer.innerHTML = stripTrails(fixUrls(data.objectsHTML || ''));
  S.playersLayer.innerHTML = fixUrls(data.playersHTML || '');
  if (data.playerCounts) {
    S.playerCounts.a = data.playerCounts.a || 0;
    S.playerCounts.b = data.playerCounts.b || 0;
    S.playerCounts.joker = data.playerCounts.joker || 0;
  }
  // Do NOT call makeDraggable — keep it read-only

  // Restore animation frames if present
  if (data.frames && data.frames.length >= 2) {
    frames = data.frames.map(f => ({
      positions: f.positions,
      elementIds: new Set(f.elementIds),
    }));
    currentFrame = data.currentFrame || 0;
    applyFrame(0);
    // Hide trail lines in shared view — viewers just see the play animation
    if (trailsGroup) { trailsGroup.remove(); trailsGroup = null; }
    // Show play button overlay on the pitch
    const container = document.getElementById('pitch-container');
    if (container) {
      const playOverlay = document.createElement('button');
      playOverlay.id = 'shared-play-btn';
      playOverlay.className = 'shared-play-btn';
      playOverlay.innerHTML = '<svg width="18" height="18" viewBox="0 0 12 12" fill="none"><polygon points="2,1 11,6 2,11" fill="currentColor"/></svg> Play';
      playOverlay.onclick = () => {
        playOverlay.style.display = 'none';
        // Temporarily allow pointer events for animation
        const pitch = document.getElementById('pitch');
        if (pitch) pitch.style.pointerEvents = 'auto';
        playAllSteps();
        // Re-show button and disable pointer events after animation
        const checkDone = setInterval(() => {
          if (!animationRunning) {
            clearInterval(checkDone);
            playOverlay.style.display = '';
            if (pitch) pitch.style.pointerEvents = 'none';
            // Remove trails after animation ends in shared view
            if (trailsGroup) { trailsGroup.remove(); trailsGroup = null; }
            applyFrame(0);
          }
        }, 200);
      };
      container.appendChild(playOverlay);
    }
  }
}

function updateShareBannerAuth(isLoggedIn) {
  const signupBtn = document.getElementById('share-banner-signup-btn');
  const signinBtn = document.getElementById('share-banner-signin-btn');
  const copyBtn = document.getElementById('share-banner-copy-btn');
  if (isLoggedIn) {
    if (signupBtn) signupBtn.style.display = 'none';
    if (signinBtn) signinBtn.style.display = 'none';
    if (copyBtn) copyBtn.style.display = 'flex';
  } else {
    if (signupBtn) signupBtn.style.display = '';
    if (signinBtn) signinBtn.style.display = '';
    if (copyBtn) copyBtn.style.display = 'none';
  }
}

async function forkSharedAnalysis() {
  if (!_sharedData) return;
  const u = getCurrentUser();
  if (!u) { openAuthModal('signup'); return; }
  const newId = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const newName = (_sharedData.name || 'Shared Analysis') + ' (copy)';
  // Pitch is already rendered with shared data, so captureState() will capture it
  await saveAnalysis(newName);
  // Track fork
  logAction(u.uid, u.email, 'share_forked', {
    shareId: _pendingShareId, newAnalysisId: getCurrentId()
  }).catch(() => {});
  // Exit shared view
  document.body.classList.remove('shared-view');
  document.getElementById('share-banner').style.display = 'none';
  history.replaceState(null, '', window.location.pathname);
  _pendingShareId = null;
  _sharedData = null;
  // Reload into normal editor
  location.reload();
}
window.forkSharedAnalysis = forkSharedAnalysis;

function showConfirmModal({ icon, title, desc, confirmLabel, confirmClass, checkbox }) {
  return new Promise(resolve => {
    const modal = document.getElementById('tactica-confirm-modal');
    const iconEl = document.getElementById('confirm-modal-icon');
    iconEl.innerHTML = icon || '';
    iconEl.className = 'share-modal-icon' + (confirmClass === 'danger' ? ' danger' : '');
    document.getElementById('confirm-modal-title').textContent = title || 'Confirm';
    document.getElementById('confirm-modal-desc').textContent = desc || '';
    const okBtn = document.getElementById('confirm-modal-ok');
    okBtn.innerHTML = confirmLabel || 'OK';
    okBtn.className = 'share-modal-btn confirm' + (confirmClass === 'danger' ? ' danger' : '');
    // Optional checkbox with name input
    const extraEl = document.getElementById('confirm-modal-extra');
    if (extraEl) extraEl.remove();
    let checkboxEl = null;
    let nameInput = null;
    if (checkbox) {
      const wrap = document.createElement('div');
      wrap.id = 'confirm-modal-extra';
      wrap.className = 'confirm-modal-extra-wrap';
      // Checkbox row
      const labelRow = document.createElement('label');
      labelRow.className = 'confirm-modal-checkbox';
      checkboxEl = document.createElement('input');
      checkboxEl.type = 'checkbox';
      checkboxEl.checked = checkbox.checked !== false;
      const span = document.createElement('span');
      span.textContent = checkbox.label;
      labelRow.appendChild(checkboxEl);
      labelRow.appendChild(span);
      wrap.appendChild(labelRow);
      // Name input (shown when checkbox is checked)
      if (checkbox.nameField) {
        nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.className = 'confirm-modal-name-input';
        nameInput.placeholder = 'Analysis name';
        nameInput.value = checkbox.nameField.value || '';
        nameInput.maxLength = 60;
        nameInput.style.display = checkboxEl.checked ? '' : 'none';
        wrap.appendChild(nameInput);
        checkboxEl.addEventListener('change', () => {
          nameInput.style.display = checkboxEl.checked ? '' : 'none';
          if (checkboxEl.checked) nameInput.focus();
        });
      }
      // Insert before actions
      const actions = modal.querySelector('.share-modal-actions');
      actions.parentElement.insertBefore(wrap, actions);
    }
    modal.style.display = 'flex';
    if (nameInput && checkboxEl?.checked) nameInput.focus();
    const cancel = document.getElementById('confirm-modal-cancel');
    function cleanup(result) {
      modal.style.display = 'none';
      okBtn.removeEventListener('click', onOk);
      cancel.removeEventListener('click', onCancel);
      modal.removeEventListener('click', onBackdrop);
      if (result && checkboxEl) {
        resolve({
          confirmed: true,
          checkboxChecked: checkboxEl.checked,
          name: nameInput ? nameInput.value.trim() : '',
        });
      } else {
        resolve(result ? { confirmed: true } : false);
      }
    }
    function onOk() { cleanup(true); }
    function onCancel() { cleanup(false); }
    function onBackdrop(e) { if (e.target === modal) cleanup(false); }
    okBtn.addEventListener('click', onOk);
    cancel.addEventListener('click', onCancel);
    modal.addEventListener('click', onBackdrop);
  });
}

async function shareAnalysis() {
  const u = getCurrentUser();
  if (!u) { showNotification('Sign in to share.', 'error', 3000); return; }
  const alreadySaved = !!getCurrentId();
  const result = await showConfirmModal({
    icon: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none"><circle cx="18" cy="5" r="3" stroke="#34D399" stroke-width="1.5"/><circle cx="6" cy="12" r="3" stroke="#34D399" stroke-width="1.5"/><circle cx="18" cy="19" r="3" stroke="#34D399" stroke-width="1.5"/><line x1="8.6" y1="13.5" x2="15.4" y2="17.5" stroke="#34D399" stroke-width="1.5"/><line x1="8.6" y1="10.5" x2="15.4" y2="6.5" stroke="#34D399" stroke-width="1.5"/></svg>',
    title: 'Share Analysis',
    desc: "This will create a public link. Anyone with the link can view this analysis — they'll need to sign up to make their own copy.",
    confirmLabel: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="18" cy="5" r="3" stroke="currentColor" stroke-width="1.5"/><circle cx="6" cy="12" r="3" stroke="currentColor" stroke-width="1.5"/><circle cx="18" cy="19" r="3" stroke="currentColor" stroke-width="1.5"/><line x1="8.6" y1="13.5" x2="15.4" y2="17.5" stroke="currentColor" stroke-width="1.5"/><line x1="8.6" y1="10.5" x2="15.4" y2="6.5" stroke="currentColor" stroke-width="1.5"/></svg> Share',
    checkbox: {
      label: 'Also save analysis to my account',
      checked: false,
      nameField: { value: document.getElementById('analysis-name-input')?.value || '' },
    },
  });
  if (!result) return;
  const shareId = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const currentId = getCurrentId();
  const state = captureState();
  const thumb = await generateThumbnail();
  const currentName = (result.checkboxChecked && result.name) ? result.name
    : document.getElementById('analysis-name-input')?.value || 'Untitled';
  // Update the name input if user typed a new name
  if (result.checkboxChecked && result.name) {
    const nameInput = document.getElementById('analysis-name-input');
    if (nameInput) nameInput.value = result.name;
  }
  try {
    await saveSharedAnalysis(shareId, {
      creatorUid: u.uid,
      creatorName: u.displayName || '',
      sourceAnalysisId: currentId || '',
      name: currentName,
      thumbnail: thumb,
      data: state,
    });
    // Auto-save if checkbox was checked
    if (result.checkboxChecked) {
      try { await saveAnalysis(currentName); } catch (e) { console.warn('Auto-save failed:', e); }
    }
    // Track
    logAction(u.uid, u.email, 'share_created', { analysisId: getCurrentId() || currentId, shareId, autoSaved: !!result.checkboxChecked }).catch(() => {});
    // Show modal with link
    const url = window.location.origin + window.location.pathname + '#/s/' + shareId;
    const input = document.getElementById('share-link-input');
    if (input) input.value = url;
    document.getElementById('share-modal').style.display = 'flex';
  } catch (e) {
    console.error('Share failed:', e);
    showNotification('Failed to create share link. Please try again.', 'error', 4000);
  }
}
window.shareAnalysis = shareAnalysis;

function copyShareLink() {
  const input = document.getElementById('share-link-input');
  if (!input) return;
  navigator.clipboard.writeText(input.value).then(() => {
    const btn = document.getElementById('share-copy-btn');
    if (btn) { btn.textContent = 'Copied!'; setTimeout(() => { btn.textContent = 'Copy Link'; }, 2000); }
  });
}
window.copyShareLink = copyShareLink;

// ─── Auth State Listener ────────────────────────────────────────────────────
let _authInitialized = false;
onAuthChange(async (user) => {
  // ─── Access Gate ─────────────────────────────────────────────────────────
  // Block specific emails and users in blocked regions.
  if (shouldBlockUser(user)) {
    const reason = isBlockedEmail(user) ? 'blocked_email' : 'region';
    showMaintenanceOverlay({ user, reason });
    return;
  }
  updateAuthUI(user);
  closeAuthModal();
  const gate = document.getElementById('landing-gate');

  // ─── Shared View Branch ────────────────────────────────────────────────────
  if (_pendingShareId) {
    // Always enter shared view (works with or without auth)
    await enterSharedView(_pendingShareId);
    updateShareBannerAuth(!!user);
    // If user just signed in while on shared view, track session
    if (user) {
      setSessionId(user.uid + '_' + Date.now());
      try { await logSession(user.uid, user.email, user.displayName); } catch (e) {}
      // Check if this sign-up was driven by a share link
      const shareRef = sessionStorage.getItem('tactica_share_ref');
      if (shareRef && _authInitialized) {
        logAction(user.uid, user.email, 'share_signup', {
          shareId: shareRef,
          method: user.providerData?.[0]?.providerId === 'google.com' ? 'google' : 'email'
        }).catch(() => {});
      }
    }
    _authInitialized = true;
    return;
  }

  if (user) {
    // Hide landing gate
    if (gate) gate.style.display = 'none';
    // Migrate localStorage to cloud on first sign-in
    try { await migrateLocalToCloud(user.uid); } catch (e) { console.warn('Migration error:', e); }
    // Track auto-restored sessions (returning users who didn't actively sign in)
    if (!_authInitialized) {
      const method = user.providerData?.[0]?.providerId === 'google.com' ? 'google' : 'email';
      trackSignIn(method);
    }
    // Generate session ID and log session to Firestore
    setSessionId(user.uid + '_' + Date.now());
    let _sc = 0;
    let _hasReviewed = false;
    try {
      const res = await logSession(user.uid, user.email, user.displayName);
      _sc = res?.sessionCount || 0;
      _hasReviewed = res?.hasReviewed === true;
    } catch (e) { console.warn('Session log error:', e); }
    // Show review modal based on real Firestore session count + reviewed flag
    maybeShowReview(_sc, _hasReviewed);

    // Always start a fresh board on new session
    clearCurrentId();
    const nameInput = document.getElementById('analysis-name-input');
    if (nameInput) nameInput.value = 'New analysis';

    // Show welcome notification only on sign-up (first session ever)
    if (_authInitialized && _sc === 1) {
      const name = user.displayName || user.email || 'User';
      showNotification('Welcome to Táctica, ' + name + '!', 'success', 4000);
    }

    // Feature announcements — shown once on first click of each tool
    if (window.innerWidth > 768) {
      const connectBtn = document.getElementById('connect-btn');
      if (connectBtn) {
        connectBtn.addEventListener('click', function _connectAnnounce() {
          showFeatureAnnounce({
            id: 'connect-tooltip-v1',
            anchorEl: connectBtn,
            img: 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="280" height="140" viewBox="0 0 280 140"><rect width="280" height="140" fill="#1a2a1a"/><rect x="10" y="10" width="260" height="120" rx="6" fill="#2d5a2d" opacity="0.6"/><line x1="140" y1="10" x2="140" y2="130" stroke="rgba(255,255,255,0.15)" stroke-width="1"/><circle cx="60" cy="50" r="18" fill="#8B5CF6" opacity="0.9"/><text x="60" y="55" text-anchor="middle" font-family="sans-serif" font-size="12" font-weight="700" fill="white">2</text><circle cx="140" cy="40" r="18" fill="#8B5CF6" opacity="0.9"/><text x="140" y="45" text-anchor="middle" font-family="sans-serif" font-size="12" font-weight="700" fill="white">6</text><circle cx="220" cy="55" r="18" fill="#8B5CF6" opacity="0.9"/><text x="220" y="60" text-anchor="middle" font-family="sans-serif" font-size="12" font-weight="700" fill="white">9</text><circle cx="140" cy="100" r="18" fill="#FBBF24" opacity="0.9"/><text x="140" y="105" text-anchor="middle" font-family="sans-serif" font-size="12" font-weight="700" fill="white">4</text><line x1="78" y1="50" x2="122" y2="40" stroke="rgba(255,255,255,0.5)" stroke-width="3" stroke-dasharray="6,4" stroke-linecap="round"/><line x1="158" y1="40" x2="202" y2="55" stroke="rgba(255,255,255,0.5)" stroke-width="3" stroke-dasharray="6,4" stroke-linecap="round"/><line x1="140" y1="58" x2="140" y2="82" stroke="rgba(59,130,246,0.5)" stroke-width="3" stroke-dasharray="6,4" stroke-linecap="round"/></svg>`),
            title: 'Connect Players',
            text: 'Draw tactical connections between players. Click multiple players to chain them together — great for showing passing lanes and pressing triggers.',
            cta: 'Got it',
          });
          connectBtn.removeEventListener('click', _connectAnnounce);
        });
      }

      const stepBtn = document.getElementById('step-btn');
      if (stepBtn) {
        stepBtn.addEventListener('click', function _stepAnnounce() {
          showFeatureAnnounce({
            id: 'step-tooltip-v1',
            anchorEl: stepBtn,
            img: 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="280" height="140" viewBox="0 0 280 140"><rect width="280" height="140" fill="#141420"/><rect x="20" y="16" width="240" height="108" rx="8" fill="#1e1e2a" stroke="rgba(255,255,255,0.08)" stroke-width="1"/><rect x="36" y="90" width="44" height="22" rx="4" fill="rgba(201,169,98,0.15)" stroke="rgba(201,169,98,0.4)" stroke-width="1"/><text x="58" y="104" text-anchor="middle" font-family="sans-serif" font-size="8" font-weight="600" fill="#c8a94e">Start</text><rect x="88" y="90" width="24" height="22" rx="4" fill="rgba(201,169,98,0.25)" stroke="rgba(201,169,98,0.5)" stroke-width="1"/><text x="100" y="104" text-anchor="middle" font-family="sans-serif" font-size="8" font-weight="700" fill="#c8a94e">1</text><rect x="120" y="90" width="24" height="22" rx="4" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.1)" stroke-width="1"/><text x="132" y="104" text-anchor="middle" font-family="sans-serif" font-size="8" font-weight="600" fill="rgba(255,255,255,0.5)">2</text><polygon points="170,95 182,101 170,107" fill="none" stroke="#c8a94e" stroke-width="1.2"/><text x="190" y="104" font-family="sans-serif" font-size="8" font-weight="600" fill="#c8a94e">Play</text><circle cx="80" cy="50" r="12" fill="#8B5CF6" opacity="0.8"/><text x="80" y="54" text-anchor="middle" font-family="sans-serif" font-size="8" font-weight="700" fill="white">7</text><circle cx="140" cy="42" r="12" fill="#8B5CF6" opacity="0.8"/><text x="140" y="46" text-anchor="middle" font-family="sans-serif" font-size="8" font-weight="700" fill="white">10</text><circle cx="200" cy="50" r="12" fill="#8B5CF6" opacity="0.8"/><text x="200" y="54" text-anchor="middle" font-family="sans-serif" font-size="8" font-weight="700" fill="white">11</text><line x1="92" y1="50" x2="128" y2="42" stroke="rgba(255,255,255,0.3)" stroke-width="1.5" stroke-dasharray="4,3"/><path d="M110 46 L128 42" stroke="rgba(201,169,98,0.6)" stroke-width="1.5" marker-end="url(#arr)"/><line x1="152" y1="42" x2="188" y2="50" stroke="rgba(255,255,255,0.3)" stroke-width="1.5" stroke-dasharray="4,3"/><rect x="210" y="88" width="40" height="24" rx="4" fill="rgba(201,169,98,0.12)" stroke="rgba(201,169,98,0.3)" stroke-width="1"/><text x="230" y="98" text-anchor="middle" font-family="sans-serif" font-size="6" fill="rgba(201,169,98,0.8)">Export</text><text x="230" y="107" text-anchor="middle" font-family="sans-serif" font-size="6" font-weight="700" fill="#c8a94e">MP4</text></svg>`),
            title: 'Animate & Export MP4',
            text: 'Create step-by-step animations and export them as MP4 videos you can share directly on Twitter, WhatsApp, or anywhere.',
            cta: 'Got it',
          });
          stepBtn.removeEventListener('click', _stepAnnounce);
        });
      }

      const pairBtn = document.getElementById('pair-btn');
      if (pairBtn) {
        pairBtn.addEventListener('click', function _pairAnnounce() {
          showFeatureAnnounce({
            id: 'pair-tooltip-v1',
            anchorEl: pairBtn,
            img: 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="280" height="140" viewBox="0 0 280 140"><rect width="280" height="140" fill="#1a2a1a"/><rect x="10" y="10" width="260" height="120" rx="6" fill="#2d5a2d" opacity="0.6"/><line x1="140" y1="10" x2="140" y2="130" stroke="rgba(255,255,255,0.15)" stroke-width="1"/><ellipse cx="140" cy="70" rx="80" ry="36" fill="rgba(234,179,8,0.35)" stroke="rgba(255,255,255,0.5)" stroke-width="2" stroke-dasharray="6,4"/><circle cx="100" cy="70" r="18" fill="#8B5CF6" opacity="0.9"/><text x="100" y="75" text-anchor="middle" font-family="sans-serif" font-size="12" font-weight="700" fill="white">4</text><circle cx="180" cy="70" r="18" fill="#FBBF24" opacity="0.9"/><text x="180" y="75" text-anchor="middle" font-family="sans-serif" font-size="12" font-weight="700" fill="white">6</text></svg>`),
            title: 'Pair Players',
            text: 'Visually group two players with an ellipse zone. Click two players to mark them as a pair — perfect for showing man-marking, partnerships, or 1v1 matchups.',
            cta: 'Got it',
          });
          pairBtn.removeEventListener('click', _pairAnnounce);
        });
      }
    }

    // Welcome modal — only on sign-up (first session ever, regardless of device).
    // Previously this used a per-device localStorage counter, so users saw it
    // twice on every new device they signed in from. _sc comes from the server
    // and is the lifetime session count, so === 1 means "this is sign-up".
    if (_authInitialized && _sc === 1) {
      if (window.innerWidth <= 768) showMobileHint();
      else showDesktopWelcome();
    }
  } else {
    // Show landing gate when not authenticated
    if (gate) gate.style.display = 'flex';
  }
  _authInitialized = true;
  await updateCurrentBar();
});

// ─── Collapsible panel sections ─────────────────────────────────────────────
(function initCollapsibleSections() {
  const STORAGE_KEY = 'tactica_collapsed';
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch {}

  document.querySelectorAll('h3.collapsible[data-collapse]').forEach(h3 => {
    const key = h3.dataset.collapse;
    const body = document.querySelector(`[data-collapse-body="${key}"]`);
    if (!body) return;

    // Restore saved state (default: expanded)
    if (saved[key]) {
      h3.classList.add('collapsed');
      body.classList.add('collapsed');
    }

    h3.addEventListener('click', () => {
      const isCollapsed = h3.classList.toggle('collapsed');
      body.classList.toggle('collapsed', isCollapsed);

      // Persist
      try {
        const state = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
        if (isCollapsed) state[key] = true; else delete state[key];
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch {}
    });
  });
})();

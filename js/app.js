import * as S from './state.js';
import { deselect, deleteSelected, switchTab, select, applyTransform, updateArrowVisual, registerRewrap, registerHeadlineRewrap, registerVisionUpdate, registerFreeformUpdate, registerMotionUpdate, registerTagReposition, registerLinkUpdate, registerDragEnd, makeDraggable, registerSelectTracker, registerSelectTeamContext, startMarquee, updateMarquee, endMarquee, cleanupMarquee, forEachSelected } from './interaction.js';
import { addPlayer, addReferee, addBall, addCone, addArrow, addShadow, addSpotlight, addTextBox, updateTextBoxBg, rewrapTextBox, addHeadline, rewrapHeadline, openHeadlineEdit, addVision, updateVisionPolygon, addFreeformZone, updateFreeformPath, addMotion, updateMotionVisual, updatePlayerArms, addTag, openTagEdit, repositionTag, addLink, updateLink, updateAllLinks, addPair, updatePair, updateAllPairs } from './elements.js';
import { setTool, setArrowType, selectTeamContext, applyKit, applyColor, placeFormation,
         liveUpdateNumber, confirmNumber, liveUpdateName, confirmName,
         applyNameSize, applyNameColor, applyNameBg, updatePlayerNameBg,
         applyPlayerFill, applyPlayerBorder, togglePlayerArms,
         liveUpdateRefName, confirmRefName, applyRefFill, applyRefBorder,
         openColorPicker, closeColorPicker, confirmColorPicker,
         applyArrowColor, applyArrowStyle, applyArrowWidth, applyArrowCurve, applyArrowOpacity,
         applySpotlightColor, setSpotlightColor, applyVisionColor, applyVisionBorder, applyVisionOpacity,
         liveUpdateSpotName, confirmSpotName, applySpotNameSize, applySpotNameColor, applySpotNameBg,
         applyZoneFill, applyZoneBorder, applyZoneBorderStyle, applyZoneOpacity,
         liveUpdateTextBox, confirmTextBox, applyTextBoxSize, applyTextBoxColor, applyTextBoxBg, applyTextBoxAlign,
         liveUpdateHeadline, applyHeadlineBarColor, applyHeadlineTitleSize, applyHeadlineBodySize, applyHeadlineTextColor, applyHeadlineBg,
         liveUpdateTagLabel, liveUpdateTagValue, applyTagLabelColor, applyTagValueColor, applyTagLineColor, applyTagLineDash, applyTagLineLen, applyTagLineAngle, applyTagTextAnchor,
         applySize, applyRotation, clearAll } from './ui.js';
import { setPitch, setPitchColor, setPitchOpt, updatePitchFromToggles, setPitchLineColor, toggleStripes, rebuildPitch } from './pitch.js';
import { exportImage, selectFmt, closeExport, doExport } from './export.js?v=2';
import { triggerImageUpload, handleImageUpload, enterImageMode, exitImageMode } from './imagemode.js';
import { triggerVideoUpload, handleVideoUpload, enterVideoMode, exitVideoMode, tagVideoTimestamp, toggleVideoPlayback, seekVideo, autoPauseIfPlaying, _renderAnnotationBars } from './videomode.js';
import { trackElementInserted, trackModeSwitch, trackElementEdited, trackElementDragged, trackSignUp, trackSignIn, trackSignOut, registerAnalysisTracker } from './analytics.js';
import { saveAnalysis, loadAnalysis, deleteAnalysis, duplicateAnalysis, renameAnalysis, listAnalyses, getCurrentId, clearCurrentId, formatDate, quickSave, migrateLocalToCloud, captureState, generateThumbnail, listFolders, createFolder, renameFolder, deleteFolder, moveAnalysisToFolder } from './storage.js';
import { onAuthChange, signInWithGoogle, signUpWithEmail, signInWithEmail, sendPasswordReset, signOut, getCurrentUser } from './auth.js';
import { logSession, logAction, setSessionId, saveSharedAnalysis, loadSharedAnalysis } from './firestore.js?v=4';
import { hideUpgradePrompt, setUserTier, updateLockedUI } from './subscription.js';

// ─── Wire up cross-module callbacks ─────────────────────────────────────────
registerRewrap(rewrapTextBox);
registerHeadlineRewrap(rewrapHeadline);
registerSelectTeamContext(selectTeamContext);
registerVisionUpdate(updateVisionPolygon);
registerFreeformUpdate(updateFreeformPath);
registerMotionUpdate(updateMotionVisual);
registerTagReposition(repositionTag);
registerLinkUpdate(updateAllLinks);
// ─── Initialize subscription UI ────────────────────────────────────────────
updateLockedUI();

// ─── "Analysis started" session tracker ────────────────────────────────────
registerAnalysisTracker(() => {
  const u = getCurrentUser();
  if (u) logAction(u.uid, u.email, 'analysis_started').catch(() => {});
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
    if (g.dataset.type !== 'link') makeDraggable(g);
    g.addEventListener('click', e => { if (S.tool === 'select') { e.stopPropagation(); select(g, { additive: e.ctrlKey || e.metaKey }); } });
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
  _baseSetTool(t);
  // Auto-pause video when switching to a drawing tool
  if (S.appMode === 'video' && t !== 'select') autoPauseIfPlaying();
};
window.setArrowType = setArrowType;
window.setVisionType = S.setVisionType;
window.selectTeamContext = selectTeamContext;
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
  document.querySelectorAll('.kit-tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
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
window.clearAll = clearAll;
window.toggleToolbar = function() {
  const tb = document.getElementById('toolbar');
  const btn = document.getElementById('toolbar-toggle');
  tb.classList.toggle('collapsed');
  btn.classList.toggle('collapsed');
  const isCollapsed = tb.classList.contains('collapsed');
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
  const isV = (/full-v|half-v/).test(lay);
  return {
    type: lay,
    orientation: isV ? 'vertical' : 'horizontal',
    size: lay.startsWith('half') ? 'half' : 'full',
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
window.applySpotlightColor = applySpotlightColor;
window.applyVisionColor = applyVisionColor;
window.applyVisionBorder = applyVisionBorder;
window.applyVisionOpacity = applyVisionOpacity;
window.liveUpdateSpotName = liveUpdateSpotName;
window.confirmSpotName = confirmSpotName;
window.applySpotNameSize = applySpotNameSize;
window.applySpotNameColor = applySpotNameColor;
window.applySpotNameBg = applySpotNameBg;
window.applyZoneFill = applyZoneFill;
window.applyZoneBorder = applyZoneBorder;
window.applyZoneBorderStyle = applyZoneBorderStyle;
window.applyZoneOpacity = applyZoneOpacity;
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
window.triggerImageUpload = triggerImageUpload;
window.handleImageUpload = function(input) {
  handleImageUpload(input);
  const u = getCurrentUser();
  if (u) logAction(u.uid, u.email, 'feature_image_upload').catch(() => {});
};
window.triggerVideoUpload = triggerVideoUpload;
window.handleVideoUploadFromInput = function(input) {
  handleVideoUpload(input);
  const u = getCurrentUser();
  if (u) logAction(u.uid, u.email, 'feature_video_upload').catch(() => {});
};
window.enterImageMode = enterImageMode;
window.exitImageMode = exitImageMode;

// ─── Mode Switching (Tactical Board vs Image Upload) ────────────────────────
function hasCanvasWork() {
  return S.objectsLayer.children.length > 0 || S.playersLayer.children.length > 0;
}

function showImageUploadPane() {
  // Switch to pitch tab first, then replace pitch pane with upload pane
  switchTab('pitch');
  const pitchPane = document.getElementById('pane-pitch');
  const uploadPane = document.getElementById('image-upload-pane');
  const imageInfo = document.getElementById('image-mode-info');
  if (pitchPane) pitchPane.style.display = 'none';
  if (uploadPane) uploadPane.style.display = 'flex';
  if (imageInfo) imageInfo.style.display = 'none';
}
window.showImageUploadPane = showImageUploadPane;

function hideImageUploadPane() {
  const uploadPane = document.getElementById('image-upload-pane');
  if (uploadPane) uploadPane.style.display = 'none';
}

function showVideoUploadPane() {
  switchTab('pitch');
  const pitchPane = document.getElementById('pane-pitch');
  const uploadPane = document.getElementById('video-upload-pane');
  const videoInfo = document.getElementById('video-mode-info');
  if (pitchPane) pitchPane.style.display = 'none';
  if (uploadPane) uploadPane.style.display = 'flex';
  if (videoInfo) videoInfo.style.display = 'none';
}
window.showVideoUploadPane = showVideoUploadPane;

function hideVideoUploadPane() {
  const uploadPane = document.getElementById('video-upload-pane');
  if (uploadPane) uploadPane.style.display = 'none';
}

function switchMode(mode) {
  const pitchBtn = document.getElementById('mode-pitch-btn');
  const imageBtn = document.getElementById('mode-image-btn');
  const videoBtn = document.getElementById('mode-video-btn');

  function setActiveTab(m) {
    if (pitchBtn) pitchBtn.classList.toggle('active', m === 'pitch');
    if (imageBtn) imageBtn.classList.toggle('active', m === 'image');
    if (videoBtn) videoBtn.classList.toggle('active', m === 'video');
  }

  const currentMode = S.appMode;

  // ── Switching TO image ──
  if (mode === 'image') {
    if (currentMode === 'image') return;
    const go = () => {
      if (currentMode === 'video') exitVideoMode();
      setActiveTab('image');
      showImageUploadPane();
    };
    if (hasCanvasWork()) {
      showModeSwitchModal('Switching to Image Analysis will erase all elements. Are you sure?', go);
    } else { go(); }
    return;
  }

  // ── Switching TO video ──
  if (mode === 'video') {
    if (currentMode === 'video') return;
    const go = () => {
      if (currentMode === 'image') exitImageMode();
      setActiveTab('video');
      showVideoUploadPane();
    };
    if (hasCanvasWork()) {
      showModeSwitchModal('Switching to Video Analysis will erase all elements. Are you sure?', go);
    } else { go(); }
    return;
  }

  // ── Switching TO pitch ──
  hideImageUploadPane();
  hideVideoUploadPane();
  const pitchPane = document.getElementById('pane-pitch');
  if (pitchPane) pitchPane.style.display = '';

  if (currentMode === 'pitch') {
    setActiveTab('pitch');
    return;
  }

  const go = () => {
    if (currentMode === 'image') exitImageMode();
    if (currentMode === 'video') exitVideoMode();
    setActiveTab('pitch');
  };

  if (hasCanvasWork()) {
    const label = currentMode === 'image' ? 'image' : 'video';
    showModeSwitchModal(`Switching to Tactical Board will erase all elements on your ${label}. Are you sure?`, go);
  } else { go(); }
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
  label.textContent = mode === 'pitch' ? 'Tactical Board' : mode === 'video' ? 'Video Analysis' : 'Image Analysis';
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

// ─── Link Tool State ────────────────────────────────────────────────────────
let _linkStartPlayer = null;
let _linkHighlight = null;

// ─── Pair Tool State ────────────────────────────────────────────────────────
let _pairStartPlayer = null;

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
    const clickedEl = e.target.closest('[data-type="player"]') || e.target.closest('[data-type="referee"]');
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
  if (placed) {
    // Tag with video timestamp if in video mode
    if (S.appMode === 'video') tagVideoTimestamp(placed);
    const elType = placed.dataset.type;
    trackElementInserted(elType);
    maybeSendPitchSnapshot();
    // Log element insertion to Firestore
    const u = getCurrentUser();
    if (u) logAction(u.uid, u.email, 'element_inserted', { element: elType }).catch(() => {});
    // Players stay in placement mode so you can keep adding
    if (S.tool === 'player-a' || S.tool === 'player-b' || S.tool === 'player-joker') {
      // Don't switch tool — stay in player mode
    } else {
      setTool('select'); select(placed);
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
    if (arrow) {
      if (S.appMode === 'video') tagVideoTimestamp(arrow);
      setTool('select'); select(arrow);
    }
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
    if (zone) {
      if (S.appMode === 'video') tagVideoTimestamp(zone);
      setTool('select'); select(zone);
    }
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
  if (S.tool !== 'freeform') return;
  e.preventDefault();
  closeFreeform();
});

S.svg.addEventListener('mousemove', e => {
  if (S.tool !== 'freeform' || freeformPts.length === 0) return;
  const pt = S.getSVGPoint(e);
  updateFreeformPreview(pt);
});

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

// ─── Bundle menus (toolbar flyouts) ─────────────────────────────────────────
function openBundle(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const isOpen = el.classList.contains('open');
  document.querySelectorAll('.tool-bundle.open').forEach(b => { if (b.id !== id) closeBundle(b.id); });
  if (!isOpen) {
    el.classList.add('open');
    const menuEl = el.querySelector('.bundle-menu') || document.querySelector(`.bundle-menu[data-bundle="${id}"]`);
    const btn = el.querySelector('.tool-btn');
    if (menuEl && btn) {
      document.body.appendChild(menuEl);
      menuEl.dataset.bundle = id;
      const rect = btn.getBoundingClientRect();
      menuEl.style.position = 'fixed';
      menuEl.style.display = 'block';
      menuEl.style.zIndex = '10000';
      menuEl._parentBundle = el;
      if (window.innerWidth <= 768) {
        // Mobile: position above the button
        menuEl.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - 200)) + 'px';
        menuEl.style.bottom = (window.innerHeight - rect.top + 8) + 'px';
        menuEl.style.top = 'auto';
      } else {
        // Desktop: position to the right of the button
        menuEl.style.left = (rect.right + 10) + 'px';
        menuEl.style.top = rect.top + 'px';
        menuEl.style.bottom = 'auto';
      }
    }
  }
}
function closeBundle(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove('open');
  // Move detached menu back into the bundle
  const detached = document.querySelector(`.bundle-menu[data-bundle="${id}"]`);
  if (detached && detached._parentBundle === el) {
    detached.style.display = '';
    detached.style.position = '';
    detached.style.left = '';
    detached.style.bottom = '';
    detached.style.top = '';
    detached.style.zIndex = '';
    el.appendChild(detached);
  }
}

// When selecting a bundle option, swap the main button's icon to reflect the choice
const bundleIcons = {
  'shadow-circle': `<svg width="20" height="20" viewBox="0 0 22 22"><ellipse cx="11" cy="11" rx="8" ry="5" fill="rgba(79,156,249,0.25)" stroke="rgba(79,156,249,0.6)" stroke-width="1.2"/></svg>`,
  'shadow-rect': `<svg width="20" height="20" viewBox="0 0 22 22"><rect x="3" y="6" width="16" height="10" rx="2" fill="rgba(79,156,249,0.25)" stroke="rgba(79,156,249,0.6)" stroke-width="1.2"/></svg>`,
  'freeform': `<svg width="20" height="20" viewBox="0 0 22 22" fill="none"><path d="M6 14 Q3 8 7 5 Q12 2 16 6 Q20 10 17 15 Q14 19 9 17 Z" fill="rgba(79,156,249,0.25)" stroke="rgba(79,156,249,0.6)" stroke-width="1.2" stroke-linejoin="round"/></svg>`,
  'spotlight': `<svg width="20" height="20" viewBox="0 0 22 22" fill="none"><path d="M10 2 L5 16 L17 16 L12 2 Z" fill="rgba(200,210,230,0.2)"/><ellipse cx="11" cy="16" rx="6" ry="2.5" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>`,
  'vision': `<svg width="20" height="20" viewBox="0 0 22 22" fill="none"><polygon points="3,11 19,4 19,18" fill="rgba(147,197,253,0.5)" stroke="rgba(147,197,253,0.8)" stroke-width="1"/></svg>`,
};
function updateBundleIcon(bundleId, toolName) {
  const bundle = document.getElementById(bundleId);
  if (!bundle) return;
  const mainBtn = bundle.querySelector('.tool-btn');
  if (!mainBtn || !bundleIcons[toolName]) return;
  // Replace only the SVG, keep the label
  const label = mainBtn.querySelector('.tool-label');
  const labelHTML = label ? label.outerHTML : '';
  mainBtn.innerHTML = bundleIcons[toolName] + labelHTML;
  mainBtn.setAttribute('data-tool', toolName);
}

// Close bundles when clicking elsewhere — use CAPTURE phase so it fires
// before any element handler can call stopPropagation()
function closeBundlesOnOutsideClick(e) {
  if (!e.target.closest('.tool-bundle') && !e.target.closest('.bundle-menu')) {
    document.querySelectorAll('.tool-bundle.open').forEach(b => {
      closeBundle(b.id);
    });
  }
}
document.addEventListener('mousedown', closeBundlesOnOutsideClick, true);
document.addEventListener('click', closeBundlesOnOutsideClick, true);

const arrowIcons = {
  'run': `<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><line x1="3" y1="9" x2="13" y2="9" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-dasharray="4,2.5"/><polygon points="13,9 9,6.5 9,11.5" fill="#FFFFFF"/></svg>`,
  'pass': `<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><line x1="3" y1="9" x2="13" y2="9" stroke="#F59E0B" stroke-width="2" stroke-linecap="round"/><polygon points="13,9 9,6.5 9,11.5" fill="#F59E0B"/></svg>`,
  'line': `<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><line x1="3" y1="9" x2="15" y2="9" stroke="#f94f4f" stroke-width="2" stroke-linecap="round"/></svg>`,
};
const arrowLabels = { 'run': 'Run', 'pass': 'Pass', 'line': 'Line' };
function updateArrowBundleIcon(type) {
  const btn = document.getElementById('arrow-main-btn');
  if (!btn || !arrowIcons[type]) return;
  btn.innerHTML = arrowIcons[type] + `<span class="tool-label">${arrowLabels[type]}</span>`;
}

window.openBundle = openBundle;
window.closeBundle = closeBundle;
window.updateBundleIcon = updateBundleIcon;
window.updateArrowBundleIcon = updateArrowBundleIcon;

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

  // Video mode: Space = play/pause, arrows = seek
  if (S.appMode === 'video') {
    if (e.key === ' ') { e.preventDefault(); toggleVideoPlayback(); return; }
    if (e.key === 'ArrowLeft') { e.preventDefault(); seekVideo(e.shiftKey ? -5 : -1); return; }
    if (e.key === 'ArrowRight') { e.preventDefault(); seekVideo(e.shiftKey ? 5 : 1); return; }
  }

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

  const user = getCurrentUser();
  const userEmail = user ? user.email : 'unknown';
  const userName = user ? (user.displayName || user.email) : 'unknown';

  try {
    const formData = new FormData();
    formData.append('access_key', '315e7f89-890f-4b05-8b81-605325f4f8e4');
    formData.append('subject', `Táctica Feedback: ${feedbackType}`);
    formData.append('type', feedbackType);
    formData.append('message', `From: ${userName} (${userEmail})\n\n${msg}`);
    formData.append('from_name', 'Táctica Feedback');
    formData.append('email', userEmail);

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
      if (g.dataset.type !== 'link') makeDraggable(g);
      g.addEventListener('click', e => { if (S.tool === 'select') { e.stopPropagation(); select(g, { additive: e.ctrlKey || e.metaKey }); } });
      if (g.dataset.type === 'textbox') {
        g.addEventListener('dblclick', e => {
          e.stopPropagation();
          try { import('./elements.js').then(m => m.openTextBoxEditFn?.(g)); } catch(err) {}
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

// ─── Pitch Zoom ─────────────────────────────────────────────────────────────
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

function zoomIn() {
  _zoomLevel = Math.min(ZOOM_MAX, _zoomLevel + ZOOM_STEP);
  applyZoom();
}
window.zoomIn = zoomIn;

function zoomOut() {
  _zoomLevel = Math.max(ZOOM_MIN, _zoomLevel - ZOOM_STEP);
  applyZoom();
}
window.zoomOut = zoomOut;

function zoomReset() {
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

// ─── Notes Panel ────────────────────────────────────────────────────────────
let _notesOpenTracked = false;

function toggleNotes() {
  const panel = document.getElementById('notes-panel');
  const btn = document.getElementById('notes-toggle-btn');
  const isOpen = panel.style.display !== 'none';
  panel.style.display = isOpen ? 'none' : 'flex';
  btn.style.display = isOpen ? 'flex' : 'none';
  // Track opening
  if (!isOpen && !_notesOpenTracked) {
    _notesOpenTracked = true;
    const u = getCurrentUser();
    if (u) logAction(u.uid, u.email, 'feature_notes_open', {}).catch(() => {});
  }
}
window.toggleNotes = toggleNotes;

// Auto-save notes on blur (when user clicks away) with "Saved" indicator + tracking
let _notesSaveTimer = null;
const notesTextarea = document.getElementById('notes-textarea');

notesTextarea?.addEventListener('input', function() {
  const btn = document.getElementById('notes-toggle-btn');
  if (btn) btn.classList.toggle('has-notes', this.value.trim().length > 0);
  // Debounced auto-save indicator
  clearTimeout(_notesSaveTimer);
  _notesSaveTimer = setTimeout(() => showNotesSaved(), 1500);
});

notesTextarea?.addEventListener('blur', function() {
  clearTimeout(_notesSaveTimer);
  if (this.value.trim().length > 0) showNotesSaved();
});

function showNotesSaved() {
  const status = document.getElementById('notes-save-status');
  if (!status) return;
  status.textContent = 'Saved';
  status.classList.add('visible');
  // Track save
  const u = getCurrentUser();
  if (u) logAction(u.uid, u.email, 'feature_notes_save', { length: notesTextarea?.value.length || 0 }).catch(() => {});
  setTimeout(() => status.classList.remove('visible'), 2000);
}

// Expose notes for captureState
window._getNotesText = () => document.getElementById('notes-textarea')?.value || '';
window._setNotesText = (text) => {
  const ta = document.getElementById('notes-textarea');
  if (ta) ta.value = text || '';
  const btn = document.getElementById('notes-toggle-btn');
  if (btn) btn.classList.toggle('has-notes', (text || '').trim().length > 0);
};

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

function openAuthModal(tab) {
  document.getElementById('auth-modal').style.display = 'flex';
  switchAuthTab(tab === 'signup' ? 'signup' : 'signin');
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
    try { await logSession(user.uid, user.email, user.displayName); } catch (e) { console.warn('Session log error:', e); }
    // Always start a fresh board on new session
    clearCurrentId();
    const nameInput = document.getElementById('analysis-name-input');
    if (nameInput) nameInput.value = 'New analysis';

    // Show welcome notification (skip on initial page load auto-restore)
    if (_authInitialized) {
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
      // Notes feature announcement — show once, on load, pointing at the notes toggle button
      const notesBtn = document.getElementById('notes-toggle-btn');
      if (notesBtn) {
        setTimeout(() => {
          notesBtn.classList.add('announce-highlight');
          // Auto-remove highlight after 6s regardless
          setTimeout(() => notesBtn.classList.remove('announce-highlight'), 6000);
          showFeatureAnnounce({
            id: 'notes-tooltip-v1',
            anchorEl: notesBtn,
            title: 'Notes',
            text: 'Add coaching notes to any analysis for future reference. Your notes are saved automatically.',
            cta: 'Got it',
            position: 'below',
            maxShows: 2,
            onCta: () => notesBtn.classList.remove('announce-highlight'),
          });
        }, 1200);
      }
    }

    // Welcome modals (show for first 2 sessions)
    if (window.innerWidth <= 768) {
      const mobileCount = parseInt(localStorage.getItem('tactica_mobile_sessions') || '0', 10) + 1;
      localStorage.setItem('tactica_mobile_sessions', mobileCount);
      if (mobileCount <= 2) showMobileHint();
    } else {
      const desktopCount = parseInt(localStorage.getItem('tactica_desktop_sessions') || '0', 10) + 1;
      localStorage.setItem('tactica_desktop_sessions', desktopCount);
      if (desktopCount <= 2) showDesktopWelcome();
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

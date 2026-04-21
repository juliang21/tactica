// ─── Mode Registry ──────────────────────────────────────────────────────────
// Central mode lifecycle manager. Each mode (pitch, image, video, training…)
// registers its configuration here. switchMode() coordinates toolbar, side
// panel, analytics context, and lifecycle hooks on activation/deactivation.
// ─────────────────────────────────────────────────────────────────────────────

import { applyToolbarForMode } from './toolbar-manager.js';

const modes = new Map();
let activeMode = null;

// ─── Registration ──────────────────────────────────────────────────────────
export function registerMode(id, config) {
  config.id = id;
  modes.set(id, config);
}

// ─── Accessors ─────────────────────────────────────────────────────────────
export function getActiveMode() { return activeMode; }
export function getActiveModeId() { return activeMode?.id || 'pitch'; }
export function getModeConfig(id) { return modes.get(id); }

// ─── Mode Switching ────────────────────────────────────────────────────────
// `activateMode` is the low-level switch — call it after any confirmation
// modals have already been resolved.
export function activateMode(newModeId) {
  const newMode = modes.get(newModeId);
  if (!newMode) {
    console.warn(`[mode-registry] Unknown mode: "${newModeId}"`);
    return;
  }
  if (activeMode?.id === newModeId) return;

  // Deactivate current mode
  activeMode?.onDeactivate?.();

  // Apply toolbar + side panel for the new mode
  applyToolbarForMode(newMode);
  applySidePanelForMode(newMode);
  syncModeButtons(newModeId, newMode.label);

  // Activate new mode
  newMode.onActivate?.();
  activeMode = newMode;
}

// ─── Side Panel Tabs ───────────────────────────────────────────────────────
// Show only the tabs declared by the mode; switch to its default tab.
// Also updates tab button labels if the mode overrides them (e.g. the
// "Pitch" tab becomes "Image" in image-analysis mode).
function applySidePanelForMode(modeConfig) {
  const tabs = modeConfig.sidePanel?.tabs;
  if (!tabs) return;

  const allTabIds = ['players', 'pitch', 'element'];
  const modeTabIds = new Set(tabs.map(t => t.id));

  // Show/hide tab buttons and update labels
  allTabIds.forEach(id => {
    const btn = document.getElementById('tab-' + id);
    if (!btn) return;
    btn.style.display = modeTabIds.has(id) ? '' : 'none';
    // Update label text if the mode declares one
    const tabCfg = tabs.find(t => t.id === id);
    if (tabCfg?.label) {
      // Replace only the text node after the SVG icon
      const textNode = [...btn.childNodes].find(n => n.nodeType === Node.TEXT_NODE && n.textContent.trim());
      if (textNode) textNode.textContent = '\n      ' + tabCfg.label + '\n    ';
    }
  });

  // Activate the default tab
  const defaultTab = modeConfig.sidePanel.defaultTab || tabs[0]?.id;
  if (defaultTab) switchTabForMode(defaultTab, modeConfig);
}

// ─── Mode-aware tab switching ──────────────────────────────────────────────
// This replaces the hardcoded isImageMode branching in interaction.js.
// It reads pane mappings from the active mode config so every mode can
// declare which pane ID shows when a tab is selected.
export function switchTabForMode(name, modeConfigOverride) {
  const mode = modeConfigOverride || activeMode;
  if (!mode?.sidePanel?.tabs) return;

  const tabs = mode.sidePanel.tabs;

  tabs.forEach(tab => {
    const tabBtn = document.getElementById('tab-' + tab.id);
    const pane = document.getElementById(tab.paneId);
    if (tabBtn) tabBtn.classList.toggle('active', tab.id === name);
    if (pane) pane.style.display = tab.id === name ? 'flex' : 'none';
  });

  // Hide any panes that belong to other modes but share the same tab slot.
  // e.g. when in image mode, pane-pitch must be hidden even though the tab
  // says "pitch".
  const activePaneIds = new Set(tabs.map(t => t.paneId));
  const allPaneIds = ['pane-players', 'pane-pitch', 'pane-element', 'image-mode-info'];
  allPaneIds.forEach(id => {
    if (!activePaneIds.has(id)) {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    }
  });
}

// ─── Sync desktop + mobile mode buttons ────────────────────────────────────
function syncModeButtons(modeId, label) {
  // Desktop tab bar — each mode button has id="mode-{id}-btn"
  const modeIds = [...modes.keys()];
  modeIds.forEach(id => {
    const btn = document.getElementById(`mode-${id}-btn`);
    if (btn) btn.classList.toggle('active', id === modeId);
  });
  // Mobile dropdown
  const ddLabel = document.getElementById('mode-dropdown-label');
  if (ddLabel) ddLabel.textContent = label || modeId;
  document.querySelectorAll('.mode-dropdown-option').forEach(o => {
    o.classList.toggle('active', o.dataset.mode === modeId);
  });
}

// ─── window.* (used by mode-registry internally, not typically needed by HTML)
window.getActiveModeId = getActiveModeId;

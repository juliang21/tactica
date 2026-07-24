// ─── Training Mode Configuration ────────────────────────────────────────────
// Training Session Builder — separate mode for creating drills and sessions.
// Hides the pitch and shows a dedicated landing/builder UI.
// ─────────────────────────────────────────────────────────────────────────────

import { showTrainingShell, hideTrainingShell } from './training.js';

export const trainingMode = {
  id: 'training',
  label: 'Training',

  // Reuse the existing #toolbar; only show the drill-relevant tools.
  toolbar: {
    tools: [
      'select',
      'player-a', 'player-b', 'player-joker',
      'ball', 'cone', 'disc-cone', 'small-goal', 'ladder',
      'shadow-rect',           // Zone
      'arrow',
    ],
    hiddenIds: [],
  },

  // Right side panel: Drill metadata + Pitch + Selection.
  // CSS hides the panel on the landing view; it reappears in the drill editor.
  sidePanel: {
    tabs: [
      { id: 'drill',   label: 'Drill',     paneId: 'pane-drill' },
      { id: 'pitch',   label: 'Pitch',     paneId: 'pane-pitch' },
      { id: 'element', label: 'Selection', paneId: 'pane-element' },
    ],
    defaultTab: 'drill',
  },

  onActivate() {
    showTrainingShell();
  },

  onDeactivate() {
    hideTrainingShell();
  },
};

// ─── Pitch Mode Configuration ───────────────────────────────────────────────
// Tactical Board mode — the default mode. Full toolbar, standard side panel
// with Players / Pitch / Element tabs.
// ─────────────────────────────────────────────────────────────────────────────

import { deselect } from '../../interaction.js';

export const pitchMode = {
  id: 'pitch',
  label: 'Tactical Board',

  toolbar: {
    tools: [
      // Essentials
      'select', 'player-a', 'player-b', 'player-joker',
      'ball', 'cone', 'referee',
      // Zones & highlights
      'shadow-rect',
      'spotlight', 'vision',
      // Arrows
      'arrow',
      // Text & annotations
      'textbox', 'headline', 'tag',
      // Connections
      'link', 'pair', 'net-zone',
    ],
    // IDs of non-data-tool buttons to hide (empty = show all)
    hiddenIds: [],
  },

  sidePanel: {
    tabs: [
      { id: 'players', label: 'Edit Team',  paneId: 'pane-players' },
      { id: 'pitch',   label: 'Pitch',      paneId: 'pane-pitch' },
      { id: 'element', label: 'Selection',   paneId: 'pane-element' },
    ],
    defaultTab: 'players',
  },

  // Note: enterImageMode/exitImageMode in imagemode.js handle the actual
  // mode transition (CSS class, SVG setup, rebuildPitch). The registry
  // hooks here handle only UI concerns (toolbar, panels).
  onActivate() {
    document.body.classList.remove('image-mode');
  },

  onDeactivate() {
    deselect();
  },
};

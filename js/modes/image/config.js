// ─── Image Mode Configuration ───────────────────────────────────────────────
// Image Analysis mode — overlay elements on an uploaded image.
// Same essential tools as pitch, minus connect/pair (no formation context).
// Side panel swaps the Pitch tab pane for the Image Analysis pane.
// ─────────────────────────────────────────────────────────────────────────────

import { deselect } from '../../interaction.js';

export const imageMode = {
  id: 'image',
  label: 'Image Analysis',

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
      'textbox', 'headline', 'tag', 'marker',
      // Connections
      'link', 'pair', 'net-zone',
    ],
    hiddenIds: ['step-btn'],  // no animation in image mode
  },

  sidePanel: {
    tabs: [
      { id: 'players', label: 'Edit Team',     paneId: 'pane-players' },
      { id: 'pitch',   label: 'Image',          paneId: 'image-mode-info' },
      { id: 'element', label: 'Selection',      paneId: 'pane-element' },
    ],
    defaultTab: 'pitch',
  },

  // Note: body.image-mode CSS class is managed by enterImageMode() /
  // exitImageMode() in imagemode.js because it controls overflow/layout
  // that only makes sense once an image is loaded — not during the upload
  // overlay phase.
  onActivate() {},

  onDeactivate() {
    deselect();
  },
};

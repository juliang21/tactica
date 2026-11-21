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
      // Essentials (no referee in Image Analysis; Detect Player takes its slot)
      'select', 'player-a', 'player-b', 'player-joker',
      'ball', 'cone', 'detect-player',
      // Zones & highlights ('freeform' = Free Zone: draw your own shape by
      // dropping vertices, then drag any vertex to reshape it)
      'shadow-rect', 'freeform',
      'spotlight', 'vision', 'zoom',
      // Arrows
      'arrow',
      // Text & annotations
      'textbox', 'headline', 'tag', 'marker',
      // Connections
      'link', 'pair', 'net-zone',
      // Player marker (single circle, snaps to a detected player)
      'mark-player',
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
  onActivate() {
    // Runs inside the deferred mode swap, after the outgoing mode's
    // onDeactivate. That ordering matters: activateMode() delays the swap by
    // 210ms for the panel slide, so anything _doSwitchToImage() set up
    // beforehand can be clobbered by the previous mode tearing down — leaving
    // Session Builder calls hideTrainingShell(), which unconditionally shows
    // the pitch container, and the dropzone and the pitch ended up on screen
    // together. Re-assert the upload state here, once nothing else will write.
    // Authoritative both ways, so neither branch can be left half-applied.
    const hasImage = !!document.getElementById('image-bg');
    if (hasImage) window.hideImageUploadPane?.();
    else window.showImageUploadPane?.();
  },

  onDeactivate() {
    deselect();
  },
};

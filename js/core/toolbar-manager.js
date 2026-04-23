// ─── Toolbar Manager ────────────────────────────────────────────────────────
// Shows/hides toolbar tools based on the active mode's configuration.
// Works with the existing HTML toolbar — no dynamic rendering needed.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Show only the tools (and tool-groups) declared in a mode's toolbar config.
 *
 * @param {Object} modeConfig — a mode config object with `.toolbar.tools` array
 *   of tool IDs (matching data-tool attributes in the HTML).
 *   If `.toolbar.groups` is provided, entire tool-group sections can be
 *   shown/hidden by their group ID.
 */
export function applyToolbarForMode(modeConfig) {
  if (!modeConfig?.toolbar?.tools) return;
  const allowed = new Set(modeConfig.toolbar.tools);

  const toolbar = document.getElementById('toolbar');
  if (!toolbar) return;

  // ── Individual tool buttons & bundles ──────────────────────────────────
  toolbar.querySelectorAll('[data-tool]').forEach(btn => {
    const toolId = btn.dataset.tool;
    const bundle = btn.closest('.tool-bundle');

    if (bundle) {
      // For buttons inside a bundle, the bundle visibility is handled below
      return;
    }

    // Regular standalone button
    btn.style.display = allowed.has(toolId) ? '' : 'none';
  });

  // ── Bundles: show if ANY child tool is in the allowed set ─────────────
  toolbar.querySelectorAll('.tool-bundle').forEach(bundle => {
    const childTools = bundle.querySelectorAll('[data-tool]');
    const anyAllowed = [...childTools].some(c => allowed.has(c.dataset.tool));
    bundle.style.display = anyAllowed ? '' : 'none';
  });

  // ── Buttons without data-tool (undo, clear, step, save) ──────────────
  // These "action" buttons don't have data-tool. We handle them by ID.
  const alwaysVisible = ['undo-btn', 'step-btn'];
  const hiddenByMode = modeConfig.toolbar.hiddenIds || [];
  const hiddenSet = new Set(hiddenByMode);
  alwaysVisible.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = hiddenSet.has(id) ? 'none' : '';
  });

  // ── Tool groups: hide group if ALL its child tools are hidden ─────────
  toolbar.querySelectorAll('.tool-group').forEach(group => {
    const buttons = group.querySelectorAll('[data-tool], .tool-bundle, #undo-btn, #step-btn');
    const anyVisible = [...buttons].some(el => el.style.display !== 'none');
    // Don't hide the save or account groups (always shown — they hold utility UI, not tools)
    if (group.classList.contains('tool-group-save')) return;
    if (group.classList.contains('tool-group-account')) return;
    group.style.display = anyVisible ? '' : 'none';
    // Also hide the following separator
    const sep = group.nextElementSibling;
    if (sep?.classList.contains('tool-sep')) {
      sep.style.display = anyVisible ? '' : 'none';
    }
  });

  // ── Reorder tools via CSS order property ───────────────────────────────
  // If the mode config provides a `toolOrder` array, reorder visible tools
  // within their CSS Grid groups. Otherwise reset to DOM order (order: 0).
  const toolOrder = modeConfig.toolbar.toolOrder;
  const orderMap = new Map();
  if (toolOrder) {
    toolOrder.forEach((id, i) => orderMap.set(id, i + 1));
  }
  toolbar.querySelectorAll('[data-tool]').forEach(btn => {
    const el = btn.closest('.tool-bundle') || btn;
    el.style.order = orderMap.get(btn.dataset.tool) ?? '';
  });
}

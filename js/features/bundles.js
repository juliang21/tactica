// ─── Toolbar Bundle / Flyout Menus ──────────────────────────────────────────
// Extracted from app.js — manages opening/closing toolbar bundle flyout menus,
// updating bundle icons on selection, and the click-outside dismiss handler.

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

// Arrow bundle icon variants
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

// ─── window.* assignments (used by HTML onclick handlers) ───────────────────
window.openBundle = openBundle;
window.closeBundle = closeBundle;
window.updateBundleIcon = updateBundleIcon;
window.updateArrowBundleIcon = updateArrowBundleIcon;

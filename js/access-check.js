// ─── Access Check ─────────────────────────────────────────────────────────
// Shows a maintenance overlay for blocked users.
// Blocks a specific email and users in Turkey.

const BLOCKED_EMAILS = new Set([
  'cefu3607@icloud.com',
]);

const BLOCKED_TIMEZONES = new Set([
  'Europe/Istanbul',
  'Asia/Istanbul',
  'Turkey',
]);

function isTurkishLocale() {
  try {
    const tz = (Intl.DateTimeFormat().resolvedOptions().timeZone || '').trim();
    if (BLOCKED_TIMEZONES.has(tz)) return true;
    const lang = (navigator.language || '').toLowerCase();
    if (lang === 'tr' || lang.startsWith('tr-')) return true;
    const langs = (navigator.languages || []).map(l => (l || '').toLowerCase());
    if (langs.some(l => l === 'tr' || l.startsWith('tr-'))) return true;
  } catch (e) {}
  return false;
}

function isBlockedEmail(user) {
  if (!user || !user.email) return false;
  return BLOCKED_EMAILS.has(user.email.toLowerCase().trim());
}

export function shouldBlockUser(user) {
  return isBlockedEmail(user) || isTurkishLocale();
}

export function shouldBlockAnonymous() {
  return isTurkishLocale();
}

let _overlayShown = false;
export function showMaintenanceOverlay(opts = {}) {
  if (_overlayShown) return;
  _overlayShown = true;

  // Try to sign out (best-effort — don't block the overlay on it)
  try {
    import('./auth.js').then(m => {
      if (typeof m.signOut === 'function') m.signOut();
    }).catch(() => {});
  } catch (e) {}

  const overlay = document.createElement('div');
  overlay.id = 'maintenance-overlay';
  overlay.setAttribute('style', [
    'position:fixed',
    'inset:0',
    'z-index:2147483647',
    'background:#000',
    'color:#fff',
    'display:flex',
    'align-items:center',
    'justify-content:center',
    'font-family:Manrope,system-ui,-apple-system,sans-serif',
    '-webkit-font-smoothing:antialiased',
  ].join(';'));

  overlay.innerHTML = `
    <div style="max-width:440px;padding:40px 32px;text-align:center">
      <div style="font-size:22px;font-weight:600;letter-spacing:-0.01em;margin-bottom:14px">
        Under maintenance
      </div>
      <div style="font-size:14px;color:#9ca3af;line-height:1.6;margin-bottom:32px">
        The site is temporarily unavailable while we perform scheduled maintenance.
        <br>We'll be back on <strong style="color:#e5e7eb">30 April</strong>.
      </div>
      <button id="maintenance-ok-btn" style="
        padding:11px 32px;
        border:none;
        border-radius:8px;
        background:#fff;
        color:#000;
        font-family:Manrope,system-ui,sans-serif;
        font-size:14px;
        font-weight:600;
        cursor:pointer;
        transition:opacity 0.15s;
      ">OK</button>
    </div>
  `;

  // Wipe any existing body content and replace with overlay
  // (so users can't interact with anything underneath)
  document.body.appendChild(overlay);

  const btn = document.getElementById('maintenance-ok-btn');
  if (btn) {
    btn.onmouseenter = () => { btn.style.opacity = '0.85'; };
    btn.onmouseleave = () => { btn.style.opacity = '1'; };
    btn.onclick = () => {
      window.location.href = opts.redirect || 'landing.html';
    };
  }
}

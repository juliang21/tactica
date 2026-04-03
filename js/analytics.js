// ─── Analytics Module ─────────────────────────────────────────────────────────
// Google Analytics 4 event tracking for Táctica
//
// Replace the Measurement ID below with your own GA4 property ID.
// ──────────────────────────────────────────────────────────────────────────────

const GA_MEASUREMENT_ID = 'G-Q9VK1EXXN8';

// ─── Initialise gtag ─────────────────────────────────────────────────────────
(function initGA() {
  // Load gtag.js script
  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
  document.head.appendChild(script);

  // Initialise dataLayer + gtag function
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { window.dataLayer.push(arguments); };
  window.gtag('js', new Date());
  window.gtag('config', GA_MEASUREMENT_ID, {
    // Custom dimension so you can filter "Táctica Tool" traffic
    // inside your Rondos GA4 property
    custom_map: { dimension1: 'tool_name' },
    tool_name: 'tactica',
    send_page_view: true,
  });
})();

// ─── Helper ──────────────────────────────────────────────────────────────────
function send(eventName, params = {}) {
  // Always tag events with tool_name for easy filtering
  params.tool_name = 'tactica';
  if (typeof window.gtag === 'function') {
    window.gtag('event', eventName, params);
  }
}

// ─── 1. Element Selected ─────────────────────────────────────────────────────
// Fired when the user selects an existing element on the canvas.
export function trackElementSelected(elementType) {
  send('element_selected', {
    element_type: elementType,       // e.g. 'player', 'spotlight', 'arrow', …
    event_category: 'interaction',
  });
}

// ─── 2. Element Inserted ─────────────────────────────────────────────────────
// Fired when a new element is placed on the canvas.
export function trackElementInserted(elementType) {
  send('element_inserted', {
    element_type: elementType,
    event_category: 'creation',
  });
}

// ─── 3. Element Edited ──────────────────────────────────────────────────────
// Fired when the user changes a property of an element.
// `property` describes what changed (e.g. 'color', 'name', 'size', 'position').
export function trackElementEdited(elementType, property) {
  send('element_edited', {
    element_type: elementType,
    edit_property: property,         // e.g. 'color', 'name', 'scale', …
    event_category: 'editing',
  });
}

// ─── 4. Mode Switched ───────────────────────────────────────────────────────
// Fired when the user switches between Tactical Board and Image mode.
export function trackModeSwitch(mode) {
  send('mode_switch', {
    mode: mode,                      // 'pitch' or 'image'
    event_category: 'navigation',
  });
}

// ─── 5. Save / Export Clicked ────────────────────────────────────────────────
// Fired when the user clicks Save / Export button (opens the export modal).
export function trackExportClicked() {
  send('export_clicked', {
    event_category: 'export',
  });
}

// ─── 6. Export Completed ─────────────────────────────────────────────────────
// Fired when the user actually downloads the image in a specific format.
export function trackExportCompleted(format) {
  send('export_completed', {
    export_format: format,           // 'png' or 'jpg'
    event_category: 'export',
  });
}

// ─── 7. Sign Up (milestone!) ────────────────────────────────────────────────
// Fired when a new user creates an account. Key conversion event.
export function trackSignUp(method) {
  send('sign_up', {
    method: method,                  // 'google' or 'email'
    event_category: 'auth',
  });
}

// ─── 8. Sign In ─────────────────────────────────────────────────────────────
// Fired when an existing user signs in.
export function trackSignIn(method) {
  send('login', {
    method: method,                  // 'google' or 'email'
    event_category: 'auth',
  });
}

// ─── 9. Sign Out ────────────────────────────────────────────────────────────
export function trackSignOut() {
  send('sign_out', {
    event_category: 'auth',
  });
}

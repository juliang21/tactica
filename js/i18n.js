// ─── Localisation ────────────────────────────────────────────────────────────
// Phase 1 covers the landing gate and the Session Builder. Strings live here
// keyed by a dotted id; markup opts in with data-i18n attributes so a new
// string is one dictionary entry plus one attribute.
//
// Language resolution, in order:
//   1. ?lang= in the URL        — lets a link force a language
//   2. localStorage override    — what the coach picked, and it WINS
//   3. navigator.language       — our guess
//   4. 'en'
// The override is deliberately above detection: plenty of Spanish-speaking
// coaches prefer the English UI, and guessing from locale must never trap
// them. Until now the only way out was Chrome's auto-translate, which
// silently rewrote stored values (see normalizeCategory in training.js).

export const LANGS = {
  en: 'English', es: 'Español', de: 'Deutsch',
  fr: 'Français', it: 'Italiano', tr: 'Türkçe',
};
const STORE_KEY = 'tactica_lang';

const STRINGS = {
  en: {
    'landing.signin': 'Sign in',
    'landing.getStarted': 'Get started',
    'landing.headline1': 'Master Every Play',
    'landing.headline2': 'with Táctica',
    'landing.sub': "Elevate your coaching with Táctica's intuitive professional tactical board. Plan formations, draw dynamic plays, and analyze in real-time.",
    'landing.ratingLabel': 'average rating',
    'landing.reviewsWord': 'reviews',
    'landing.coachesLabel': 'coaches on Táctica',
    'landing.terms': 'Terms & Conditions',
    'landing.navBoard': 'Tactics Board',
    'landing.navSession': 'Session Planner',
    'landing.navAnalysis': 'Match Analysis',

    'nav.board': 'Tactical Board',
    'nav.image': 'Image Analysis',
    'nav.session': 'Session Builder',

    'menu.language': 'Language',
    'menu.signIn': 'Sign In',
    'menu.myAnalyses': 'My Analyses',
    'menu.signOut': 'Sign Out',

    'sb.eyebrow': 'SESSION BUILDER',
    'sb.title': 'Plan your sessions, design your drills.',
    'sb.sub': 'Build a full training session composed of drills, or save individual drills to your library.',
    'sb.newDrill': 'New Drill',
    'sb.newDrillDesc': 'Lay out players, cones, ladders and arrows on the pitch. Add objectives and step-by-step animation.',
    'sb.startDrill': 'Start a drill',
    'sb.newSession': 'New Session',
    'sb.newSessionDesc': 'Chain several drills into a full session. Warm-up to cool-down, with objectives and player counts.',
    'sb.planSession': 'Plan a session',
    'sb.searchPlaceholder': 'Search drills and sessions by name, category or objective…',
    'sb.myDrills': 'MY DRILLS',
    'sb.mySessions': 'MY SESSIONS',
    'sb.noDrills': 'No drills yet. Click <strong>New Drill</strong> above to create your first one.',
    'sb.noSessions': 'No sessions yet. Click <strong>New Session</strong> above to plan your first session.',
    'sb.drill': 'drill',
    'sb.drills': 'drills',
    'sb.sort': 'Sort',
    'sb.sortRecent': 'Last edited',
    'sb.sortCreated': 'Newest first',
    'sb.sortName': 'Name A–Z',
    'sb.sortDuration': 'Duration',
    'sb.all': 'All',
    'sb.of': 'of',
    'sb.noMatch': 'No drills match that search.',
    'sb.noneInCategory': 'No drills in this category.',
    'sb.players': 'Players',
    'sb.duration': 'Duration',
    'sb.equipment': 'Equipment',
    'sb.duplicate': 'Duplicate',
    'sb.delete': 'Delete',
    'sb.session': 'Session',
    'sb.untitledDrill': 'Untitled drill',
    'sb.untitledSession': 'Untitled session',

    'cat.warm-up': 'Warm-up',
    'cat.technical': 'Technical',
    'cat.possession': 'Possession',
    'cat.ssg': 'Small-sided game',
    'cat.phase-of-play': 'Phase of play',
    'cat.match': 'Match',
    'cat.cool-down': 'Cool-down',
    'cat.uncategorised': 'Uncategorised',

    // ── Phase 4: runtime messages (toasts, confirms) ──
    'dlg.clearAllTitle': "Clear all elements?",
    'dlg.clearAllDesc': "This will remove every player, zone, arrow, and annotation from the pitch. This cannot be undone.",
    'dlg.clearAllBtn': "Clear All",
    'dlg.clearStepsTitle': "Clear all {n} steps?",
    'dlg.clearStepsTitleOne': "Clear all 1 step?",
    'dlg.clearStepsDesc': "This will remove all animation steps and restore the pitch to its original state. This cannot be undone.",
    'dlg.deleteFolderTitle': "Delete Folder?",
    'dlg.deleteFolderDesc': "Delete \"{name}\"? Analyses inside will be moved to unfiled.",
    'dlg.shareTitle': "Share Analysis",
    'dlg.shareDesc': "This will create a public link. Anyone with the link can view this analysis — they'll need to sign up to make their own copy.",
    'dlg.shareBtn': "Share",
    'msg.couldNotLoadImage': "Could not load image",
    'msg.maxLogos': "You can add up to {n} logos.",
    'msg.defaultArrowSaved': "Saved as your default arrow style.",
    'msg.stepDeleted': "Step {n} deleted — Undo to bring it back.",
    'msg.needTwoSteps': "Add at least 2 steps before exporting.",
    'msg.videoExportFailed': "Video export failed.",
    'msg.analysisSaved': "Analysis saved",
    'msg.folderDeleted': "Folder deleted",
    'msg.analysisLoaded': "Analysis loaded: ",
    'msg.duplicated': "Duplicated",
    'msg.newAnalysis': "New analysis",
    'msg.autoSaved': "Auto-saved",
    'msg.sharedGone': "This shared analysis no longer exists.",
    'msg.sharedLoadFailed': "Could not load shared analysis. Please try again.",
    'msg.signInToShare': "Sign in to share.",
    'msg.shareFailed': "Failed to create share link. Please try again.",
    'msg.welcome': "Welcome to Táctica, ",
    'msg.copyUnavailable': "Copying isn't available in this browser — downloaded the image instead.",
    'msg.exportError': "Export error: ",
    'msg.drillNeedsName': "Please give your drill a name.",
    'msg.sessionNeedsName': "Please give your session a name.",
    'msg.drillLoadFailed': "Could not load drill.",
    'msg.sessionLoadFailed': "Could not load session.",
    'msg.drillSaveFailed': "Could not save drill. Please try again.",
    'msg.sessionSaveFailed': "Could not save session. Please try again.",
    'msg.drillDuplicateFailed': "Could not duplicate the drill. Please try again.",
    'msg.needOneDrill': "Add at least one drill before printing.",
    'msg.copiedAs': "Copied as \"{name}\".",
    'msg.savedToCloud': "cloud",
    'msg.savedToDevice': "this device",
    'msg.drillSaved': "Drill \"{name}\" saved to {where}.",
    'msg.sessionSaved': "Session \"{name}\" saved to {where}.",
    'msg.migrated': "{bits} from this device are now in your cloud library.",
    'msg.confirmDeleteDrill': "Delete drill \"{name}\"?",
    'msg.confirmDeleteSession': "Delete session \"{name}\"?",
    'msg.untitled': "Untitled",
    // ── Phase 3: dialogs, modals, remaining chrome ──
    'ui.board-short': 'Board',
    'ui.image-short': 'Image',
    'ui.8-99-mo': "€8.99/mo",
    'ui.89-yr': "€89/yr",
    'ui.a-new-way-to-use-tactica-build-individual-dr': "A new way to use Táctica: build individual drills or compose them into a full training session.",
    'ui.actions': "Actions",
    'ui.add-a-tactical-pitch-alongside-your-image-to': "Add a tactical pitch alongside your image to diagram plays.",
    'ui.add-drill': "Add drill",
    'ui.adds-it-to-your-swatches': "Adds it to your swatches",
    'ui.analyst-plan': "Analyst Plan",
    'ui.angle': "Angle",
    'ui.animation': "Animation",
    'ui.annotate-your-match-image-with-players-arrow': "Annotate your match image with players, arrows, zones, and text.",
    'ui.anyone-with-this-link-can-view-your-analysis': "Anyone with this link can view your analysis.",
    'ui.apply': "Apply",
    'ui.attach-screenshot-optional': "Attach screenshot (optional)",
    'ui.back': "Back",
    'ui.back-to-sign-in': "← Back to Sign In",
    'ui.bottom': "↓ Bottom",
    'ui.bug': "🐛 Bug",
    'ui.build-a-session': "Build a session",
    'ui.cancel': "Cancel",
    'ui.cancel-anytime-secure-payment-via-stripe': "Cancel anytime. Secure payment via Stripe.",
    'ui.center': "Center",
    'ui.click-any-element-on-the-pitch-to-edit-it': "Click any element on the pitch to edit it.",
    'ui.click-through-so-you-can-select-players-over': "Click-through so you can select players over it",
    'ui.clubs': "Clubs",
    'ui.combine-multiple-saved-drills-into-an-ordere': "Combine multiple saved drills into an ordered training session with overall objectives.",
    'ui.copy-puts-the-image-on-your-clipboard-paste-': "Copy puts the image on your clipboard — paste it straight into WhatsApp, X or Slack. No file saved.",
    'ui.create-a-drill': "Create a drill",
    'ui.create-account': "Create Account",
    'ui.create-your-first-tactical-analysis-and-save': "Create your first tactical analysis and save it here",
    'ui.crop-to-circle': "Crop to circle",
    'ui.curved': "Curved",
    'ui.custom': "Custom",
    'ui.dashed': "Dashed",
    'ui.defensive': "Defensive",
    'ui.delete': "Delete",
    'ui.delete-analysis': "Delete Analysis?",
    'ui.detect-player': "Detect Player",
    'ui.distort': "Distort",
    'ui.done': "Done",
    'ui.dotted': "Dotted",
    'ui.download': "Download",
    'ui.drop-a-match-screenshot-or-tactical-image-he': "Drop a match screenshot or tactical image here, or click to browse.",
    'ui.drop-players-jokers-cones-small-goals-arrows': "Drop players, jokers, cones, small goals, arrows and zones on the pitch. Add objectives, variants and step-by-step animation.",
    'ui.elements': "elements",
    'ui.enter-your-email-and-we-ll-send-a-reset-link': "Enter your email and we'll send a reset link.",
    'ui.equipment': "Equipment",
    'ui.export-pitch': "Export Pitch",
    'ui.faded': "Faded",
    'ui.feedback': "Feedback",
    'ui.fine-tune': "Fine-tune",
    'ui.forgot-password': "Forgot password?",
    'ui.general': "General",
    'ui.goals': "Goals",
    'ui.hides-the-watermark-from-the-board-and-expor': "Hides the watermark from the board and exports.",
    'ui.highlight': "Highlight",
    'ui.horizontal-grid': "Horizontal grid",
    'ui.how-it-looks': "How it looks",
    'ui.how-s-tactica-working-for-you': "How's Táctica working for you?",
    'ui.improvement': "💡 Improvement",
    'ui.leave-feedback': "Leave feedback",
    'ui.left': "← Left",
    'ui.let-s-go': "Let's go",
    'ui.line': "Line",
    'ui.line-angle': "Line angle",
    'ui.line-colour': "Line colour",
    'ui.line-length': "Line length",
    'ui.link-ready': "Link Ready",
    'ui.lossless-transparent-friendly': "lossless, transparent-friendly",
    'ui.manage-subscription': "Manage Subscription",
    'ui.marker': "Marker",
    'ui.maybe-later': "Maybe later",
    'ui.monthly': "Monthly",
    'ui.movement-zones': "Movement & Zones",
    'ui.my-analyses': "My Analyses",
    'ui.national': "National",
    'ui.new-arrows-will-use-this-style-automatically': "New arrows will use this style automatically.",
    'ui.new-drill': "New Drill",
    'ui.new-session': "New Session",
    'ui.no-equipment': "No equipment",
    'ui.no-saved-analyses-yet': "No saved analyses yet",
    'ui.notes': "Notes",
    'ui.offensive': "Offensive",
    'ui.optional': "(optional)",
    'ui.or': "or",
    'ui.outline-only': "Outline only",
    'ui.oval': "Oval",
    'ui.pass': "Pass",
    'ui.pick-colour': "Pick colour",
    'ui.pitch-colour': "Pitch colour",
    'ui.pitch-type': "Pitch type",
    'ui.plan-your-sessions-and-design-drills': "Plan your sessions and design drills.",
    'ui.players': "Players",
    'ui.pointed': "Pointed",
    'ui.powered-by': "Powered by",
    'ui.press': "Press",
    'ui.rectangle': "Rectangle",
    'ui.resize': "Resize",
    'ui.right': "→ Right",
    'ui.rondo': "Rondo",
    'ui.rounded': "Rounded",
    'ui.run': "Run",
    'ui.save': "Save",
    'ui.save-17': "Save 17%",
    'ui.save-analysis': "Save Analysis",
    'ui.save-this-colour': "Save this colour",
    'ui.save-to-the-cloud': "Save to the cloud",
    'ui.scale': "Scale",
    'ui.send-feedback': "Send Feedback",
    'ui.send-reset-link': "Send Reset Link",
    'ui.session-drills': "Session drills",
    'ui.set-as-default-arrow': "★ Set as default arrow",
    'ui.setup-amp-instructions': "(setup & instructions)",
    'ui.shared-analysis': "Shared analysis",
    'ui.sharp': "Sharp",
    'ui.show-arms': "Show arms",
    'ui.show-pitch': "Show pitch",
    'ui.show-tactica-football-watermark': "Show tactica.football watermark",
    'ui.sign-in': "Sign In",
    'ui.sign-in-to-keep-your-drills-and-sessions-in-': "Sign in to keep your drills and sessions in your library and access them from anywhere.",
    'ui.sign-out': "Sign Out",
    'ui.sign-up': "Sign Up",
    'ui.sign-up-to-edit': "Sign up to edit",
    'ui.smaller-file-size': "smaller file size",
    'ui.soft': "Soft",
    'ui.solid': "Solid",
    'ui.space': "Space",
    'ui.square': "Square",
    'ui.straight': "Straight",
    'ui.stripes': "Stripes",
    'ui.strong': "Strong",
    'ui.submit-review': "Submit Review",
    'ui.switch': "Switch",
    'ui.switch-mode': "Switch mode?",
    'ui.switching-will-erase-your-current-work-are-y': "Switching will erase your current work. Are you sure?",
    'ui.tactical-board': "Tactical Board",
    'ui.this-cannot-be-undone': "This cannot be undone.",
    'ui.this-feature': "This feature",
    'ui.this-is-a-beta-your-feedback-shapes-what-com': "This is a beta — your feedback shapes what comes next.",
    'ui.tilt-x': "Tilt X",
    'ui.tilt-y': "Tilt Y",
    'ui.top': "↑ Top",
    'ui.upgrade-to-analyst': "Upgrade to Analyst",
    'ui.upload-a-match-screenshot-or-tactical-image-': "Upload a match screenshot or tactical image to start your analysis.",
    'ui.upload-image': "Upload Image",
    'ui.vertical': "Vertical",
    'ui.vertical-grid': "Vertical grid",
    'ui.very-round': "Very round",
    'ui.welcome-to-session-builder': "Welcome to Session Builder",
    'ui.your-feedback-shapes-what-we-build-next': "Your feedback shapes what we build next",
    'ui.your-review-may-be-featured-on-our-website': "Your review may be featured on our website",

    // ── Phase 2: toolbar, panels and forms ──
    'tab.editTeam': 'Edit Team',
    'tab.drill': 'Drill',
    'tab.pitch': 'Pitch',
    'tab.selection': 'Selection',
    'acc.teamAppearance': 'Team appearance',
    'acc.formation': 'Formation',
    'acc.kitColour': 'Kit colour',
    'top.save': 'Save',
    'top.saveDrill': 'Save Drill',
    'top.saveSession': 'Save Session',
    'top.export': 'Export',
    'field.alignment': "Alignment",
    'field.arm-rotation': "Arm rotation",
    'field.background': "Background",
    'field.background-all-players': "Background (all players)",
    'field.background-colour': "Background colour",
    'field.bar-colour': "Bar Colour",
    'field.body-size': "Body Size",
    'field.border': "Border",
    'field.border-colour': "Border colour",
    'field.border-colour-all-players': "Border colour (all players)",
    'field.border-style': "Border style",
    'field.colour': "Colour",
    'field.content': "Content",
    'field.corners': "Corners",
    'field.curvature': "Curvature",
    'field.description': "Description",
    'field.edges': "Edges",
    'field.fill-colour': "Fill colour",
    'field.fill-style': "Fill style",
    'field.font-size': "Font size",
    'field.handles': "Handles",
    'field.head-size': "Head size",
    'field.height': "Height",
    'field.jersey-style': "Jersey style",
    'field.jersey-style-all-players': "Jersey style (all players)",
    'field.label': "Label",
    'field.line-colour': "Line colour",
    'field.line-style': "Line style",
    'field.name': "Name",
    'field.name-background': "Name background",
    'field.name-colour': "Name colour",
    'field.name-size': "Name size",
    'field.name-your-analysis': "Name your analysis",
    'field.number': "Number",
    'field.opacity': "Opacity",
    'field.perspective': "Perspective",
    'field.purpose': "Purpose",
    'field.ring': "Ring",
    'field.rotation': "Rotation",
    'field.secondary-colour': "Secondary colour",
    'field.secondary-colour-all-players': "Secondary colour (all players)",
    'field.shape': "Shape",
    'field.size': "Size",
    'field.size-all-players': "Size (all players)",
    'field.style': "Style",
    'field.text-colour': "Text colour",
    'field.text-position': "Text position",
    'field.title': "Title",
    'field.title-size': "Title Size",
    'field.type': "Type",
    'field.value': "Value",
    'field.value-colour': "Value colour",
    'field.width': "Width",
    'form.category': "Category",
    'form.coaching-points': "Coaching points",
    'form.description': "Description",
    'form.drill-name': "Drill name",
    'form.duration-min': "Duration (min)",
    'form.equipment': "Equipment",
    'form.number-of-players': "Number of players",
    'form.objectives': "Objectives",
    'form.players': "Players",
    'form.progression-variants': "Progression / variants",
    'form.session-name': "Session name",
    'panel.add-a-drill-to-this-session': "Add a drill to this session",
    'panel.arrow-line': "Arrow / Line",
    'panel.callout': "Callout",
    'panel.chain-link': "Chain link",
    'panel.disc-cone': "Disc cone",
    'panel.headline': "Headline",
    'panel.highlight': "Highlight",
    'panel.hoop': "Hoop",
    'panel.image-analysis': "Image Analysis",
    'panel.ladder': "Ladder",
    'panel.line-colour': "Line colour",
    'panel.logo': "Logo",
    'panel.mannequin': "Mannequin",
    'panel.marker': "Marker",
    'panel.options': "Options",
    'panel.pitch-colour': "Pitch colour",
    'panel.player': "Player",
    'panel.player-s-vision': "Player's Vision",
    'panel.pole': "Pole",
    'panel.referee': "Referee",
    'panel.rotation': "Rotation",
    'panel.side-pitch': "Side Pitch",
    'panel.size': "Size",
    'panel.size-orientation': "Size & Orientation",
    'panel.text': "Text",
    'panel.unit': "Unit",
    'panel.watermark': "Watermark",
    'panel.zoom': "Zoom",
    'tool.arrow': "Arrow",
    'tool.away': "Away",
    'tool.ball': "Ball",
    'tool.callout': "Callout",
    'tool.chain': "Chain",
    'tool.clear-all': "Clear All",
    'tool.cone': "Cone",
    'tool.connect': "Connect",
    'tool.detect-player': "Detect Player",
    'tool.detect': "Detect",
    'tool.disc': "Disc",
    'tool.free-zone': "Free Zone",
    'tool.goal': "Goal",
    'tool.headline': "Headline",
    'tool.highlight': "Highlight",
    'tool.home': "Home",
    'tool.hoop': "Hoop",
    'tool.joker': "Joker",
    'tool.ladder': "Ladder",
    'tool.logo': "Logo",
    'tool.mannequin': "Mannequin",
    'tool.marker': "Marker",
    'tool.pair': "Pair",
    'tool.pole': "Pole",
    'tool.referee': "Referee",
    'tool.select': "Select",
    'tool.step': "Step",
    'tool.text': "Text",
    'tool.undo': "Undo",
    'tool.unit': "Unit",
    'tool.vision': "Vision",
    'tool.zone': "Zone",
    'tool.zoom': "Zoom",
    'toolgroup.actions': "Actions",
    'toolgroup.animation': "Animation",
    'toolgroup.annotations': "Annotations",
    'toolgroup.essentials': "Essentials",
  },
};

function readStored() {
  try { const v = localStorage.getItem(STORE_KEY); return LANGS[v] ? v : null; }
  catch (e) { return null; }
}
function detect() {
  const list = navigator.languages && navigator.languages.length
    ? navigator.languages : [navigator.language || 'en'];
  for (const l of list) {
    const base = String(l).toLowerCase().split('-')[0];
    if (LANGS[base]) return base;
  }
  return 'en';
}

let _lang = (() => {
  try {
    const q = new URLSearchParams(location.search).get('lang');
    if (q && LANGS[q]) return q;
  } catch (e) {}
  return readStored() || detect();
})();

export function getLang() { return _lang; }
// True only when the coach picked a language themselves; detection is a guess.
export function hasExplicitLang() { return !!readStored(); }

export function t(key, fallback) {
  const d = STRINGS[_lang] || STRINGS.en;
  return (key in d) ? d[key] : (STRINGS.en[key] ?? fallback ?? key);
}
// Strict lookup: undefined when the key is unknown in BOTH dictionaries, so
// applyI18n can leave the existing markup in place instead of painting the
// raw key onto the screen.
function tStrict(key) {
  const d = STRINGS[_lang] || STRINGS.en;
  if (key in d) return d[key];
  if (key in STRINGS.en) return STRINGS.en[key];
  return undefined;
}

// t() with {placeholder} substitution, so a message keeps one dictionary entry
// instead of being glued together from fragments that translate badly.
export function tf(key, vars = {}, fallback) {
  let out = t(key, fallback);
  for (const k in vars) out = out.split('{' + k + '}').join(String(vars[k]));
  return out;
}

// Non-English dictionaries live in js/i18n/<lang>.js and are fetched the first
// time that language is used, so a visitor only downloads the one they read.
// English is inline above and always available, which is why applyI18n can run
// synchronously on first paint.
const _loading = new Map();
export function loadLang(lang) {
  if (lang === 'en' || STRINGS[lang]) return Promise.resolve(STRINGS[lang]);
  if (_loading.has(lang)) return _loading.get(lang);
  const p = import(`./i18n/${lang}.js?v=1`)
    .then(m => { STRINGS[lang] = m.default; return STRINGS[lang]; })
    .catch(e => { console.warn('[i18n] could not load', lang, e); return null; });
  _loading.set(lang, p);
  return p;
}

export function setLang(lang, { persist = true } = {}) {
  if (!LANGS[lang]) return;
  _lang = lang;
  if (persist) { try { localStorage.setItem(STORE_KEY, lang); } catch (e) {} }
  document.documentElement.lang = lang;
  // Paint immediately when the dictionary is already in memory; otherwise fetch
  // it first so we never flash a half-translated UI.
  const done = () => {
    applyI18n();
    window.dispatchEvent(new CustomEvent('tactica:langchange', { detail: { lang } }));
  };
  if (lang === 'en' || STRINGS[lang]) done(); else loadLang(lang).then(done);
}

// Walks the DOM and fills in anything tagged. data-i18n sets text,
// data-i18n-html sets markup (for strings with <strong>), and
// data-i18n-attr="placeholder:key,title:key" sets attributes.
// Keep every .lang-switch in sync — there is one on the gate and one in the
// account menu, and both must show the active language.
function paintSwitches() {
  // One <select> per switcher (gate + account menu). Populated here rather than
  // in markup so adding a language is a single entry in LANGS.
  document.querySelectorAll('.lang-select').forEach(sel => {
    if (sel.options.length !== Object.keys(LANGS).length) {
      sel.innerHTML = Object.entries(LANGS)
        .map(([code, name]) => `<option value="${code}">${name}</option>`).join('');
    }
    sel.value = _lang;
  });
}

export function applyI18n(root = document) {
  paintSwitches();
  root.querySelectorAll('[data-i18n]').forEach(el => {
    const v = tStrict(el.dataset.i18n);
    if (v !== undefined) el.textContent = v;
  });
  root.querySelectorAll('[data-i18n-html]').forEach(el => {
    const v = tStrict(el.dataset.i18nHtml);
    if (v !== undefined) el.innerHTML = v;
  });
  root.querySelectorAll('[data-i18n-attr]').forEach(el => {
    el.dataset.i18nAttr.split(',').forEach(pair => {
      const [attr, key] = pair.split(':').map(s => s.trim());
      const v = attr && tStrict(key);
      if (v !== undefined && v !== false) el.setAttribute(attr, v);
    });
  });
}

document.documentElement.lang = _lang;
function _boot() {
  if (_lang === 'en') { applyI18n(); return; }
  loadLang(_lang).then(() => applyI18n());
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', _boot);
} else {
  _boot();
}
window.__tacticaSetLang = setLang;
window.__tacticaGetLang = getLang;

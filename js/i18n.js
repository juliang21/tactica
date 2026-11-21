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

export const LANGS = { en: 'English', es: 'Español' };
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
  },
  es: {
    'landing.signin': 'Iniciar sesión',
    'landing.getStarted': 'Empezar',
    'landing.headline1': 'Domina cada jugada',
    'landing.headline2': 'con Táctica',
    'landing.sub': 'Lleva tu entrenamiento más lejos con la pizarra táctica profesional de Táctica. Diseña formaciones, dibuja jugadas y analiza en tiempo real.',
    'landing.ratingLabel': 'valoración media',
    'landing.reviewsWord': 'reseñas',
    'landing.coachesLabel': 'entrenadores en Táctica',
    'landing.terms': 'Términos y Condiciones',
    'landing.navBoard': 'Pizarra Táctica',
    'landing.navSession': 'Planificador de Entrenamientos',
    'landing.navAnalysis': 'Análisis de Partido',

    'nav.board': 'Pizarra Táctica',
    'nav.image': 'Análisis de Imagen',
    'nav.session': 'Entrenamientos',

    'menu.language': 'Idioma',
    'menu.signIn': 'Iniciar sesión',
    'menu.myAnalyses': 'Mis análisis',
    'menu.signOut': 'Cerrar sesión',

    'sb.eyebrow': 'ENTRENAMIENTOS',
    'sb.title': 'Planifica tus sesiones, diseña tus ejercicios.',
    'sb.sub': 'Crea una sesión de entrenamiento completa a partir de ejercicios, o guarda ejercicios sueltos en tu biblioteca.',
    'sb.newDrill': 'Nuevo ejercicio',
    'sb.newDrillDesc': 'Coloca jugadores, conos, escaleras y flechas sobre el campo. Añade objetivos y animación paso a paso.',
    'sb.startDrill': 'Crear ejercicio',
    'sb.newSession': 'Nueva sesión',
    'sb.newSessionDesc': 'Encadena varios ejercicios en una sesión completa. Del calentamiento a la vuelta a la calma, con objetivos y número de jugadores.',
    'sb.planSession': 'Planificar sesión',
    'sb.searchPlaceholder': 'Busca ejercicios y sesiones por nombre, categoría u objetivo…',
    'sb.myDrills': 'MIS EJERCICIOS',
    'sb.mySessions': 'MIS SESIONES',
    'sb.noDrills': 'Todavía no hay ejercicios. Pulsa <strong>Nuevo ejercicio</strong> arriba para crear el primero.',
    'sb.noSessions': 'Todavía no hay sesiones. Pulsa <strong>Nueva sesión</strong> arriba para planificar la primera.',
    'sb.drill': 'ejercicio',
    'sb.drills': 'ejercicios',
    'sb.sort': 'Ordenar',
    'sb.sortRecent': 'Última edición',
    'sb.sortCreated': 'Más recientes',
    'sb.sortName': 'Nombre A–Z',
    'sb.sortDuration': 'Duración',
    'sb.all': 'Todos',
    'sb.of': 'de',
    'sb.noMatch': 'Ningún ejercicio coincide con la búsqueda.',
    'sb.noneInCategory': 'No hay ejercicios en esta categoría.',
    'sb.players': 'Jugadores',
    'sb.duration': 'Duración',
    'sb.equipment': 'Material',
    'sb.duplicate': 'Duplicar',
    'sb.delete': 'Eliminar',
    'sb.session': 'Sesión',
    'sb.untitledDrill': 'Ejercicio sin título',
    'sb.untitledSession': 'Sesión sin título',

    'cat.warm-up': 'Calentamiento',
    'cat.technical': 'Técnico',
    'cat.possession': 'Posesión',
    'cat.ssg': 'Juego reducido',
    'cat.phase-of-play': 'Fase de juego',
    'cat.match': 'Partido',
    'cat.cool-down': 'Vuelta a la calma',
    'cat.uncategorised': 'Sin categoría',
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

export function setLang(lang, { persist = true } = {}) {
  if (!LANGS[lang]) return;
  _lang = lang;
  if (persist) { try { localStorage.setItem(STORE_KEY, lang); } catch (e) {} }
  document.documentElement.lang = lang;
  applyI18n();
  window.dispatchEvent(new CustomEvent('tactica:langchange', { detail: { lang } }));
}

// Walks the DOM and fills in anything tagged. data-i18n sets text,
// data-i18n-html sets markup (for strings with <strong>), and
// data-i18n-attr="placeholder:key,title:key" sets attributes.
// Keep every .lang-switch in sync — there is one on the gate and one in the
// account menu, and both must show the active language.
function paintSwitches() {
  document.querySelectorAll('.lang-switch button[data-lang]').forEach(b => {
    b.classList.toggle('active', b.dataset.lang === _lang);
    b.setAttribute('aria-pressed', String(b.dataset.lang === _lang));
  });
}

export function applyI18n(root = document) {
  paintSwitches();
  root.querySelectorAll('[data-i18n]').forEach(el => {
    const v = t(el.dataset.i18n);
    if (v != null) el.textContent = v;
  });
  root.querySelectorAll('[data-i18n-html]').forEach(el => {
    const v = t(el.dataset.i18nHtml);
    if (v != null) el.innerHTML = v;
  });
  root.querySelectorAll('[data-i18n-attr]').forEach(el => {
    el.dataset.i18nAttr.split(',').forEach(pair => {
      const [attr, key] = pair.split(':').map(s => s.trim());
      if (attr && key) el.setAttribute(attr, t(key));
    });
  });
}

document.documentElement.lang = _lang;
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => applyI18n());
} else {
  applyI18n();
}
window.__tacticaSetLang = setLang;
window.__tacticaGetLang = getLang;

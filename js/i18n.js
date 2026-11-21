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

    // ── Phase 2: toolbar, panels and forms ──
    'tab.editTeam': 'Equipo',
    'tab.drill': 'Ejercicio',
    'tab.pitch': 'Campo',
    'tab.selection': 'Selección',
    'acc.teamAppearance': 'Aspecto del equipo',
    'acc.formation': 'Formación',
    'acc.kitColour': 'Color de la equipación',
    'top.save': 'Guardar',
    'top.saveDrill': 'Guardar ejercicio',
    'top.saveSession': 'Guardar sesión',
    'top.export': 'Exportar',
    'field.alignment': "Alineación",
    'field.arm-rotation': "Rotación de brazos",
    'field.background': "Fondo",
    'field.background-all-players': "Fondo (todos los jugadores)",
    'field.background-colour': "Color de fondo",
    'field.bar-colour': "Color de la barra",
    'field.body-size': "Tamaño del cuerpo",
    'field.border': "Borde",
    'field.border-colour': "Color del borde",
    'field.border-colour-all-players': "Color del borde (todos los jugadores)",
    'field.border-style': "Estilo del borde",
    'field.colour': "Color",
    'field.content': "Contenido",
    'field.corners': "Esquinas",
    'field.curvature': "Curvatura",
    'field.description': "Descripción",
    'field.edges': "Bordes",
    'field.fill-colour': "Color de relleno",
    'field.fill-style': "Estilo de relleno",
    'field.font-size': "Tamaño de letra",
    'field.handles': "Manejadores",
    'field.head-size': "Tamaño de punta",
    'field.height': "Altura",
    'field.jersey-style': "Estilo de camiseta",
    'field.jersey-style-all-players': "Estilo de camiseta (todos los jugadores)",
    'field.label': "Etiqueta",
    'field.line-colour': "Color de líneas",
    'field.line-style': "Estilo de línea",
    'field.name': "Nombre",
    'field.name-background': "Fondo del nombre",
    'field.name-colour': "Color del nombre",
    'field.name-size': "Tamaño del nombre",
    'field.name-your-analysis': "Nombra tu análisis",
    'field.number': "Dorsal",
    'field.opacity': "Opacidad",
    'field.perspective': "Perspectiva",
    'field.purpose': "Función",
    'field.ring': "Anillo",
    'field.rotation': "Rotación",
    'field.secondary-colour': "Color secundario",
    'field.secondary-colour-all-players': "Color secundario (todos los jugadores)",
    'field.shape': "Forma",
    'field.size': "Tamaño",
    'field.size-all-players': "Tamaño (todos los jugadores)",
    'field.style': "Estilo",
    'field.text-colour': "Color del texto",
    'field.text-position': "Posición del texto",
    'field.title': "Título",
    'field.title-size': "Tamaño del título",
    'field.type': "Tipo",
    'field.value': "Valor",
    'field.value-colour': "Color del valor",
    'field.width': "Anchura",
    'form.category': "Categoría",
    'form.coaching-points': "Puntos de entrenamiento",
    'form.description': "Descripción",
    'form.drill-name': "Nombre del ejercicio",
    'form.duration-min': "Duración (min)",
    'form.equipment': "Material",
    'form.number-of-players': "Número de jugadores",
    'form.objectives': "Objetivos",
    'form.players': "Jugadores",
    'form.progression-variants': "Progresión / variantes",
    'form.session-name': "Nombre de la sesión",
    'panel.add-a-drill-to-this-session': "Añadir un ejercicio a esta sesión",
    'panel.arrow-line': "Flecha / Línea",
    'panel.callout': "Etiqueta",
    'panel.chain-link': "Cadena",
    'panel.disc-cone': "Seta",
    'panel.headline': "Título",
    'panel.highlight': "Foco",
    'panel.hoop': "Aro",
    'panel.image-analysis': "Análisis de imagen",
    'panel.ladder': "Escalera",
    'panel.line-colour': "Color de líneas",
    'panel.logo': "Escudo",
    'panel.mannequin': "Maniquí",
    'panel.marker': "Marcador",
    'panel.options': "Opciones",
    'panel.pitch-colour': "Color del campo",
    'panel.player': "Jugador",
    'panel.player-s-vision': "Visión del jugador",
    'panel.pole': "Pica",
    'panel.referee': "Árbitro",
    'panel.rotation': "Rotación",
    'panel.side-pitch': "Campo lateral",
    'panel.size': "Tamaño",
    'panel.size-orientation': "Tamaño y orientación",
    'panel.text': "Texto",
    'panel.unit': "Línea",
    'panel.watermark': "Marca de agua",
    'panel.zoom': "Zoom",
    'tool.arrow': "Flecha",
    'tool.away': "Visitante",
    'tool.ball': "Balón",
    'tool.callout': "Etiqueta",
    'tool.chain': "Cadena",
    'tool.clear-all': "Borrar todo",
    'tool.cone': "Cono",
    'tool.connect': "Conectar",
    'tool.detect-player': "Detectar jugador",
    'tool.disc': "Seta",
    'tool.free-zone': "Zona libre",
    'tool.goal': "Portería",
    'tool.headline': "Título",
    'tool.highlight': "Foco",
    'tool.home': "Local",
    'tool.hoop': "Aro",
    'tool.joker': "Comodín",
    'tool.ladder': "Escalera",
    'tool.logo': "Escudo",
    'tool.mannequin': "Maniquí",
    'tool.marker': "Marcador",
    'tool.pair': "Pareja",
    'tool.pole': "Pica",
    'tool.referee': "Árbitro",
    'tool.select': "Seleccionar",
    'tool.step': "Paso",
    'tool.text': "Texto",
    'tool.undo': "Deshacer",
    'tool.unit': "Línea",
    'tool.vision': "Visión",
    'tool.zone': "Zona",
    'tool.zoom': "Zoom",
    'toolgroup.actions': "Acciones",
    'toolgroup.animation': "Animación",
    'toolgroup.annotations': "Anotaciones",
    'toolgroup.essentials': "Esenciales",
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
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => applyI18n());
} else {
  applyI18n();
}
window.__tacticaSetLang = setLang;
window.__tacticaGetLang = getLang;

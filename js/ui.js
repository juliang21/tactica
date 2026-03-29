import * as S from './state.js';
import { deselect, select, switchTab, applyTransform, updateArrowVisual, updateSpotlightNameBg } from './interaction.js';
import { addPlayer, rewrapTextBox } from './elements.js';
import { trackElementEdited } from './analytics.js';

// ─── Tool Selection ───────────────────────────────────────────────────────────
export function setTool(t) {
  S.setTool(t);
  document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
  const btn = document.querySelector(`[data-tool="${t}"]`);
  if (btn) btn.classList.add('active');
  if (t === 'arrow') {
    document.getElementById('arrow-' + S.arrowType + '-btn').classList.add('active');
  }
  document.body.className = 'tool-' + (t.startsWith('player') ? 'player' : t.startsWith('shadow') ? 'shadow' : t === 'textbox' ? 'textbox' : t);
  if (!t.startsWith('player')) deselect();
}

export function setArrowType(type) {
  S.setArrowType(type);
  ['run','pass','line'].forEach(t => document.getElementById('arrow-' + t + '-btn').classList.remove('active'));
  document.getElementById('arrow-' + type + '-btn').classList.add('active');
}

// ─── Team Context ─────────────────────────────────────────────────────────────
export function selectTeamContext(team) {
  S.setTeamContext(team);
  document.getElementById('team-a-pill').classList.toggle('active', team === 'a');
  document.getElementById('team-b-pill').classList.toggle('active', team === 'b');
}

// ─── Kit Colours ──────────────────────────────────────────────────────────────
export function applyKit(el) {
  document.querySelectorAll('.kit-btn').forEach(b => b.classList.remove('selected'));
  el.classList.add('selected');
  const color = el.dataset.color, gkColor = el.dataset.gk || '#a8f0d0';
  S.teamColors[S.teamContext] = color;
  S.gkColors[S.teamContext] = gkColor;
  document.getElementById('dot-' + S.teamContext).style.background = color;
  updateTeamPlayerColors(S.teamContext, color, gkColor);
}

export function applyColor(swatchEl) {
  document.querySelectorAll('.color-swatch, .custom-swatch').forEach(s => s.classList.remove('selected'));
  swatchEl.classList.add('selected');
  const color = swatchEl.dataset.color;
  if (S.selectedEl && S.selectedEl.dataset.type === 'player') {
    setPlayerColor(S.selectedEl, color);
  } else {
    S.teamColors[S.teamContext] = color;
    document.getElementById('dot-' + S.teamContext).style.background = color;
    S.playersLayer.querySelectorAll(`g[data-team="${S.teamContext}"]`).forEach(g => {
      if (g.dataset.isGK !== '1') setPlayerColor(g, color);
    });
  }
}

function setPlayerColor(g, color) {
  const circ = g.querySelector('circle');
  if (circ) {
    circ.setAttribute('fill', color);
    circ.setAttribute('stroke', S.isDarkColor(color) ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.15)');
    circ.setAttribute('stroke-width', '1.5');
  }
  delete g.dataset.borderColor;
  const txt = g.querySelectorAll('text')[0];
  if (txt) txt.setAttribute('fill', S.isDarkColor(color) ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.75)');
}

function updateTeamPlayerColors(team, color, gkColor) {
  S.playersLayer.querySelectorAll(`g[data-team="${team}"]`).forEach(g => {
    const isGK = g.dataset.isGK === '1';
    const c = isGK ? gkColor : color;
    setPlayerColor(g, c);
  });
}

// ─── Formations ───────────────────────────────────────────────────────────────
export function placeFormation(name) {
  S.pushUndo();
  const team = S.teamContext;
  Array.from(S.playersLayer.querySelectorAll(`g[data-team="${team}"]`)).forEach(el => el.remove());
  S.playerCounts[team] = 0;

  const isV = S.currentPitchLayout.endsWith('-v');
  const isHalf = S.currentPitchLayout.startsWith('half');
  const W = parseFloat(S.svg.getAttribute('width'));
  const H = parseFloat(S.svg.getAttribute('height'));

  S.FORMATIONS[name].forEach(([xf, yf], i) => {
    const isGK = i === 0;
    let x, y;
    // xf = depth (0=own goal, 1=opponent goal), yf = lateral spread (0=top, 1=bottom)
    // Map depth so forwards reach ~60% (just past midfield), not into opponent's half
    const depth = 0.05 + xf * 0.88;  // GK ~0.10, forwards ~0.61

    if (isHalf) {
      // Half pitch (vertical): depth → Y axis (goal at bottom, halfway at top), lateral → X axis
      const pad=20, py=20, pw=W-pad*2, ph=H-py*2;
      const d = (0.05 + xf * 1.30) * ph;
      x = pad + yf * pw;
      y = team === 'a' ? py + ph - d : py + d;
    } else if (!isV) {
      // Full horizontal: depth → X axis, lateral → Y axis
      const pad=30, py=20, pw=W-pad*2, ph=H-py*2;
      y = py + yf * ph;
      x = team === 'a' ? pad + depth * pw : pad + pw - depth * pw;
    } else {
      // Full vertical: depth → Y axis, lateral → X axis
      const pad=20, px=20, pw=W-pad*2, ph=H-px*2;
      x = pad + yf * pw;
      y = team === 'a' ? px + depth * ph : px + ph - depth * ph;
    }

    addPlayer(x, y, team, i+1, isGK);
  });
  setTool('select');
}

// ─── Player Edit ──────────────────────────────────────────────────────────────
export function liveUpdateNumber(val) {
  if (!S.selectedEl || S.selectedEl.dataset.type !== 'player') return;
  S.selectedEl.querySelectorAll('text')[0].textContent = val;
}

export function confirmNumber() {
  if (!S.selectedEl || S.selectedEl.dataset.type !== 'player') return;
  const val = document.getElementById('number-input').value.trim();
  if (!val) return;
  trackElementEdited('player', 'number');
  S.selectedEl.dataset.label = val;
  S.selectedEl.querySelectorAll('text')[0].textContent = val;
}

export function liveUpdateName(val) {
  if (!S.selectedEl || S.selectedEl.dataset.type !== 'player') return;
  const nl = S.selectedEl.querySelector('.player-name');
  if (!nl) return;
  if (val.trim()) { nl.textContent = val; nl.style.display = ''; setTimeout(() => updatePlayerNameBg(S.selectedEl), 0); }
  else { nl.style.display = 'none'; const bg = S.selectedEl.querySelector('.player-name-bg'); if (bg) bg.remove(); }
}

export function confirmName() {
  if (!S.selectedEl || S.selectedEl.dataset.type !== 'player') return;
  const val = document.getElementById('name-input').value.trim();
  trackElementEdited('player', 'name');
  S.selectedEl.dataset.playerName = val;
  const nl = S.selectedEl.querySelector('.player-name');
  if (!nl) return;
  if (val) { nl.textContent = val; nl.style.display = ''; setTimeout(() => updatePlayerNameBg(S.selectedEl), 0); }
  else { nl.style.display = 'none'; nl.textContent = ''; const bg = S.selectedEl.querySelector('.player-name-bg'); if (bg) bg.remove(); }
}

// ─── Name Style ───────────────────────────────────────────────────────────────
export function applyNameSize(val) {
  document.getElementById('name-size-val').textContent = val + 'px';
  if (!S.selectedEl || S.selectedEl.dataset.type !== 'player') return;
  trackElementEdited('player', 'name_size');
  const nl = S.selectedEl.querySelector('.player-name');
  if (nl) nl.setAttribute('font-size', val);
  S.selectedEl.dataset.nameSize = val;
}

export function applyNameColor(swatchEl) {
  document.querySelectorAll('.name-color-row .color-swatch').forEach(s => s.classList.remove('selected'));
  swatchEl.classList.add('selected');
  const color = swatchEl.dataset.color;
  if (!S.selectedEl || S.selectedEl.dataset.type !== 'player') return;
  trackElementEdited('player', 'name_color');
  const nl = S.selectedEl.querySelector('.player-name');
  if (nl) nl.setAttribute('fill', color);
  S.selectedEl.dataset.nameColor = color;
}

export function applyNameBg(swatchEl) {
  document.querySelectorAll('.name-bg-row .color-swatch').forEach(s => s.classList.remove('selected'));
  swatchEl.classList.add('selected');
  const color = swatchEl.dataset.color;
  if (!S.selectedEl || S.selectedEl.dataset.type !== 'player') return;
  trackElementEdited('player', 'name_bg');
  S.selectedEl.dataset.nameBg = color;
  updatePlayerNameBg(S.selectedEl);
}

export function updatePlayerNameBg(g) {
  const nl = g.querySelector('.player-name');
  if (!nl || nl.style.display === 'none') return;
  let bgRect = g.querySelector('.player-name-bg');
  const bgColor = g.dataset.nameBg || 'none';

  if (bgColor === 'none') {
    if (bgRect) bgRect.remove();
    return;
  }

  const bbox = nl.getBBox();
  if (!bbox.width) { if (bgRect) bgRect.remove(); return; }

  if (!bgRect) {
    bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bgRect.setAttribute('class', 'player-name-bg');
    bgRect.setAttribute('rx', '3'); bgRect.setAttribute('ry', '3');
    bgRect.setAttribute('pointer-events', 'none');
    // Insert before the name text
    g.insertBefore(bgRect, nl);
  }
  bgRect.setAttribute('x', bbox.x - 3);
  bgRect.setAttribute('y', bbox.y - 1);
  bgRect.setAttribute('width', bbox.width + 6);
  bgRect.setAttribute('height', bbox.height + 2);
  bgRect.setAttribute('fill', bgColor);
}

// ─── Player Fill & Border ─────────────────────────────────────────────────────
export function applyPlayerFill(swatchEl) {
  if (!S.selectedEl || S.selectedEl.dataset.type !== 'player') return;
  trackElementEdited('player', 'fill_color');
  const color = swatchEl.dataset.color;
  setPlayerColor(S.selectedEl, color);
}

export function applyPlayerBorder(swatchEl) {
  if (!S.selectedEl || S.selectedEl.dataset.type !== 'player') return;
  trackElementEdited('player', 'border_color');
  const color = swatchEl.dataset.color;
  const circ = S.selectedEl.querySelector('circle');
  if (!circ) return;
  if (color === 'none') {
    circ.setAttribute('stroke', 'transparent');
    circ.setAttribute('stroke-width', '0');
  } else {
    circ.setAttribute('stroke', color);
    circ.setAttribute('stroke-width', '1.5');
  }
  S.selectedEl.dataset.borderColor = color;
}

// ─── Color Picker ─────────────────────────────────────────────────────────────
let colorPickerTarget = 'fill'; // 'fill', 'border', or 'arrow'

export function openColorPicker(target) {
  colorPickerTarget = target;
  const modal = document.getElementById('color-picker-modal');
  modal.style.display = 'flex';
  let current = '#ffffff';
  if (target === 'arrow') {
    const line = S.selectedEl?.querySelector('line');
    if (line) current = line.getAttribute('stroke') || '#ffffff';
  } else {
    const circ = S.selectedEl?.querySelector('circle');
    if (circ && target === 'fill') current = circ.getAttribute('fill') || '#ffffff';
    else if (circ && target === 'border') current = circ.getAttribute('stroke') || '#ffffff';
  }
  if (current.startsWith('#') && current.length === 7) {
    document.getElementById('color-picker-input').value = current;
    document.getElementById('color-picker-hex').value = current.slice(1);
  }
  document.getElementById('color-picker-input').oninput = function() {
    document.getElementById('color-picker-hex').value = this.value.slice(1);
  };
  document.getElementById('color-picker-hex').oninput = function() {
    const v = this.value.replace(/[^0-9a-fA-F]/g, '').slice(0, 6);
    this.value = v;
    if (v.length === 6) document.getElementById('color-picker-input').value = '#' + v;
  };
}

export function closeColorPicker() {
  document.getElementById('color-picker-modal').style.display = 'none';
}

export function confirmColorPicker() {
  const hex = '#' + document.getElementById('color-picker-hex').value;
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return;
  closeColorPicker();
  if (!S.selectedEl) return;
  if (colorPickerTarget === 'arrow') {
    applyArrowColorValue(hex);
  } else if (colorPickerTarget === 'spotlight') {
    // Convert hex to rgba for spotlight
    const r = parseInt(hex.slice(1,3), 16);
    const g = parseInt(hex.slice(3,5), 16);
    const b = parseInt(hex.slice(5,7), 16);
    setSpotlightColor(S.selectedEl, `rgba(${r},${g},${b},0.7)`);
  } else if (colorPickerTarget === 'zone-fill') {
    const shape = S.selectedEl.querySelector('rect,ellipse');
    if (shape) shape.setAttribute('fill', hex);
  } else if (colorPickerTarget === 'zone-border') {
    const shape = S.selectedEl.querySelector('rect,ellipse');
    if (shape) {
      shape.setAttribute('stroke', hex);
      S.selectedEl.dataset.savedStroke = hex;
    }
  } else if (S.selectedEl.dataset.type === 'player') {
    if (colorPickerTarget === 'fill') {
      setPlayerColor(S.selectedEl, hex);
    } else {
      const circ = S.selectedEl.querySelector('circle');
      if (circ) {
        circ.setAttribute('stroke', hex);
        circ.setAttribute('stroke-width', '1.5');
      }
      S.selectedEl.dataset.borderColor = hex;
    }
  }
}

// ─── Arrow Editing ───────────────────────────────────────────────────────────
function getOrCreateMarker(color) {
  const safeId = 'marker-' + color.replace('#', '');
  let marker = document.getElementById(safeId);
  if (!marker) {
    marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
    marker.setAttribute('id', safeId);
    marker.setAttribute('markerWidth', '7');
    marker.setAttribute('markerHeight', '6');
    marker.setAttribute('refX', '5.5');
    marker.setAttribute('refY', '3');
    marker.setAttribute('orient', 'auto');
    const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    poly.setAttribute('points', '0 0, 7 3, 0 6');
    poly.setAttribute('fill', color);
    marker.appendChild(poly);
    S.svg.querySelector('defs').appendChild(marker);
  }
  return 'url(#' + safeId + ')';
}

function applyArrowColorValue(color) {
  if (!S.selectedEl || S.selectedEl.dataset.type !== 'arrow') return;
  const line = S.selectedEl.querySelector('line');
  if (line) {
    line.setAttribute('stroke', color);
    // Update marker if arrow has a head
    const hasHead = S.selectedEl.dataset.arrowType !== 'line';
    if (hasHead) {
      line.setAttribute('marker-end', getOrCreateMarker(color));
    }
  }
  S.selectedEl.dataset.arrowColor = color;
}

export function applyArrowColor(swatchEl) {
  trackElementEdited('arrow', 'color');
  applyArrowColorValue(swatchEl.dataset.color);
}

export function applyArrowStyle(style) {
  document.querySelectorAll('.style-btn').forEach(b => b.classList.toggle('active', b.dataset.style === style));
  if (!S.selectedEl || S.selectedEl.dataset.type !== 'arrow') return;
  trackElementEdited('arrow', 'style');
  const line = S.selectedEl.querySelector('line');
  if (!line) return;
  const map = { solid: '', dashed: '6,4', dotted: '2,5' };
  const dash = map[style] || '';
  if (dash) line.setAttribute('stroke-dasharray', dash);
  else line.removeAttribute('stroke-dasharray');
  S.selectedEl.dataset.arrowDash = dash;
}

export function applyArrowWidth(val) {
  document.getElementById('arrow-width-val').textContent = val;
  if (!S.selectedEl || S.selectedEl.dataset.type !== 'arrow') return;
  trackElementEdited('arrow', 'width');
  S.selectedEl.dataset.arrowWidth = val;
  S.selectedEl.querySelector('line')?.setAttribute('stroke-width', val);
}

// ─── Text Box Editing ────────────────────────────────────────────────────────
export function liveUpdateTextBox(val) {
  if (!S.selectedEl || S.selectedEl.dataset.type !== 'textbox') return;
  S.selectedEl.dataset.textContent = val;
  rewrapTextBox(S.selectedEl);
}

export function confirmTextBox() {
  if (!S.selectedEl || S.selectedEl.dataset.type !== 'textbox') return;
  trackElementEdited('textbox', 'text');
  const val = document.getElementById('textbox-input').value;
  S.selectedEl.dataset.textContent = val;
  rewrapTextBox(S.selectedEl);
}

export function applyTextBoxSize(val) {
  document.getElementById('textbox-size-val').textContent = val + 'px';
  if (!S.selectedEl || S.selectedEl.dataset.type !== 'textbox') return;
  trackElementEdited('textbox', 'size');
  S.selectedEl.dataset.textSize = val;
  rewrapTextBox(S.selectedEl);
}

export function applyTextBoxColor(swatchEl) {
  if (!S.selectedEl || S.selectedEl.dataset.type !== 'textbox') return;
  trackElementEdited('textbox', 'color');
  const color = swatchEl.dataset.color;
  S.selectedEl.dataset.textColor = color;
  const txt = S.selectedEl.querySelector('text');
  if (txt) txt.setAttribute('fill', color);
}

export function applyTextBoxBg(swatchEl) {
  if (!S.selectedEl || S.selectedEl.dataset.type !== 'textbox') return;
  trackElementEdited('textbox', 'background');
  const color = swatchEl.dataset.color;
  S.selectedEl.dataset.textBg = color;
  rewrapTextBox(S.selectedEl);
}

export function applyTextBoxAlign(align) {
  document.querySelectorAll('[data-align]').forEach(b => b.classList.toggle('active', b.dataset.align === align));
  if (!S.selectedEl || S.selectedEl.dataset.type !== 'textbox') return;
  trackElementEdited('textbox', 'alignment');
  S.selectedEl.dataset.textAlign = align;
  rewrapTextBox(S.selectedEl);
}

// ─── Spotlight Properties ────────────────────────────────────────────────────
export function applySpotlightColor(swatchEl) {
  if (!S.selectedEl || S.selectedEl.dataset.type !== 'spotlight') return;
  trackElementEdited('spotlight', 'color');
  const color = swatchEl.dataset.spotColor;
  setSpotlightColor(S.selectedEl, color);
}

export function setSpotlightColor(el, color) {
  el.dataset.spotColor = color;
  // Parse RGBA components from color
  const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  const r = match ? match[1] : 255, g = match ? match[2] : 255, b = match ? match[3] : 255;

  // Update beam (cone) gradient stops
  const beamGradId = 'spot-beam-' + el.id;
  const glowGradId = 'spot-glow-' + el.id;
  const ringGradId = 'spot-ring-' + el.id;
  const beamGrad = document.getElementById(beamGradId);
  const glowGrad = document.getElementById(glowGradId);
  const ringGrad = document.getElementById(ringGradId);

  if (beamGrad) {
    beamGrad.innerHTML = `
      <stop offset="0" stop-color="rgba(${r},${g},${b},1)"/>
      <stop offset="0.2" stop-color="rgba(${r},${g},${b},0.7)"/>
      <stop offset="0.5" stop-color="rgba(${r},${g},${b},0.3)"/>
      <stop offset="0.8" stop-color="rgba(${r},${g},${b},0.08)"/>
      <stop offset="1" stop-color="rgba(${r},${g},${b},0)"/>`;
  }
  if (glowGrad) {
    glowGrad.innerHTML = `
      <stop offset="0" stop-color="rgba(${r},${g},${b},0.85)"/>
      <stop offset="0.4" stop-color="rgba(${r},${g},${b},0.4)"/>
      <stop offset="1" stop-color="rgba(${r},${g},${b},0)"/>`;
  }
  if (ringGrad) {
    ringGrad.innerHTML = `
      <stop offset="0" stop-color="rgba(${r},${g},${b},0.4)"/>
      <stop offset="1" stop-color="rgba(${r},${g},${b},0.15)"/>`;
  }

  // Update ring ellipse stroke
  const ring = el.querySelector('.spotlight-ring') || el.querySelector('ellipse:not(.spotlight-glow)');
  const strokeColor = `rgba(${r},${g},${b},0.85)`;
  if (ring) {
    ring.setAttribute('stroke', strokeColor);
    el.dataset.savedStroke = strokeColor;
  }
}

// ─── Spotlight Name ──────────────────────────────────────────────────────────
export function liveUpdateSpotName(val) {
  if (!S.selectedEl || S.selectedEl.dataset.type !== 'spotlight') return;
  S.selectedEl.dataset.spotName = val.trim();
  const nl = S.selectedEl.querySelector('.spotlight-name');
  if (!nl) return;
  if (val.trim()) {
    nl.textContent = val; nl.style.display = '';
    applyTransform(S.selectedEl);
  } else {
    nl.style.display = 'none';
    const bg = S.selectedEl.querySelector('.spotlight-name-bg');
    if (bg) bg.style.display = 'none';
  }
}

export function confirmSpotName() {
  if (!S.selectedEl || S.selectedEl.dataset.type !== 'spotlight') return;
  trackElementEdited('spotlight', 'name');
  const val = document.getElementById('spot-name-input').value.trim();
  S.selectedEl.dataset.spotName = val;
  const nl = S.selectedEl.querySelector('.spotlight-name');
  if (!nl) return;
  if (val) {
    nl.textContent = val; nl.style.display = '';
    applyTransform(S.selectedEl);
  } else {
    nl.style.display = 'none'; nl.textContent = '';
    const bg = S.selectedEl.querySelector('.spotlight-name-bg');
    if (bg) bg.style.display = 'none';
  }
}

export function applySpotNameSize(val) {
  document.getElementById('spot-name-size-val').textContent = val + 'px';
  if (!S.selectedEl || S.selectedEl.dataset.type !== 'spotlight') return;
  trackElementEdited('spotlight', 'name_size');
  const nl = S.selectedEl.querySelector('.spotlight-name');
  if (nl) nl.setAttribute('font-size', val);
  S.selectedEl.dataset.spotNameSize = val;
  applyTransform(S.selectedEl);
}

export function applySpotNameColor(swatchEl) {
  const color = swatchEl.dataset.color;
  if (!S.selectedEl || S.selectedEl.dataset.type !== 'spotlight') return;
  trackElementEdited('spotlight', 'name_color');
  const nl = S.selectedEl.querySelector('.spotlight-name');
  if (nl) nl.setAttribute('fill', color);
  S.selectedEl.dataset.spotNameColor = color;
}

export function applySpotNameBg(swatchEl) {
  const color = swatchEl.dataset.color;
  if (!S.selectedEl || S.selectedEl.dataset.type !== 'spotlight') return;
  trackElementEdited('spotlight', 'name_bg');
  S.selectedEl.dataset.spotNameBg = color;
  updateSpotlightNameBg(S.selectedEl);
}

// ─── Zone Properties ─────────────────────────────────────────────────────────
export function applyZoneFill(swatchEl) {
  if (!S.selectedEl || !S.selectedEl.dataset.type?.startsWith('shadow')) return;
  trackElementEdited(S.selectedEl.dataset.type, 'fill_color');
  const shape = S.selectedEl.querySelector('rect,ellipse');
  if (shape) shape.setAttribute('fill', swatchEl.dataset.color);
}

export function applyZoneBorder(swatchEl) {
  if (!S.selectedEl || !S.selectedEl.dataset.type?.startsWith('shadow')) return;
  trackElementEdited(S.selectedEl.dataset.type, 'border_color');
  const shape = S.selectedEl.querySelector('rect,ellipse');
  if (shape) {
    shape.setAttribute('stroke', swatchEl.dataset.color);
    // Update savedStroke so deselect restores the new color
    S.selectedEl.dataset.savedStroke = swatchEl.dataset.color;
  }
}

export function applyZoneBorderStyle(style) {
  document.querySelectorAll('[data-zstyle]').forEach(b => b.classList.toggle('active', b.dataset.zstyle === style));
  if (!S.selectedEl || !S.selectedEl.dataset.type?.startsWith('shadow')) return;
  trackElementEdited(S.selectedEl.dataset.type, 'border_style');
  const shape = S.selectedEl.querySelector('rect,ellipse');
  if (!shape) return;
  if (style === 'solid') {
    shape.removeAttribute('stroke-dasharray');
  } else {
    shape.setAttribute('stroke-dasharray', '4,3');
  }
}

// ─── Sliders ──────────────────────────────────────────────────────────────────
export function applySize(val) {
  document.getElementById('size-val').textContent = (val/100).toFixed(1) + '×';
  if (!S.selectedEl) return;
  trackElementEdited(S.selectedEl.dataset.type, 'scale');
  S.selectedEl.dataset.scale = val/100;
  const t = S.selectedEl.dataset.type;
  if (t === 'player' || t === 'ball' || t === 'cone' || t.startsWith('shadow')) applyTransform(S.selectedEl);
  else if (t === 'arrow') updateArrowVisual(S.selectedEl);
}

export function applyRotation(val) {
  document.getElementById('rot-val').textContent = Math.round(val) + '°';
  if (!S.selectedEl) return;
  trackElementEdited(S.selectedEl.dataset.type, 'rotation');
  S.selectedEl.dataset.rotation = val;
  const t = S.selectedEl.dataset.type;
  if (t.startsWith('shadow')) applyTransform(S.selectedEl);
  else if (t === 'arrow') updateArrowVisual(S.selectedEl);
}

// ─── Clear All ────────────────────────────────────────────────────────────────
export function clearAll() {
  if (!confirm('Clear all elements?')) return;
  S.pushUndo();
  S.playersLayer.innerHTML = '';
  S.objectsLayer.innerHTML = '';
  S.playerCounts.a = 0;
  S.playerCounts.b = 0;
  S.setObjectCounter(0);
  deselect();
}

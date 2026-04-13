import * as S from './state.js';
import { makeDraggable, select, updateArrowVisual } from './interaction.js';

let _refCount = 0;

// ─── Add Player ───────────────────────────────────────────────────────────────
export function addPlayer(x, y, team, num, isGK) {
  if (num === undefined) { S.playerCounts[team]++; num = S.playerCounts[team]; }
  isGK = isGK || false;
  const fillColor = isGK ? S.gkColors[team] : S.teamColors[team];
  const isPattern = fillColor.startsWith('url(');
  const isDark = !isPattern && S.isDarkColor(fillColor);
  const textColor = isDark ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.75)';

  const id = 'pl-' + S.nextObjectId();
  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  g.setAttribute('id', id);
  g.dataset.type = 'player'; g.dataset.team = team;
  g.dataset.label = String(num); g.dataset.isGK = isGK ? '1' : '0';
  g.dataset.cx = x; g.dataset.cy = y; g.dataset.scale = '0.9';

  const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  circle.setAttribute('cx','0'); circle.setAttribute('cy','0'); circle.setAttribute('r','16');
  circle.setAttribute('fill', fillColor);
  circle.setAttribute('stroke', isDark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.25)');
  circle.setAttribute('stroke-width','2.5');
  circle.setAttribute('filter', 'url(#player-shadow)');

  const numText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  numText.setAttribute('text-anchor','middle'); numText.setAttribute('dominant-baseline','central');
  numText.setAttribute('font-family','Poppins,sans-serif');
  numText.setAttribute('font-size','10'); numText.setAttribute('font-weight','700');
  numText.setAttribute('fill', textColor); numText.setAttribute('pointer-events','none');
  if (isPattern) {
    numText.setAttribute('stroke', 'rgba(255,255,255,0.85)');
    numText.setAttribute('stroke-width', '3');
    numText.setAttribute('paint-order', 'stroke');
  }
  numText.textContent = num;

  const nameLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  nameLabel.setAttribute('class','player-name');
  nameLabel.setAttribute('text-anchor','middle'); nameLabel.setAttribute('dominant-baseline','hanging');
  nameLabel.setAttribute('font-family','Poppins,sans-serif');
  nameLabel.setAttribute('font-size','11'); nameLabel.setAttribute('font-weight','400');
  nameLabel.setAttribute('fill','rgba(255,255,255,0.9)');
  nameLabel.setAttribute('y','24'); nameLabel.setAttribute('pointer-events','none');
  nameLabel.style.display = 'none';

  // Invisible hit area for easier touch tapping
  const hitArea = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  hitArea.classList.add('hit-area');
  hitArea.setAttribute('cx','0'); hitArea.setAttribute('cy','0'); hitArea.setAttribute('r','28');
  hitArea.setAttribute('fill','transparent'); hitArea.setAttribute('stroke','none');

  g.appendChild(hitArea); g.appendChild(circle); g.appendChild(numText); g.appendChild(nameLabel);
  g.setAttribute('transform', `translate(${x},${y}) scale(0.9)`);
  makeDraggable(g);
  g.addEventListener('click', e => { if (S.tool === 'select') { e.stopPropagation(); select(g, { additive: e.ctrlKey || e.metaKey }); } });
  g.addEventListener('dblclick', e => { e.stopPropagation(); openPlayerEdit(g); });
  S.playersLayer.appendChild(g);
  return g;
}

// ─── Toggle / Update Arms on Player ──────────────────────────────────────────
// Arms style: two short curved strokes extending from body sides,
// mimicking a simple person silhouette (like the Football UI Kit style).
// Rotation only affects the arms, not the number/name.
export function updatePlayerArms(g) {
  const hasArms = g.dataset.arms === '1';
  // Remove existing arm elements
  g.querySelectorAll('.player-arm').forEach(a => a.remove());

  if (!hasArms) return;

  const bodyCircle = g.querySelector('circle:not(.hit-area):not(.player-arm)');
  if (!bodyCircle) return;
  const r = parseFloat(bodyCircle.getAttribute('r'));   // body radius (16)
  const rot = parseFloat(g.dataset.rotation || '0') * Math.PI / 180;

  // Base arm geometry (at 0° rotation)
  const startY = r * 0.45;
  const armLen = r * 0.85;
  const armDrop = r * 0.7;

  // Rotate a point around origin
  function rotPt(x, y) {
    return [x * Math.cos(rot) - y * Math.sin(rot),
            x * Math.sin(rot) + y * Math.cos(rot)];
  }

  function mkArm(side) {
    const sx0 = side * r * 0.55,  sy0 = startY;
    const ex0 = side * (r * 0.55 + armLen), ey0 = startY + armDrop;
    const cpx0 = side * (r * 0.55 + armLen * 0.5), cpy0 = startY + armDrop * 0.15;

    const [sx, sy] = rotPt(sx0, sy0);
    const [ex, ey] = rotPt(ex0, ey0);
    const [cpx, cpy] = rotPt(cpx0, cpy0);

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.classList.add('player-arm');
    path.setAttribute('d', `M${sx.toFixed(2)},${sy.toFixed(2)} Q${cpx.toFixed(2)},${cpy.toFixed(2)} ${ex.toFixed(2)},${ey.toFixed(2)}`);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', '#1a1a1a');
    path.setAttribute('stroke-width', '2.5');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('pointer-events', 'none');
    return path;
  }

  const leftArm = mkArm(-1);
  const rightArm = mkArm(1);

  // Insert before body circle so arms draw behind it
  g.insertBefore(leftArm, bodyCircle);
  g.insertBefore(rightArm, bodyCircle);
}

function openPlayerEdit(g) {
  select(g);
  const inp = document.getElementById('number-input');
  inp.value = g.dataset.label || ''; inp.focus(); inp.select();
}

// ─── Add Ball ─────────────────────────────────────────────────────────────────
export function addBall(x, y) {
  const id = 'ball-' + S.nextObjectId();
  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  g.setAttribute('id', id); g.dataset.type = 'ball';
  g.dataset.cx = x; g.dataset.cy = y; g.dataset.scale = '0.7';
  const ns = 'http://www.w3.org/2000/svg';

  // Invisible hit area for easier touch tapping
  const hitArea = document.createElementNS(ns, 'circle');
  hitArea.classList.add('hit-area');
  hitArea.setAttribute('cx','0'); hitArea.setAttribute('cy','0'); hitArea.setAttribute('r','24');
  hitArea.setAttribute('fill','transparent'); hitArea.setAttribute('stroke','none');

  const c = document.createElementNS(ns, 'circle');
  c.setAttribute('cx','0'); c.setAttribute('cy','0'); c.setAttribute('r','10');
  c.setAttribute('fill','white'); c.setAttribute('stroke','#333'); c.setAttribute('stroke-width','1.5');

  g.appendChild(hitArea); g.appendChild(c);
  g.setAttribute('transform', `translate(${x},${y}) scale(0.7)`);
  makeDraggable(g);
  g.addEventListener('click', e => { if (S.tool === 'select') { e.stopPropagation(); select(g, { additive: e.ctrlKey || e.metaKey }); } });
  S.playersLayer.appendChild(g);
  return g;
}

// ─── Add Referee ─────────────────────────────────────────────────────────────
export function addReferee(x, y, label, fillColor, borderColor) {
  if (label === undefined) { _refCount++; label = _refCount === 1 ? 'R' : 'R' + _refCount; }
  fillColor = fillColor || '#1a1a1a';
  borderColor = borderColor || '#FBBF24';
  const isDark = S.isDarkColor(fillColor);
  const textColor = isDark ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.75)';

  const id = 'ref-' + S.nextObjectId();
  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  g.setAttribute('id', id);
  g.dataset.type = 'referee';
  g.dataset.label = String(label);
  g.dataset.cx = x; g.dataset.cy = y; g.dataset.scale = '0.9';
  g.dataset.fillColor = fillColor;
  g.dataset.borderColor = borderColor;

  const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  circle.setAttribute('cx','0'); circle.setAttribute('cy','0'); circle.setAttribute('r','16');
  circle.setAttribute('fill', fillColor);
  circle.setAttribute('stroke', borderColor);
  circle.setAttribute('stroke-width','2.5');
  circle.setAttribute('filter', 'url(#player-shadow)');

  const numText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  numText.setAttribute('text-anchor','middle'); numText.setAttribute('dominant-baseline','central');
  numText.setAttribute('font-family','Poppins,sans-serif');
  numText.setAttribute('font-size','10'); numText.setAttribute('font-weight','700');
  numText.setAttribute('fill', textColor); numText.setAttribute('pointer-events','none');
  numText.textContent = label;

  const nameLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  nameLabel.setAttribute('class','player-name');
  nameLabel.setAttribute('text-anchor','middle'); nameLabel.setAttribute('dominant-baseline','hanging');
  nameLabel.setAttribute('font-family','Poppins,sans-serif');
  nameLabel.setAttribute('font-size','11'); nameLabel.setAttribute('font-weight','400');
  nameLabel.setAttribute('fill','rgba(255,255,255,0.9)');
  nameLabel.setAttribute('y','24'); nameLabel.setAttribute('pointer-events','none');
  nameLabel.style.display = 'none';

  const hitArea = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  hitArea.classList.add('hit-area');
  hitArea.setAttribute('cx','0'); hitArea.setAttribute('cy','0'); hitArea.setAttribute('r','28');
  hitArea.setAttribute('fill','transparent'); hitArea.setAttribute('stroke','none');

  g.appendChild(hitArea); g.appendChild(circle); g.appendChild(numText); g.appendChild(nameLabel);
  g.setAttribute('transform', `translate(${x},${y}) scale(0.9)`);
  makeDraggable(g);
  g.addEventListener('click', e => { if (S.tool === 'select') { e.stopPropagation(); select(g, { additive: e.ctrlKey || e.metaKey }); } });
  g.addEventListener('dblclick', e => { e.stopPropagation(); select(g); });
  S.playersLayer.appendChild(g);
  return g;
}

// ─── Add Cone ─────────────────────────────────────────────────────────────────
export function addCone(x, y) {
  const id = 'cone-' + S.nextObjectId();
  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  g.setAttribute('id', id); g.dataset.type = 'cone';
  g.dataset.cx = x; g.dataset.cy = y; g.dataset.scale = '1';
  const ns = 'http://www.w3.org/2000/svg';

  const sh = document.createElementNS(ns, 'ellipse');
  sh.setAttribute('cx','0'); sh.setAttribute('cy','8'); sh.setAttribute('rx','7'); sh.setAttribute('ry','2.5');
  sh.setAttribute('fill','rgba(0,0,0,0.3)'); sh.setAttribute('pointer-events','none');

  const tri = document.createElementNS(ns, 'polygon');
  tri.setAttribute('points','0,-10 8,8 -8,8');
  tri.setAttribute('fill','#ff8c00'); tri.setAttribute('stroke','#cc6600'); tri.setAttribute('stroke-width','1');

  const stripe = document.createElementNS(ns, 'line');
  stripe.setAttribute('x1','-5'); stripe.setAttribute('y1','2');
  stripe.setAttribute('x2','5'); stripe.setAttribute('y2','2');
  stripe.setAttribute('stroke','#ffb84d'); stripe.setAttribute('stroke-width','1.5');
  stripe.setAttribute('pointer-events','none');

  // Invisible hit area for easier touch tapping
  const hitArea = document.createElementNS(ns, 'circle');
  hitArea.classList.add('hit-area');
  hitArea.setAttribute('cx','0'); hitArea.setAttribute('cy','0'); hitArea.setAttribute('r','20');
  hitArea.setAttribute('fill','transparent'); hitArea.setAttribute('stroke','none');

  g.appendChild(hitArea); g.appendChild(sh); g.appendChild(tri); g.appendChild(stripe);
  g.setAttribute('transform', `translate(${x},${y})`);
  makeDraggable(g);
  g.addEventListener('click', e => { if (S.tool === 'select') { e.stopPropagation(); select(g, { additive: e.ctrlKey || e.metaKey }); } });
  S.playersLayer.appendChild(g);
  return g;
}

// ─── Add Arrow ────────────────────────────────────────────────────────────────
export function addArrow(x1, y1, x2, y2, type) {
  type = type || S.arrowType;
  const id = 'arrow-' + S.nextObjectId();
  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  g.setAttribute('id', id); g.dataset.type = 'arrow'; g.dataset.arrowType = type;
  const cx = (x1+x2)/2, cy = (y1+y2)/2;
  g.dataset.cx = cx; g.dataset.cy = cy;
  g.dataset.dx1 = x1-cx; g.dataset.dy1 = y1-cy;
  g.dataset.dx2 = x2-cx; g.dataset.dy2 = y2-cy;
  g.dataset.scale = '1'; g.dataset.rotation = '0';

  g.dataset.curve = '0';

  const st = S.ARROW_STYLES[type];
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  line.classList.add('arrow-line');
  line.setAttribute('stroke', st.color); line.setAttribute('stroke-width','2.5');
  line.setAttribute('stroke-linecap','round'); line.setAttribute('fill', 'none');
  if (st.dash) line.setAttribute('stroke-dasharray', st.dash);
  if (st.marker !== 'none') line.setAttribute('marker-end', st.marker);
  line.setAttribute('opacity','0.95');
  g.dataset.arrowOpacity = '0.95';

  const hit = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  hit.classList.add('arrow-hit');
  hit.setAttribute('stroke','transparent'); hit.setAttribute('stroke-width','14');
  hit.setAttribute('fill', 'none');

  g.appendChild(line); g.appendChild(hit);
  updateArrowVisual(g);
  makeDraggable(g);
  g.addEventListener('click', e => { if (S.tool === 'select') { e.stopPropagation(); select(g, { additive: e.ctrlKey || e.metaKey }); } });
  S.objectsLayer.appendChild(g);
  return g;
}

// ─── Add Text Box ────────────────────────────────────────────────────────────
export function addTextBox(x, y, text) {
  text = text || 'Text';
  const id = 'txt-' + S.nextObjectId();
  const ns = 'http://www.w3.org/2000/svg';
  const g = document.createElementNS(ns, 'g');
  g.setAttribute('id', id);
  g.dataset.type = 'textbox';
  g.dataset.cx = x; g.dataset.cy = y;
  g.dataset.scale = '1'; g.dataset.rotation = '0';
  g.dataset.hw = '60'; g.dataset.hh = '20';
  g.dataset.textContent = text;
  g.dataset.textSize = '14';
  g.dataset.textColor = 'rgba(255,255,255,0.9)';
  g.dataset.textBg = 'rgba(0,0,0,0.5)';
  g.dataset.textAlign = 'center';

  const bg = document.createElementNS(ns, 'rect');
  bg.setAttribute('rx', '4'); bg.setAttribute('ry', '4');
  bg.setAttribute('fill', 'rgba(0,0,0,0.5)');
  bg.classList.add('textbox-bg');

  const txt = document.createElementNS(ns, 'text');
  txt.setAttribute('font-family', 'Poppins, sans-serif');
  txt.setAttribute('font-size', '14');
  txt.setAttribute('font-weight', '400');
  txt.setAttribute('fill', 'rgba(255,255,255,0.9)');
  txt.setAttribute('pointer-events', 'none');

  g.appendChild(bg); g.appendChild(txt);
  S.playersLayer.appendChild(g);
  rewrapTextBox(g);

  makeDraggable(g);
  g.addEventListener('click', e => {
    if (S.tool !== 'select') return;
    e.stopPropagation();
    select(g);
  });
  g.addEventListener('dblclick', e => {
    e.stopPropagation();
    try { openTextBoxEdit(g); } catch(err) { console.error('openTextBoxEdit error:', err); }
  });
  // On mobile: touchstart preventDefault blocks click, so use touchend to open editor
  g.addEventListener('touchend', e => {
    if (S.tool !== 'select') return;
    // Only open editor on tap (no drag movement)
    if (!S.dragMoved) {
      setTimeout(() => {
        try { openTextBoxEdit(g); } catch(err) { console.error('openTextBoxEdit error:', err); }
      }, 50);
    }
  });
  return g;
}

function openTextBoxEdit(g) {
  select(g);
  // Also update sidebar textarea
  const sideInput = document.getElementById('textbox-input');
  sideInput.value = g.dataset.textContent || '';

  // Create inline overlay textarea on top of the SVG element
  const svgEl = document.getElementById('pitch-svg');
  const svgRect = svgEl.getBoundingClientRect();
  const cx = parseFloat(g.dataset.cx), cy = parseFloat(g.dataset.cy);
  const hw = parseFloat(g.dataset.hw || '60'), hh = parseFloat(g.dataset.hh || '20');
  const rot = parseFloat(g.dataset.rotation || '0');
  const fontSize = parseFloat(g.dataset.textSize || '14');
  const align = g.dataset.textAlign || 'center';
  const textColor = g.dataset.textColor || 'rgba(255,255,255,0.9)';

  // Convert SVG coords to screen coords
  const pt1 = svgEl.createSVGPoint(); pt1.x = cx - hw; pt1.y = cy - hh;
  const pt2 = svgEl.createSVGPoint(); pt2.x = cx + hw; pt2.y = cy + hh;
  const ctm = svgEl.getScreenCTM();
  const s1 = pt1.matrixTransform(ctm);
  const s2 = pt2.matrixTransform(ctm);

  const ta = document.createElement('textarea');
  ta.value = g.dataset.textContent || '';
  ta.style.cssText = `
    position: fixed;
    left: ${s1.x}px; top: ${s1.y}px;
    width: ${s2.x - s1.x}px; height: ${s2.y - s1.y}px;
    background: transparent; border: 2px solid #C9A962; border-radius: 4px;
    color: ${textColor}; font-family: Poppins, sans-serif;
    font-size: ${fontSize * (ctm.a)}px; font-weight: 400;
    text-align: ${align}; padding: 6px 8px;
    outline: none; resize: none; overflow: hidden;
    z-index: 9999; box-sizing: border-box;
    ${rot ? `transform: rotate(${rot}deg); transform-origin: center;` : ''}
  `;

  // Hide SVG text while editing
  const txtEl = g.querySelector('text');
  if (txtEl) txtEl.style.visibility = 'hidden';

  document.body.appendChild(ta);
  ta.focus();
  ta.select();

  function finishEdit() {
    const val = ta.value;
    g.dataset.textContent = val;
    sideInput.value = val;
    if (txtEl) txtEl.style.visibility = '';
    ta.remove();
    rewrapTextBox(g);
  }

  ta.addEventListener('blur', finishEdit);
  ta.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); ta.blur(); }
  });
  // Live update sidebar + SVG as user types
  ta.addEventListener('input', () => {
    g.dataset.textContent = ta.value;
    sideInput.value = ta.value;
  });
}

// Wrap text into lines that fit within box width, position bg + text
export function rewrapTextBox(g) {
  const ns = 'http://www.w3.org/2000/svg';
  const txt = g.querySelector('text');
  const bg = g.querySelector('.textbox-bg');
  if (!txt) return;

  const cx = parseFloat(g.dataset.cx);
  const cy = parseFloat(g.dataset.cy);
  const hw = parseFloat(g.dataset.hw || '60');
  const hh = parseFloat(g.dataset.hh || '20');
  const rot = parseFloat(g.dataset.rotation || '0');
  const fontSize = parseFloat(g.dataset.textSize || '14');
  const content = g.dataset.textContent || '';
  const pad = 8;
  const boxInnerW = hw * 2 - pad * 2;

  // Clear old tspans
  txt.innerHTML = '';
  txt.setAttribute('font-size', fontSize);

  // Create a temporary text for measuring word widths
  const measure = document.createElementNS(ns, 'text');
  measure.setAttribute('font-family', 'Poppins, sans-serif');
  measure.setAttribute('font-size', fontSize);
  measure.setAttribute('font-weight', '400');
  measure.style.visibility = 'hidden';
  S.svg.appendChild(measure);

  // Split by explicit newlines, then wrap words within each paragraph
  const paragraphs = content.split('\n');
  const lines = [];
  for (const para of paragraphs) {
    if (para.trim() === '') { lines.push(''); continue; }
    const words = para.split(/\s+/);
    let currentLine = '';
    for (const word of words) {
      const testLine = currentLine ? currentLine + ' ' + word : word;
      measure.textContent = testLine;
      if (measure.getComputedTextLength() > boxInnerW && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) lines.push(currentLine);
  }
  measure.remove();

  if (lines.length === 0) lines.push('');

  // Create tspan elements with alignment
  const align = g.dataset.textAlign || 'center';
  const lineHeight = fontSize * 1.35;
  // Vertically center: position first baseline so the text block is centered at cy
  // baseline offset ~0.35em accounts for glyph ascender vs descender balance
  const startY = cy - (lines.length - 1) * lineHeight / 2 + fontSize * 0.35;

  // X position depends on alignment
  const textX = align === 'left' ? (cx - hw + pad)
              : align === 'right' ? (cx + hw - pad)
              : cx;

  lines.forEach((line, i) => {
    const tspan = document.createElementNS(ns, 'tspan');
    tspan.setAttribute('x', textX);
    tspan.setAttribute('y', startY + i * lineHeight);
    tspan.textContent = line || '\u00A0';
    txt.appendChild(tspan);
  });

  const anchorMap = { left: 'start', center: 'middle', right: 'end' };
  txt.setAttribute('text-anchor', anchorMap[align] || 'middle');
  if (rot) txt.setAttribute('transform', `rotate(${rot},${cx},${cy})`);
  else txt.removeAttribute('transform');

  // Position background rect
  if (bg) {
    bg.setAttribute('x', cx - hw);
    bg.setAttribute('y', cy - hh);
    bg.setAttribute('width', hw * 2);
    bg.setAttribute('height', hh * 2);
    if (rot) bg.setAttribute('transform', `rotate(${rot},${cx},${cy})`);
    else bg.removeAttribute('transform');
    bg.setAttribute('fill', g.dataset.textBg === 'none' ? 'transparent' : (g.dataset.textBg || 'rgba(0,0,0,0.5)'));
  }
}

// Legacy alias
export function updateTextBoxBg(g) { rewrapTextBox(g); }

// ─── Add Headline ────────────────────────────────────────────────────────────
export function addHeadline(x, y, title, body) {
  title = title || 'Your headline here';
  body = body || 'Add a short description or key idea.';
  const id = 'hl-' + S.nextObjectId();
  const ns = 'http://www.w3.org/2000/svg';
  const g = document.createElementNS(ns, 'g');
  g.setAttribute('id', id);
  g.dataset.type = 'headline';
  g.dataset.cx = x; g.dataset.cy = y;
  g.dataset.scale = '1'; g.dataset.rotation = '0';
  g.dataset.hw = '130'; g.dataset.hh = '40';
  g.dataset.hlTitle = title;
  g.dataset.hlBody = body;
  g.dataset.hlBarColor = '#4FC3F7';
  g.dataset.hlTitleSize = '16';
  g.dataset.hlBodySize = '12';
  g.dataset.hlTextColor = 'rgba(255,255,255,0.9)';
  g.dataset.hlBg = 'none';

  // Background rect
  const bg = document.createElementNS(ns, 'rect');
  bg.setAttribute('rx', '4'); bg.setAttribute('ry', '4');
  bg.setAttribute('fill', 'transparent');
  bg.classList.add('headline-bg');

  // Vertical accent bar
  const bar = document.createElementNS(ns, 'rect');
  bar.setAttribute('rx', '2'); bar.setAttribute('ry', '2');
  bar.setAttribute('fill', '#4FC3F7');
  bar.classList.add('headline-bar');

  // Title text
  const titleEl = document.createElementNS(ns, 'text');
  titleEl.classList.add('headline-title');
  titleEl.setAttribute('font-family', 'Poppins, sans-serif');
  titleEl.setAttribute('font-size', '16');
  titleEl.setAttribute('font-weight', '700');
  titleEl.setAttribute('fill', 'rgba(255,255,255,0.9)');
  titleEl.setAttribute('pointer-events', 'none');

  // Body text
  const bodyEl = document.createElementNS(ns, 'text');
  bodyEl.classList.add('headline-body');
  bodyEl.setAttribute('font-family', 'Poppins, sans-serif');
  bodyEl.setAttribute('font-size', '12');
  bodyEl.setAttribute('font-weight', '400');
  bodyEl.setAttribute('fill', 'rgba(255,255,255,0.7)');
  bodyEl.setAttribute('pointer-events', 'none');

  g.appendChild(bg); g.appendChild(bar); g.appendChild(titleEl); g.appendChild(bodyEl);
  S.playersLayer.appendChild(g);
  rewrapHeadline(g);

  makeDraggable(g);
  g.addEventListener('click', e => {
    if (S.tool !== 'select') return;
    e.stopPropagation();
    select(g);
  });
  return g;
}

export function rewrapHeadline(g) {
  const ns = 'http://www.w3.org/2000/svg';
  const bg = g.querySelector('.headline-bg');
  const bar = g.querySelector('.headline-bar');
  const titleEl = g.querySelector('.headline-title');
  const bodyEl = g.querySelector('.headline-body');
  if (!titleEl || !bodyEl) return;

  const cx = parseFloat(g.dataset.cx);
  const cy = parseFloat(g.dataset.cy);
  const hw = parseFloat(g.dataset.hw || '130');
  const hh = parseFloat(g.dataset.hh || '40');
  const rot = parseFloat(g.dataset.rotation || '0');
  const titleSize = parseFloat(g.dataset.hlTitleSize || '16');
  const bodySize = parseFloat(g.dataset.hlBodySize || '12');
  const barColor = g.dataset.hlBarColor || '#4FC3F7';
  const textColor = g.dataset.hlTextColor || 'rgba(255,255,255,0.9)';
  const bgColor = g.dataset.hlBg || 'none';
  const title = g.dataset.hlTitle || '';
  const body = g.dataset.hlBody || '';

  const barW = 4;
  const padL = 14; // left padding after bar
  const padR = 10;
  const padY = 10;
  const textAreaW = hw * 2 - barW - padL - padR;

  // Update bar
  if (bar) {
    bar.setAttribute('x', cx - hw + 4);
    bar.setAttribute('y', cy - hh + padY);
    bar.setAttribute('width', barW);
    bar.setAttribute('height', hh * 2 - padY * 2);
    bar.setAttribute('fill', barColor);
    if (rot) bar.setAttribute('transform', `rotate(${rot},${cx},${cy})`);
    else bar.removeAttribute('transform');
  }

  // Update bg
  if (bg) {
    bg.setAttribute('x', cx - hw); bg.setAttribute('y', cy - hh);
    bg.setAttribute('width', hw * 2); bg.setAttribute('height', hh * 2);
    bg.setAttribute('fill', bgColor === 'none' ? 'transparent' : bgColor);
    if (rot) bg.setAttribute('transform', `rotate(${rot},${cx},${cy})`);
    else bg.removeAttribute('transform');
  }

  const textStartX = cx - hw + barW + padL;

  // Measure helper
  function wrapText(content, fontSize, maxW) {
    const measure = document.createElementNS(ns, 'text');
    measure.setAttribute('font-family', 'Poppins, sans-serif');
    measure.setAttribute('font-size', fontSize);
    measure.setAttribute('font-weight', fontSize === titleSize ? '700' : '400');
    measure.style.visibility = 'hidden';
    S.svg.appendChild(measure);
    const paragraphs = content.split('\n');
    const lines = [];
    for (const para of paragraphs) {
      if (para.trim() === '') { lines.push(''); continue; }
      const words = para.split(/\s+/);
      let cur = '';
      for (const w of words) {
        const test = cur ? cur + ' ' + w : w;
        measure.textContent = test;
        if (measure.getComputedTextLength() > maxW && cur) { lines.push(cur); cur = w; }
        else cur = test;
      }
      if (cur) lines.push(cur);
    }
    measure.remove();
    return lines.length ? lines : [''];
  }

  // Wrap title
  const titleLines = wrapText(title, titleSize, textAreaW);
  const titleLineH = titleSize * 1.3;

  // Wrap body
  const bodyLines = wrapText(body, bodySize, textAreaW);
  const bodyLineH = bodySize * 1.4;

  // Layout: start from top with padding
  const totalTitleH = titleLines.length * titleLineH;
  const gapBetween = 3;
  const totalBodyH = bodyLines.length * bodyLineH;
  const totalContentH = totalTitleH + gapBetween + totalBodyH;
  const startY = cy - totalContentH / 2;

  // Render title tspans
  titleEl.innerHTML = '';
  titleEl.setAttribute('font-size', titleSize);
  titleEl.setAttribute('fill', textColor);
  titleEl.setAttribute('text-anchor', 'start');
  titleLines.forEach((line, i) => {
    const tspan = document.createElementNS(ns, 'tspan');
    tspan.setAttribute('x', textStartX);
    tspan.setAttribute('y', startY + i * titleLineH + titleSize * 0.85);
    tspan.textContent = line || '\u00A0';
    titleEl.appendChild(tspan);
  });
  if (rot) titleEl.setAttribute('transform', `rotate(${rot},${cx},${cy})`);
  else titleEl.removeAttribute('transform');

  // Render body tspans
  bodyEl.innerHTML = '';
  bodyEl.setAttribute('font-size', bodySize);
  bodyEl.setAttribute('fill', textColor);
  bodyEl.setAttribute('text-anchor', 'start');
  bodyEl.setAttribute('opacity', '0.7');
  const bodyStartY = startY + totalTitleH + gapBetween;
  bodyLines.forEach((line, i) => {
    const tspan = document.createElementNS(ns, 'tspan');
    tspan.setAttribute('x', textStartX);
    tspan.setAttribute('y', bodyStartY + i * bodyLineH + bodySize * 0.85);
    tspan.textContent = line || '\u00A0';
    bodyEl.appendChild(tspan);
  });
  if (rot) bodyEl.setAttribute('transform', `rotate(${rot},${cx},${cy})`);
  else bodyEl.removeAttribute('transform');
}

// ─── Add Shadow/Zone ──────────────────────────────────────────────────────────
export function addShadow(x, y, type) {
  const id = 'shadow-' + S.nextObjectId();
  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  g.setAttribute('id', id); g.dataset.type = type;
  g.dataset.cx = x; g.dataset.cy = y; g.dataset.scale = '1'; g.dataset.rotation = '0';
  g.dataset.hw = '30'; g.dataset.hh = '20';

  let shape;
  if (type === 'shadow-circle') {
    shape = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
    shape.setAttribute('cx', x); shape.setAttribute('cy', y);
    shape.setAttribute('rx','30'); shape.setAttribute('ry','20');
  } else {
    shape = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    shape.setAttribute('x', x-30); shape.setAttribute('y', y-20);
    shape.setAttribute('width','60'); shape.setAttribute('height','40'); shape.setAttribute('rx','4');
  }
  shape.setAttribute('fill','rgba(79,156,249,0.18)');
  shape.setAttribute('stroke','rgba(255,255,255,0.5)');
  shape.setAttribute('stroke-width','1.5');
  shape.setAttribute('stroke-dasharray','4,3');

  g.appendChild(shape);
  makeDraggable(g);
  g.addEventListener('click', e => { if (S.tool === 'select') { e.stopPropagation(); select(g, { additive: e.ctrlKey || e.metaKey }); } });
  S.objectsLayer.appendChild(g);
  return g;
}

// ─── Spotlight ────────────────────────────────────────────────────────────────
export function addSpotlight(x, y) {
  const svgEl = S.svg;
  const topY = 0;

  const rx = 28, ry = 5;      // ellipse radii (flat = floor shadow feel)
  const sourceW = 6;           // narrow beam source width at top

  const id = 'spot-' + S.nextObjectId();
  const ns = 'http://www.w3.org/2000/svg';
  const g = document.createElementNS(ns, 'g');
  g.setAttribute('id', id);
  g.dataset.type = 'spotlight';
  g.dataset.cx = x; g.dataset.cy = y;
  g.dataset.scale = '1'; g.dataset.rotation = '0';
  g.dataset.rx = rx; g.dataset.ry = ry;
  g.dataset.spotColor = 'rgba(255,255,255,0.85)';

  // Create unique gradient IDs
  const beamGradId = 'spot-beam-' + id;
  const glowGradId = 'spot-glow-' + id;
  const ringGradId = 'spot-ring-' + id;

  // SVG defs for gradients
  let defs = svgEl.querySelector('defs');
  if (!defs) { defs = document.createElementNS(ns, 'defs'); svgEl.prepend(defs); }

  // Beam gradient — cone fade from bright at source to transparent at base
  const beamGrad = document.createElementNS(ns, 'linearGradient');
  beamGrad.setAttribute('id', beamGradId);
  beamGrad.setAttribute('x1', '0'); beamGrad.setAttribute('y1', '0');
  beamGrad.setAttribute('x2', '0'); beamGrad.setAttribute('y2', '1');
  beamGrad.innerHTML = `
    <stop offset="0" stop-color="rgba(255,255,255,1)"/>
    <stop offset="0.2" stop-color="rgba(255,255,255,0.7)"/>
    <stop offset="0.5" stop-color="rgba(255,255,255,0.3)"/>
    <stop offset="0.8" stop-color="rgba(255,255,255,0.08)"/>
    <stop offset="1" stop-color="rgba(255,255,255,0)"/>`;
  defs.appendChild(beamGrad);

  // Glow radial gradient for the larger base glow ellipse
  const glowGrad = document.createElementNS(ns, 'radialGradient');
  glowGrad.setAttribute('id', glowGradId);
  glowGrad.innerHTML = `
    <stop offset="0" stop-color="rgba(255,255,255,0.85)"/>
    <stop offset="0.4" stop-color="rgba(255,255,255,0.4)"/>
    <stop offset="1" stop-color="rgba(255,255,255,0)"/>`;
  defs.appendChild(glowGrad);

  // Ring radial gradient (subtle white fill)
  const ringGrad = document.createElementNS(ns, 'radialGradient');
  ringGrad.setAttribute('id', ringGradId);
  ringGrad.innerHTML = `
    <stop offset="0" stop-color="rgba(255,255,255,0.4)"/>
    <stop offset="1" stop-color="rgba(255,255,255,0.15)"/>`;
  defs.appendChild(ringGrad);

  // Cone beam — trapezoid path (narrow at top, wide at base) with blur
  const beam = document.createElementNS(ns, 'path');
  const beamW = rx * 2;
  beam.setAttribute('d', `M ${x - sourceW} ${topY} L ${x - beamW/2} ${y} L ${x + beamW/2} ${y} L ${x + sourceW} ${topY} Z`);
  beam.setAttribute('fill', `url(#${beamGradId})`);
  beam.setAttribute('filter', 'url(#spotlight-cone-blur)');
  beam.classList.add('spotlight-beam');

  // Soft glow at base (larger blurred ellipse, 1.5x ring width)
  const glow = document.createElementNS(ns, 'ellipse');
  glow.setAttribute('cx', x); glow.setAttribute('cy', y);
  glow.setAttribute('rx', rx * 1.5); glow.setAttribute('ry', ry * 3);
  glow.setAttribute('fill', `url(#${glowGradId})`);
  glow.setAttribute('filter', 'url(#spotlight-glow-blur)');
  glow.classList.add('spotlight-glow');

  // Ring — the main ellipse ring with gradient fill and thin stroke
  const ellipse = document.createElementNS(ns, 'ellipse');
  ellipse.setAttribute('cx', x); ellipse.setAttribute('cy', y);
  ellipse.setAttribute('rx', rx); ellipse.setAttribute('ry', ry);
  ellipse.setAttribute('fill', `url(#${ringGradId})`);
  ellipse.setAttribute('stroke', 'rgba(255,255,255,0.85)');
  ellipse.setAttribute('stroke-width', '1.5');
  ellipse.classList.add('spotlight-ring');

  // Name label with dark rounded-rect background, positioned below ring
  const nameBgRect = document.createElementNS(ns, 'rect');
  nameBgRect.setAttribute('class', 'spotlight-name-bg');
  nameBgRect.setAttribute('rx', '4'); nameBgRect.setAttribute('ry', '4');
  nameBgRect.setAttribute('fill', 'rgba(0,0,0,0.5)');
  nameBgRect.setAttribute('pointer-events', 'none');
  nameBgRect.style.display = 'none';

  const nameLabel = document.createElementNS(ns, 'text');
  nameLabel.setAttribute('class', 'spotlight-name');
  nameLabel.setAttribute('text-anchor', 'middle');
  nameLabel.setAttribute('dominant-baseline', 'hanging');
  nameLabel.setAttribute('font-family', 'Poppins, sans-serif');
  nameLabel.setAttribute('font-size', '11');
  nameLabel.setAttribute('font-weight', '400');
  nameLabel.setAttribute('fill', 'rgba(255,255,255,0.9)');
  nameLabel.setAttribute('x', x);
  nameLabel.setAttribute('y', y + ry + 10);
  nameLabel.setAttribute('pointer-events', 'none');
  nameLabel.style.display = 'none';

  g.appendChild(glow);
  g.appendChild(beam);
  g.appendChild(ellipse);
  g.appendChild(nameBgRect);
  g.appendChild(nameLabel);
  g.setAttribute('transform', `translate(0,0)`);
  makeDraggable(g);
  g.addEventListener('click', e => { if (S.tool === 'select') { e.stopPropagation(); select(g, { additive: e.ctrlKey || e.metaKey }); } });
  S.objectsLayer.appendChild(g);
  return g;
}

// ─── Player Vision ───────────────────────────────────────────────────────────
export function addVision(x, y) {
  const id = 'vision-' + S.nextObjectId();
  const ns = 'http://www.w3.org/2000/svg';
  const g = document.createElementNS(ns, 'g');
  g.setAttribute('id', id);
  g.dataset.type = 'vision';
  g.dataset.cx = x; g.dataset.cy = y;
  g.dataset.scale = '1'; g.dataset.rotation = '0';
  g.dataset.visionLength = '80';   // depth from apex to base
  g.dataset.visionSpread = '35';   // half-width at base
  g.dataset.visionColor = 'rgba(147,197,253,0.55)';
  g.dataset.visionStyle = S.visionType || 'pointed';

  const tri = document.createElementNS(ns, 'path');
  tri.setAttribute('fill', 'rgba(147,197,253,0.55)');
  tri.setAttribute('stroke', 'rgba(147,197,253,0.4)');
  tri.setAttribute('stroke-width', '1');
  tri.setAttribute('stroke-linejoin', 'round');
  tri.classList.add('vision-shape');

  g.appendChild(tri);
  updateVisionPolygon(g);
  makeDraggable(g);
  g.addEventListener('click', e => { if (S.tool === 'select') { e.stopPropagation(); select(g, { additive: e.ctrlKey || e.metaKey }); } });
  S.objectsLayer.appendChild(g);
  return g;
}

// ─── Add Freeform Zone ──────────────────────────────────────────────────────
// points = [{x,y}, {x,y}, ...]  (at least 3 world-space points)
export function addFreeformZone(points) {
  if (points.length < 3) return null;
  const id = 'freeform-' + S.nextObjectId();
  const ns = 'http://www.w3.org/2000/svg';
  const g = document.createElementNS(ns, 'g');
  g.setAttribute('id', id);
  g.dataset.type = 'freeform';

  // Store center as centroid of all points
  let sumX = 0, sumY = 0;
  points.forEach(p => { sumX += p.x; sumY += p.y; });
  const cx = sumX / points.length;
  const cy = sumY / points.length;
  g.dataset.cx = cx; g.dataset.cy = cy;
  g.dataset.scale = '1'; g.dataset.rotation = '0';

  // Store points as deltas from center (JSON string)
  const deltas = points.map(p => ({ dx: p.x - cx, dy: p.y - cy }));
  g.dataset.freeformPts = JSON.stringify(deltas);

  const path = document.createElementNS(ns, 'path');
  path.classList.add('freeform-shape');
  path.setAttribute('fill', 'rgba(79,156,249,0.18)');
  path.setAttribute('stroke', 'rgba(255,255,255,0.5)');
  path.setAttribute('stroke-width', '1.5');
  path.setAttribute('stroke-dasharray', '4,3');
  path.setAttribute('stroke-linejoin', 'round');

  g.appendChild(path);
  updateFreeformPath(g); // compute the smooth SVG d= from points

  makeDraggable(g);
  g.addEventListener('click', e => { if (S.tool === 'select') { e.stopPropagation(); select(g, { additive: e.ctrlKey || e.metaKey }); } });
  S.objectsLayer.appendChild(g);
  return g;
}

// Build a smooth closed SVG path (Catmull-Rom → Cubic Bezier) from the stored freeform points
export function updateFreeformPath(g) {
  const path = g.querySelector('.freeform-shape');
  if (!path) return;
  const cx = parseFloat(g.dataset.cx), cy = parseFloat(g.dataset.cy);
  const scale = parseFloat(g.dataset.scale || '1');
  const rot = parseFloat(g.dataset.rotation || '0') * Math.PI / 180;
  const deltas = JSON.parse(g.dataset.freeformPts || '[]');
  if (deltas.length < 3) return;

  // Transform deltas to world points
  const cosR = Math.cos(rot), sinR = Math.sin(rot);
  const pts = deltas.map(d => ({
    x: cx + (d.dx * scale * cosR - d.dy * scale * sinR),
    y: cy + (d.dx * scale * sinR + d.dy * scale * cosR)
  }));

  // Catmull-Rom to Bezier — smooth closed curve
  const n = pts.length;
  const tension = 0.35;
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    const cp1x = p1.x + (p2.x - p0.x) * tension;
    const cp1y = p1.y + (p2.y - p0.y) * tension;
    const cp2x = p2.x - (p3.x - p1.x) * tension;
    const cp2y = p2.y - (p3.y - p1.y) * tension;
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }
  d += ' Z';
  path.setAttribute('d', d);
}

// ─── Add Motion (player movement trail + ghost) ─────────────────────────────
export function addMotion(x1, y1, x2, y2, color) {
  color = color || 'rgba(255,255,255,0.5)';
  const id = 'motion-' + S.nextObjectId();
  const ns = 'http://www.w3.org/2000/svg';
  const g = document.createElementNS(ns, 'g');
  g.setAttribute('id', id);
  g.dataset.type = 'motion';

  const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;
  g.dataset.cx = cx; g.dataset.cy = cy;
  g.dataset.dx1 = x1 - cx; g.dataset.dy1 = y1 - cy;
  g.dataset.dx2 = x2 - cx; g.dataset.dy2 = y2 - cy;
  g.dataset.scale = '1'; g.dataset.rotation = '0';
  g.dataset.motionColor = color;

  // Trail line (dashed, curved feel via stroke style)
  const trail = document.createElementNS(ns, 'line');
  trail.classList.add('motion-trail');
  trail.setAttribute('stroke', color);
  trail.setAttribute('stroke-width', '2');
  trail.setAttribute('stroke-dasharray', '6,4');
  trail.setAttribute('stroke-linecap', 'round');
  trail.setAttribute('opacity', '0.7');

  // Direction chevrons (small arrow in the middle)
  const chevron = document.createElementNS(ns, 'polygon');
  chevron.classList.add('motion-chevron');
  chevron.setAttribute('fill', color);
  chevron.setAttribute('opacity', '0.6');

  // Ghost circle at destination
  const ghost = document.createElementNS(ns, 'circle');
  ghost.classList.add('motion-ghost');
  ghost.setAttribute('r', '10');
  ghost.setAttribute('fill', color);
  ghost.setAttribute('opacity', '0.25');
  ghost.setAttribute('stroke', color);
  ghost.setAttribute('stroke-width', '1.5');
  ghost.setAttribute('stroke-dasharray', '3,2');

  // Invisible hit area
  const hit = document.createElementNS(ns, 'line');
  hit.setAttribute('stroke', 'transparent');
  hit.setAttribute('stroke-width', '14');

  g.appendChild(trail);
  g.appendChild(chevron);
  g.appendChild(ghost);
  g.appendChild(hit);
  updateMotionVisual(g);

  makeDraggable(g);
  g.addEventListener('click', e => { if (S.tool === 'select') { e.stopPropagation(); select(g, { additive: e.ctrlKey || e.metaKey }); } });
  S.objectsLayer.appendChild(g);
  return g;
}

// Recompute visual positions for a motion element
export function updateMotionVisual(el) {
  const cx = parseFloat(el.dataset.cx), cy = parseFloat(el.dataset.cy);
  const dx1 = parseFloat(el.dataset.dx1), dy1 = parseFloat(el.dataset.dy1);
  const dx2 = parseFloat(el.dataset.dx2), dy2 = parseFloat(el.dataset.dy2);
  const sc = parseFloat(el.dataset.scale || '1');
  const rot = parseFloat(el.dataset.rotation || '0') * Math.PI / 180;
  const cosR = Math.cos(rot), sinR = Math.sin(rot);

  const p1x = cx + (dx1*sc)*cosR - (dy1*sc)*sinR;
  const p1y = cy + (dx1*sc)*sinR + (dy1*sc)*cosR;
  const p2x = cx + (dx2*sc)*cosR - (dy2*sc)*sinR;
  const p2y = cy + (dx2*sc)*sinR + (dy2*sc)*cosR;

  // Trail line
  const trail = el.querySelector('.motion-trail');
  if (trail) {
    trail.setAttribute('x1', p1x); trail.setAttribute('y1', p1y);
    trail.setAttribute('x2', p2x); trail.setAttribute('y2', p2y);
  }

  // Hit area
  const hit = el.querySelector('line:not(.motion-trail)');
  if (hit) {
    hit.setAttribute('x1', p1x); hit.setAttribute('y1', p1y);
    hit.setAttribute('x2', p2x); hit.setAttribute('y2', p2y);
  }

  // Ghost at endpoint
  const ghost = el.querySelector('.motion-ghost');
  if (ghost) {
    ghost.setAttribute('cx', p2x); ghost.setAttribute('cy', p2y);
  }

  // Chevron (small arrow at midpoint, pointing toward destination)
  const chevron = el.querySelector('.motion-chevron');
  if (chevron) {
    const mx = (p1x + p2x) / 2, my = (p1y + p2y) / 2;
    const angle = Math.atan2(p2y - p1y, p2x - p1x);
    const sz = 5;
    const tipX = mx + sz * Math.cos(angle);
    const tipY = my + sz * Math.sin(angle);
    const lx = mx - sz * Math.cos(angle - 0.5);
    const ly = my - sz * Math.sin(angle - 0.5);
    const rx = mx - sz * Math.cos(angle + 0.5);
    const ry = my - sz * Math.sin(angle + 0.5);
    chevron.setAttribute('points', `${tipX},${tipY} ${lx},${ly} ${rx},${ry}`);
  }
}

// Update the vision polygon points from stored dimensions
export function updateVisionPolygon(g) {
  const shape = g.querySelector('.vision-shape');
  if (!shape) return;
  const cx = parseFloat(g.dataset.cx);
  const cy = parseFloat(g.dataset.cy);
  const len = parseFloat(g.dataset.visionLength || '80');
  const spread = parseFloat(g.dataset.visionSpread || '35');
  const rot = parseFloat(g.dataset.rotation || '0');
  const scale = parseFloat(g.dataset.scale || '1');
  const style = g.dataset.visionStyle || 'pointed';

  // Compute the 3 world-space vertices
  const r = rot * Math.PI / 180;
  const cosR = Math.cos(r), sinR = Math.sin(r);

  // Local coords → rotated + scaled → translated
  // Apex at (0,0) → (cx, cy)
  // Top-right at (len, -spread) → rotated & scaled
  // Bottom-right at (len, spread) → rotated & scaled
  const sLen = len * scale, sSpread = spread * scale;

  const ax = cx, ay = cy;
  const tx = cx + (sLen * cosR - (-sSpread) * sinR);
  const ty = cy + (sLen * sinR + (-sSpread) * cosR);
  const bx = cx + (sLen * cosR - sSpread * sinR);
  const by = cy + (sLen * sinR + sSpread * cosR);

  // Ensure we have a <path> element (upgrade legacy <polygon> if needed)
  if (shape.tagName === 'polygon') {
    const ns = 'http://www.w3.org/2000/svg';
    const p = document.createElementNS(ns, 'path');
    p.setAttribute('fill', shape.getAttribute('fill'));
    p.setAttribute('stroke', shape.getAttribute('stroke'));
    p.setAttribute('stroke-width', shape.getAttribute('stroke-width'));
    p.setAttribute('stroke-linejoin', shape.getAttribute('stroke-linejoin') || 'round');
    p.classList.add('vision-shape');
    shape.replaceWith(p);
    // Re-query and set the path
    const newShape = g.querySelector('.vision-shape');
    setVisionPath(newShape, style, ax, ay, tx, ty, bx, by, cx, cy, sLen, cosR, sinR);
    return;
  }

  setVisionPath(shape, style, ax, ay, tx, ty, bx, by, cx, cy, sLen, cosR, sinR);
}

function setVisionPath(shape, style, ax, ay, tx, ty, bx, by, cx, cy, sLen, cosR, sinR) {
  if (style === 'rounded') {
    // Control point for quadratic bezier: bulge the base outward
    // In local space it's at (len * 1.25, 0) — past the base, centered
    const cpLocalX = sLen * 1.25, cpLocalY = 0;
    const cpx = cx + (cpLocalX * cosR - cpLocalY * sinR);
    const cpy = cy + (cpLocalX * sinR + cpLocalY * cosR);
    shape.setAttribute('d', `M ${ax},${ay} L ${tx},${ty} Q ${cpx},${cpy} ${bx},${by} Z`);
  } else {
    // Pointed: straight triangle
    shape.setAttribute('d', `M ${ax},${ay} L ${tx},${ty} L ${bx},${by} Z`);
  }
}

// ─── Add Tag (stat annotation callout) ──────────────────────────────────────
let _tagCount = 0;

export function addTag(x, y, label, value) {
  label = label || 'TOP SPEED';
  value = value || '8.7km/h';
  const id = 'tag-' + S.nextObjectId();
  const ns = 'http://www.w3.org/2000/svg';
  const g = document.createElementNS(ns, 'g');
  g.setAttribute('id', id);
  g.dataset.type = 'tag';
  g.dataset.cx = x; g.dataset.cy = y;
  g.dataset.scale = '1'; g.dataset.rotation = '0';
  g.dataset.tagLabel = label;
  g.dataset.tagValue = value;
  g.dataset.tagLabelColor = 'rgba(255,255,255,0.9)';
  g.dataset.tagValueColor = '#39FF14';
  g.dataset.tagLineColor = 'rgba(255,255,255,0.7)';
  g.dataset.tagLineDash = '6,4';
  g.dataset.tagLineLen = '80';
  g.dataset.tagLineAngle = '-35';
  g.dataset.tagTextAnchor = 'bottom';  // top, bottom, left, right — where line meets text

  // Dashed line
  const line = document.createElementNS(ns, 'line');
  line.classList.add('tag-line');
  line.setAttribute('stroke', 'rgba(255,255,255,0.7)');
  line.setAttribute('stroke-width', '1.5');
  line.setAttribute('stroke-dasharray', '6,4');

  // Anchor circle (filled)
  const circle = document.createElementNS(ns, 'circle');
  circle.classList.add('tag-dot');
  circle.setAttribute('r', '5');
  circle.setAttribute('fill', 'rgba(255,255,255,0.9)');
  circle.setAttribute('stroke', 'none');

  // Label text (white, upper)
  const labelEl = document.createElementNS(ns, 'text');
  labelEl.classList.add('tag-label');
  labelEl.setAttribute('font-family', 'Poppins, sans-serif');
  labelEl.setAttribute('font-size', '12');
  labelEl.setAttribute('font-weight', '600');
  labelEl.setAttribute('fill', 'rgba(255,255,255,0.9)');
  labelEl.setAttribute('pointer-events', 'none');
  labelEl.setAttribute('letter-spacing', '0.5');

  // Value text (green, lower — same font size)
  const valueEl = document.createElementNS(ns, 'text');
  valueEl.classList.add('tag-value');
  valueEl.setAttribute('font-family', 'Poppins, sans-serif');
  valueEl.setAttribute('font-size', '12');
  valueEl.setAttribute('font-weight', '700');
  valueEl.setAttribute('fill', '#39FF14');
  valueEl.setAttribute('pointer-events', 'none');

  // Hit area at the dot
  const hitDot = document.createElementNS(ns, 'circle');
  hitDot.classList.add('hit-area');
  hitDot.setAttribute('r', '24');
  hitDot.setAttribute('fill', 'transparent');
  hitDot.setAttribute('stroke', 'none');

  // Hit area at the text end (repositioned in repositionTag)
  const hitText = document.createElementNS(ns, 'rect');
  hitText.classList.add('hit-area', 'tag-hit-text');
  hitText.setAttribute('fill', 'transparent');
  hitText.setAttribute('stroke', 'none');
  hitText.setAttribute('pointer-events', 'all');

  // Wide hit area along the line
  const hitLine = document.createElementNS(ns, 'line');
  hitLine.classList.add('hit-area', 'tag-hit-line');
  hitLine.setAttribute('stroke', 'transparent');
  hitLine.setAttribute('stroke-width', '16');
  hitLine.setAttribute('pointer-events', 'stroke');

  g.appendChild(hitLine);
  g.appendChild(line);
  g.appendChild(circle);
  g.appendChild(labelEl);
  g.appendChild(valueEl);
  g.appendChild(hitDot);
  g.appendChild(hitText);
  S.playersLayer.appendChild(g);
  repositionTag(g);

  makeDraggable(g);
  g.addEventListener('click', e => {
    if (S.tool !== 'select') return;
    e.stopPropagation();
    select(g);
  });
  _tagCount++;
  return g;
}

export function repositionTag(g) {
  const cx = parseFloat(g.dataset.cx);
  const cy = parseFloat(g.dataset.cy);
  const len = parseFloat(g.dataset.tagLineLen || '80');
  const angleDeg = parseFloat(g.dataset.tagLineAngle || '-35');
  const angleRad = angleDeg * Math.PI / 180;

  // Circle dot is at (cx, cy) — the anchor point
  const circle = g.querySelector('.tag-dot');
  if (circle) { circle.setAttribute('cx', cx); circle.setAttribute('cy', cy); }

  // Hit area centered on the dot
  const hitDot = g.querySelector('.hit-area:not(.tag-hit-text):not(.tag-hit-line)');
  if (hitDot) { hitDot.setAttribute('cx', cx); hitDot.setAttribute('cy', cy); }

  // Line extends from dot to text area
  const ex = cx + len * Math.cos(angleRad);
  const ey = cy + len * Math.sin(angleRad);
  const line = g.querySelector('.tag-line');
  if (line) {
    line.setAttribute('x1', cx); line.setAttribute('y1', cy);
    line.setAttribute('x2', ex); line.setAttribute('y2', ey);
    line.setAttribute('stroke', g.dataset.tagLineColor || 'rgba(255,255,255,0.7)');
    const dash = g.dataset.tagLineDash || '6,4';
    if (dash === 'none') line.removeAttribute('stroke-dasharray');
    else line.setAttribute('stroke-dasharray', dash);
  }

  // Hit area along the line
  const hitLine = g.querySelector('.tag-hit-line');
  if (hitLine) {
    hitLine.setAttribute('x1', cx); hitLine.setAttribute('y1', cy);
    hitLine.setAttribute('x2', ex); hitLine.setAttribute('y2', ey);
  }

  // Text positioning: anchor describes where the line meets the text block
  // "top"    → line connects at top-center of text; text hangs below
  // "bottom" → line connects at bottom-center; text sits above
  // "left"   → line connects at left-center; text extends right
  // "right"  → line connects at right-center; text extends left
  const gap = 6;
  const anchor = g.dataset.tagTextAnchor || 'bottom';
  const fontSize = 12;
  const lineH = fontSize * 1.4;
  const textBlockH = lineH * 2;  // two lines (label + value)

  const labelEl = g.querySelector('.tag-label');
  const valueEl = g.querySelector('.tag-value');

  let labelX, labelY, valueX, valueY, svgAnchor, labelBaseline, valueBaseline;

  if (anchor === 'top') {
    // Line meets top-center → text below the connection point
    svgAnchor = 'middle';
    labelX = ex; labelY = ey + gap;
    valueX = ex; valueY = labelY + lineH;
    labelBaseline = 'hanging'; valueBaseline = 'hanging';
  } else if (anchor === 'bottom') {
    // Line meets bottom-center → text above the connection point
    svgAnchor = 'middle';
    valueY = ey - gap;
    labelY = valueY - lineH;
    labelX = ex; valueX = ex;
    labelBaseline = 'auto'; valueBaseline = 'auto';
  } else if (anchor === 'left') {
    // Line meets left-center of text → text extends right
    svgAnchor = 'start';
    labelX = ex + gap; valueX = ex + gap;
    labelY = ey - lineH * 0.55;
    valueY = labelY + lineH;
    labelBaseline = 'auto'; valueBaseline = 'auto';
  } else if (anchor === 'right') {
    // Line meets right-center of text → text extends left
    svgAnchor = 'end';
    labelX = ex - gap; valueX = ex - gap;
    labelY = ey - lineH * 0.55;
    valueY = labelY + lineH;
    labelBaseline = 'auto'; valueBaseline = 'auto';
  }

  if (labelEl) {
    labelEl.setAttribute('x', labelX);
    labelEl.setAttribute('y', labelY);
    labelEl.setAttribute('fill', g.dataset.tagLabelColor || 'rgba(255,255,255,0.9)');
    labelEl.setAttribute('font-size', fontSize);
    labelEl.setAttribute('text-anchor', svgAnchor);
    labelEl.setAttribute('dominant-baseline', labelBaseline);
    labelEl.textContent = g.dataset.tagLabel || '';
  }
  if (valueEl) {
    valueEl.setAttribute('x', valueX);
    valueEl.setAttribute('y', valueY);
    valueEl.setAttribute('fill', g.dataset.tagValueColor || '#39FF14');
    valueEl.setAttribute('font-size', fontSize);
    valueEl.setAttribute('text-anchor', svgAnchor);
    valueEl.setAttribute('dominant-baseline', valueBaseline);
    valueEl.textContent = g.dataset.tagValue || '';
  }

  // Hit area at text end — dynamically sized to cover both text lines
  const hitText = g.querySelector('.tag-hit-text');
  if (hitText) {
    const pad = 10;
    // Measure actual text widths if available
    let maxW = 80;
    if (labelEl && labelEl.getComputedTextLength) {
      const lw = labelEl.getComputedTextLength();
      const vw = valueEl ? valueEl.getComputedTextLength() : 0;
      maxW = Math.max(lw, vw, 40) + pad * 2;
    }
    const hitH = textBlockH + pad * 2;
    let hx, hy;

    if (anchor === 'top') {
      hx = ex - maxW / 2; hy = ey;
    } else if (anchor === 'bottom') {
      hx = ex - maxW / 2; hy = ey - hitH;
    } else if (anchor === 'left') {
      hx = ex; hy = ey - hitH / 2;
    } else if (anchor === 'right') {
      hx = ex - maxW; hy = ey - hitH / 2;
    }
    hitText.setAttribute('x', hx);
    hitText.setAttribute('y', hy);
    hitText.setAttribute('width', maxW);
    hitText.setAttribute('height', hitH);
  }
}

// ─── Add Link (player-to-player connecting line) ────────────────────────────
export function addLink(player1Id, player2Id, opts = {}) {
  const id = 'link-' + S.nextObjectId();
  const ns = 'http://www.w3.org/2000/svg';
  const g = document.createElementNS(ns, 'g');
  g.setAttribute('id', id);
  g.dataset.type = 'link';
  g.dataset.player1 = player1Id;
  g.dataset.player2 = player2Id;
  g.dataset.linkColor = opts.color || 'rgba(255,255,255,0.4)';
  g.dataset.linkStyle = opts.style || 'dashed'; // 'dashed' or 'solid'
  // cx/cy for compat with moveElement (midpoint of the two players)
  g.dataset.cx = '0'; g.dataset.cy = '0';
  g.dataset.scale = '1'; g.dataset.rotation = '0';

  // Visible line
  const line = document.createElementNS(ns, 'line');
  line.classList.add('link-line');
  line.setAttribute('stroke', g.dataset.linkColor);
  line.setAttribute('stroke-width', '3');
  if (g.dataset.linkStyle === 'dashed') line.setAttribute('stroke-dasharray', '6,4');
  line.setAttribute('stroke-linecap', 'round');
  line.setAttribute('pointer-events', 'none');

  // Thicker invisible hit line for click targeting
  const hit = document.createElementNS(ns, 'line');
  hit.classList.add('link-hit');
  hit.setAttribute('stroke', 'transparent');
  hit.setAttribute('stroke-width', '14');
  hit.setAttribute('pointer-events', 'stroke');

  g.appendChild(hit);
  g.appendChild(line);
  S.objectsLayer.appendChild(g);

  // Position the line from player positions
  updateLink(g);

  // Click handler: select all connected players as a group
  g.addEventListener('click', e => {
    if (S.tool === 'select') { e.stopPropagation(); selectConnectedGroup(g, e); }
  });
  // Mousedown handler: if players are already selected, start group drag
  g.addEventListener('mousedown', e => {
    if (S.tool !== 'select') return;
    // Select connected group first if not already multi-selected
    selectConnectedGroup(g, e);
    // Now start the drag via a synthetic mousedown on the first connected player
    const p1 = document.getElementById(g.dataset.player1);
    if (p1) {
      // The players are now in selectedEls; dispatch mousedown on one to trigger startDrag
      const synth = new MouseEvent('mousedown', { bubbles: false, clientX: e.clientX, clientY: e.clientY, ctrlKey: e.ctrlKey, metaKey: e.metaKey });
      e.stopPropagation(); e.preventDefault();
      p1.dispatchEvent(synth);
    }
  });

  return g;
}

export function updateLink(linkEl) {
  if (!linkEl || linkEl.dataset.type !== 'link') return;
  const p1Id = linkEl.dataset.player1;
  const p2Id = linkEl.dataset.player2;
  const p1 = document.getElementById(p1Id);
  const p2 = document.getElementById(p2Id);

  const line = linkEl.querySelector('.link-line');
  const hit = linkEl.querySelector('.link-hit');
  if (!line || !hit) return;

  let x1, y1, x2, y2;
  if (p1) { x1 = parseFloat(p1.dataset.cx); y1 = parseFloat(p1.dataset.cy); }
  else { x1 = parseFloat(linkEl.dataset.lastX1 || '0'); y1 = parseFloat(linkEl.dataset.lastY1 || '0'); }
  if (p2) { x2 = parseFloat(p2.dataset.cx); y2 = parseFloat(p2.dataset.cy); }
  else { x2 = parseFloat(linkEl.dataset.lastX2 || '0'); y2 = parseFloat(linkEl.dataset.lastY2 || '0'); }

  // Store last known positions
  linkEl.dataset.lastX1 = x1; linkEl.dataset.lastY1 = y1;
  linkEl.dataset.lastX2 = x2; linkEl.dataset.lastY2 = y2;
  // Update cx/cy to midpoint
  linkEl.dataset.cx = (x1 + x2) / 2; linkEl.dataset.cy = (y1 + y2) / 2;

  line.setAttribute('x1', x1); line.setAttribute('y1', y1);
  line.setAttribute('x2', x2); line.setAttribute('y2', y2);
  hit.setAttribute('x1', x1); hit.setAttribute('y1', y1);
  hit.setAttribute('x2', x2); hit.setAttribute('y2', y2);

  // Apply style
  const color = linkEl.dataset.linkColor || 'rgba(255,255,255,0.4)';
  line.setAttribute('stroke', color);
  line.setAttribute('stroke-width', '3');
  line.setAttribute('stroke-linecap', 'round');
  if (linkEl.dataset.linkStyle === 'solid') {
    line.removeAttribute('stroke-dasharray');
  } else {
    line.setAttribute('stroke-dasharray', '6,4');
  }
}

export function updateAllLinks() {
  const links = S.objectsLayer.querySelectorAll('g[data-type="link"]');
  links.forEach(updateLink);
  // Also check players layer in case links were moved there
  const links2 = S.playersLayer.querySelectorAll('g[data-type="link"]');
  links2.forEach(updateLink);
  // Also update pair elements
  updateAllPairs();
}

// ─── Select Connected Group ──────────────────────────────────────────────────
// When clicking a link line, find all transitively connected players and select them
function selectConnectedGroup(linkEl, e) {
  const allLinks = [...S.objectsLayer.querySelectorAll('g[data-type="link"]'),
                     ...S.playersLayer.querySelectorAll('g[data-type="link"]')];
  // Build adjacency graph
  const adj = {};
  for (const lk of allLinks) {
    if (lk.style.display === 'none') continue;
    const a = lk.dataset.player1, b = lk.dataset.player2;
    if (!adj[a]) adj[a] = new Set();
    if (!adj[b]) adj[b] = new Set();
    adj[a].add(b); adj[b].add(a);
  }
  // BFS from both endpoints of the clicked link
  const seed1 = linkEl.dataset.player1, seed2 = linkEl.dataset.player2;
  const visited = new Set();
  const queue = [seed1, seed2];
  while (queue.length) {
    const id = queue.shift();
    if (visited.has(id)) continue;
    visited.add(id);
    if (adj[id]) for (const n of adj[id]) if (!visited.has(n)) queue.push(n);
  }
  // Select all connected players
  const additive = e.ctrlKey || e.metaKey;
  let first = true;
  for (const pid of visited) {
    const pEl = document.getElementById(pid);
    if (!pEl) continue;
    if (first && !additive) {
      select(pEl, { additive: false });
      first = false;
    } else {
      select(pEl, { additive: true });
    }
  }
}

// ─── Pair Element ────────────────────────────────────────────────────────────
// Ellipse zone around two players: red fill, white dashed border
export function addPair(player1Id, player2Id) {
  const id = 'pair-' + S.nextObjectId();
  const ns = 'http://www.w3.org/2000/svg';
  const g = document.createElementNS(ns, 'g');
  g.setAttribute('id', id);
  g.dataset.type = 'pair';
  g.dataset.player1 = player1Id;
  g.dataset.player2 = player2Id;
  g.dataset.cx = '0'; g.dataset.cy = '0';
  g.dataset.scale = '1'; g.dataset.rotation = '0';
  g.dataset.pairColor = 'rgba(234,179,8,0.4)';
  g.dataset.pairPadX = '24';  // extra rx beyond half-distance
  g.dataset.pairPadY = '28';  // ry (vertical padding)

  const ellipse = document.createElementNS(ns, 'ellipse');
  ellipse.classList.add('pair-ellipse');
  ellipse.setAttribute('fill', 'rgba(234,179,8,0.4)');
  ellipse.setAttribute('stroke', 'rgba(255,255,255,0.5)');
  ellipse.setAttribute('stroke-width', '1.5');
  ellipse.setAttribute('stroke-dasharray', '4,3');

  g.appendChild(ellipse);
  // Insert at the beginning of objectsLayer so it's behind players
  S.objectsLayer.insertBefore(g, S.objectsLayer.firstChild);

  updatePair(g);

  // Click handler for selection
  g.addEventListener('click', e => {
    if (S.tool === 'select') { e.stopPropagation(); select(g, { additive: e.ctrlKey || e.metaKey }); }
  });

  makeDraggable(g);
  return g;
}

export function updatePair(pairEl) {
  if (!pairEl || pairEl.dataset.type !== 'pair') return;
  const p1 = document.getElementById(pairEl.dataset.player1);
  const p2 = document.getElementById(pairEl.dataset.player2);
  const ellipse = pairEl.querySelector('.pair-ellipse');
  if (!ellipse) return;

  let x1, y1, x2, y2;
  if (p1) { x1 = parseFloat(p1.dataset.cx); y1 = parseFloat(p1.dataset.cy); }
  else { x1 = parseFloat(pairEl.dataset.lastX1 || '0'); y1 = parseFloat(pairEl.dataset.lastY1 || '0'); }
  if (p2) { x2 = parseFloat(p2.dataset.cx); y2 = parseFloat(p2.dataset.cy); }
  else { x2 = parseFloat(pairEl.dataset.lastX2 || '0'); y2 = parseFloat(pairEl.dataset.lastY2 || '0'); }

  pairEl.dataset.lastX1 = x1; pairEl.dataset.lastY1 = y1;
  pairEl.dataset.lastX2 = x2; pairEl.dataset.lastY2 = y2;

  const cx = (x1 + x2) / 2;
  const cy = (y1 + y2) / 2;
  const dist = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
  const padX = parseFloat(pairEl.dataset.pairPadX || '24');
  const padY = parseFloat(pairEl.dataset.pairPadY || '28');
  const rx = dist / 2 + padX;
  const ry = padY;
  const angle = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;

  pairEl.dataset.cx = cx; pairEl.dataset.cy = cy;
  pairEl.dataset.hw = rx; pairEl.dataset.hh = ry;
  pairEl.dataset.rotation = angle;
  pairEl.dataset.pairDist = dist; // store for handle back-calculation

  ellipse.setAttribute('cx', cx);
  ellipse.setAttribute('cy', cy);
  ellipse.setAttribute('rx', rx);
  ellipse.setAttribute('ry', ry);
  ellipse.setAttribute('transform', `rotate(${angle} ${cx} ${cy})`);

  // Apply color
  const color = pairEl.dataset.pairColor || 'rgba(234,179,8,0.4)';
  ellipse.setAttribute('fill', color);
}

export function updateAllPairs() {
  const pairs = S.objectsLayer.querySelectorAll('g[data-type="pair"]');
  pairs.forEach(updatePair);
  const pairs2 = S.playersLayer.querySelectorAll('g[data-type="pair"]');
  pairs2.forEach(updatePair);
}

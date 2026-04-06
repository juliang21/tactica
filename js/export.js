import * as S from './state.js';
import { deselectVisual, select } from './interaction.js';
import { trackExportClicked, trackExportCompleted } from './analytics.js';
import { canAccess } from './subscription.js';

// Helper: word-wrap text for canvas rendering
function wrapCanvasText(ctx, content, maxW) {
  const paragraphs = content.split('\n');
  const lines = [];
  for (const para of paragraphs) {
    if (para.trim() === '') { lines.push(''); continue; }
    const words = para.split(/\s+/);
    let cur = '';
    for (const w of words) {
      const test = cur ? cur + ' ' + w : w;
      if (ctx.measureText(test).width > maxW && cur) { lines.push(cur); cur = w; }
      else cur = test;
    }
    if (cur) lines.push(cur);
  }
  return lines.length ? lines : [''];
}

// ─── Free-tier watermark ─────────────────────────────────────────────────────
function drawWatermark(ctx, W, H, logoImg) {
  ctx.save();

  const padding = 8;
  const logoSize = 16;
  const gap = 5;
  const text = 'Built with tactica.rondos.futbol';

  ctx.font = '600 11px Inter, system-ui, sans-serif';
  const textW = ctx.measureText(text).width;

  const blockW = (logoImg ? logoSize + gap : 0) + textW + padding * 2;
  const blockH = 24;
  const x = W - blockW - 10;
  const y = H - blockH - 10;

  // Semi-transparent pill background
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  const r = 6;
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + blockW - r, y);
  ctx.arcTo(x + blockW, y, x + blockW, y + r, r);
  ctx.lineTo(x + blockW, y + blockH - r);
  ctx.arcTo(x + blockW, y + blockH, x + blockW - r, y + blockH, r);
  ctx.lineTo(x + r, y + blockH);
  ctx.arcTo(x, y + blockH, x, y + blockH - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
  ctx.fill();

  // Logo
  let textX = x + padding;
  if (logoImg) {
    const ly = y + (blockH - logoSize) / 2;
    ctx.drawImage(logoImg, textX, ly, logoSize, logoSize);
    textX += logoSize + gap;
  }

  // Text
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, textX, y + blockH / 2);

  ctx.restore();
}

export function exportImage() {
  trackExportClicked();
  document.getElementById('export-modal').style.display = 'flex';
}

export function selectFmt(fmt) {
  S.setExportFmt(fmt);
  document.getElementById('fmt-png').classList.toggle('active', fmt === 'png');
  document.getElementById('fmt-jpg').classList.toggle('active', fmt === 'jpg');
}

export function closeExport() {
  document.getElementById('export-modal').style.display = 'none';
}

export function doExport() {
  trackExportCompleted(S.exportFmt || 'png');
  closeExport();
  const prevSelected = S.selectedEl;
  if (S.selectedEl) deselectVisual(S.selectedEl);

  const svgExport = S.svg;
  const W = svgExport.viewBox.baseVal.width || 700;
  const H = svgExport.viewBox.baseVal.height || 480;
  const S1 = S.pitchColors.s1;
  const S2 = S.pitchColors.s2;
  const PL = S.pitchColors.line;
  const isV = S.currentPitchLayout.includes('full-v');
  const isHalf = S.currentPitchLayout.startsWith('half');
  const hasGoals = !S.currentPitchLayout.includes('-ng');
  const hasD = !S.currentPitchLayout.includes('-nd');

  const SCALE = 3; // 3x resolution for crisp exports
  const canvas = document.createElement('canvas');
  canvas.width = W * SCALE; canvas.height = H * SCALE;
  canvas.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0;pointer-events:none;';
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  ctx.scale(SCALE, SCALE);

  // Image mode: draw uploaded image as background, then render overlays
  if (S.appMode === 'image' && S.imageData) {
    const bgImg = new Image();
    bgImg.onload = () => {
      ctx.drawImage(bgImg, 0, 0, W, H);
      renderOverlays(ctx, W, H, SCALE, canvas, prevSelected);
    };
    bgImg.src = S.imageData;
    return;
  }

  // Pitch stripes
  if (isV) {
    for (let y = 0; y < H; y += 40) {
      ctx.fillStyle = S1; ctx.fillRect(0, y, W, 20);
      ctx.fillStyle = S2; ctx.fillRect(0, y+20, W, 20);
    }
  } else {
    for (let x = 0; x < W; x += 40) {
      ctx.fillStyle = S1; ctx.fillRect(x, 0, 20, H);
      ctx.fillStyle = S2; ctx.fillRect(x+20, 0, 20, H);
    }
  }

  function pl(fn) { ctx.save(); ctx.strokeStyle = PL; ctx.lineWidth = 1.5; fn(); ctx.restore(); }

  if (!isV) {
    const pad=30, py=20, pw=W-pad*2, ph=H-py*2, cx=W/2, cy=H/2;
    if (isHalf) {
      pl(() => { ctx.lineWidth=2; ctx.strokeRect(pad,py,pw,ph); });
      const paW=pw*0.42, paH=ph*0.45, paX=pad+(pw-paW)/2, paY=py+ph-paH;
      pl(() => { ctx.strokeRect(paX,paY,paW,paH); });
      const gaW=pw*0.18, gaH=ph*0.18, gaX=pad+(pw-gaW)/2, gaY=py+ph-gaH;
      pl(() => { ctx.strokeRect(gaX,gaY,gaW,gaH); });
      const psX=cx, psY=py+ph-paH*0.78;
      ctx.beginPath(); ctx.arc(psX,psY,3,0,Math.PI*2); ctx.fillStyle=PL; ctx.fill();
      const hArcDist = psY - paY;
      const hArcA = Math.acos(Math.min(1, hArcDist/55));
      pl(() => { ctx.beginPath(); ctx.arc(psX,psY,55,Math.PI*1.5-hArcA,Math.PI*1.5+hArcA,true); ctx.stroke(); });
      pl(() => { ctx.beginPath(); ctx.moveTo(pad,py); ctx.lineTo(pad+pw,py); ctx.stroke(); });
      if (hasGoals) {
        const gW=pw*0.075, gH=14, gX=pad+(pw-gW)/2;
        ctx.save(); ctx.fillStyle='rgba(0,0,0,0)'; ctx.strokeStyle=PL; ctx.lineWidth=1.5;
        ctx.fillRect(gX,py+ph,gW,gH); ctx.strokeRect(gX,py+ph,gW,gH); ctx.restore();
      }
    } else {
      pl(() => { ctx.lineWidth=2; ctx.strokeRect(pad,py,pw,ph); });
      pl(() => { ctx.beginPath(); ctx.moveTo(cx,py); ctx.lineTo(cx,py+ph); ctx.stroke(); });
      pl(() => { ctx.beginPath(); ctx.arc(cx,cy,55,0,Math.PI*2); ctx.stroke(); });
      ctx.beginPath(); ctx.arc(cx,cy,3,0,Math.PI*2); ctx.fillStyle=PL; ctx.fill();
      pl(() => { ctx.strokeRect(pad,cy-100,105,200); });
      pl(() => { ctx.strokeRect(pad,cy-55,40,110); });
      ctx.beginPath(); ctx.arc(pad+67,cy,2.5,0,Math.PI*2); ctx.fillStyle=PL; ctx.fill();
      const arcA = Math.acos(38/55);
      pl(() => { ctx.beginPath(); ctx.arc(pad+67,cy,55,-arcA,arcA); ctx.stroke(); });
      pl(() => { ctx.strokeRect(pad+pw-105,cy-100,105,200); });
      pl(() => { ctx.strokeRect(pad+pw-40,cy-55,40,110); });
      ctx.beginPath(); ctx.arc(pad+pw-67,cy,2.5,0,Math.PI*2); ctx.fillStyle=PL; ctx.fill();
      pl(() => { ctx.beginPath(); ctx.arc(pad+pw-67,cy,55,Math.PI-arcA,Math.PI+arcA); ctx.stroke(); });
      ctx.save(); ctx.fillStyle='rgba(0,0,0,0)'; ctx.strokeStyle=PL; ctx.lineWidth=1.5;
      ctx.fillRect(pad-14,cy-35,14,70); ctx.strokeRect(pad-14,cy-35,14,70);
      ctx.fillRect(pad+pw,cy-35,14,70); ctx.strokeRect(pad+pw,cy-35,14,70);
      ctx.restore();
    }
  } else {
    const pad=20, px=20, pw=W-pad*2, ph=H-px*2, cx=W/2, cy=H/2;
    if (isHalf) {
      pl(() => { ctx.lineWidth=2; ctx.strokeRect(pad,px,pw,ph); });
      const paH=ph*0.42, paW=pw*0.80, paX=pad+(pw-paW)/2;
      pl(() => { ctx.strokeRect(paX,px,paW,paH); });
      const gaH=ph*0.18, gaW=pw*0.36, gaX=pad+(pw-gaW)/2;
      pl(() => { ctx.strokeRect(gaX,px,gaW,gaH); });
      const psY=px+paH*0.78;
      ctx.beginPath(); ctx.arc(cx,psY,3,0,Math.PI*2); ctx.fillStyle=PL; ctx.fill();
      const vhArcDist = psY - (px + paH);
      const vhArcA = Math.acos(Math.min(1, Math.abs(vhArcDist)/55));
      pl(() => { ctx.beginPath(); ctx.arc(cx,psY,55,Math.PI/2-vhArcA,Math.PI/2+vhArcA); ctx.stroke(); });
      if (hasGoals) {
        const gH=14, gW=pw*0.38, gX=pad+(pw-gW)/2;
        ctx.save(); ctx.fillStyle='rgba(0,0,0,0)'; ctx.strokeStyle=PL; ctx.lineWidth=1.5;
        ctx.fillRect(gX,px-14,gW,14); ctx.strokeRect(gX,px-14,gW,14); ctx.restore();
      }
    } else {
      pl(() => { ctx.lineWidth=2; ctx.strokeRect(pad,px,pw,ph); });
      pl(() => { ctx.beginPath(); ctx.moveTo(pad,cy); ctx.lineTo(pad+pw,cy); ctx.stroke(); });
      pl(() => { ctx.beginPath(); ctx.arc(cx,cy,55,0,Math.PI*2); ctx.stroke(); });
      ctx.beginPath(); ctx.arc(cx,cy,3,0,Math.PI*2); ctx.fillStyle=PL; ctx.fill();
      pl(() => { ctx.strokeRect(cx-100,px,200,105); });
      pl(() => { ctx.strokeRect(cx-55,px,110,40); });
      ctx.beginPath(); ctx.arc(cx,px+67,2.5,0,Math.PI*2); ctx.fillStyle=PL; ctx.fill();
      const vArcA = Math.acos(38/55);
      pl(() => { ctx.beginPath(); ctx.arc(cx,px+67,55,Math.PI/2+vArcA,Math.PI*2.5-vArcA); ctx.stroke(); });
      pl(() => { ctx.strokeRect(cx-100,px+ph-105,200,105); });
      pl(() => { ctx.strokeRect(cx-55,px+ph-40,110,40); });
      ctx.beginPath(); ctx.arc(cx,px+ph-67,2.5,0,Math.PI*2); ctx.fillStyle=PL; ctx.fill();
      pl(() => { ctx.beginPath(); ctx.arc(cx,px+ph-67,55,Math.PI/2-vArcA,-(Math.PI/2-vArcA)); ctx.stroke(); });
      ctx.save(); ctx.fillStyle='rgba(0,0,0,0)'; ctx.strokeStyle=PL; ctx.lineWidth=1.5;
      ctx.fillRect(cx-35,px-14,70,14); ctx.strokeRect(cx-35,px-14,70,14);
      ctx.fillRect(cx-35,px+ph,70,14); ctx.strokeRect(cx-35,px+ph,70,14);
      ctx.restore();
    }
  }

  renderOverlays(ctx, W, H, SCALE, canvas, prevSelected);
}

function renderOverlays(ctx, W, H, SCALE, canvas, prevSelected) {

  // ── Per-element render functions ──────────────────────────────────────────

  function renderShadow(g, type) {
    const cx = parseFloat(g.dataset.cx), cy = parseFloat(g.dataset.cy);
    const sc = parseFloat(g.dataset.scale || '1');
    const rot = parseFloat(g.dataset.rotation || '0') * Math.PI / 180;
    const hw = parseFloat(g.dataset.hw || '30') * sc;
    const hh = parseFloat(g.dataset.hh || '20') * sc;
    const shape = g.querySelector('rect,ellipse');
    const sFill = shape?.getAttribute('fill') || 'rgba(79,156,249,0.18)';
    const sStroke = g.dataset.savedStroke || shape?.getAttribute('stroke') || 'rgba(255,255,255,0.5)';
    const sDash = shape?.getAttribute('stroke-dasharray') || '';

    ctx.save(); ctx.translate(cx,cy); ctx.rotate(rot);
    if (type === 'shadow-circle') {
      ctx.beginPath(); ctx.ellipse(0,0,hw,hh,0,0,Math.PI*2);
    } else {
      const bx=-hw, by=-hh, bw=hw*2, bh=hh*2, br=4;
      ctx.beginPath();
      ctx.moveTo(bx+br,by); ctx.lineTo(bx+bw-br,by); ctx.arcTo(bx+bw,by,bx+bw,by+br,br);
      ctx.lineTo(bx+bw,by+bh-br); ctx.arcTo(bx+bw,by+bh,bx+bw-br,by+bh,br);
      ctx.lineTo(bx+br,by+bh); ctx.arcTo(bx,by+bh,bx,by+bh-br,br);
      ctx.lineTo(bx,by+br); ctx.arcTo(bx,by,bx+br,by,br); ctx.closePath();
    }
    ctx.fillStyle=sFill; ctx.fill();
    ctx.strokeStyle=sStroke; ctx.lineWidth=1.5;
    if (sDash) { ctx.setLineDash(sDash.split(',').map(Number)); } else { ctx.setLineDash([]); }
    ctx.stroke(); ctx.setLineDash([]);
    ctx.restore();
  }

  function renderSpotlight(g) {
    const cx = parseFloat(g.dataset.cx), cy = parseFloat(g.dataset.cy);
    const sc = parseFloat(g.dataset.scale || '1');
    const rx = parseFloat(g.dataset.rx || '28') * sc;
    const ry = parseFloat(g.dataset.ry || '5') * sc;
    const beamW = rx * 2;
    const sourceW = 6;

    ctx.save();
    ctx.filter = 'blur(6px)';
    ctx.beginPath();
    ctx.moveTo(cx - sourceW, 0);
    ctx.lineTo(cx - beamW / 2, cy);
    ctx.lineTo(cx + beamW / 2, cy);
    ctx.lineTo(cx + sourceW, 0);
    ctx.closePath();
    const beamGrad = ctx.createLinearGradient(cx, 0, cx, cy);
    beamGrad.addColorStop(0, 'rgba(255,255,255,1)');
    beamGrad.addColorStop(0.2, 'rgba(255,255,255,0.7)');
    beamGrad.addColorStop(0.5, 'rgba(255,255,255,0.3)');
    beamGrad.addColorStop(0.8, 'rgba(255,255,255,0.08)');
    beamGrad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = beamGrad;
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.filter = 'blur(5px)';
    ctx.beginPath(); ctx.ellipse(cx, cy, rx * 1.5, ry * 3, 0, 0, Math.PI * 2);
    const glowGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, rx * 1.5);
    glowGrad.addColorStop(0, 'rgba(255,255,255,0.85)');
    glowGrad.addColorStop(0.4, 'rgba(255,255,255,0.4)');
    glowGrad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = glowGrad;
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    const ringGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, rx);
    ringGrad.addColorStop(0, 'rgba(255,255,255,0.4)');
    ringGrad.addColorStop(1, 'rgba(255,255,255,0.15)');
    ctx.fillStyle = ringGrad;
    ctx.fill();
    const ring = g.querySelector('.spotlight-ring') || g.querySelector('ellipse:not(.spotlight-glow)');
    ctx.strokeStyle = g.dataset.savedStroke || ring?.getAttribute('stroke') || 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 1.5; ctx.stroke();
    ctx.restore();

    const spotName = g.dataset.spotName;
    if (spotName) {
      const snSize = parseFloat(g.dataset.spotNameSize || '11');
      const snColor = g.dataset.spotNameColor || 'rgba(255,255,255,0.9)';
      ctx.font = `600 ${snSize}px Arial,sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      const snY = cy + ry + 10;
      const tw = ctx.measureText(spotName).width;
      const snBg = g.dataset.spotNameBg || 'rgba(0,0,0,0.5)';
      if (snBg !== 'none') {
        ctx.fillStyle = snBg;
        const bx = cx - tw/2 - 5, by = snY - 2, bw = tw + 10, bh = snSize + 6, br = 4;
        ctx.beginPath(); ctx.moveTo(bx+br,by); ctx.lineTo(bx+bw-br,by); ctx.arcTo(bx+bw,by,bx+bw,by+br,br);
        ctx.lineTo(bx+bw,by+bh-br); ctx.arcTo(bx+bw,by+bh,bx+bw-br,by+bh,br);
        ctx.lineTo(bx+br,by+bh); ctx.arcTo(bx,by+bh,bx,by+bh-br,br);
        ctx.lineTo(bx,by+br); ctx.arcTo(bx,by,bx+br,by,br); ctx.closePath(); ctx.fill();
      }
      ctx.fillStyle = snColor;
      ctx.fillText(spotName, cx, snY);
    }
  }

  function renderArrow(g) {
    const cx = parseFloat(g.dataset.cx), cy = parseFloat(g.dataset.cy);
    const sc = parseFloat(g.dataset.scale || '1');
    const rot = parseFloat(g.dataset.rotation || '0') * Math.PI / 180;
    const dx1=parseFloat(g.dataset.dx1), dy1=parseFloat(g.dataset.dy1);
    const dx2=parseFloat(g.dataset.dx2), dy2=parseFloat(g.dataset.dy2);
    const tfm = (dx,dy) => ({
      x: cx+(dx*sc)*Math.cos(rot)-(dy*sc)*Math.sin(rot),
      y: cy+(dx*sc)*Math.sin(rot)+(dy*sc)*Math.cos(rot)
    });
    const p1=tfm(dx1,dy1), p2=tfm(dx2,dy2);
    const k = parseFloat(g.dataset.curve || '0');
    const ddx=p2.x-p1.x, ddy=p2.y-p1.y, len=Math.sqrt(ddx*ddx+ddy*ddy);
    if (len < 2) return;
    const aType = g.dataset.arrowType || 'run';
    const line = g.querySelector('.arrow-line');
    const col = line?.getAttribute('stroke') || S.ARROW_STYLES[aType]?.color || '#f9a84f';
    const lineDash = line?.getAttribute('stroke-dasharray') || '';
    const lineW = parseFloat(g.dataset.arrowWidth || '2.5');
    const hasMarker = aType !== 'line' && line?.getAttribute('marker-end') !== '';

    const midX = (p1.x+p2.x)/2, midY = (p1.y+p2.y)/2;
    let perpX = -(p2.y-p1.y), perpY = p2.x-p1.x;
    const pLen = Math.sqrt(perpX*perpX+perpY*perpY);
    if (pLen > 1) { perpX /= pLen; perpY /= pLen; }
    const cpX = midX + k*perpX, cpY = midY + k*perpY;

    const tanX = p2.x - cpX, tanY = p2.y - cpY;
    const tanLen = Math.sqrt(tanX*tanX+tanY*tanY);
    const ux = tanLen > 0 ? tanX/tanLen : ddx/len;
    const uy = tanLen > 0 ? tanY/tanLen : ddy/len;
    const aSize=11;

    ctx.save();
    ctx.strokeStyle=col; ctx.lineWidth=lineW; ctx.lineCap='round';
    if (lineDash) { ctx.setLineDash(lineDash.split(',').map(Number)); }
    ctx.beginPath(); ctx.moveTo(p1.x,p1.y);
    if (Math.abs(k) < 1) {
      if (hasMarker) { ctx.lineTo(p2.x-ux*aSize*0.8,p2.y-uy*aSize*0.8); }
      else { ctx.lineTo(p2.x,p2.y); }
    } else {
      if (hasMarker) {
        ctx.quadraticCurveTo(cpX,cpY, p2.x-ux*aSize*0.8,p2.y-uy*aSize*0.8);
      } else {
        ctx.quadraticCurveTo(cpX,cpY, p2.x,p2.y);
      }
    }
    ctx.stroke();
    ctx.setLineDash([]);
    if (hasMarker) {
      ctx.translate(p2.x,p2.y); ctx.rotate(Math.atan2(tanY,tanX));
      ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(-aSize,-aSize*0.45); ctx.lineTo(-aSize,aSize*0.45);
      ctx.closePath(); ctx.fillStyle=col; ctx.fill();
    }
    ctx.restore();
  }

  function renderVision(g) {
    const cx = parseFloat(g.dataset.cx), cy = parseFloat(g.dataset.cy);
    const vLen = parseFloat(g.dataset.visionLength || '80');
    const spread = parseFloat(g.dataset.visionSpread || '35');
    const rot = parseFloat(g.dataset.rotation || '0') * Math.PI / 180;
    const sc = parseFloat(g.dataset.scale || '1');
    const color = g.dataset.visionColor || 'rgba(147,197,253,0.55)';

    const cosR = Math.cos(rot), sinR = Math.sin(rot);
    const sLen = vLen * sc, sSpread = spread * sc;

    // Apex
    const ax = cx, ay = cy;
    // Top-right vertex
    const tx = cx + (sLen * cosR - (-sSpread) * sinR);
    const ty = cy + (sLen * sinR + (-sSpread) * cosR);
    // Bottom-right vertex
    const bx = cx + (sLen * cosR - sSpread * sinR);
    const by = cy + (sLen * sinR + sSpread * cosR);

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(tx, ty);
    ctx.lineTo(bx, by);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();

    // Border — derive from fill color at lower opacity
    const tri = g.querySelector('.vision-shape');
    const strokeColor = tri?.getAttribute('stroke') || color.replace(/[\d.]+\)$/, '0.4)');
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 1;
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.restore();
  }

  function renderFreeform(g) {
    const cx = parseFloat(g.dataset.cx), cy = parseFloat(g.dataset.cy);
    const sc = parseFloat(g.dataset.scale || '1');
    const rot = parseFloat(g.dataset.rotation || '0') * Math.PI / 180;
    const deltas = JSON.parse(g.dataset.freeformPts || '[]');
    if (deltas.length < 3) return;

    const cosR = Math.cos(rot), sinR = Math.sin(rot);
    const pts = deltas.map(d => ({
      x: cx + (d.dx * sc * cosR - d.dy * sc * sinR),
      y: cy + (d.dx * sc * sinR + d.dy * sc * cosR)
    }));

    const shape = g.querySelector('.freeform-shape');
    const sFill = shape?.getAttribute('fill') || 'rgba(79,156,249,0.18)';
    const sStroke = g.dataset.savedStroke || shape?.getAttribute('stroke') || 'rgba(255,255,255,0.5)';
    const sDash = shape?.getAttribute('stroke-dasharray') || '';

    // Catmull-Rom to Bezier — smooth closed curve
    const n = pts.length;
    const tension = 0.35;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 0; i < n; i++) {
      const p0 = pts[(i - 1 + n) % n];
      const p1 = pts[i];
      const p2 = pts[(i + 1) % n];
      const p3 = pts[(i + 2) % n];
      const cp1x = p1.x + (p2.x - p0.x) * tension;
      const cp1y = p1.y + (p2.y - p0.y) * tension;
      const cp2x = p2.x - (p3.x - p1.x) * tension;
      const cp2y = p2.y - (p3.y - p1.y) * tension;
      ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
    }
    ctx.closePath();
    ctx.fillStyle = sFill; ctx.fill();
    ctx.strokeStyle = sStroke; ctx.lineWidth = 1.5;
    if (sDash) { ctx.setLineDash(sDash.split(',').map(Number)); } else { ctx.setLineDash([]); }
    ctx.stroke(); ctx.setLineDash([]);
    ctx.restore();
  }

  function renderMotion(g) {
    const cx = parseFloat(g.dataset.cx), cy = parseFloat(g.dataset.cy);
    const sc = parseFloat(g.dataset.scale || '1');
    const rot = parseFloat(g.dataset.rotation || '0') * Math.PI / 180;
    const dx1 = parseFloat(g.dataset.dx1), dy1 = parseFloat(g.dataset.dy1);
    const dx2 = parseFloat(g.dataset.dx2), dy2 = parseFloat(g.dataset.dy2);
    const color = g.dataset.motionColor || 'rgba(255,255,255,0.5)';
    const cosR = Math.cos(rot), sinR = Math.sin(rot);

    const p1x = cx + (dx1*sc)*cosR - (dy1*sc)*sinR;
    const p1y = cy + (dx1*sc)*sinR + (dy1*sc)*cosR;
    const p2x = cx + (dx2*sc)*cosR - (dy2*sc)*sinR;
    const p2y = cy + (dx2*sc)*sinR + (dy2*sc)*cosR;

    // Trail line
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.lineCap = 'round';
    ctx.globalAlpha = 0.7;
    ctx.beginPath(); ctx.moveTo(p1x, p1y); ctx.lineTo(p2x, p2y); ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    // Chevron at midpoint
    const mx = (p1x + p2x) / 2, my = (p1y + p2y) / 2;
    const angle = Math.atan2(p2y - p1y, p2x - p1x);
    const sz = 5;
    const tipX = mx + sz * Math.cos(angle);
    const tipY = my + sz * Math.sin(angle);
    const lx = mx - sz * Math.cos(angle - 0.5);
    const ly = my - sz * Math.sin(angle - 0.5);
    const rx = mx - sz * Math.cos(angle + 0.5);
    const ry = my - sz * Math.sin(angle + 0.5);
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.moveTo(tipX, tipY); ctx.lineTo(lx, ly); ctx.lineTo(rx, ry); ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1;

    // Ghost circle at destination
    ctx.globalAlpha = 0.25;
    ctx.beginPath(); ctx.arc(p2x, p2y, 10, 0, Math.PI * 2);
    ctx.fillStyle = color; ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = color; ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 2]);
    ctx.beginPath(); ctx.arc(p2x, p2y, 10, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  function renderTextbox(g) {
    const cx = parseFloat(g.dataset.cx), cy = parseFloat(g.dataset.cy);
    const hw = parseFloat(g.dataset.hw || '60');
    const hh = parseFloat(g.dataset.hh || '20');
    const rot = parseFloat(g.dataset.rotation || '0') * Math.PI / 180;
    const fontSize = parseFloat(g.dataset.textSize || '14');
    const textColor = g.dataset.textColor || 'rgba(255,255,255,0.9)';
    const textBg = g.dataset.textBg || 'rgba(0,0,0,0.5)';
    const content = g.dataset.textContent || '';
    if (!content) return;

    ctx.save();
    ctx.translate(cx, cy);
    if (rot) ctx.rotate(rot);

    if (textBg && textBg !== 'none') {
      ctx.fillStyle = textBg;
      const br = 4;
      const bx = -hw, by = -hh, bw = hw*2, bh = hh*2;
      ctx.beginPath();
      ctx.moveTo(bx+br,by); ctx.lineTo(bx+bw-br,by); ctx.arcTo(bx+bw,by,bx+bw,by+br,br);
      ctx.lineTo(bx+bw,by+bh-br); ctx.arcTo(bx+bw,by+bh,bx+bw-br,by+bh,br);
      ctx.lineTo(bx+br,by+bh); ctx.arcTo(bx,by+bh,bx,by+bh-br,br);
      ctx.lineTo(bx,by+br); ctx.arcTo(bx,by,bx+br,by,br); ctx.closePath();
      ctx.fill();
    }

    const align = g.dataset.textAlign || 'center';
    ctx.font = `600 ${fontSize}px Manrope, sans-serif`;
    ctx.textAlign = align === 'left' ? 'left' : align === 'right' ? 'right' : 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = textColor;
    const pad = 8;
    const boxInnerW = hw * 2 - pad * 2;

    const paragraphs = content.split('\n');
    const lines = [];
    for (const para of paragraphs) {
      if (para.trim() === '') { lines.push(''); continue; }
      const words = para.split(/\s+/);
      let cur = '';
      for (const w of words) {
        const test = cur ? cur + ' ' + w : w;
        if (ctx.measureText(test).width > boxInnerW && cur) { lines.push(cur); cur = w; }
        else cur = test;
      }
      if (cur) lines.push(cur);
    }
    if (!lines.length) lines.push('');

    const textX = align === 'left' ? (-hw + pad)
                : align === 'right' ? (hw - pad)
                : 0;
    const lineH = fontSize * 1.35;
    const startY = -(lines.length - 1) * lineH / 2 + fontSize * 0.35;
    lines.forEach((line, i) => {
      ctx.fillText(line || '', textX, startY + i * lineH);
    });

    ctx.restore();
  }

  function renderHeadline(g) {
    const cx = parseFloat(g.dataset.cx), cy = parseFloat(g.dataset.cy);
    const hw = parseFloat(g.dataset.hw || '130');
    const hh = parseFloat(g.dataset.hh || '40');
    const rot = parseFloat(g.dataset.rotation || '0') * Math.PI / 180;
    const titleSize = parseFloat(g.dataset.hlTitleSize || '16');
    const bodySize = parseFloat(g.dataset.hlBodySize || '12');
    const textColor = g.dataset.hlTextColor || 'rgba(255,255,255,0.9)';
    const bgColor = g.dataset.hlBg || 'none';
    const barColor = g.dataset.hlBarColor || '#4FC3F7';
    const title = g.dataset.hlTitle || '';
    const body = g.dataset.hlBody || '';

    ctx.save();
    ctx.translate(cx, cy);
    if (rot) ctx.rotate(rot);

    if (bgColor && bgColor !== 'none') {
      ctx.fillStyle = bgColor;
      const br = 4, bx = -hw, by = -hh, bw = hw*2, bh = hh*2;
      ctx.beginPath();
      ctx.moveTo(bx+br,by); ctx.lineTo(bx+bw-br,by); ctx.arcTo(bx+bw,by,bx+bw,by+br,br);
      ctx.lineTo(bx+bw,by+bh-br); ctx.arcTo(bx+bw,by+bh,bx+bw-br,by+bh,br);
      ctx.lineTo(bx+br,by+bh); ctx.arcTo(bx,by+bh,bx,by+bh-br,br);
      ctx.lineTo(bx,by+br); ctx.arcTo(bx,by,bx+br,by,br); ctx.closePath();
      ctx.fill();
    }

    const barW = 4, padY = 10;
    ctx.fillStyle = barColor;
    ctx.beginPath();
    ctx.roundRect(-hw + 4, -hh + padY, barW, hh*2 - padY*2, 2);
    ctx.fill();

    const padL = 14, padR = 10;
    const textAreaW = hw*2 - barW - padL - padR;
    const textStartX = -hw + barW + padL;

    ctx.font = `700 ${titleSize}px Poppins, sans-serif`;
    const titleLines = wrapCanvasText(ctx, title, textAreaW);
    const titleLineH = titleSize * 1.3;

    ctx.font = `400 ${bodySize}px Poppins, sans-serif`;
    const bodyLines = wrapCanvasText(ctx, body, textAreaW);
    const bodyLineH = bodySize * 1.4;

    const totalTitleH = titleLines.length * titleLineH;
    const gapBetween = 3;
    const totalBodyH = bodyLines.length * bodyLineH;
    const totalContentH = totalTitleH + gapBetween + totalBodyH;
    const startY = -totalContentH / 2;

    ctx.font = `700 ${titleSize}px Poppins, sans-serif`;
    ctx.fillStyle = textColor;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    titleLines.forEach((line, i) => {
      ctx.fillText(line, textStartX, startY + i * titleLineH + titleSize * 0.85);
    });

    ctx.font = `400 ${bodySize}px Poppins, sans-serif`;
    ctx.globalAlpha = 0.7;
    bodyLines.forEach((line, i) => {
      ctx.fillText(line, textStartX, startY + totalTitleH + gapBetween + i * bodyLineH + bodySize * 0.85);
    });
    ctx.globalAlpha = 1;

    ctx.restore();
  }

  function renderPlayer(g) {
    const cx = parseFloat(g.dataset.cx), cy = parseFloat(g.dataset.cy);
    const sc = parseFloat(g.dataset.scale || '1');
    if (isNaN(cx) || isNaN(cy)) return;
    ctx.save(); ctx.translate(cx,cy); ctx.scale(sc,sc);

    const hasArms = g.dataset.arms === '1';
    const circleEl = g.querySelector('circle:not(.hit-area):not(.player-arm)');
    const color = circleEl ? circleEl.getAttribute('fill') : '#e8f0ff';
    const dark = S.isDarkColor(color);
    const borderColor = g.dataset.borderColor;

    if (hasArms) {
      const r = 16;
      const rot = parseFloat(g.dataset.rotation || '0') * Math.PI / 180;
      const armStartY = r * 0.45;
      const armLen = r * 0.85;
      const armDrop = r * 0.7;
      const cosR = Math.cos(rot), sinR = Math.sin(rot);
      const rp = (x, y) => [x*cosR - y*sinR, x*sinR + y*cosR];
      ctx.save();
      ctx.strokeStyle = '#1a1a1a';
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      for (const side of [-1, 1]) {
        const [sx, sy] = rp(side * r * 0.55, armStartY);
        const [ex, ey] = rp(side * (r * 0.55 + armLen), armStartY + armDrop);
        const [cpx, cpy] = rp(side * (r * 0.55 + armLen * 0.5), armStartY + armDrop * 0.15);
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.quadraticCurveTo(cpx, cpy, ex, ey);
        ctx.stroke();
      }
      ctx.restore();
    }

    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.43)';
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 5;
    ctx.shadowBlur = 10;
    ctx.beginPath(); ctx.arc(0, 0, 16, 0, Math.PI*2);
    ctx.fillStyle = color; ctx.fill();
    if (borderColor === 'none') {
      // no border
    } else if (borderColor) {
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = 2; ctx.stroke();
    } else {
      ctx.strokeStyle = dark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.15)';
      ctx.lineWidth = 1.5; ctx.stroke();
    }
    ctx.restore();
    const texts = g.querySelectorAll('text');
    const numEl = texts[0];
    if (numEl && numEl.textContent.trim()) {
      ctx.font='700 10px Arial,sans-serif';
      ctx.fillStyle = dark ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.75)';
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText(numEl.textContent.trim(), 0, 0);
    }
    const nameEl = texts[1];
    if (nameEl && nameEl.style.display !== 'none' && nameEl.textContent.trim()) {
      const nm = nameEl.textContent.trim();
      const nSize = parseFloat(g.dataset.nameSize || '11');
      const nColor = g.dataset.nameColor || 'rgba(255,255,255,0.9)';
      ctx.font=`600 ${nSize}px Arial,sans-serif`;
      ctx.textAlign='center'; ctx.textBaseline='top';
      const tw = ctx.measureText(nm).width;
      const nameBg = g.dataset.nameBg || 'none';
      if (nameBg !== 'none') {
        ctx.fillStyle=nameBg;
        const bx=-tw/2-3, by=23, bw=tw+6, bh=nSize+3, br=3;
        ctx.beginPath(); ctx.moveTo(bx+br,by); ctx.lineTo(bx+bw-br,by); ctx.arcTo(bx+bw,by,bx+bw,by+br,br);
        ctx.lineTo(bx+bw,by+bh-br); ctx.arcTo(bx+bw,by+bh,bx+bw-br,by+bh,br);
        ctx.lineTo(bx+br,by+bh); ctx.arcTo(bx,by+bh,bx,by+bh-br,br);
        ctx.lineTo(bx,by+br); ctx.arcTo(bx,by,bx+br,by,br); ctx.closePath(); ctx.fill();
      }
      ctx.fillStyle=nColor; ctx.fillText(nm, 0, 24);
    }
    ctx.restore();
  }

  function renderReferee(g) {
    const cx = parseFloat(g.dataset.cx), cy = parseFloat(g.dataset.cy);
    const sc = parseFloat(g.dataset.scale || '0.9');
    if (isNaN(cx) || isNaN(cy)) return;
    ctx.save(); ctx.translate(cx,cy); ctx.scale(sc,sc);

    const fillColor = g.dataset.fillColor || '#1a1a1a';
    const borderColor = g.dataset.borderColor || '#facc15';
    const circleEl = g.querySelector('circle:not(.hit-area)');
    const dark = S.isDarkColor(fillColor);

    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.43)';
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 5;
    ctx.shadowBlur = 10;
    ctx.beginPath(); ctx.arc(0, 0, 16, 0, Math.PI*2);
    ctx.fillStyle = fillColor; ctx.fill();
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 2.5; ctx.stroke();
    ctx.restore();

    const texts = g.querySelectorAll('text');
    const numEl = texts[0];
    if (numEl && numEl.textContent.trim()) {
      ctx.font='700 10px Arial,sans-serif';
      ctx.fillStyle = dark ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.75)';
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText(numEl.textContent.trim(), 0, 0);
    }
    const nameEl = texts[1];
    if (nameEl && nameEl.style.display !== 'none' && nameEl.textContent.trim()) {
      const nm = nameEl.textContent.trim();
      const nSize = parseFloat(g.dataset.nameSize || '11');
      const nColor = g.dataset.nameColor || 'rgba(255,255,255,0.9)';
      ctx.font=`600 ${nSize}px Arial,sans-serif`;
      ctx.textAlign='center'; ctx.textBaseline='top';
      ctx.fillStyle=nColor; ctx.fillText(nm, 0, 24);
    }
    ctx.restore();
  }

  function renderBall(g) {
    const cx = parseFloat(g.dataset.cx), cy = parseFloat(g.dataset.cy);
    const sc = parseFloat(g.dataset.scale || '1');
    if (isNaN(cx) || isNaN(cy)) return;
    ctx.save(); ctx.translate(cx,cy); ctx.scale(sc,sc);
    ctx.beginPath(); ctx.arc(0,0,10,0,Math.PI*2); ctx.fillStyle='white'; ctx.fill();
    ctx.strokeStyle='#333'; ctx.lineWidth=1.5; ctx.stroke();
    ctx.beginPath();
    for (let i=0; i<5; i++) {
      const a = i*72*Math.PI/180;
      i === 0 ? ctx.moveTo(4*Math.sin(a),-4*Math.cos(a)) : ctx.lineTo(4*Math.sin(a),-4*Math.cos(a));
    }
    ctx.closePath(); ctx.fillStyle='rgba(26,26,26,0.8)'; ctx.fill();
    for (let i=0; i<5; i++) {
      const a = (36+i*72)*Math.PI/180;
      ctx.beginPath(); ctx.arc(7.2*Math.sin(a),-7.2*Math.cos(a),1.8,0,Math.PI*2);
      ctx.fillStyle='rgba(26,26,26,0.55)'; ctx.fill();
    }
    ctx.restore();
  }

  function renderCone(g) {
    const cx = parseFloat(g.dataset.cx), cy = parseFloat(g.dataset.cy);
    const sc = parseFloat(g.dataset.scale || '1');
    if (isNaN(cx) || isNaN(cy)) return;
    ctx.save(); ctx.translate(cx,cy); ctx.scale(sc,sc);
    ctx.beginPath(); ctx.moveTo(0,-10); ctx.lineTo(8,8); ctx.lineTo(-8,8); ctx.closePath();
    ctx.fillStyle='#ff8c00'; ctx.fill(); ctx.strokeStyle='#cc6600'; ctx.lineWidth=1; ctx.stroke();
    ctx.restore();
  }

  // ── Render objects layer in DOM order (preserves layer stacking) ──────────
  document.querySelectorAll('#objects-layer > g').forEach(g => {
    const type = g.dataset.type;
    if (!type) return;
    if (type === 'shadow-circle' || type === 'shadow-rect') renderShadow(g, type);
    else if (type === 'spotlight') renderSpotlight(g);
    else if (type === 'arrow') renderArrow(g);
    else if (type === 'vision') renderVision(g);
    else if (type === 'freeform') renderFreeform(g);
    else if (type === 'motion') renderMotion(g);
  });

  // ── Render players layer in DOM order (preserves layer stacking) ──────────
  document.querySelectorAll('#players-layer > g').forEach(g => {
    const type = g.dataset.type;
    if (!type) return;
    if (type === 'textbox') renderTextbox(g);
    else if (type === 'headline') renderHeadline(g);
    else if (type === 'player') renderPlayer(g);
    else if (type === 'referee') renderReferee(g);
    else if (type === 'ball') renderBall(g);
    else if (type === 'cone') renderCone(g);
  });

  function finalizeExport() {
    try {
      let dataUrl;
      if (S.exportFmt === 'jpg') {
        const flat = document.createElement('canvas');
        flat.width = W * SCALE; flat.height = H * SCALE;
        flat.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0;pointer-events:none;';
        document.body.appendChild(flat);
        const fc = flat.getContext('2d');
        fc.fillStyle = '#1a1f2e'; fc.fillRect(0,0,W*SCALE,H*SCALE);
        fc.drawImage(canvas, 0, 0);
        dataUrl = flat.toDataURL('image/jpeg', 0.93);
        document.body.removeChild(flat);
      } else {
        dataUrl = canvas.toDataURL('image/png');
      }
      document.body.removeChild(canvas);
      const a = document.createElement('a');
      const prefix = S.appMode === 'image' ? 'tactica-analysis' : 'tactica-pitch';
      a.href = dataUrl; a.download = prefix + '.' + S.exportFmt;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
    } catch(err) {
      if (document.body.contains(canvas)) document.body.removeChild(canvas);
      if (typeof showNotification === 'function') showNotification('Export error: ' + err.message, 'error', 5000);
      else console.error('Export error:', err.message);
    }
    if (prevSelected) select(prevSelected);
  }

  setTimeout(() => {
    // Free-tier watermark
    if (!canAccess('export:no-watermark')) {
      const logo = new Image();
      logo.onload = () => {
        drawWatermark(ctx, W, H, logo);
        finalizeExport();
      };
      logo.onerror = () => {
        // If logo fails to load, draw text-only watermark
        drawWatermark(ctx, W, H, null);
        finalizeExport();
      };
      logo.src = 'images/rondos-logo.png';
    } else {
      finalizeExport();
    }
  }, 50);
}

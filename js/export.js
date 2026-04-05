import * as S from './state.js';
import { deselectVisual, select } from './interaction.js';
import { trackExportClicked, trackExportCompleted } from './analytics.js';

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
  const isV = S.currentPitchLayout.endsWith('-v');
  const isHalf = S.currentPitchLayout.startsWith('half');
  const hasGoals = !S.currentPitchLayout.includes('-ng-');

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
  // Objects (shadows, arrows)
  document.querySelectorAll('#objects-layer > g').forEach(g => {
    const type = g.dataset.type;
    if (!type) return;
    const cx = parseFloat(g.dataset.cx), cy = parseFloat(g.dataset.cy);
    const sc = parseFloat(g.dataset.scale || '1');
    const rot = parseFloat(g.dataset.rotation || '0') * Math.PI / 180;

    if (type === 'shadow-circle' || type === 'shadow-rect') {
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
    } else if (type === 'spotlight') {
      const rx = parseFloat(g.dataset.rx || '28') * sc;
      const ry = parseFloat(g.dataset.ry || '5') * sc;
      const beamW = rx * 2;
      const sourceW = 6;

      // Cone beam — trapezoid with gradient and blur
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

      // Glow ellipse (1.5x ring width, blurred)
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

      // Ring ellipse (gradient fill + thin stroke)
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

      // Spotlight name with dark rounded-rect background
      const spotName = g.dataset.spotName;
      if (spotName) {
        const snSize = parseFloat(g.dataset.spotNameSize || '11');
        const snColor = g.dataset.spotNameColor || 'rgba(255,255,255,0.9)';
        ctx.font = `600 ${snSize}px Arial,sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        const snY = cy + ry + 10;
        // Always draw dark bg for label
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
    } else if (type === 'arrow') {
      const dx1=parseFloat(g.dataset.dx1), dy1=parseFloat(g.dataset.dy1);
      const dx2=parseFloat(g.dataset.dx2), dy2=parseFloat(g.dataset.dy2);
      const tfm = (dx,dy) => ({
        x: cx+(dx*sc)*Math.cos(rot)-(dy*sc)*Math.sin(rot),
        y: cy+(dx*sc)*Math.sin(rot)+(dy*sc)*Math.cos(rot)
      });
      const p1=tfm(dx1,dy1), p2=tfm(dx2,dy2);
      const ddx=p2.x-p1.x, ddy=p2.y-p1.y, len=Math.sqrt(ddx*ddx+ddy*ddy);
      if (len < 2) return;
      const aType = g.dataset.arrowType || 'run';
      const line = g.querySelector('line');
      const col = line?.getAttribute('stroke') || S.ARROW_STYLES[aType]?.color || '#f9a84f';
      const lineDash = line?.getAttribute('stroke-dasharray') || '';
      const lineW = parseFloat(g.dataset.arrowWidth || '2.5');
      const hasMarker = aType !== 'line' && line?.getAttribute('marker-end') !== '';
      const ux=ddx/len, uy=ddy/len, aSize=11;
      ctx.save();
      ctx.strokeStyle=col; ctx.lineWidth=lineW; ctx.lineCap='round';
      if (lineDash) { ctx.setLineDash(lineDash.split(',').map(Number)); }
      if (hasMarker) {
        ctx.beginPath(); ctx.moveTo(p1.x,p1.y); ctx.lineTo(p2.x-ux*aSize*0.8,p2.y-uy*aSize*0.8); ctx.stroke();
      } else {
        ctx.beginPath(); ctx.moveTo(p1.x,p1.y); ctx.lineTo(p2.x,p2.y); ctx.stroke();
      }
      ctx.setLineDash([]);
      if (hasMarker) {
        ctx.translate(p2.x,p2.y); ctx.rotate(Math.atan2(ddy,ddx));
        ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(-aSize,-aSize*0.45); ctx.lineTo(-aSize,aSize*0.45);
        ctx.closePath(); ctx.fillStyle=col; ctx.fill();
      }
      ctx.restore();
    }
  });

  // Text boxes
  document.querySelectorAll('#players-layer > g[data-type="textbox"]').forEach(g => {
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

    // Draw background
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

    // Wrap text same as SVG side
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
  });

  // Players, ball, cones
  document.querySelectorAll('#players-layer > g').forEach(g => {
    const type = g.dataset.type;
    if (type === 'textbox') return; // already rendered above
    const cx = parseFloat(g.dataset.cx), cy = parseFloat(g.dataset.cy);
    const sc = parseFloat(g.dataset.scale || '1');
    if (isNaN(cx) || isNaN(cy)) return;
    ctx.save(); ctx.translate(cx,cy); ctx.scale(sc,sc);

    if (type === 'ball') {
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
    } else if (type === 'cone') {
      ctx.beginPath(); ctx.moveTo(0,-10); ctx.lineTo(8,8); ctx.lineTo(-8,8); ctx.closePath();
      ctx.fillStyle='#ff8c00'; ctx.fill(); ctx.strokeStyle='#cc6600'; ctx.lineWidth=1; ctx.stroke();
    } else if (type === 'player') {
      const circleEl = g.querySelector('circle:not(.hit-area)');
      const color = circleEl ? circleEl.getAttribute('fill') : '#e8f0ff';
      // Drop shadow: black 43%, angle 90°, distance 5, blur 6
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.43)';
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 5 * sc;
      ctx.shadowBlur = 6 * sc;
      ctx.beginPath(); ctx.arc(0,0,16,0,Math.PI*2);
      ctx.fillStyle=color; ctx.fill();
      const dark = S.isDarkColor(color);
      const borderColor = g.dataset.borderColor;
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
    }
    ctx.restore();
  });

  setTimeout(() => {
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
  }, 50);
}

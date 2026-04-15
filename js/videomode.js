import * as S from './state.js';
import { rebuildPitch } from './pitch.js';
import { deselect, switchTab } from './interaction.js';
import { trackModeSwitch } from './analytics.js';

let _timeLoopId = null;   // rAF ID for time sync loop
let _videoEl = null;       // reference to the <video> element

// ─── Trigger file picker ──────────────────────────────────────────────────────
export function triggerVideoUpload() {
  document.getElementById('video-file-input').click();
}

// ─── Handle file selection ────────────────────────────────────────────────────
export function handleVideoUpload(input) {
  const file = input.files[0];
  if (!file) return;

  const objectUrl = URL.createObjectURL(file);
  const tempVideo = document.createElement('video');
  tempVideo.preload = 'metadata';

  tempVideo.onloadedmetadata = () => {
    enterVideoMode(objectUrl, tempVideo.videoWidth, tempVideo.videoHeight, tempVideo.duration, file.name);
    tempVideo.src = ''; // release
  };
  tempVideo.onerror = () => {
    URL.revokeObjectURL(objectUrl);
    alert('Could not load this video. Please use MP4 or WebM format.');
  };
  tempVideo.src = objectUrl;

  // Reset input so same file can be re-selected
  input.value = '';
}

// ─── Enter Video Mode ─────────────────────────────────────────────────────────
export function enterVideoMode(objectUrl, natW, natH, duration, fileName) {
  deselect();
  trackModeSwitch('video');

  S.setAppMode('video');
  S.setVideoData(objectUrl);
  S.setVideoDimensions({ width: natW, height: natH, duration });
  S.setVideoFileName(fileName || 'video');

  // Clear undo stack
  S.undoStack.length = 0;

  // Compute display dimensions — fit within max 900w x 680h preserving aspect ratio
  const maxW = 900, maxH = 680;
  const ratio = natW / natH;
  let W, H;
  if (ratio > maxW / maxH) {
    W = Math.min(natW, maxW);
    H = W / ratio;
  } else {
    H = Math.min(natH, maxH);
    W = H * ratio;
  }
  W = Math.round(W);
  H = Math.round(H);

  const svgEl = S.svg;

  // Remove all pitch elements (keep defs, objects-layer, players-layer)
  Array.from(svgEl.children).forEach(child => {
    if (child.tagName === 'defs' || child.id === 'objects-layer' || child.id === 'players-layer') return;
    child.remove();
  });

  // Add transparent background rect so SVG still has bounds
  const ns = 'http://www.w3.org/2000/svg';
  const bgRect = document.createElementNS(ns, 'rect');
  bgRect.setAttribute('id', 'video-svg-bg');
  bgRect.setAttribute('width', W);
  bgRect.setAttribute('height', H);
  bgRect.setAttribute('fill', 'transparent');
  svgEl.insertBefore(bgRect, S.objectsLayer);

  // Resize SVG
  svgEl.setAttribute('width', W);
  svgEl.setAttribute('height', H);
  svgEl.setAttribute('viewBox', `0 0 ${W} ${H}`);

  // Clear existing objects/players
  S.objectsLayer.innerHTML = '';
  S.playersLayer.innerHTML = '';
  S.playerCounts.a = 0;
  S.playerCounts.b = 0;
  S.playerCounts.joker = 0;

  // Create <video> element in #pitch-container
  const container = document.getElementById('pitch-container');
  const videoEl = document.createElement('video');
  videoEl.id = 'video-bg';
  videoEl.src = objectUrl;
  videoEl.style.cssText = `
    position: absolute; top: 0; left: 0;
    width: ${W}px; height: ${H}px;
    z-index: 0; border-radius: 6px;
    object-fit: contain; background: #000;
  `;
  videoEl.playsInline = true;
  videoEl.preload = 'auto';
  videoEl.muted = true; // muted by default for autoplay compat

  // Position SVG absolutely on top of video
  svgEl.style.position = 'absolute';
  svgEl.style.top = '0';
  svgEl.style.left = '0';
  svgEl.style.zIndex = '1';

  // Ensure container is positioned
  container.style.position = 'relative';
  container.style.width = W + 'px';
  container.style.height = H + 'px';

  // Insert video before the SVG
  container.insertBefore(videoEl, svgEl);
  _videoEl = videoEl;

  // Add CSS class
  document.body.classList.add('video-mode');

  // Update UI
  updateVideoModeUI(true);
  switchTab('players');

  // Initialize timeline
  _initTimeline(duration);

  // Start time sync loop
  startVideoTimeLoop();
}

// ─── Exit Video Mode ──────────────────────────────────────────────────────────
export function exitVideoMode() {
  deselect();
  trackModeSwitch('pitch');

  stopVideoTimeLoop();

  // Revoke object URL
  if (S.videoData) {
    try { URL.revokeObjectURL(S.videoData); } catch {}
  }

  S.setAppMode('pitch');
  S.setVideoData(null);
  S.setVideoDimensions(null);
  S.setVideoFileName(null);

  // Clear undo stack
  S.undoStack.length = 0;

  // Remove video element
  const videoEl = document.getElementById('video-bg');
  if (videoEl) videoEl.remove();
  _videoEl = null;

  // Remove transparent bg rect
  const bgRect = document.getElementById('video-svg-bg');
  if (bgRect) bgRect.remove();

  // Reset SVG positioning
  const svgEl = S.svg;
  svgEl.style.position = '';
  svgEl.style.top = '';
  svgEl.style.left = '';
  svgEl.style.zIndex = '';

  // Reset container sizing
  const container = document.getElementById('pitch-container');
  if (container) {
    container.style.width = '';
    container.style.height = '';
  }

  // Clear elements
  S.objectsLayer.innerHTML = '';
  S.playersLayer.innerHTML = '';
  S.playerCounts.a = 0;
  S.playerCounts.b = 0;
  S.playerCounts.joker = 0;

  // Remove CSS class
  document.body.classList.remove('video-mode');

  // Hide timeline
  const timeline = document.getElementById('video-timeline');
  if (timeline) timeline.style.display = 'none';

  // Restore pitch
  rebuildPitch();

  updateVideoModeUI(false);
  switchTab('players');
}

// ─── Video Time Sync Loop ────────────────────────────────────────────────────
export function startVideoTimeLoop() {
  function tick() {
    if (_videoEl) {
      syncAnnotationsToTime(_videoEl.currentTime);
      _updateTimelinePlayhead();
    }
    _timeLoopId = requestAnimationFrame(tick);
  }
  _timeLoopId = requestAnimationFrame(tick);
}

export function stopVideoTimeLoop() {
  if (_timeLoopId) {
    cancelAnimationFrame(_timeLoopId);
    _timeLoopId = null;
  }
}

// ─── Show/Hide Annotations Based on Video Time ──────────────────────────────
export function syncAnnotationsToTime(t) {
  const allElements = [
    ...S.objectsLayer.children,
    ...S.playersLayer.children,
  ];

  for (const el of allElements) {
    const vtIn = el.dataset.vtIn;
    const vtOut = el.dataset.vtOut;

    // Elements without timestamps are always visible (e.g. just-created)
    if (vtIn === undefined && vtOut === undefined) continue;

    const tIn = parseFloat(vtIn || '0');
    const tOut = parseFloat(vtOut || '99999');

    if (t >= tIn && t <= tOut) {
      if (el.style.display === 'none') el.style.display = '';
    } else {
      if (el.style.display !== 'none') el.style.display = 'none';
    }
  }
}

// ─── Tag New Annotation with Current Video Time ─────────────────────────────
export function tagVideoTimestamp(element) {
  if (S.appMode !== 'video' || !_videoEl) return;
  const t = _videoEl.currentTime;
  element.dataset.vtIn = t.toFixed(2);
  element.dataset.vtOut = (t + 5).toFixed(2);
  _renderAnnotationBars();
}

// ─── Video Controls ──────────────────────────────────────────────────────────
export function toggleVideoPlayback() {
  if (!_videoEl) return;
  if (_videoEl.paused) {
    _videoEl.play();
    const btn = document.getElementById('vt-play-btn');
    if (btn) btn.textContent = '⏸';
  } else {
    _videoEl.pause();
    const btn = document.getElementById('vt-play-btn');
    if (btn) btn.textContent = '▶';
  }
}

export function seekVideo(seconds) {
  if (!_videoEl) return;
  _videoEl.currentTime = Math.max(0, Math.min(_videoEl.duration || 0, _videoEl.currentTime + seconds));
}

export function setVideoSpeed(rate) {
  if (_videoEl) _videoEl.playbackRate = parseFloat(rate) || 1;
}

export function getVideoElement() {
  return _videoEl;
}

export function getVideoCurrentTime() {
  return _videoEl ? _videoEl.currentTime : 0;
}

// ─── Auto-pause when drawing ─────────────────────────────────────────────────
export function autoPauseIfPlaying() {
  if (_videoEl && !_videoEl.paused) {
    _videoEl.pause();
    const btn = document.getElementById('vt-play-btn');
    if (btn) btn.textContent = '▶';
  }
}

// ─── Timeline UI ─────────────────────────────────────────────────────────────
let _duration = 0;

function _initTimeline(duration) {
  _duration = duration;
  const timeline = document.getElementById('video-timeline');
  if (timeline) timeline.style.display = 'flex';

  // Update time display
  _updateTimeDisplay(0, duration);

  // Play/pause button
  const playBtn = document.getElementById('vt-play-btn');
  if (playBtn) {
    playBtn.textContent = '▶';
    playBtn.onclick = toggleVideoPlayback;
  }

  // Speed selector
  const speedSel = document.getElementById('vt-speed');
  if (speedSel) {
    speedSel.value = '1';
    speedSel.onchange = () => setVideoSpeed(speedSel.value);
  }

  // Scrubber click-to-seek
  const scrubber = document.getElementById('vt-scrubber');
  if (scrubber) {
    let scrubbing = false;

    function seekFromEvent(e) {
      const rect = scrubber.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      if (_videoEl) _videoEl.currentTime = pct * _duration;
    }

    scrubber.addEventListener('mousedown', e => {
      scrubbing = true;
      seekFromEvent(e);
    });
    document.addEventListener('mousemove', e => {
      if (scrubbing) seekFromEvent(e);
    });
    document.addEventListener('mouseup', () => { scrubbing = false; });
  }

  // Video ended handler
  if (_videoEl) {
    _videoEl.onended = () => {
      const btn = document.getElementById('vt-play-btn');
      if (btn) btn.textContent = '▶';
    };
    _videoEl.onpause = () => {
      const btn = document.getElementById('vt-play-btn');
      if (btn) btn.textContent = '▶';
    };
    _videoEl.onplay = () => {
      const btn = document.getElementById('vt-play-btn');
      if (btn) btn.textContent = '⏸';
    };
  }
}

function _updateTimelinePlayhead() {
  if (!_videoEl || !_duration) return;
  const pct = (_videoEl.currentTime / _duration) * 100;

  const progress = document.getElementById('vt-progress');
  if (progress) progress.style.width = pct + '%';

  const playhead = document.getElementById('vt-playhead');
  if (playhead) playhead.style.left = pct + '%';

  _updateTimeDisplay(_videoEl.currentTime, _duration);
}

function _updateTimeDisplay(current, total) {
  const el = document.getElementById('vt-time');
  if (el) el.textContent = `${_formatTime(current)} / ${_formatTime(total)}`;
}

function _formatTime(s) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

// ─── Annotation Bars on Timeline ─────────────────────────────────────────────
export function _renderAnnotationBars() {
  const track = document.getElementById('vt-annotation-track');
  if (!track || !_duration) return;
  track.innerHTML = '';

  const allElements = [
    ...S.objectsLayer.children,
    ...S.playersLayer.children,
  ];

  const colors = ['#4FC3F7', '#FFB74D', '#81C784', '#E57373', '#BA68C8', '#4DD0E1', '#FFD54F'];
  let colorIdx = 0;

  for (const el of allElements) {
    if (el.dataset.vtIn === undefined) continue;
    const tIn = parseFloat(el.dataset.vtIn || '0');
    const tOut = parseFloat(el.dataset.vtOut || '0');
    const leftPct = (tIn / _duration) * 100;
    const widthPct = ((tOut - tIn) / _duration) * 100;

    const bar = document.createElement('div');
    bar.className = 'vt-annotation-bar';
    bar.style.left = leftPct + '%';
    bar.style.width = Math.max(0.5, widthPct) + '%';
    bar.style.background = colors[colorIdx % colors.length];
    bar.title = `${el.dataset.type || 'annotation'} (${_formatTime(tIn)} – ${_formatTime(tOut)})`;
    bar.dataset.elementId = el.id;

    // Click to seek to annotation start
    bar.addEventListener('click', () => {
      if (_videoEl) _videoEl.currentTime = tIn;
    });

    track.appendChild(bar);
    colorIdx++;
  }
}

// ─── Update UI ───────────────────────────────────────────────────────────────
function updateVideoModeUI(isVideoMode) {
  const pitchPane = document.getElementById('pane-pitch');
  const videoInfo = document.getElementById('video-mode-info');
  const uploadPane = document.getElementById('video-upload-pane');

  if (pitchPane) pitchPane.style.display = isVideoMode ? 'none' : '';
  if (videoInfo) videoInfo.style.display = isVideoMode ? '' : 'none';
  if (uploadPane) uploadPane.style.display = 'none';

  // Sync mode bar buttons
  const pitchBtn = document.getElementById('mode-pitch-btn');
  const imageBtn = document.getElementById('mode-image-btn');
  const videoBtn = document.getElementById('mode-video-btn');
  if (pitchBtn) pitchBtn.classList.toggle('active', !isVideoMode && S.appMode === 'pitch');
  if (imageBtn) imageBtn.classList.toggle('active', false);
  if (videoBtn) videoBtn.classList.toggle('active', isVideoMode);
}

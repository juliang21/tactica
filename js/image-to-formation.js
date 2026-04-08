// ─── Image-to-Formation: AI-powered player detection ─────────────────────────
import * as S from './state.js';
import { addPlayer } from './elements.js';
import { select, deselect } from './interaction.js';

const DETECTION_PROMPT = `You are a football/soccer tactical analyst AI. Analyze this image and detect all visible players on the pitch.

IMPORTANT RULES:
- Only detect actual human players visible on a football/soccer pitch
- Estimate each player's position as a percentage of the FULL pitch dimensions:
  - x: 0 = left side, 100 = right side (looking at the image)
  - y: 0 = top of image, 100 = bottom of image
- Group players into two teams based on jersey color
- Team "a" = the team playing towards the RIGHT (or towards the top if vertical view)
- Team "b" = the team playing towards the LEFT (or towards the bottom if vertical view)
- If you can read jersey numbers, include them. Otherwise use null.
- Detect the approximate jersey color of each team as a hex color

Return ONLY valid JSON in this exact format (no markdown, no code fences):
{"players":[{"x":50,"y":10,"team":"a","number":1},{"x":30,"y":40,"team":"b","number":7}],"teamAColor":"#3B82F6","teamBColor":"#EF4444"}`;

// ─── Provider Management ─────────────────────────────────────────────────────
// Supported: 'gemini', 'openai', 'anthropic', 'groq'
export function getProvider() {
  return localStorage.getItem('tactica_ai_provider') || 'gemini';
}
export function setProvider(p) {
  localStorage.setItem('tactica_ai_provider', p);
}

// ─── API Key Management ──────────────────────────────────────────────────────
export function getApiKey() {
  const provider = getProvider();
  return localStorage.getItem(`tactica_${provider}_key`) || '';
}

export function setApiKey(key) {
  const provider = getProvider();
  localStorage.setItem(`tactica_${provider}_key`, key.trim());
}

export function hasApiKey() {
  return !!getApiKey();
}

// ─── Image to Base64 ─────────────────────────────────────────────────────────
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ─── Gemini Vision API ──────────────────────────────────────────────────────
async function detectWithGemini(imageBase64, mimeType) {
  const apiKey = getApiKey();
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: DETECTION_PROMPT },
          { inline_data: { mime_type: mimeType, data: imageBase64 } }
        ]
      }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 2048 }
    })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `Gemini API error (${response.status})`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('No response from Gemini');
  return text;
}

// ─── OpenAI Vision API ──────────────────────────────────────────────────────
async function detectWithOpenAI(imageBase64, mimeType) {
  const apiKey = getApiKey();
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: DETECTION_PROMPT },
          { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } }
        ]
      }],
      temperature: 0.1,
      max_tokens: 2048
    })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `OpenAI API error (${response.status})`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error('No response from OpenAI');
  return text;
}

// ─── Anthropic Claude Vision API ────────────────────────────────────────────
async function detectWithAnthropic(imageBase64, mimeType) {
  const apiKey = getApiKey();
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mimeType, data: imageBase64 } },
          { type: 'text', text: DETECTION_PROMPT }
        ]
      }]
    })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `Anthropic API error (${response.status})`);
  }

  const data = await response.json();
  const text = data.content?.[0]?.text;
  if (!text) throw new Error('No response from Claude');
  return text;
}

// ─── Groq Vision API ───────────────────────────────────────────────────────
async function detectWithGroq(imageBase64, mimeType) {
  const apiKey = getApiKey();
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'meta-llama/llama-4-scout-17b-16e-instruct',
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: DETECTION_PROMPT },
          { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } }
        ]
      }],
      temperature: 0.1,
      max_tokens: 2048
    })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `Groq API error (${response.status})`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error('No response from Groq');
  return text;
}

// ─── Detect Players (routes to provider) ─────────────────────────────────────
async function detectPlayers(imageBase64, mimeType) {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('No API key configured');

  const provider = getProvider();
  let text;
  if (provider === 'openai') {
    text = await detectWithOpenAI(imageBase64, mimeType);
  } else if (provider === 'anthropic') {
    text = await detectWithAnthropic(imageBase64, mimeType);
  } else if (provider === 'groq') {
    text = await detectWithGroq(imageBase64, mimeType);
  } else {
    text = await detectWithGemini(imageBase64, mimeType);
  }

  // Parse JSON from response (strip markdown fences if present)
  const jsonStr = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  try {
    return JSON.parse(jsonStr);
  } catch {
    throw new Error('Failed to parse AI response. Please try again with a clearer image.');
  }
}

// ─── Map detected positions to SVG coordinates ─────────────────────────────
function mapToSVGCoords(players) {
  const lay = S.currentPitchLayout;
  const isV = lay.includes('-v');
  const isHalf = lay.startsWith('half');
  const W = parseFloat(S.svg.getAttribute('width'));
  const H = parseFloat(S.svg.getAttribute('height'));

  let pad, py, pw, ph;
  if (isHalf) {
    pad = 20; py = 20; pw = W - pad * 2; ph = H - py * 2;
  } else if (isV) {
    pad = 20; py = 20; pw = W - pad * 2; ph = H - py * 2;
  } else {
    pad = 30; py = 20; pw = W - pad * 2; ph = H - py * 2;
  }

  return players.map(p => ({
    ...p,
    svgX: pad + (p.x / 100) * pw,
    svgY: py + (p.y / 100) * ph
  }));
}

// ─── Place detected players on pitch ─────────────────────────────────────────
function placePlayers(result) {
  S.pushUndo();
  deselect();

  // Clear existing players
  Array.from(S.playersLayer.querySelectorAll('g[data-type="player"]')).forEach(el => el.remove());
  S.playerCounts.a = 0;
  S.playerCounts.b = 0;
  S.playerCounts.joker = 0;

  const mapped = mapToSVGCoords(result.players);

  // Assign numbers if not detected (auto-increment per team)
  let numA = 0, numB = 0;
  mapped.forEach(p => {
    if (p.team === 'a') numA++;
    else numB++;
    if (!p.number) p.number = p.team === 'a' ? numA : numB;
  });

  // Apply detected team colors
  if (result.teamAColor) {
    S.teamColors.a = result.teamAColor;
    const dotA = document.getElementById('dot-a');
    if (dotA) dotA.style.background = result.teamAColor;
  }
  if (result.teamBColor) {
    S.teamColors.b = result.teamBColor;
    const dotB = document.getElementById('dot-b');
    if (dotB) dotB.style.background = result.teamBColor;
  }

  // Place each player
  const placed = [];
  mapped.forEach(p => {
    const isGK = p.number === 1;
    const el = addPlayer(p.svgX, p.svgY, p.team, p.number, isGK);
    if (el) placed.push(el);
  });

  return placed;
}

// ─── Main entry point ────────────────────────────────────────────────────────
export async function processImage(file) {
  if (!file) throw new Error('No file provided');
  if (!file.type.startsWith('image/')) throw new Error('Please upload an image file');

  const base64 = await fileToBase64(file);
  const result = await detectPlayers(base64, file.type);

  if (!result.players || result.players.length === 0) {
    throw new Error('No players detected in the image. Try a clearer tactical view.');
  }

  const placed = placePlayers(result);
  return { count: placed.length, teamA: result.teamAColor, teamB: result.teamBColor };
}

// ─── Subscription / Freemium Gating ──────────────────────────────────────────

// User tier: 'free' | 'pro'
let userTier = 'free';

// Features that require Pro subscription
const PREMIUM_FEATURES = new Set([
  // Pitch layouts (free: full-h, full-v, half-h)
  'pitch:half-h-ng',
  'pitch:half-h-ng-nd',
]);

// ─── Feature tagging API ─────────────────────────────────────────────────────
// Any module can register a feature as premium:
//   import { tagPremium } from './subscription.js';
//   tagPremium('export:no-watermark');
export function tagPremium(featureId) {
  PREMIUM_FEATURES.add(featureId);
}

export function tagPremiumBatch(featureIds) {
  featureIds.forEach(id => PREMIUM_FEATURES.add(id));
}

export function listPremiumFeatures() {
  return [...PREMIUM_FEATURES];
}

// ─── Tier helpers ────────────────────────────────────────────────────────────
export function getUserTier() {
  return userTier;
}

export function setUserTier(tier) {
  userTier = tier;
  updateLockedUI();
}

export function isPro() {
  return userTier === 'pro';
}

export function canAccess(featureId) {
  if (userTier === 'pro') return true;
  return !PREMIUM_FEATURES.has(featureId);
}

export function isFeaturePremium(featureId) {
  return PREMIUM_FEATURES.has(featureId);
}

// ─── Upgrade prompt ──────────────────────────────────────────────────────────
export function showUpgradePrompt(featureName) {
  const overlay = document.getElementById('upgrade-overlay');
  if (!overlay) return;
  const label = overlay.querySelector('.upgrade-feature-name');
  if (label) label.textContent = featureName || 'this feature';
  overlay.classList.add('visible');
}

export function hideUpgradePrompt() {
  const overlay = document.getElementById('upgrade-overlay');
  if (overlay) overlay.classList.remove('visible');
}

// ─── Update locked UI state ──────────────────────────────────────────────────
export function updateLockedUI() {
  document.querySelectorAll('[data-feature]').forEach(el => {
    const featureId = el.dataset.feature;
    const locked = !canAccess(featureId);
    el.classList.toggle('locked', locked);
    el.classList.toggle('unlocked', !locked);
  });
}

// ─── Register built-in premium tags ──────────────────────────────────────────
// Watermark-free export is a Pro perk
tagPremium('export:no-watermark');

// ─── Subscription / Freemium Gating ──────────────────────────────────────────
import { db, app } from './firebase-config.js';
import { doc, onSnapshot } from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js';
// Firebase Functions SDK is loaded lazily in startCheckout / openManageSubscription
// to avoid blocking the entire module if Cloud Functions aren't deployed yet.

// User tier: 'free' | 'pro'
let userTier = 'free';
let _subscriptionInfo = null;
let _unsubListener = null;

// Features that require Pro subscription
const PREMIUM_FEATURES = new Set([
  // Pitch layouts (free: full-h, full-v, half-h)
  'pitch:half-h-ng',
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

// ─── Subscription info ──────────────────────────────────────────────────────
export function getSubscriptionInfo() {
  return _subscriptionInfo;
}

// ─── Firestore subscription listener ────────────────────────────────────────
// Listens to the user's doc in Firestore for subscription changes written by
// the Stripe webhook Cloud Function. UI updates instantly via onSnapshot.
export function initSubscriptionListener(uid) {
  stopSubscriptionListener();
  const userRef = doc(db, 'tactica_users', uid);
  _unsubListener = onSnapshot(userRef, (snap) => {
    const data = snap.data();
    if (!data?.subscription) {
      _subscriptionInfo = null;
      setUserTier('free');
      return;
    }
    _subscriptionInfo = data.subscription;
    const status = data.subscription.status;
    // active and past_due both grant access (past_due shows a warning)
    if (status === 'active' || status === 'past_due') {
      setUserTier('pro');
    } else {
      setUserTier('free');
    }
  }, (err) => {
    console.error('Subscription listener error:', err);
  });
}

export function stopSubscriptionListener() {
  if (_unsubListener) {
    _unsubListener();
    _unsubListener = null;
  }
  _subscriptionInfo = null;
}

// ─── Currency detection ─────────────────────────────────────────────────────
export function detectCurrency() {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    if (tz.startsWith('Europe/') || tz.startsWith('Africa/')) return 'eur';
  } catch (e) {}
  return 'usd';
}

// Display prices for UI
const DISPLAY_PRICES = {
  eur: { month: '8.99', year: '89', symbol: '€', code: 'EUR' },
  usd: { month: '10.99', year: '99', symbol: '$', code: 'USD' },
};

export function getDisplayPrices() {
  const currency = detectCurrency();
  return DISPLAY_PRICES[currency];
}

// ─── Stripe Checkout ────────────────────────────────────────────────────────
export async function startCheckout(interval) {
  try {
    const { getFunctions, httpsCallable } = await import('https://www.gstatic.com/firebasejs/11.6.0/firebase-functions.js');
    const functions = getFunctions(app);
    const createCheckoutSession = httpsCallable(functions, 'createCheckoutSession');
    const result = await createCheckoutSession({ interval });
    window.location.href = result.data.sessionUrl;
  } catch (err) {
    console.error('Checkout error:', err);
    window.showNotification?.('Could not start checkout. Please try again.', 'error', 5000);
  }
}

// ─── Stripe Customer Portal ─────────────────────────────────────────────────
export async function openManageSubscription() {
  try {
    const { getFunctions, httpsCallable } = await import('https://www.gstatic.com/firebasejs/11.6.0/firebase-functions.js');
    const functions = getFunctions(app);
    const createPortalSession = httpsCallable(functions, 'createPortalSession');
    const result = await createPortalSession();
    window.location.href = result.data.portalUrl;
  } catch (err) {
    console.error('Portal error:', err);
    window.showNotification?.('Could not open subscription management. Please try again.', 'error', 5000);
  }
}

// ─── Upgrade prompt ──────────────────────────────────────────────────────────
export function showUpgradePrompt(featureName) {
  const overlay = document.getElementById('upgrade-overlay');
  if (!overlay) return;
  const label = overlay.querySelector('.upgrade-feature-name');
  if (label) label.textContent = featureName || 'this feature';

  // Update prices in overlay
  const prices = getDisplayPrices();
  const monthEl = overlay.querySelector('.upgrade-price-month');
  const yearEl = overlay.querySelector('.upgrade-price-year');
  if (monthEl) monthEl.textContent = `${prices.symbol}${prices.month}/mo`;
  if (yearEl) yearEl.textContent = `${prices.symbol}${prices.year}/yr`;

  overlay.classList.add('visible');
}

export function hideUpgradePrompt() {
  const overlay = document.getElementById('upgrade-overlay');
  if (overlay) overlay.classList.remove('visible');
}

// ─── Update locked UI state ──────────────────────────────────────────────────
export function updateLockedUI() {
  // Update feature locks
  document.querySelectorAll('[data-feature]').forEach(el => {
    const featureId = el.dataset.feature;
    const locked = !canAccess(featureId);
    el.classList.toggle('locked', locked);
    el.classList.toggle('unlocked', !locked);
  });

  // Update menu tier label + upgrade/manage buttons
  const pro = isPro();
  const labelSecondary = document.getElementById('app-menu-label-secondary');
  if (labelSecondary && labelSecondary.style.display !== 'none') {
    labelSecondary.textContent = pro ? 'Analyst Plan' : 'Free Plan';
  }
  const menuUpgrade = document.getElementById('app-menu-upgrade');
  const menuManageSub = document.getElementById('app-menu-manage-sub');
  // Only toggle if user is signed in (labelSecondary visible)
  if (labelSecondary && labelSecondary.style.display !== 'none') {
    if (menuUpgrade) menuUpgrade.style.display = pro ? 'none' : 'flex';
    if (menuManageSub) menuManageSub.style.display = pro ? 'flex' : 'none';
  }
}

// ─── Register built-in premium tags ──────────────────────────────────────────
// Watermark-free export is a Pro perk
tagPremium('export:no-watermark');

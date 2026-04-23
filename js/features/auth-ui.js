// ─── Auth UI Module ──────────────────────────────────────────────────────────
// Extracted from app.js — handles auth modal, menu, sign-in/up/out UI.
// ──────────────────────────────────────────────────────────────────────────────
import { signInWithGoogle, signUpWithEmail, signInWithEmail, sendPasswordReset, signOut } from '../auth.js';
import { trackSignUp, trackSignIn, trackSignOut } from '../analytics.js';

// ─── Auth UI (avatar, menu) ─────────────────────────────────────────────────
export function updateAuthUI(user) {
  const menuIcon = document.getElementById('app-menu-icon');
  const menuAvatarImg = document.getElementById('app-menu-avatar-img');
  const menuAvatarInitials = document.getElementById('app-menu-avatar-initials');
  const menuUserInfo = document.getElementById('app-menu-user-info');
  const menuUserName = document.getElementById('app-menu-user-name');
  const menuUserEmail = document.getElementById('app-menu-user-email');
  const menuUserDivider = document.getElementById('app-menu-user-divider');
  const menuSignin = document.getElementById('app-menu-signin');
  const menuSignout = document.getElementById('app-menu-signout');
  const menuSignoutDivider = document.getElementById('app-menu-signout-divider');
  const menuBtn = document.getElementById('app-menu-btn');
  const topbarSigninLink = document.getElementById('topbar-signin-link');

  // Top-right signin link: only visible when signed out (for discoverability)
  if (topbarSigninLink) topbarSigninLink.style.display = user ? 'none' : '';

  if (user) {
    // Show avatar, hide hamburger icon
    menuIcon.style.display = 'none';
    menuBtn.style.borderColor = 'var(--accent)';

    if (user.photoURL) {
      menuAvatarImg.src = user.photoURL;
      menuAvatarImg.style.display = 'block';
      menuAvatarInitials.style.display = 'none';
    } else {
      menuAvatarImg.style.display = 'none';
      menuAvatarInitials.style.display = 'flex';
      const name = user.displayName || user.email || 'U';
      menuAvatarInitials.textContent = name.charAt(0).toUpperCase();
    }

    // Dropdown: show user info, hide sign-in, show sign-out
    menuUserInfo.style.display = 'block';
    menuUserName.textContent = user.displayName || 'User';
    menuUserEmail.textContent = user.email || '';
    menuUserDivider.style.display = 'block';
    menuSignin.style.display = 'none';
    menuSignout.style.display = 'flex';
    menuSignoutDivider.style.display = 'block';
  } else {
    // Show hamburger icon, hide avatar
    menuIcon.style.display = 'flex';
    menuAvatarImg.style.display = 'none';
    menuAvatarInitials.style.display = 'none';
    menuBtn.style.borderColor = '';

    // Dropdown: hide user info, show sign-in, hide sign-out
    menuUserInfo.style.display = 'none';
    menuUserDivider.style.display = 'none';
    menuSignin.style.display = 'flex';
    menuSignout.style.display = 'none';
    menuSignoutDivider.style.display = 'none';
  }
}

function toggleAppMenu() {
  const dd = document.getElementById('app-menu-dropdown');
  const isOpen = dd.style.display !== 'none';
  dd.style.display = isOpen ? 'none' : 'block';
}
window.toggleAppMenu = toggleAppMenu;

// Close app menu when clicking outside
document.addEventListener('click', (e) => {
  const wrapper = document.getElementById('app-menu-wrapper');
  const dd = document.getElementById('app-menu-dropdown');
  if (wrapper && dd && !wrapper.contains(e.target)) {
    dd.style.display = 'none';
  }
});

export function openAuthModal(tab) {
  document.getElementById('auth-modal').style.display = 'flex';
  switchAuthTab(tab === 'signup' ? 'signup' : 'signin');
  clearAuthMessage();
}
window.openAuthModal = openAuthModal;

export function closeAuthModal() {
  document.getElementById('auth-modal').style.display = 'none';
  clearAuthMessage();
}
window.closeAuthModal = closeAuthModal;

function switchAuthTab(tab) {
  document.getElementById('auth-form-signin').style.display = tab === 'signin' ? 'flex' : 'none';
  document.getElementById('auth-form-signup').style.display = tab === 'signup' ? 'flex' : 'none';
  document.getElementById('auth-form-forgot').style.display = tab === 'forgot' ? 'flex' : 'none';

  const tabSignin = document.getElementById('auth-tab-signin');
  const tabSignup = document.getElementById('auth-tab-signup');
  tabSignin.classList.toggle('active', tab === 'signin' || tab === 'forgot');
  tabSignup.classList.toggle('active', tab === 'signup');

  // Show/hide Google button and divider for forgot
  const googleBtn = document.querySelector('.auth-google-btn');
  const divider = document.querySelector('.auth-divider');
  if (googleBtn) googleBtn.style.display = tab === 'forgot' ? 'none' : 'flex';
  if (divider) divider.style.display = tab === 'forgot' ? 'none' : 'flex';

  clearAuthMessage();
}
window.switchAuthTab = switchAuthTab;

function showAuthMessage(msg, type) {
  const el = document.getElementById('auth-message');
  el.textContent = msg;
  el.className = 'auth-message ' + type;
  el.style.display = 'block';
}

function clearAuthMessage() {
  const el = document.getElementById('auth-message');
  el.style.display = 'none';
  el.textContent = '';
}

async function doGoogleSignIn() {
  clearAuthMessage();
  const { user, error } = await signInWithGoogle();
  if (error) showAuthMessage(error, 'error');
  else if (user) trackSignIn('google');
}
window.doGoogleSignIn = doGoogleSignIn;

async function doEmailSignIn() {
  clearAuthMessage();
  const email = document.getElementById('auth-email-in').value.trim();
  const pass = document.getElementById('auth-pass-in').value;
  if (!email || !pass) { showAuthMessage('Please fill in all fields.', 'error'); return; }
  const { user, error } = await signInWithEmail(email, pass);
  if (error) showAuthMessage(error, 'error');
  else if (user) trackSignIn('email');
}
window.doEmailSignIn = doEmailSignIn;

async function doEmailSignUp() {
  clearAuthMessage();
  const name = document.getElementById('auth-name-up').value.trim();
  const email = document.getElementById('auth-email-up').value.trim();
  const pass = document.getElementById('auth-pass-up').value;
  if (!email || !pass) { showAuthMessage('Please fill in email and password.', 'error'); return; }
  const { user, error } = await signUpWithEmail(email, pass, name);
  if (error) showAuthMessage(error, 'error');
  else if (user) trackSignUp('email');
}
window.doEmailSignUp = doEmailSignUp;

async function doPasswordReset() {
  clearAuthMessage();
  const email = document.getElementById('auth-email-reset').value.trim();
  if (!email) { showAuthMessage('Please enter your email.', 'error'); return; }
  const { success, error } = await sendPasswordReset(email);
  if (error) showAuthMessage(error, 'error');
  else showAuthMessage('Reset link sent! Check your inbox.', 'success');
}
window.doPasswordReset = doPasswordReset;

async function doSignOut() {
  await signOut();
  trackSignOut();
  const dropdown = document.getElementById('user-dropdown');
  if (dropdown) dropdown.style.display = 'none';
  window.showNotification?.('You have been signed out', 'info', 4000);
}
window.doSignOut = doSignOut;

// ─── Firebase Authentication ─────────────────────────────────────────────────
import { auth } from './firebase-config.js';
import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut as firebaseSignOut,
  updateProfile,
} from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js';

const googleProvider = new GoogleAuthProvider();

// ─── Auth State Listener ────────────────────────────────────────────────────
export function onAuthChange(callback) {
  return onAuthStateChanged(auth, callback);
}

// ─── Google Sign-In ─────────────────────────────────────────────────────────
export async function signInWithGoogle() {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return { user: result.user, error: null };
  } catch (e) {
    // If popup blocked, try redirect
    if (e.code === 'auth/popup-blocked') {
      await signInWithRedirect(auth, googleProvider);
      return { user: null, error: null };
    }
    return { user: null, error: friendlyError(e.code) };
  }
}

// ─── Email/Password Sign Up ─────────────────────────────────────────────────
export async function signUpWithEmail(email, password, displayName) {
  try {
    const result = await createUserWithEmailAndPassword(auth, email, password);
    if (displayName) {
      await updateProfile(result.user, { displayName });
    }
    return { user: result.user, error: null };
  } catch (e) {
    return { user: null, error: friendlyError(e.code) };
  }
}

// ─── Email/Password Sign In ─────────────────────────────────────────────────
export async function signInWithEmail(email, password) {
  try {
    const result = await signInWithEmailAndPassword(auth, email, password);
    return { user: result.user, error: null };
  } catch (e) {
    return { user: null, error: friendlyError(e.code) };
  }
}

// ─── Password Reset ─────────────────────────────────────────────────────────
export async function sendPasswordReset(email) {
  try {
    await sendPasswordResetEmail(auth, email);
    return { success: true, error: null };
  } catch (e) {
    return { success: false, error: friendlyError(e.code) };
  }
}

// ─── Sign Out ───────────────────────────────────────────────────────────────
export async function signOut() {
  await firebaseSignOut(auth);
}

// ─── Get Current User ───────────────────────────────────────────────────────
export function getCurrentUser() {
  return auth.currentUser;
}

// ─── Friendly Error Messages ────────────────────────────────────────────────
function friendlyError(code) {
  const map = {
    'auth/email-already-in-use': 'This email is already registered. Try signing in.',
    'auth/invalid-email': 'Please enter a valid email address.',
    'auth/weak-password': 'Password must be at least 6 characters.',
    'auth/user-not-found': 'No account found with this email.',
    'auth/wrong-password': 'Incorrect password. Try again.',
    'auth/invalid-credential': 'Incorrect email or password.',
    'auth/too-many-requests': 'Too many attempts. Please try again later.',
    'auth/popup-closed-by-user': 'Sign-in cancelled.',
    'auth/network-request-failed': 'Network error. Check your connection.',
  };
  return map[code] || 'Something went wrong. Please try again.';
}

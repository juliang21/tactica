// ─── Firestore CRUD for Analyses ─────────────────────────────────────────────
import { db } from './firebase-config.js';
import {
  doc, setDoc, getDoc, getDocs, deleteDoc,
  collection, query, orderBy, Timestamp,
} from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js';

const MAX_IMAGE_DATA_LENGTH = 500000; // ~500KB, skip large images for cloud

// ─── Save ───────────────────────────────────────────────────────────────────
export async function saveAnalysisToCloud(uid, analysisObj) {
  const ref = doc(db, 'users', uid, 'analyses', analysisObj.id);
  const payload = {
    name: analysisObj.name,
    createdAt: analysisObj.createdAt,
    updatedAt: Date.now(),
    thumbnail: analysisObj.thumbnail || '',
    data: sanitizeData(analysisObj.data),
  };
  await setDoc(ref, payload, { merge: true });
  return payload;
}

// ─── Load single ────────────────────────────────────────────────────────────
export async function loadAnalysisFromCloud(uid, id) {
  const ref = doc(db, 'users', uid, 'analyses', id);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

// ─── List all ───────────────────────────────────────────────────────────────
export async function listAnalysesFromCloud(uid) {
  const q = query(
    collection(db, 'users', uid, 'analyses'),
    orderBy('updatedAt', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ─── Delete ─────────────────────────────────────────────────────────────────
export async function deleteAnalysisFromCloud(uid, id) {
  await deleteDoc(doc(db, 'users', uid, 'analyses', id));
}

// ─── Duplicate ──────────────────────────────────────────────────────────────
export async function duplicateAnalysisInCloud(uid, newAnalysis) {
  const ref = doc(db, 'users', uid, 'analyses', newAnalysis.id);
  await setDoc(ref, {
    name: newAnalysis.name,
    createdAt: newAnalysis.createdAt,
    updatedAt: newAnalysis.updatedAt,
    thumbnail: newAnalysis.thumbnail || '',
    data: sanitizeData(newAnalysis.data),
  });
}

// ─── Migrate localStorage → Firestore ───────────────────────────────────────
export async function migrateLocalToCloud(uid) {
  const migrationKey = `tactica_migrated_${uid}`;
  if (localStorage.getItem(migrationKey)) return; // already migrated

  const localData = JSON.parse(localStorage.getItem('tactica_analyses') || '[]');
  if (localData.length === 0) {
    localStorage.setItem(migrationKey, '1');
    return;
  }

  // Check existing cloud analyses to avoid duplicates
  const existing = await listAnalysesFromCloud(uid);
  const existingIds = new Set(existing.map(a => a.id));

  for (const analysis of localData) {
    if (!existingIds.has(analysis.id)) {
      try {
        await saveAnalysisToCloud(uid, analysis);
      } catch (e) {
        console.warn('Migration failed for analysis:', analysis.id, e);
      }
    }
  }

  localStorage.setItem(migrationKey, '1');
}

// ─── Session Tracking ───────────────────────────────────────────────────────
export async function logSession(uid, email, displayName) {
  const now = Date.now();
  const today = new Date(now).toISOString().slice(0, 10); // YYYY-MM-DD

  // Update user profile with last seen + session count
  const userRef = doc(db, 'tactica_users', uid);
  const userSnap = await getDoc(userRef);
  const existing = userSnap.exists() ? userSnap.data() : {};
  const sessionCount = (existing.sessionCount || 0) + 1;
  const firstSeen = existing.firstSeen || now;

  await setDoc(userRef, {
    email: email || '',
    displayName: displayName || '',
    firstSeen,
    lastSeen: now,
    sessionCount,
    lastSessionDate: today,
  }, { merge: true });

  // Log individual session
  const device = window.innerWidth <= 768 ? 'mobile' : 'desktop';
  const sessionRef = doc(collection(db, 'tactica_sessions'));
  await setDoc(sessionRef, {
    uid,
    email: email || '',
    timestamp: now,
    date: today,
    device,
  });
}

// ─── Session ID (one per page load) ────────────────────────────────────────
let _sessionId = null;
export function setSessionId(id) { _sessionId = id; }
export function getSessionId() { return _sessionId; }

// ─── Action Tracking (saves, exports, features) ───────────────────────────
export async function logAction(uid, email, action, meta) {
  const now = Date.now();
  const today = new Date(now).toISOString().slice(0, 10);
  const ref = doc(collection(db, 'tactica_actions'));
  await setDoc(ref, {
    uid,
    email: email || '',
    action,       // 'save' | 'export' | 'feature_*'
    meta: meta || {},
    sessionId: _sessionId || null,
    timestamp: now,
    date: today,
  });
}

// ─── Admin: Get all users ───────────────────────────────────────────────────
export async function getAllUsers() {
  const q = query(collection(db, 'tactica_users'), orderBy('lastSeen', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ uid: d.id, ...d.data() }));
}

// ─── Admin: Get sessions for date range ─────────────────────────────────────
export async function getRecentSessions(limitCount = 500) {
  const q = query(collection(db, 'tactica_sessions'), orderBy('timestamp', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.slice(0, limitCount).map(d => d.data());
}

// ─── Sanitize data for Firestore ────────────────────────────────────────────
function sanitizeData(data) {
  if (!data) return {};
  const clean = { ...data };
  // Strip large image data to stay under Firestore 1MB doc limit
  if (clean.imageData && clean.imageData.length > MAX_IMAGE_DATA_LENGTH) {
    clean.imageData = null;
  }
  return clean;
}

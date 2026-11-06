// ─── Training Storage (Drills) ──────────────────────────────────────────────
// Router: Firestore when signed in, localStorage otherwise.
// Decoupled from the analyses storage so drills can be moved/removed cleanly.
// ─────────────────────────────────────────────────────────────────────────────

import { db } from '../../firebase-config.js';
import { getCurrentUser } from '../../auth.js';
import {
  doc, setDoc, getDoc, getDocs, deleteDoc,
  collection, query, orderBy,
} from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js';

const LS_KEY = 'tactica_drills_v1';
const LS_SESSIONS_KEY = 'tactica_sessions_v1';

function isSignedIn() { return !!getCurrentUser(); }
function uid() { return getCurrentUser()?.uid || null; }

// ─── Local storage helpers ──────────────────────────────────────────────────
function readLocal() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); }
  catch { return []; }
}

function writeLocal(list) {
  localStorage.setItem(LS_KEY, JSON.stringify(list));
}

// ─── Public API ─────────────────────────────────────────────────────────────
export async function saveDrillCloudOrLocal(drill) {
  if (isSignedIn()) {
    try {
      const ref = doc(db, 'users', uid(), 'drills', drill.id);
      await setDoc(ref, drill, { merge: true });
      return { storedIn: 'cloud' };
    } catch (e) {
      console.warn('Cloud drill save failed, falling back to local:', e);
    }
  }
  const list = readLocal();
  const idx = list.findIndex(d => d.id === drill.id);
  if (idx >= 0) list[idx] = drill; else list.push(drill);
  writeLocal(list);
  return { storedIn: 'local' };
}

export async function listDrills() {
  if (isSignedIn()) {
    try {
      const q = query(collection(db, 'users', uid(), 'drills'), orderBy('updatedAt', 'desc'));
      const snap = await getDocs(q);
      return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (e) {
      console.warn('Cloud drill list failed, using local:', e);
    }
  }
  return readLocal().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

export async function loadDrill(id) {
  if (isSignedIn()) {
    try {
      const ref = doc(db, 'users', uid(), 'drills', id);
      const snap = await getDoc(ref);
      if (snap.exists()) return { id: snap.id, ...snap.data() };
    } catch (e) {
      console.warn('Cloud drill load failed, trying local:', e);
    }
  }
  return readLocal().find(d => d.id === id) || null;
}

export async function deleteDrill(id) {
  if (isSignedIn()) {
    try {
      await deleteDoc(doc(db, 'users', uid(), 'drills', id));
    } catch (e) {
      console.warn('Cloud drill delete failed:', e);
    }
  }
  const list = readLocal().filter(d => d.id !== id);
  writeLocal(list);
}

// ═══ SESSIONS ═══════════════════════════════════════════════════════════════
function readLocalSessions() {
  try { return JSON.parse(localStorage.getItem(LS_SESSIONS_KEY) || '[]'); }
  catch { return []; }
}
function writeLocalSessions(list) {
  localStorage.setItem(LS_SESSIONS_KEY, JSON.stringify(list));
}

export async function saveSessionCloudOrLocal(session) {
  if (isSignedIn()) {
    try {
      const ref = doc(db, 'users', uid(), 'sessions', session.id);
      await setDoc(ref, session, { merge: true });
      return { storedIn: 'cloud' };
    } catch (e) {
      console.warn('Cloud session save failed, falling back to local:', e);
    }
  }
  const list = readLocalSessions();
  const idx = list.findIndex(s => s.id === session.id);
  if (idx >= 0) list[idx] = session; else list.push(session);
  writeLocalSessions(list);
  return { storedIn: 'local' };
}

export async function listSessions() {
  if (isSignedIn()) {
    try {
      const q = query(collection(db, 'users', uid(), 'sessions'), orderBy('updatedAt', 'desc'));
      const snap = await getDocs(q);
      return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (e) {
      console.warn('Cloud session list failed, using local:', e);
    }
  }
  return readLocalSessions().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

export async function loadSession(id) {
  if (isSignedIn()) {
    try {
      const ref = doc(db, 'users', uid(), 'sessions', id);
      const snap = await getDoc(ref);
      if (snap.exists()) return { id: snap.id, ...snap.data() };
    } catch (e) {
      console.warn('Cloud session load failed, trying local:', e);
    }
  }
  return readLocalSessions().find(s => s.id === id) || null;
}

export async function deleteSession(id) {
  if (isSignedIn()) {
    try { await deleteDoc(doc(db, 'users', uid(), 'sessions', id)); }
    catch (e) { console.warn('Cloud session delete failed:', e); }
  }
  writeLocalSessions(readLocalSessions().filter(s => s.id !== id));
}

// ─── Migrate localStorage → Firestore ───────────────────────────────────────
// Until the security rules named users/{uid}/drills and users/{uid}/sessions,
// every cloud write was denied and quietly fell back to localStorage. Fixing
// the rules only helps new saves, so a coach's existing library has to be
// lifted up once, on the first sign-in after the fix.
//
// Deliberately conservative: never deletes the local copy, never overwrites a
// cloud drill that is newer, and never throws — a failed migration must not
// block sign-in or lose anything.
const MIGRATION_KEY = 'tactica_training_migrated_';

// Cloud-only listing. listDrills()/listSessions() fall back to localStorage
// when the cloud read fails, which during a migration would mean comparing the
// local library against itself, skipping every item and marking the migration
// done without moving anything.
async function listCloudOnly(uid, name) {
  const q = query(collection(db, 'users', uid, name), orderBy('updatedAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function migrateCollection(localList, listCloud, saveCloud) {
  let cloud = [];
  try { cloud = await listCloud(); } catch (e) { return { moved: 0, failed: localList.length }; }
  const byId = new Map(cloud.map(d => [d.id, d]));
  let moved = 0, failed = 0;
  for (const item of localList) {
    const existing = byId.get(item.id);
    // Skip anything the cloud already holds at the same or newer revision.
    if (existing && (existing.updatedAt || 0) >= (item.updatedAt || 0)) continue;
    try {
      // saveCloud falls back to localStorage instead of throwing, so the
      // return value is the only honest signal that it really reached cloud.
      const { storedIn } = await saveCloud(item) || {};
      if (storedIn === 'cloud') moved++; else failed++;
    } catch (e) { console.warn('[training] migration failed for', item.id, e); failed++; }
  }
  return { moved, failed };
}

export async function migrateTrainingLocalToCloud(uid) {
  if (!uid || !isSignedIn()) return null;
  const key = MIGRATION_KEY + uid;
  if (localStorage.getItem(key)) return null;

  const drills = readLocal();
  const sessions = readLocalSessions();
  if (!drills.length && !sessions.length) {
    localStorage.setItem(key, '1');
    return null;
  }

  const d = await migrateCollection(drills, () => listCloudOnly(uid, 'drills'), saveDrillCloudOrLocal);
  const s = await migrateCollection(sessions, () => listCloudOnly(uid, 'sessions'), saveSessionCloudOrLocal);

  // Only mark done when nothing failed, so a flaky network retries next time
  // instead of stranding the rest of the library on this device.
  if (d.failed === 0 && s.failed === 0) localStorage.setItem(key, '1');
  return { drills: d.moved, sessions: s.moved, failed: d.failed + s.failed };
}

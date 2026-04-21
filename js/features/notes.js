// ─── Notes Panel ────────────────────────────────────────────────────────────
// Extracted from app.js — toggle, auto-save indicator, and analytics for the notes panel.

import { getCurrentUser } from '../auth.js';
import { logAction } from '../firestore.js?v=4';

let _notesOpenTracked = false;

export function toggleNotes() {
  const panel = document.getElementById('notes-panel');
  const btn = document.getElementById('notes-toggle-btn');
  const isOpen = panel.style.display !== 'none';
  panel.style.display = isOpen ? 'none' : 'flex';
  btn.style.display = isOpen ? 'flex' : 'none';
  // Track opening
  if (!isOpen && !_notesOpenTracked) {
    _notesOpenTracked = true;
    const u = getCurrentUser();
    if (u) logAction(u.uid, u.email, 'feature_notes_open', {}).catch(() => {});
  }
}
window.toggleNotes = toggleNotes;

// Auto-save notes on blur (when user clicks away) with "Saved" indicator + tracking
let _notesSaveTimer = null;
const notesTextarea = document.getElementById('notes-textarea');

notesTextarea?.addEventListener('input', function() {
  const btn = document.getElementById('notes-toggle-btn');
  if (btn) btn.classList.toggle('has-notes', this.value.trim().length > 0);
  // Debounced auto-save indicator
  clearTimeout(_notesSaveTimer);
  _notesSaveTimer = setTimeout(() => showNotesSaved(), 1500);
});

notesTextarea?.addEventListener('blur', function() {
  clearTimeout(_notesSaveTimer);
  if (this.value.trim().length > 0) showNotesSaved();
});

function showNotesSaved() {
  const status = document.getElementById('notes-save-status');
  if (!status) return;
  status.textContent = 'Saved';
  status.classList.add('visible');
  // Track save
  const u = getCurrentUser();
  if (u) logAction(u.uid, u.email, 'feature_notes_save', { length: notesTextarea?.value.length || 0 }).catch(() => {});
  setTimeout(() => status.classList.remove('visible'), 2000);
}

// Expose notes for captureState
window._getNotesText = () => document.getElementById('notes-textarea')?.value || '';
window._setNotesText = (text) => {
  const ta = document.getElementById('notes-textarea');
  if (ta) ta.value = text || '';
  const btn = document.getElementById('notes-toggle-btn');
  if (btn) btn.classList.toggle('has-notes', (text || '').trim().length > 0);
};

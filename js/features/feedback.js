// ─── Feedback Widget ─────────────────────────────────────────────────────────
// Extracted from app.js — handles the feedback panel UI, file attachment,
// image compression, and form submission via Web3Forms.

import { getCurrentUser } from '../auth.js';

let feedbackType = 'improvement';
let feedbackFile = null;

function toggleFeedback() {
  const panel = document.getElementById('feedback-panel');
  panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
  // Reset on open
  if (panel.style.display === 'block') {
    document.getElementById('fb-message').value = '';
    document.getElementById('fb-status').style.display = 'none';
    document.getElementById('fb-submit').disabled = false;
    document.getElementById('fb-submit').textContent = 'Send Feedback';
    document.getElementById('fb-file').value = '';
    document.getElementById('fb-upload-text').textContent = 'Attach screenshot (optional)';
    document.getElementById('fb-upload-label').classList.remove('has-file');
    feedbackFile = null;
  }
}

function setFeedbackType(btn) {
  document.querySelectorAll('.fb-type-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  feedbackType = btn.dataset.fbtype;
}

function onFeedbackFile(input) {
  const label = document.getElementById('fb-upload-label');
  const textEl = document.getElementById('fb-upload-text');
  if (input.files && input.files[0]) {
    feedbackFile = input.files[0];
    textEl.textContent = feedbackFile.name;
    label.classList.add('has-file');
  } else {
    feedbackFile = null;
    textEl.textContent = 'Attach screenshot (optional)';
    label.classList.remove('has-file');
  }
}

function compressImage(file, maxWidth, quality) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxWidth / img.width);
      const canvas = document.createElement('canvas');
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(blob => resolve(blob), 'image/jpeg', quality);
    };
    img.src = URL.createObjectURL(file);
  });
}

async function submitFeedback() {
  const msg = document.getElementById('fb-message').value.trim();
  if (!msg) { document.getElementById('fb-message').focus(); return; }

  const btn = document.getElementById('fb-submit');
  const status = document.getElementById('fb-status');
  btn.disabled = true;
  btn.textContent = 'Sending…';
  status.style.display = 'none';

  const user = getCurrentUser();
  const userEmail = user ? user.email : 'unknown';
  const userName = user ? (user.displayName || user.email) : 'unknown';

  try {
    const formData = new FormData();
    formData.append('access_key', '315e7f89-890f-4b05-8b81-605325f4f8e4');
    formData.append('subject', `Táctica Feedback: ${feedbackType}`);
    formData.append('type', feedbackType);
    formData.append('message', `From: ${userName} (${userEmail})\n\n${msg}`);
    formData.append('from_name', 'Táctica Feedback');
    formData.append('email', userEmail);

    // Upload screenshot to temp host and include URL
    if (feedbackFile) {
      btn.textContent = 'Uploading image…';
      const compressed = await compressImage(feedbackFile, 800, 0.6);
      const uploadData = new FormData();
      uploadData.append('reqtype', 'fileupload');
      uploadData.append('time', '72h');
      uploadData.append('fileToUpload', compressed, 'screenshot.jpg');
      const uploadRes = await fetch('https://litterbox.catbox.moe/resources/internals/api.php', { method: 'POST', body: uploadData });
      if (uploadRes.ok) {
        const imageUrl = (await uploadRes.text()).trim();
        formData.set('message', msg + `\n\nScreenshot: ${imageUrl}`);
      }
    }

    btn.textContent = 'Sending…';
    const res = await fetch('https://api.web3forms.com/submit', {
      method: 'POST',
      headers: { 'Accept': 'application/json' },
      body: formData,
    });

    const data = await res.json().catch(() => ({}));
    if (res.ok && data.success) {
      status.textContent = 'Thanks! Feedback sent.';
      status.className = 'success';
      status.style.display = 'block';
      btn.textContent = 'Sent ✓';
      setTimeout(() => toggleFeedback(), 1800);
    } else {
      throw new Error(data.message || 'Send failed');
    }
  } catch(e) {
    console.error('Feedback error:', e);
    status.textContent = e.message || 'Failed to send. Please try again.';
    status.className = 'error';
    status.style.display = 'block';
    btn.textContent = 'Send Feedback';
    btn.disabled = false;
  }
}

export { toggleFeedback, setFeedbackType, submitFeedback, onFeedbackFile };

window.toggleFeedback = toggleFeedback;
window.setFeedbackType = setFeedbackType;
window.submitFeedback = submitFeedback;
window.onFeedbackFile = onFeedbackFile;

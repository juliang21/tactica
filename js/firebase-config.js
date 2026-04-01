// ─── Firebase Configuration ──────────────────────────────────────────────────
import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js';
import { getAuth, setPersistence, browserLocalPersistence } from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: "AIzaSyBda3avj-hYXV72mgbc5ueLw7QAQnqTI34",
  authDomain: "tactica-94ff8.firebaseapp.com",
  projectId: "tactica-94ff8",
  storageBucket: "tactica-94ff8.firebasestorage.app",
  messagingSenderId: "288026105473",
  appId: "1:288026105473:web:50e369ab4be48afe685f80",
  measurementId: "G-6HX9DJLME1"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
setPersistence(auth, browserLocalPersistence);
const db = getFirestore(app);

export { app, auth, db };

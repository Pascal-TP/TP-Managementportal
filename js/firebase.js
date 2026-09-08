import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Gemeinsame Authentifizierung und Benutzerprofile des TP-Personalmanagements.
// Die Fachdaten des TP-Managementportals werden später getrennt angebunden.
export const firebaseConfig = {
  apiKey: "AIzaSyBPeDOgKJXgMG-zaq2sPokbx0UHc0VQelA",
  authDomain: "tp-personalmanagement.firebaseapp.com",
  projectId: "tp-personalmanagement",
  storageBucket: "tp-personalmanagement.firebasestorage.app",
  messagingSenderId: "376587718209",
  appId: "1:376587718209:web:0fc02350013715a0fac0c0",
  measurementId: "G-2PQ85F671Q"
};

// Derselbe App-Name wie im TP-Personalmanagement. Auf demselben Web-Origin
// kann dadurch dieselbe Firebase-Auth-Sitzung verwendet werden.
export const portalApp = getApps().some(a => a.name === "tp-personalmanagement")
  ? getApp("tp-personalmanagement")
  : initializeApp(firebaseConfig, "tp-personalmanagement");

export const auth = getAuth(portalApp);
export const db = getFirestore(portalApp);

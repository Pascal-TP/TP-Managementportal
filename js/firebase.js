import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getFunctions } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-functions.js";

// Gemeinsame Authentifizierung und Benutzerprofile des TP-Personalmanagements.
// Die Fachdaten des TP-Managementportals werden später getrennt angebunden.
export const firebaseConfig = {
  apiKey: "AIzaSyCcHI5sGR7sFwrWRpo2uQ3Plm0HpTvqr30",
  authDomain: "kalkpro-4cc29.firebaseapp.com",
  projectId: "kalkpro-4cc29",
  storageBucket: "kalkpro-4cc29.firebasestorage.app",
  messagingSenderId: "185447466021",
  appId: "1:185447466021:web:c404fa27a051a5b8b52bcc",
  measurementId: "G-GCR0LEGB1C"
};

// Derselbe App-Name wie im TP-Personalmanagement. Auf demselben Web-Origin
// kann dadurch dieselbe Firebase-Auth-Sitzung verwendet werden.
export const portalApp = getApps().some(a => a.name === "tp-personalmanagement")
  ? getApp("tp-personalmanagement")
  : initializeApp(firebaseConfig, "tp-personalmanagement");

export const auth = getAuth(portalApp);
export const db = getFirestore(portalApp);


// Zentrale Cloud Functions laufen weiterhin im bestehenden KalkPro-Projekt.
// Dafür wird bewusst eine zweite Firebase-App ohne Auth initialisiert; der
// TP-Personalmanagement-ID-Token wird den Functions explizit übergeben.
export const functionsApp = getApps().some(a => a.name === "tp-managementportal-functions")
  ? getApp("tp-managementportal-functions")
  : initializeApp({ projectId: "kalkpro-4cc29" }, "tp-managementportal-functions");

export const cloudFunctions = getFunctions(functionsApp, "europe-west1");

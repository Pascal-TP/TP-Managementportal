import { auth, db } from "./firebase.js";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

export const ROLE_LABELS = {
  employee: "Mitarbeiter",
  supervisor: "Vorgesetzter",
  admin: "Admin"
};

export function normalizeLogin(value = "") {
  const v = String(value).trim().toLowerCase();
  return v.includes("@") ? v : `${v}@portal.local`;
}

export function initials(name = "") {
  return String(name)
    .split(/\s+/)
    .filter(Boolean)
    .map(x => x[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "TP";
}

export async function login(identifier, password) {
  return signInWithEmailAndPassword(auth, normalizeLogin(identifier), password);
}

export async function logout() {
  return signOut(auth);
}

export async function requestPasswordReset(rawIdentifier) {
  const raw = String(rawIdentifier || "").trim();
  if (!raw) throw new Error("Bitte zuerst die E-Mail-Adresse eintragen.");
  if (!raw.includes("@")) throw new Error("Bei Benutzernamen erfolgt der Passwort-Reset derzeit über die Personalabteilung.");
  await sendPasswordResetEmail(auth, raw.toLowerCase());
}

export async function loadPortalProfile(user) {
  const snap = await getDoc(doc(db, "users", user.uid));
  if (!snap.exists()) throw new Error("Für diesen Zugang wurde noch kein Mitarbeiterprofil im TP-Personalmanagement angelegt.");

  const profile = { id: snap.id, ...snap.data() };
  if (profile.active === false) throw new Error("Dieser Benutzer ist deaktiviert.");
  if (profile.managementPortalAccess !== true) {
    throw new Error("Für diesen Benutzer ist das TP-Managementportal nicht freigeschaltet.");
  }
  if (!["employee", "supervisor", "admin"].includes(profile.role)) {
    throw new Error("Für diesen Benutzer ist keine gültige Rolle hinterlegt.");
  }
  return profile;
}

export function observeAuth(callback) {
  return onAuthStateChanged(auth, callback);
}

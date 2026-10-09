import { auth, db } from "./firebase.js";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { collection, doc, getDoc, getDocs, query, where } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

let portalDirectoryPromise = null;

async function loadPortalDirectory() {
  if (!portalDirectoryPromise) {
    portalDirectoryPromise = getDocs(collection(db, "managementPortalUsers"))
      .then(snap => snap.docs.map(d => ({ id: d.id, ...(d.data() || {}) })))
      .catch(err => {
        portalDirectoryPromise = null;
        throw err;
      });
  }
  return portalDirectoryPromise;
}

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


export async function loadQmUser() {
  try {
    const users = await loadPortalDirectory();
    const hit = users.find(v => {
      const name = String(v.name || "").trim().toLowerCase();
      const username = String(v.username || "").trim().toLowerCase();
      const email = String(v.email || "").trim().toLowerCase();
      return v.active !== false && v.managementPortalAccess === true && v.role === "admin" &&
        (name === "qm" || username === "qm" || email === "qm@portal.local");
    });
    if (!hit) return null;
    return { id: hit.id, name: String(hit.name || hit.email || "QM").trim(), email: hit.email || "", role: hit.role || "admin" };
  } catch (err) {
    console.warn("QM-Benutzer konnte nicht aus dem Portalverzeichnis geladen werden:", err);
    return null;
  }
}

export function canManagePortalDocuments(profile = {}) {
  if (["admin", "supervisor"].includes(profile.role)) return true;
  return profile.role === "employee" && profile.managementPortalDocumentAccess === true;
}

export async function loadAssignableColleagues() {
  const result = new Map();
  try {
    const users = await loadPortalDirectory();
    users.forEach(v => {
      if (v.active === false || v.managementPortalAccess !== true) return;
      const label = String(v.name || v.email || "").trim();
      if (!label) return;
      result.set(v.id, {
        id: v.id,
        name: label,
        email: v.email || "",
        role: v.role || "employee",
        documentAccess: canManagePortalDocuments(v)
      });
    });
  } catch (err) {
    console.warn("Kollegenliste konnte nicht vollständig geladen werden:", err);
  }
  return [...result.values()].sort((a, b) => a.name.localeCompare(b.name, "de"));
}

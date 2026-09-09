import { auth, db } from "./firebase.js";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { collection, doc, getDoc, getDocs, query, where } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

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
  const candidates = [
    query(collection(db, "users"), where("name", "==", "QM")),
    query(collection(db, "users"), where("email", "==", "qm@portal.local")),
    query(collection(db, "users"), where("username", "==", "QM")),
    query(collection(db, "users"), where("username", "==", "qm")),
  ];
  for (const q of candidates) {
    try {
      const snap = await getDocs(q);
      const hit = snap.docs.find(d => d.data()?.active !== false && d.data()?.role === "admin");
      if (hit) {
        const v = hit.data() || {};
        return { id: hit.id, name: String(v.name || v.email || "QM").trim(), email: v.email || "", role: v.role || "admin" };
      }
    } catch (err) {
      console.warn("QM-Benutzer konnte über eine Suchvariante nicht geladen werden:", err);
    }
  }
  return null;
}

export async function loadAssignableColleagues(profile, user) {
  const result = new Map();
  const addSnap = snap => {
    snap.forEach(d => {
      const v = d.data() || {};
      if (v.active === false) return;
      const label = String(v.name || v.email || "").trim();
      if (label) result.set(d.id, { id: d.id, name: label, email: v.email || "", role: v.role || "employee" });
    });
  };
  try {
    if (profile?.role === "admin") {
      addSnap(await getDocs(collection(db, "users")));
    } else if (profile?.role === "supervisor" && user?.uid) {
      addSnap(await getDocs(query(collection(db, "users"), where("supervisorId", "==", user.uid))));
      addSnap(await getDocs(query(collection(db, "users"), where("supervisorId2", "==", user.uid))));
    }
  } catch (err) {
    console.warn("Kollegenliste konnte nicht vollständig geladen werden:", err);
  }
  const selfLabel = String(profile?.name || profile?.email || "").trim();
  if (user?.uid && selfLabel) result.set(user.uid, { id: user.uid, name: selfLabel, email: profile?.email || "", role: profile?.role || "employee" });
  return [...result.values()].sort((a, b) => a.name.localeCompare(b.name, "de"));
}

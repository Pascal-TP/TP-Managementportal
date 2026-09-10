const META_KEY = "tpManagementPortal.documents.v03";
const DB_NAME = "tpManagementPortalFiles";
const STORE_NAME = "documents";
const DB_VERSION = 1;

export const DOCUMENT_TYPES = [
  "Arbeitsanweisung",
  "Verfahrensanweisung",
  "Betriebsanweisung",
  "Formular / Vorlage",
  "Monatsbericht",
  "Sicherheitsdatenblatt",
  "Richtlinie",
  "Zertifikat",
  "Bescheinigung / Nachweis",
  "Vertrag",
  "Sonstiges Dokument",
];

export const MANDATORY_WORKFLOW_TYPES = new Set([
  "Arbeitsanweisung",
  "Verfahrensanweisung",
  "Betriebsanweisung",
  "Formular / Vorlage",
  "Monatsbericht",
]);

export const QM_CONTROLLED_TYPES = MANDATORY_WORKFLOW_TYPES;

const PREFIX = {
  "Arbeitsanweisung": "AA",
  "Verfahrensanweisung": "VA",
  "Betriebsanweisung": "BA",
  "Formular / Vorlage": "FO",
  "Monatsbericht": "MB",
  "Sicherheitsdatenblatt": "SDB",
  Richtlinie: "RL",
  Zertifikat: "ZERT",
  "Bescheinigung / Nachweis": "NACH",
  Vertrag: "VER",
  "Sonstiges Dokument": "DOK",
};

function readMeta() {
  try {
    const data = JSON.parse(localStorage.getItem(META_KEY) || "[]");
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function writeMeta(rows) {
  localStorage.setItem(META_KEY, JSON.stringify(rows));
}

export function getDocuments() {
  return readMeta().sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
}

export function getDocument(id) {
  return readMeta().find((d) => d.id === id) || null;
}

function userKey(user = {}) {
  return {
    uid: String(user.uid || user.id || "").trim(),
    name: String(user.name || "").trim().toLowerCase(),
    email: String(user.email || "").trim().toLowerCase(),
  };
}

export function isDocumentCreator(document, user = {}) {
  const u = userKey(user);
  if (document?.createdById && u.uid) return document.createdById === u.uid;
  const createdBy = String(document?.createdBy || "").trim().toLowerCase();
  return Boolean(createdBy && (createdBy === u.name || createdBy === u.email));
}

export function isDocumentReviewer(document, user = {}) {
  const u = userKey(user);
  if (document?.workflowAssigneeId && u.uid) return document.workflowAssigneeId === u.uid;
  const assigned = String(document?.workflowAssignee || "").trim().toLowerCase();
  return Boolean(assigned && (assigned === u.name || assigned === u.email));
}

function isAdminUser(user = {}) {
  return String(user?.role || "").trim().toLowerCase() === "admin";
}

export function getDocumentVisibilityMode(document) {
  return document?.visibilityMode === "selected" ? "selected" : "all";
}

export function isDocumentVisibilityRecipient(document, user = {}) {
  if (getDocumentVisibilityMode(document) !== "selected") return true;
  const u = userKey(user);
  const ids = Array.isArray(document?.visibilityUserIds) ? document.visibilityUserIds.map(String) : [];
  if (u.uid && ids.includes(u.uid)) return true;
  const recipients = Array.isArray(document?.visibilityUsers) ? document.visibilityUsers : [];
  return recipients.some((entry) => {
    const r = userKey(entry || {});
    return Boolean(
      (u.uid && r.uid && u.uid === r.uid) ||
      (u.email && r.email && u.email === r.email) ||
      (u.name && r.name && u.name === r.name)
    );
  });
}

export function canViewDocument(document, user = {}) {
  if (!document || document.archived === true) return false;
  if (isAdminUser(user)) return true;
  if (document.status === "Freigegeben") {
    return isDocumentCreator(document, user) || isDocumentVisibilityRecipient(document, user);
  }
  return isDocumentCreator(document, user) || isDocumentReviewer(document, user) || isDocumentQmReviewer(document, user);
}

export function canAccessOriginal(document, user = {}) {
  return isDocumentCreator(document, user);
}

export function canAccessPdf(document, user = {}) {
  return canViewDocument(document, user);
}

export function getVisibleDocumentsForUser(user = {}) {
  return getDocuments().filter((d) => canViewDocument(d, user));
}

export function getVisibleDocumentsForEmployee(user = {}) {
  return getDocuments().filter((d) => d.status === "Freigegeben" && canViewDocument(d, user));
}

export function generateDocumentNumber(type) {
  const prefix = PREFIX[type] || "DOK";
  const same = readMeta().filter((d) => String(d.id || "").startsWith(prefix + "."));
  const max = same.reduce((m, d) => {
    const parts = String(d.id || "").split(".");
    const n = Number(parts[1]);
    return Number.isFinite(n) ? Math.max(m, n) : m;
  }, 0);
  return `${prefix}.${String(max + 1).padStart(3, "0")}.01`;
}

export function generateNextVersion(currentVersion = "") {
  const raw = String(currentVersion || "").trim();
  if (!raw || raw === "–") return "1.0";
  const match = raw.match(/^(\d+)(?:\.(\d+))?$/);
  if (!match) return raw;
  const major = Number(match[1]);
  const minor = Number(match[2] || 0);
  return `${major}.${minor + 1}`;
}

export function setDocumentVersionByQm(id, version, by = "") {
  const clean = String(version || "").trim();
  if (!clean) throw new Error("Bitte eine Version vergeben.");
  const rows = readMeta();
  const d = rows.find((x) => x.id === id);
  if (!d) throw new Error("Dokument wurde nicht gefunden.");
  const old = String(d.version || "–");
  d.version = clean;
  d.updatedAt = new Date().toISOString();
  d.history = Array.isArray(d.history) ? d.history : [];
  d.history.unshift({ at: d.updatedAt, action: `Version durch QM von „${old}“ auf „${clean}“ gesetzt`, by });
  writeMeta(rows);
  return d;
}

export function generateTemporaryDocumentId() {
  return `ENTW-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function getDisplayDocumentNumber(document) {
  if (!document) return "–";
  if (document.numberAssigned === false || String(document.id || "").startsWith("ENTW-")) return "–";
  return document.id || "–";
}

export function isDocumentQmReviewer(document, user = {}) {
  const u = userKey(user);
  if (document?.qmAssigneeId && u.uid) return document.qmAssigneeId === u.uid;
  const assigned = String(document?.qmAssignee || "").trim().toLowerCase();
  return Boolean(assigned && (assigned === u.name || assigned === u.email));
}

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function putFile(id, file) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put({ id, file, name: file.name, type: file.type, size: file.size });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function deleteStoredKey(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getStoredFile(id, variant = "source") {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(`${id}:${variant}`);
    req.onsuccess = () => {
      if (req.result) return resolve(req.result);
      const legacy = store.get(id);
      legacy.onsuccess = () => resolve(legacy.result || null);
      legacy.onerror = () => reject(legacy.error);
    };
    req.onerror = () => reject(req.error);
  });
}

function isPdf(file) {
  return Boolean(file && (file.type === "application/pdf" || /\.pdf$/i.test(file.name || "")));
}

export async function createDocument(payload, sourceFile, pdfFile = null) {
  if (!sourceFile) throw new Error("Bitte die Originaldatei auswählen oder hineinziehen.");
  const readingFile = isPdf(sourceFile) ? sourceFile : pdfFile;
  if (!readingFile || !isPdf(readingFile)) {
    throw new Error("Bitte zusätzlich eine PDF-Lesefassung hochladen. Andere Nutzer dürfen ausschließlich die PDF-Version öffnen.");
  }

  const rows = readMeta();
  const now = new Date().toISOString();
  const id = payload.id || generateTemporaryDocumentId();
  if (rows.some((d) => d.id === id)) throw new Error("Die interne Dokument-ID ist bereits vorhanden.");
  const numberRequired = Boolean(payload.numberRequired);
  const initialStatus = payload.workflowEnabled ? "In Prüfung" : numberRequired ? "QM-Prüfung" : "Freigegeben";

  const doc = {
    id,
    numberRequired,
    numberAssigned: numberRequired ? false : true,
    title: payload.title.trim(),
    type: payload.type,
    area: payload.area.trim() || "Allgemein",
    company: payload.company,
    version: payload.version || (numberRequired ? "–" : "1.0"),
    status: initialStatus,
    owner: payload.owner || "",
    review: payload.review || "–",
    note: payload.note?.trim() || "",
    workflowEnabled: Boolean(payload.workflowEnabled),
    workflowMandatory: Boolean(payload.workflowMandatory),
    workflowAssignee: payload.workflowAssignee?.trim() || "",
    workflowAssigneeId: payload.workflowAssigneeId || "",
    qmAssignee: "",
    qmAssigneeId: "",
    visibilityMode: payload.visibilityMode === "selected" ? "selected" : "all",
    visibilityUserIds: payload.visibilityMode === "selected" && Array.isArray(payload.visibilityUserIds) ? [...new Set(payload.visibilityUserIds.map(String).filter(Boolean))] : [],
    visibilityUsers: payload.visibilityMode === "selected" && Array.isArray(payload.visibilityUsers) ? payload.visibilityUsers.map((u) => ({ id: String(u.id || u.uid || ""), uid: String(u.uid || u.id || ""), name: String(u.name || ""), email: String(u.email || "") })) : [],
    fileName: sourceFile.name,
    fileType: sourceFile.type || "application/octet-stream",
    fileSize: sourceFile.size,
    pdfFileName: readingFile.name,
    pdfFileType: readingFile.type || "application/pdf",
    pdfFileSize: readingFile.size,
    createdAt: now,
    updatedAt: now,
    createdBy: payload.createdBy || "",
    createdById: payload.createdById || "",
    archived: false,
    history: [{
      at: now,
      action: payload.workflowEnabled ? "Dokument eingestellt und Freigabeworkflow gestartet" : numberRequired ? "Dokument eingestellt und zur Nummernvergabe an QM weitergeleitet" : "Dokument eingestellt und veröffentlicht",
      by: payload.createdBy || "",
    }],
  };

  await putFile(`${id}:source`, sourceFile);
  await putFile(`${id}:pdf`, readingFile);
  rows.push(doc);
  writeMeta(rows);
  return doc;
}

export function updateDocumentMetadata(id, patch, by = "") {
  const rows = readMeta();
  const d = rows.find((x) => x.id === id);
  if (!d) return null;
  for (const key of ["title", "area", "company", "review", "note", "version"]) {
    if (patch[key] !== undefined) d[key] = String(patch[key]).trim();
  }
  if (patch.visibilityMode !== undefined) {
    d.visibilityMode = patch.visibilityMode === "selected" ? "selected" : "all";
  }
  if (patch.visibilityUserIds !== undefined) {
    d.visibilityUserIds = d.visibilityMode === "selected" && Array.isArray(patch.visibilityUserIds)
      ? [...new Set(patch.visibilityUserIds.map(String).filter(Boolean))]
      : [];
  }
  if (patch.visibilityUsers !== undefined) {
    d.visibilityUsers = d.visibilityMode === "selected" && Array.isArray(patch.visibilityUsers)
      ? patch.visibilityUsers.map((u) => ({ id: String(u.id || u.uid || ""), uid: String(u.uid || u.id || ""), name: String(u.name || ""), email: String(u.email || "") }))
      : [];
  }
  d.updatedAt = new Date().toISOString();
  d.history = Array.isArray(d.history) ? d.history : [];
  d.history.unshift({ at: d.updatedAt, action: "Dokumentdaten angepasst", by });
  writeMeta(rows);
  return d;
}

export function updateDocumentStatus(id, status, by = "", note = "") {
  const rows = readMeta();
  const d = rows.find((x) => x.id === id);
  if (!d) return null;
  d.status = status;
  d.updatedAt = new Date().toISOString();
  d.history = Array.isArray(d.history) ? d.history : [];
  const suffix = note ? ` · Anmerkung: ${note}` : "";
  d.history.unshift({ at: d.updatedAt, action: `Status auf „${status}“ gesetzt${suffix}`, by });
  writeMeta(rows);
  return d;
}

export async function replaceDocumentFiles(id, sourceFile, pdfFile, payload = {}, by = "") {
  const rows = readMeta();
  const d = rows.find((x) => x.id === id);
  if (!d) throw new Error("Dokument wurde nicht gefunden.");
  if (!sourceFile) throw new Error("Bitte die überarbeitete Originaldatei auswählen.");
  const readingFile = isPdf(sourceFile) ? sourceFile : pdfFile;
  if (!readingFile || !isPdf(readingFile)) throw new Error("Bitte zusätzlich die überarbeitete PDF-Lesefassung hochladen.");

  await putFile(`${id}:source`, sourceFile);
  await putFile(`${id}:pdf`, readingFile);
  const now = new Date().toISOString();
  d.fileName = sourceFile.name;
  d.fileType = sourceFile.type || "application/octet-stream";
  d.fileSize = sourceFile.size;
  d.pdfFileName = readingFile.name;
  d.pdfFileType = readingFile.type || "application/pdf";
  d.pdfFileSize = readingFile.size;
  if (payload.version !== undefined) d.version = String(payload.version || d.version).trim();
  if (payload.note !== undefined) d.note = String(payload.note || "").trim();
  if (payload.workflowAssignee !== undefined) d.workflowAssignee = String(payload.workflowAssignee || "").trim();
  if (payload.workflowAssigneeId !== undefined) d.workflowAssigneeId = String(payload.workflowAssigneeId || "").trim();
  d.workflowEnabled = Boolean(payload.workflowEnabled ?? d.workflowEnabled);
  d.qmAssignee = "";
  d.qmAssigneeId = "";
  d.status = d.workflowEnabled ? "In Prüfung" : d.numberRequired ? "QM-Prüfung" : "Freigegeben";
  d.updatedAt = now;
  d.history = Array.isArray(d.history) ? d.history : [];
  d.history.unshift({
    at: now,
    action: d.workflowEnabled ? "Dokument überarbeitet, Dateien ersetzt und Workflow neu gestartet" : d.numberRequired ? "Dokument überarbeitet und erneut an QM weitergeleitet" : "Dokument überarbeitet und neu veröffentlicht",
    by,
  });
  writeMeta(rows);
  return d;
}

export function sendDocumentToQm(id, qmUser, by = "", note = "") {
  const rows = readMeta();
  const d = rows.find((x) => x.id === id);
  if (!d) return null;
  d.status = "QM-Prüfung";
  d.qmAssignee = String(qmUser?.name || qmUser?.email || "QM").trim();
  d.qmAssigneeId = String(qmUser?.id || "").trim();
  d.updatedAt = new Date().toISOString();
  d.history = Array.isArray(d.history) ? d.history : [];
  const suffix = note ? ` · Hinweis aus Prüfung: ${note}` : "";
  d.history.unshift({ at: d.updatedAt, action: `Fachliche Prüfung abgeschlossen; an QM zur Dokumentnummern- und Versionsvergabe weitergeleitet${suffix}`, by });
  writeMeta(rows);
  return d;
}

export function markDocumentNumberAssigned(id, by = "") {
  const rows = readMeta();
  const d = rows.find((x) => x.id === id);
  if (!d) return null;
  d.numberAssigned = true;
  d.updatedAt = new Date().toISOString();
  d.history = Array.isArray(d.history) ? d.history : [];
  d.history.unshift({ at: d.updatedAt, action: "Dokumentnummer durch QM endgültig vergeben", by });
  writeMeta(rows);
  return d;
}

export async function renameDocumentNumber(oldId, newId, by = "") {
  const clean = String(newId || "").trim();
  if (!clean) throw new Error("Bitte eine Dokumentnummer eingeben.");
  if (oldId === clean) return getDocument(oldId);
  const rows = readMeta();
  if (rows.some((d) => d.id === clean)) throw new Error("Die neue Dokumentnummer ist bereits vorhanden.");
  const d = rows.find((x) => x.id === oldId);
  if (!d) throw new Error("Dokument wurde nicht gefunden.");

  for (const variant of ["source", "pdf"]) {
    const stored = await getStoredFile(oldId, variant);
    if (stored?.file) await putFile(`${clean}:${variant}`, stored.file);
  }
  await deleteStoredKey(`${oldId}:source`).catch(() => {});
  await deleteStoredKey(`${oldId}:pdf`).catch(() => {});
  await deleteStoredKey(oldId).catch(() => {});

  const now = new Date().toISOString();
  d.id = clean;
  d.updatedAt = now;
  d.history = Array.isArray(d.history) ? d.history : [];
  d.history.unshift({ at: now, action: `Dokumentnummer von „${oldId}“ auf „${clean}“ geändert`, by });
  writeMeta(rows);
  return d;
}

export function archiveDocument(id, by = "") {
  const rows = readMeta();
  const d = rows.find((x) => x.id === id);
  if (!d) return null;
  d.archived = true;
  d.status = "Archiviert";
  d.updatedAt = new Date().toISOString();
  d.history = Array.isArray(d.history) ? d.history : [];
  d.history.unshift({ at: d.updatedAt, action: "Dokument archiviert", by });
  writeMeta(rows);
  return d;
}

export async function deleteDocument(id) {
  const rows = readMeta();
  const next = rows.filter((x) => x.id !== id);
  if (next.length === rows.length) return false;
  writeMeta(next);
  await deleteStoredKey(`${id}:source`).catch(() => {});
  await deleteStoredKey(`${id}:pdf`).catch(() => {});
  await deleteStoredKey(id).catch(() => {});
  return true;
}

async function openStoredVariant(id, variant) {
  const stored = await getStoredFile(id, variant);
  if (!stored?.file) throw new Error(variant === "pdf" ? "Zu diesem Dokument ist keine PDF-Lesefassung gespeichert." : "Zu diesem Dokument ist keine Originaldatei gespeichert.");
  const url = URL.createObjectURL(stored.file);
  window.open(url, "_blank", "noopener");
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

async function downloadStoredVariant(id, variant) {
  const stored = await getStoredFile(id, variant);
  if (!stored?.file) throw new Error(variant === "pdf" ? "Zu diesem Dokument ist keine PDF-Lesefassung gespeichert." : "Zu diesem Dokument ist keine Originaldatei gespeichert.");
  const url = URL.createObjectURL(stored.file);
  const a = document.createElement("a");
  a.href = url;
  a.download = stored.name || (variant === "pdf" ? "Dokument.pdf" : "Dokument");
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

export const downloadOriginalFile = (id) => downloadStoredVariant(id, "source");
export const openPdfFile = (id) => openStoredVariant(id, "pdf");

export function clearPrototypeDocuments() {
  localStorage.removeItem(META_KEY);
}

const META_KEY = "tpManagementPortal.documents.v03";
const DB_NAME = "tpManagementPortalFiles";
const STORE_NAME = "documents";
const DB_VERSION = 1;

export const DOCUMENT_TYPES = [
  "Arbeitsanweisung",
  "Verfahrensanweisung",
  "Betriebsanweisung",
  "Formular / Vorlage",
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
]);

const PREFIX = {
  "Arbeitsanweisung": "AA",
  "Verfahrensanweisung": "VA",
  "Betriebsanweisung": "BA",
  "Formular / Vorlage": "FO",
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

export function canViewDocument(document, user = {}) {
  if (!document || document.archived === true) return false;
  if (document.status === "Freigegeben") return true;
  return isDocumentCreator(document, user) || isDocumentReviewer(document, user);
}

export function canAccessOriginal(document, user = {}) {
  return isDocumentCreator(document, user);
}

export function canAccessPdf(document, user = {}) {
  if (!document || document.archived === true) return false;
  if (document.status === "Freigegeben") return true;
  return isDocumentCreator(document, user) || isDocumentReviewer(document, user);
}

export function getVisibleDocumentsForUser(user = {}) {
  return getDocuments().filter((d) => canViewDocument(d, user));
}

export function getVisibleDocumentsForEmployee() {
  return getDocuments().filter((d) => d.status === "Freigegeben" && d.archived !== true);
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

export async function getStoredFile(id, variant = "source") {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(`${id}:${variant}`);
    req.onsuccess = () => {
      if (req.result) return resolve(req.result);
      // Kompatibilität mit frühen V0.3-Dokumenten, die nur unter der Dokumentnummer gespeichert wurden.
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
  const id = payload.id || generateDocumentNumber(payload.type);
  if (rows.some((d) => d.id === id)) throw new Error("Die Dokumentnummer ist bereits vorhanden.");

  const doc = {
    id,
    title: payload.title.trim(),
    type: payload.type,
    area: payload.area.trim() || "Allgemein",
    company: payload.company,
    version: payload.version || "1.0",
    status: payload.workflowEnabled ? "In Prüfung" : "Freigegeben",
    owner: payload.owner || "",
    review: payload.review || "–",
    note: payload.note?.trim() || "",
    workflowEnabled: Boolean(payload.workflowEnabled),
    workflowMandatory: Boolean(payload.workflowMandatory),
    workflowAssignee: payload.workflowAssignee?.trim() || "",
    workflowAssigneeId: payload.workflowAssigneeId || "",
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
    history: [
      {
        at: now,
        action: payload.workflowEnabled ? "Dokument eingestellt und Freigabeworkflow gestartet" : "Dokument eingestellt und veröffentlicht",
        by: payload.createdBy || "",
      },
    ],
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
  d.updatedAt = new Date().toISOString();
  d.history = Array.isArray(d.history) ? d.history : [];
  d.history.unshift({ at: d.updatedAt, action: "Dokumentdaten angepasst", by });
  writeMeta(rows);
  return d;
}

export function updateDocumentStatus(id, status, by = "") {
  const rows = readMeta();
  const d = rows.find((x) => x.id === id);
  if (!d) return null;
  d.status = status;
  d.updatedAt = new Date().toISOString();
  d.history = Array.isArray(d.history) ? d.history : [];
  d.history.unshift({ at: d.updatedAt, action: `Status auf „${status}“ gesetzt`, by });
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

export const openOriginalFile = (id) => openStoredVariant(id, "source");
export const downloadOriginalFile = (id) => downloadStoredVariant(id, "source");
export const openPdfFile = (id) => openStoredVariant(id, "pdf");
export const downloadPdfFile = (id) => downloadStoredVariant(id, "pdf");

export function clearPrototypeDocuments() {
  localStorage.removeItem(META_KEY);
}

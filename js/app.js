import {
  login,
  logout,
  requestPasswordReset,
  loadPortalProfile,
  loadAssignableColleagues,
  observeAuth,
  ROLE_LABELS,
  initials
} from "./auth.js";
import {
  DOCUMENT_TYPES,
  MANDATORY_WORKFLOW_TYPES,
  getDocuments,
  getDocument,
  getVisibleDocumentsForEmployee,
  getVisibleDocumentsForUser,
  canViewDocument,
  canAccessOriginal,
  canAccessPdf,
  isDocumentCreator,
  generateDocumentNumber,
  createDocument,
  updateDocumentMetadata,
  updateDocumentStatus,
  replaceDocumentFiles,
  renameDocumentNumber,
  archiveDocument,
  deleteDocument,
  downloadOriginalFile,
  openPdfFile
} from "./documents.js";
import {
  createWorkflowTask,
  getWorkflowTasks,
  getWorkflowTasksVisibleToUser,
  getTasksForUser,
  getRejectedTasksForCreator,
  decideWorkflowTask,
  renameWorkflowDocument,
  deleteWorkflowTasksForDocument
} from "./workflows.js";

const companies = [
  "Alle Unternehmen",
  "TP Holding GmbH",
  "Norddeutsche Flächenheizsysteme GmbH",
  "TGA Systemtechnik GmbH",
  "Ulf Roesler GmbH",
];
const companyMeta = {
  "TP Holding GmbH": { logo: "assets/tp.png", short: "TP Holding" },
  "Norddeutsche Flächenheizsysteme GmbH": { logo: "assets/ndf.png", short: "NDF" },
  "TGA Systemtechnik GmbH": { logo: "assets/tga.png", short: "TGA Systemtechnik" },
  "Ulf Roesler GmbH": { logo: "assets/ur.png", short: "Ulf Roesler" },
};
const areas = ["Allgemein", "Arbeitssicherheit", "Personal", "Fuhrpark", "Qualitätsmanagement", "Einkauf / Lager", "Gebäudetechnik", "IT", "Vertrieb"];
const fullNav = [
  ["dashboard", "▦", "Dashboard"],
  ["documents", "▤", "Dokumentenregister"],
  ["workflow", "✓", "Freigaben & Aufgaben"],
  ["deadlines", "◷", "Fristen & Wiedervorlagen"],
  ["areas", "▣", "Öffentliche Bereiche"],
  ["myfiles", "▱", "Meine Dateien"],
  ["shared", "♧", "Für mich freigegeben"],
  ["companies", "⌂", "Unternehmen"],
  ["archive", "▱", "Archiv / Historie"],
];
const employeeNav = [
  ["dashboard", "▦", "Dashboard"],
  ["documents", "▤", "Dokumentenregister"],
  ["areas", "▣", "Öffentliche Bereiche"],
  ["myfiles", "▱", "Meine Dateien"],
  ["shared", "♧", "Für mich freigegeben"],
];

let current = "dashboard";
let portalView = "employee";
let currentProfile = null;
let currentUser = null;
let colleagues = [];
let pendingUploadFile = null;
let pendingPdfFile = null;
const content = document.querySelector("#content");
const title = document.querySelector("#page-title");
const subtitle = document.querySelector("#page-subtitle");
const modal = document.querySelector("#modal");
const modalContent = document.querySelector("#modal-content");

function esc(s = "") {
  return String(s).replace(/[&<>"']/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"})[m]);
}
function fmtDate(value) {
  if (!value || value === "–") return "–";
  const d = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  return Number.isNaN(d.getTime()) ? esc(value) : d.toLocaleDateString("de-DE");
}
function fmtDateTime(value) {
  if (!value) return "–";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? esc(value) : d.toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" });
}
function humanSize(bytes = 0) {
  if (!bytes) return "0 KB";
  const units = ["B", "KB", "MB", "GB"];
  let v = bytes, i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(i ? 1 : 0)} ${units[i]}`;
}
function status(s) {
  const c = s === "Freigegeben" ? "good" : s === "In Prüfung" ? "warn" : s === "Abgelehnt" ? "bad" : s === "Archiviert" ? "gray" : "info";
  return `<span class="badge ${c}"><i class="dot"></i>${esc(s)}</span>`;
}
function emptyState(titleText, text, button = "") {
  return `<div class="empty-state"><div class="empty-icon">▤</div><strong>${esc(titleText)}</strong><p>${esc(text)}</p>${button}</div>`;
}
function initNav() {
  const nav = portalView === "employee" ? employeeNav : fullNav;
  document.querySelector("#main-nav").innerHTML = nav.map(([id, ic, l]) => `<button class="nav-btn ${id === current ? "active" : ""}" data-page="${id}"><span class="icon">${ic}</span>${l}</button>`).join("");
  document.querySelectorAll("#main-nav [data-page]").forEach(b => b.onclick = () => render(b.dataset.page));
}
function setHead(t, s) { title.textContent = t; subtitle.textContent = s; }
function render(page) {
  if (!currentProfile) return;
  if (page === "settings" && currentProfile.role !== "admin") page = "dashboard";
  if (portalView === "employee" && !employeeNav.some(x => x[0] === page)) page = "dashboard";
  current = page;
  initNav();
  const views = portalView === "employee"
    ? { dashboard: renderEmployeeDashboard, documents: renderEmployeeDocuments, areas: renderAreas, myfiles: renderMyFiles, shared: renderShared }
    : { dashboard: renderDashboard, documents: renderDocuments, workflow: renderWorkflow, deadlines: renderDeadlines, areas: renderAreas, companies: renderCompanies, archive: renderArchive, myfiles: renderMyFiles, shared: renderShared, settings: renderSettings };
  (views[page] || views.dashboard)();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function taskRow(task, own = false) {
  const action = own
    ? `<div class="task-actions"><span class="workflow-status">Zu prüfen</span><button class="btn small" onclick="openReviewTask('${task.id}')">Prüfen</button></div>`
    : `<span class="workflow-status">${task.status === "Offen" ? "Zu prüfen" : esc(task.status)}</span>`;
  return `<div class="task workflow-task"><div class="task-icon">✓</div><div><strong>${esc(task.documentId)} · ${esc(task.documentTitle)}</strong><span>${esc(task.documentType)} · Aufgabe für ${esc(task.assignee)}</span></div>${action}</div>`;
}
function renderDashboard() {
  setHead("Dashboard", "Zentrale Übersicht des integrierten Managementsystems.");
  const actor = { ...currentProfile, uid: currentUser?.uid };
  const docs = getVisibleDocumentsForUser(actor).filter(d => !d.archived);
  const approved = docs.filter(d => d.status === "Freigegeben").length;
  const myTasks = getTasksForUser(currentProfile);
  const rejected = getRejectedTasksForCreator(actor, docs);
  const openAll = getWorkflowTasksVisibleToUser(actor).filter(t => t.status === "Offen").length;
  const recent = docs.slice(0, 5);
  const feedback = rejected.length ? `<div class="card rejection-card"><div class="card-head"><div><h2>Zur Überarbeitung zurückgegeben</h2><p>Diese Dokumente wurden abgelehnt. Der Ablehnungsgrund ist hinterlegt; anschließend können neue Dateien hochgeladen und der Workflow neu gestartet werden.</p></div></div><div class="task-list">${rejected.map(t => `<div class="task workflow-task"><div class="task-icon">!</div><div><strong>${esc(t.documentId)} · ${esc(t.documentTitle)}</strong><span>${t.decisionNote ? `Grund: ${esc(t.decisionNote)}` : "Dokument wurde zur Überarbeitung zurückgegeben."}</span></div><button class="btn small" onclick="openRevisionDoc('${t.documentId}')">Überarbeiten</button></div>`).join("")}</div></div>` : "";
  content.innerHTML = `
    <div class="kpi-grid"><div class="kpi"><span>Freigegebene Dokumente</span><strong>${approved}</strong><small>aktuell veröffentlicht</small></div><div class="kpi warn"><span>Offene Workflows</span><strong>${openAll}</strong><small>${myTasks.length} Aufgabe(n) für Sie</small></div><div class="kpi"><span>Dokumente gesamt</span><strong>${docs.length}</strong><small>ohne Archiv</small></div><div class="kpi"><span>Unternehmen</span><strong>4</strong><small>zentral filterbar</small></div></div>
    ${feedback}
    <div class="two-col"><div class="card"><div class="card-head"><div><h2>Meine offenen Aufgaben</h2><p>Freigaben, die Ihnen persönlich zugewiesen wurden.</p></div><button class="btn secondary small" onclick="render('workflow')">Alle Aufgaben</button></div>${myTasks.length ? `<div class="task-list">${myTasks.map(t => taskRow(t, true)).join("")}</div>` : emptyState("Keine offenen Aufgaben", "Aktuell ist Ihnen kein Freigabeworkflow zugewiesen.")}</div>
    <div class="card"><div class="card-head"><div><h2>Dokumentenlenkung</h2><p>Neue Dokumente direkt hochladen und bei Bedarf einen Freigabeworkflow starten.</p></div></div><div class="quick-create"><strong>Neues Dokument einstellen</strong><p>Arbeits-, Verfahrens- und Betriebsanweisungen benötigen zwingend eine Freigabe. Bei allen anderen Dokumentarten kann der Workflow optional zugeschaltet werden.</p><button class="btn" onclick="openNewDoc()">+ Neues Dokument</button></div></div></div>
    <div class="card"><div class="card-head"><div><h2>Zuletzt eingestellte Dokumente</h2><p>Die zuletzt angelegten Dokumente im Portal.</p></div><button class="btn secondary" onclick="render('documents')">Dokumentenregister</button></div>${recent.length ? docTable(recent) : emptyState("Noch keine Dokumente vorhanden", "Legen Sie das erste Dokument an.", '<button class="btn" onclick="openNewDoc()">+ Erstes Dokument anlegen</button>')}</div>`;
}

function employeeDocs() { return getVisibleDocumentsForEmployee(); }
function employeeDocTable(rows) {
  if (!rows.length) return emptyState("Keine freigegebenen Dokumente", "Sobald ein Dokument freigegeben wurde, erscheint es hier automatisch.");
  return `<div class="table-wrap"><table class="data-table"><thead><tr><th>Nr.</th><th>Dokument</th><th>Dokumentart</th><th>Unternehmen</th><th>Bereich</th><th>Version</th></tr></thead><tbody>${rows.map(d => `<tr><td><strong>${esc(d.id)}</strong></td><td><div class="doc-title" onclick="openDoc('${d.id}')">${esc(d.title)}<small>${esc(d.pdfFileName || "PDF-Lesefassung")}</small></div></td><td>${esc(d.type)}</td><td>${esc(d.company)}</td><td>${esc(d.area)}</td><td>${esc(d.version)}</td></tr>`).join("")}</tbody></table></div>`;
}
function renderEmployeeDashboard() {
  setHead("Dashboard", "Aktuelle Informationen und freigegebene Dokumente für Beschäftigte.");
  const rows = employeeDocs();
  const recent = rows.slice(0, 5);
  content.innerHTML = `<div class="employee-welcome"><div><span class="employee-eyebrow">Mitarbeiterportal</span><h2>Alles Wichtige an einer Stelle</h2><p>Hier stehen die freigegebenen Unternehmensdokumente zur Verfügung. Neue oder geänderte Inhalte werden nach ihrer Freigabe automatisch sichtbar.</p></div><button class="btn" onclick="render('documents')">Zum Dokumentenregister</button></div><div class="kpi-grid employee-kpis"><div class="kpi"><span>Freigegebene Dokumente</span><strong>${rows.length}</strong><small>für Ihre Ansicht verfügbar</small></div><div class="kpi"><span>Unternehmen</span><strong>4</strong><small>zentral filterbar</small></div><div class="kpi"><span>Öffentliche Bereiche</span><strong>9</strong><small>Informationen & Vorlagen</small></div><div class="kpi"><span>Persönlicher Bereich</span><strong>1</strong><small>Meine Dateien</small></div></div><div class="card"><div class="card-head"><div><h2>Aktuelle Dokumente</h2><p>Zuletzt freigegebene Inhalte.</p></div><button class="btn secondary" onclick="render('documents')">Alle Dokumente</button></div>${employeeDocTable(recent)}</div>`;
}
function renderEmployeeDocuments() {
  setHead("Dokumentenregister", "Freigegebene Unternehmensdokumente zentral abrufen.");
  const rows = employeeDocs();
  const types = ["Alle Dokumentarten", ...new Set(rows.map(x => x.type))];
  content.innerHTML = `<div class="info-strip"><strong>Mitarbeiteransicht:</strong> Hier werden ausschließlich freigegebene Dokumente angezeigt.</div><div class="card"><div class="card-head"><div><h2>Dokumentenregister</h2><p>Gültige Dokumente suchen und filtern.</p></div></div><div class="filter-bar employee-filter"><input id="eq" placeholder="Dokumentnummer oder Titel suchen…"><select id="ec">${companies.map(x => `<option>${x}</option>`).join("")}</select><select id="ea"><option>Alle Bereiche</option>${[...new Set(rows.map(x => x.area))].map(x => `<option>${esc(x)}</option>`).join("")}</select><select id="et">${types.map(x => `<option>${esc(x)}</option>`).join("")}</select><button class="btn secondary" id="ereset">Zurücksetzen</button></div><div id="employee-docs-table">${employeeDocTable(rows)}</div></div>`;
  ["eq","ec","ea","et"].forEach(id => document.querySelector("#" + id).oninput = filterEmployeeDocs);
  document.querySelector("#ereset").onclick = renderEmployeeDocuments;
}
function filterEmployeeDocs() {
  const q = document.querySelector("#eq").value.toLowerCase(), c = document.querySelector("#ec").value, a = document.querySelector("#ea").value, t = document.querySelector("#et").value;
  const rows = employeeDocs().filter(d => (!q || `${d.id} ${d.title} ${d.type}`.toLowerCase().includes(q)) && (c === "Alle Unternehmen" || d.company === c || d.company === "Alle Unternehmen") && (a === "Alle Bereiche" || d.area === a) && (t === "Alle Dokumentarten" || d.type === t));
  document.querySelector("#employee-docs-table").innerHTML = employeeDocTable(rows);
}

function docTable(rows) {
  if (!rows.length) return emptyState("Keine Dokumente vorhanden", "Für die gewählten Filter wurden keine Dokumente gefunden.");
  return `<div class="table-wrap"><table class="data-table"><thead><tr><th>Nr.</th><th>Dokument</th><th>Unternehmen</th><th>Bereich</th><th>Version</th><th>Status</th><th>Nächste Prüfung</th></tr></thead><tbody>${rows.map(d => `<tr><td><strong>${esc(d.id)}</strong></td><td><div class="doc-title" onclick="openDoc('${d.id}')">${esc(d.title)}<small>${esc(d.type)} · ${esc(d.pdfFileName || "PDF-Lesefassung")}</small></div></td><td>${esc(d.company)}</td><td>${esc(d.area)}</td><td>${esc(d.version)}</td><td>${status(d.status)}</td><td>${fmtDate(d.review)}</td></tr>`).join("")}</tbody></table></div>`;
}
function renderDocuments() {
  setHead("Dokumentenregister", "Dokumente zentral suchen, filtern und verwalten.");
  const docs = getVisibleDocumentsForUser({ ...currentProfile, uid: currentUser?.uid }).filter(d => !d.archived);
  content.innerHTML = `<div class="card"><div class="card-head"><div><h2>Dokumentenregister</h2><p>Dokumente einschließlich Version, Freigabestatus und Wiedervorlage.</p></div><button class="btn" onclick="openNewDoc()">+ Neues Dokument</button></div><div class="filter-bar"><input id="q" placeholder="Dokumentnummer oder Titel suchen…"><select id="fc">${companies.map(x => `<option>${x}</option>`).join("")}</select><select id="fa"><option>Alle Bereiche</option>${[...new Set(docs.map(x => x.area))].map(x => `<option>${esc(x)}</option>`).join("")}</select><select id="fs"><option>Alle Status</option><option>Freigegeben</option><option>In Prüfung</option><option>Abgelehnt</option></select><button class="btn secondary" id="reset">Zurücksetzen</button></div><div id="docs-table">${docTable(docs)}</div></div>`;
  ["q","fc","fa","fs"].forEach(id => document.querySelector("#" + id).oninput = filterDocs);
  document.querySelector("#reset").onclick = renderDocuments;
}
function filterDocs() {
  const docs = getVisibleDocumentsForUser({ ...currentProfile, uid: currentUser?.uid }).filter(d => !d.archived);
  const q = document.querySelector("#q").value.toLowerCase(), c = document.querySelector("#fc").value, a = document.querySelector("#fa").value, s = document.querySelector("#fs").value;
  const rows = docs.filter(d => (!q || `${d.id} ${d.title} ${d.type}`.toLowerCase().includes(q)) && (c === "Alle Unternehmen" || d.company === c || d.company === "Alle Unternehmen") && (a === "Alle Bereiche" || d.area === a) && (s === "Alle Status" || d.status === s));
  document.querySelector("#docs-table").innerHTML = docTable(rows);
}

function renderWorkflow() {
  setHead("Freigaben & Aufgaben", "Dokumente gezielt Kollegen zur Prüfung und Freigabe zuweisen.");
  const actor = { ...currentProfile, uid: currentUser?.uid };
  const all = getWorkflowTasksVisibleToUser(actor);
  const open = all.filter(t => t.status === "Offen");
  const mine = getTasksForUser(actor);
  const completed = all.filter(t => t.status === "Freigegeben" || t.status === "Abgelehnt");
  content.innerHTML = `<div class="kpi-grid"><div class="kpi warn"><span>Meine offenen Aufgaben</span><strong>${mine.length}</strong><small>persönlich zugewiesen</small></div><div class="kpi"><span>Offene Workflows</span><strong>${open.length}</strong><small>für Sie sichtbar</small></div><div class="kpi"><span>Abgeschlossene Prüfungen</span><strong>${completed.length}</strong><small>freigegeben oder abgelehnt</small></div><div class="kpi"><span>Pflicht-Workflow</span><strong>3</strong><small>AA · VA · BA</small></div></div><div class="card"><div class="card-head"><div><h2>Meine Aufgaben</h2><p>Der Status ist nur eine Information. Über „Prüfen“ öffnen Sie die eigentliche Prüfung mit PDF, Anmerkung, Freigabe und Ablehnung.</p></div></div>${mine.length ? `<div class="task-list">${mine.map(t => taskRow(t, true)).join("")}</div>` : emptyState("Keine Aufgabe für Sie", "Ihnen ist aktuell kein Dokument zur Prüfung/Freigabe zugewiesen.")}</div><div class="card"><div class="card-head"><div><h2>Alle laufenden Workflows</h2><p>Übersicht der gestarteten Dokumentenfreigaben.</p></div></div>${open.length ? `<div class="task-list">${open.map(t => taskRow(t, false)).join("")}</div>` : emptyState("Keine laufenden Workflows", "Beim Anlegen eines Dokuments kann ein Workflow gestartet werden.")}</div>`;
}
function renderDeadlines() {
  setHead("Fristen & Wiedervorlagen", "Befristungen und regelmäßige Prüfungen im Blick behalten.");
  const docs = getVisibleDocumentsForUser({ ...currentProfile, uid: currentUser?.uid }).filter(d => !d.archived && d.review && d.review !== "–").sort((a,b) => String(a.review).localeCompare(String(b.review)));
  content.innerHTML = `<div class="info-strip">Neben Dokumenten sollen hier später auch <strong>befristete Bescheide, Steuerbefreiungen, Zertifikate, Verträge oder Genehmigungen</strong> mit automatischen Erinnerungen überwacht werden.</div><div class="card"><div class="card-head"><div><h2>Aktive Wiedervorlagen</h2><p>Aus den bereits eingestellten Dokumenten.</p></div></div>${docs.length ? `<div class="task-list">${docs.map(d => `<div class="task"><div class="task-icon">◷</div><div><strong>${esc(d.id)} · ${esc(d.title)}</strong><span>${esc(d.company)} · ${esc(d.area)}</span></div><div class="deadline">${fmtDate(d.review)}</div></div>`).join("")}</div>` : emptyState("Noch keine Wiedervorlagen", "Eine Wiedervorlage entsteht, sobald beim Dokument ein Prüfdatum eingetragen wird.")}</div>`;
}

function renderAreas() {
  setHead("Öffentliche Bereiche", "Zentrale Dateien und Informationen für alle Beschäftigten.");
  const folders = [["📁","Ansprechpartner","Kontaktdaten und Zuständigkeiten"],["📁","Arbeitssicherheit","Informationen, Hinweise und Unterlagen"],["📁","Doku-Management","Allgemeine Dokumentation"],["📁","Flyer_Unternehmenspräsentation","Freigegebene Flyer und Präsentationen"],["📁","Fotos","Öffentlich bereitgestellte Unternehmensfotos"],["📁","Geburtstagsliste","Aktuelle Geburtstagsübersicht"],["📁","Organigramm","Organigramme des Unternehmensverbunds"],["📁","Video","Freigegebene Videos"],["📁","Vorlagen & Layouts","Word-, Excel- und Layoutvorlagen zum Download"]];
  content.innerHTML = `<div class="card"><div class="card-head"><div><h2>Öffentlicher Bereich</h2><p>Gemeinsam genutzte Inhalte werden zentral im TP-Managementportal bereitgestellt.</p></div>${portalView === "full" ? '<button class="btn" onclick="toast(\'Ordnerverwaltung folgt in einem eigenen Modul.\')">+ Neuer Ordner</button>' : ''}</div><div class="folder-list">${folders.map(f => `<button class="folder-row" onclick="toast('Ordner ${f[1]} geöffnet.')"><span class="folder-icon">${f[0]}</span><span><strong>${f[1]}</strong><small>${f[2]}</small></span><span class="folder-arrow">›</span></button>`).join("")}</div></div>`;
}
function renderMyFiles() {
  setHead("Meine Dateien", "Ihr persönlicher Arbeitsbereich im TP-Managementportal.");
  content.innerHTML = `<div class="info-strip"><strong>Persönlicher Bereich:</strong> Auf diese Dateien und Ordner hat standardmäßig nur der angemeldete Mitarbeiter Zugriff.</div><div class="card">${emptyState("Persönliche Dateiverwaltung vorbereitet", "Ordner, Upload und persönliche Zugriffsrechte werden als separates Modul umgesetzt.")}</div>`;
}
function renderShared() {
  setHead("Für mich freigegeben", "Ordner und Dateien, die gezielt mit Ihnen geteilt wurden.");
  content.innerHTML = `<div class="info-strip">Freigaben sollen für einzelne Personen vergeben werden. Unterordner übernehmen standardmäßig die Berechtigung des übergeordneten Ordners.</div><div class="card">${emptyState("Noch keine Freigaben", "Personenbezogene Ordnerfreigaben werden in einem späteren Dateiverwaltungsmodul angebunden.")}</div>`;
}
function renderCompanies() {
  setHead("Unternehmen", "Dokumente für den gesamten Unternehmensverbund strukturieren.");
  const docs = getVisibleDocumentsForUser({ ...currentProfile, uid: currentUser?.uid }).filter(d => !d.archived);
  content.innerHTML = `<div class="card"><div class="card-head"><div><h2>Unternehmensverbund</h2><p>Ein Dokument kann einer Firma oder allen Unternehmen zugeordnet werden.</p></div></div><div class="company-grid">${companies.slice(1).map(c => { const m = companyMeta[c]; const n = docs.filter(d => d.company === c || d.company === "Alle Unternehmen").length; return `<div class="company-card" onclick="render('documents')"><div class="company-logo-wrap"><img src="${m.logo}" alt="${esc(c)} Logo"></div><div class="company-card-copy"><strong>${esc(c)}</strong><span>${n} zugeordnete Dokumente</span></div><div class="company-card-arrow">›</div></div>`; }).join("")}</div></div>`;
}
function renderArchive() {
  setHead("Archiv / Historie", "Zurückgezogene Dokumente nachvollziehbar aufbewahren.");
  const archived = getDocuments().filter(d => d.archived);
  content.innerHTML = `<div class="info-strip">Dokumente werden nicht physisch gelöscht, sondern durch Administratoren archiviert. So bleibt die Historie erhalten.</div><div class="card"><div class="card-head"><div><h2>Archivierte Dokumente</h2><p>Zurückgezogene und nicht mehr gültige Inhalte.</p></div></div>${archived.length ? docTable(archived) : emptyState("Archiv ist leer", "Aktuell wurden noch keine Dokumente archiviert.")}</div>`;
}
function renderSettings() {
  setHead("Systemeinstellungen", "Dokumentarten und Workflow-Grundregeln.");
  content.innerHTML = `<div class="three-col"><div class="card"><h2>Pflicht-Workflow</h2><p class="muted"><strong>Arbeitsanweisung</strong><br><strong>Verfahrensanweisung</strong><br><strong>Betriebsanweisung</strong><br><br>Diese Dokumentarten können nicht ohne Freigabeworkflow veröffentlicht werden.</p></div><div class="card"><h2>Optionaler Workflow</h2><p class="muted">Bei allen anderen Dokumentarten kann beim Hochladen freiwillig ein Kollege für Prüfung/Freigabe ausgewählt werden.</p></div><div class="card"><h2>Dateiupload</h2><p class="muted">Dateien können ausgewählt oder direkt in die Uploadfläche gezogen und abgelegt werden.</p></div></div>`;
}

async async function openDoc(id) {
  const d = getDocument(id);
  if (!d) return toast("Dokument wurde nicht gefunden.");
  const actor = { ...currentProfile, uid: currentUser?.uid };
  if (!canViewDocument(d, actor)) return toast("Dieses Dokument ist für Sie noch nicht veröffentlicht.");
  const creator = isDocumentCreator(d, actor);
  const history = (d.history || []).map(h => `<div class="timeline-item"><strong>${esc(h.action)}</strong><span>${esc(h.by || "System")} · ${fmtDateTime(h.at)}</span></div>`).join("");
  const adminArchive = currentProfile?.role === "admin" && d.status === "Freigegeben" && !d.archived ? `<button class="btn secondary" onclick="archiveCurrentDoc('${d.id}')">Archivieren</button>` : "";
  const adminDelete = currentProfile?.role === "admin" && !d.archived ? `<button class="btn danger" onclick="deleteCurrentDoc('${d.id}')">Löschen</button>` : "";
  const editMeta = portalView === "full" && !d.archived && (creator || currentProfile?.role === "admin") ? `<button class="btn secondary" onclick="openEditDoc('${d.id}')">Dokumentdaten bearbeiten</button>` : "";
  const revise = creator && !d.archived && d.status !== "In Prüfung" ? `<button class="btn secondary" onclick="openRevisionDoc('${d.id}')">Dokument überarbeiten</button>` : "";
  const sourceButton = creator && canAccessOriginal(d, actor) ? `<button class="btn secondary" onclick="editCurrentDoc('${d.id}')">Dokument bearbeiten</button>` : "";
  const pdfButton = canAccessPdf(d, actor) ? `<button class="btn" onclick="openPdfCurrentDoc('${d.id}')">Dokument öffnen</button>` : "";
  modalContent.innerHTML = `<div class="modal-box"><div class="modal-head"><div><h2>${esc(d.id)} · ${esc(d.title)}</h2><p>${esc(d.type)} · Version ${esc(d.version)}</p></div><button class="close-btn" onclick="closeModal()">×</button></div><div class="detail-grid"><div class="detail-item"><span>Erstellt von</span><strong>${esc(d.createdBy || "–")}</strong></div><div class="detail-item"><span>Erstellt am</span><strong>${fmtDateTime(d.createdAt)}</strong></div><div class="detail-item"><span>Unternehmen</span><strong>${esc(d.company)}</strong></div><div class="detail-item"><span>Bereich</span><strong>${esc(d.area)}</strong></div><div class="detail-item"><span>Status</span><strong>${esc(d.status)}</strong></div><div class="detail-item"><span>Originaldatei</span><strong>${creator ? `${esc(d.fileName)} · ${humanSize(d.fileSize)}` : "Nur für den Ersteller sichtbar"}</strong></div><div class="detail-item"><span>PDF-Lesefassung</span><strong>${esc(d.pdfFileName || (d.fileType === "application/pdf" ? d.fileName : "PDF-Lesefassung"))}</strong></div><div class="detail-item"><span>Nächste Prüfung</span><strong>${fmtDate(d.review)}</strong></div><div class="detail-item"><span>Workflow</span><strong>${d.workflowEnabled ? `Ja · ${esc(d.workflowAssignee)}` : "Nein"}</strong></div></div><div class="info-strip"><strong>Zugriffsregel:</strong> „Dokument öffnen“ zeigt die PDF-Lesefassung. Nur der Ersteller erhält über „Dokument bearbeiten“ die hochgeladene Originaldatei zur Bearbeitung.</div>${d.note ? `<p style="font-size:12px;line-height:1.55">${esc(d.note)}</p>` : ""}<h3 style="font-size:13px">Historie</h3><div class="timeline">${history || '<div class="timeline-item"><strong>Noch keine Historie</strong></div>'}</div><div class="modal-footer">${adminDelete}${adminArchive}${editMeta}${revise}${sourceButton}${pdfButton}</div></div>`;
  modal.showModal();
}

function openNewDoc() {
  pendingUploadFile = null;
  pendingPdfFile = null;
  const defaultType = DOCUMENT_TYPES[0];
  modalContent.innerHTML = `<form id="new-doc-form" class="modal-box"><div class="modal-head"><div><h2>Neues Dokument anlegen</h2><p>Datei hochladen und Dokumentenlenkung festlegen.</p></div><button class="close-btn" type="button" onclick="closeModal()">×</button></div><div class="form-grid"><label class="field"><span>Dokumentart</span><select id="doc-type">${DOCUMENT_TYPES.map(x => `<option>${esc(x)}</option>`).join("")}</select></label><label class="field"><span>Dokumentnummer</span><input id="doc-number" value="${generateDocumentNumber(defaultType)}" readonly></label><label class="field full"><span>Titel *</span><input id="doc-title" required placeholder="Titel des Dokuments"></label><label class="field"><span>Unternehmen</span><select id="doc-company">${companies.slice(1).concat(["Alle Unternehmen"]).map(x => `<option>${esc(x)}</option>`).join("")}</select></label><label class="field"><span>Bereich</span><input id="doc-area" list="area-list" value="Allgemein"><datalist id="area-list">${areas.map(x => `<option value="${esc(x)}"></option>`).join("")}</datalist></label><label class="field"><span>Version</span><input id="doc-version" value="1.0"></label><label class="field"><span>Nächste Prüfung / Wiedervorlage</span><input id="doc-review" type="date"></label><label class="field full"><span>Bemerkung</span><textarea id="doc-note" placeholder="Optionaler Hinweis zum Dokument"></textarea></label></div><div class="workflow-config" id="workflow-config"><div class="workflow-config-head"><div><strong>Freigabeworkflow</strong><small id="workflow-rule-text"></small></div><label class="switch-line"><input id="workflow-enabled" type="checkbox" checked><span>Workflow starten</span></label></div><label class="field"><span>Aufgabe zuweisen an *</span><select id="workflow-assignee"><option value="">Kollegen auswählen …</option>${colleagues.map(c => `<option value="${esc(c.id)}">${esc(c.name)}${c.email ? ` · ${esc(c.email)}` : ""}</option>`).join("")}</select><small class="field-hint">Die Aufgabe erscheint beim ausgewählten Kollegen nach der Anmeldung im Dashboard.</small></label></div><div class="upload-section"><span class="upload-label">Originaldatei *</span><div id="drop-zone" class="drop-zone" tabindex="0"><div class="drop-icon">⇧</div><strong>Originaldatei hier hineinziehen und ablegen</strong><span>oder</span><button type="button" class="btn secondary" id="choose-file-btn">Originaldatei auswählen</button><input id="doc-file" type="file" hidden><div id="file-selected" class="file-selected">Noch keine Originaldatei ausgewählt</div></div></div><div class="upload-section"><span class="upload-label">PDF-Lesefassung</span><div id="pdf-drop-zone" class="drop-zone" tabindex="0"><div class="drop-icon">PDF</div><strong>PDF hier hineinziehen und ablegen</strong><span>oder</span><button type="button" class="btn secondary" id="choose-pdf-btn">PDF auswählen</button><input id="doc-pdf" type="file" accept="application/pdf,.pdf" hidden><div id="pdf-selected" class="file-selected">Nur erforderlich, wenn die Originaldatei kein PDF ist.</div></div></div><div class="modal-footer"><button class="btn secondary" type="button" onclick="closeModal()">Abbrechen</button><button class="btn" type="submit">Dokument anlegen</button></div></form>`;
  modal.showModal();
  bindNewDocumentForm();
}
function bindNewDocumentForm() {
  const type = document.querySelector("#doc-type"), enabled = document.querySelector("#workflow-enabled"), assignee = document.querySelector("#workflow-assignee"), rule = document.querySelector("#workflow-rule-text"), number = document.querySelector("#doc-number");
  const updateRule = () => {
    const mandatory = MANDATORY_WORKFLOW_TYPES.has(type.value);
    number.value = generateDocumentNumber(type.value);
    enabled.checked = mandatory ? true : enabled.checked;
    enabled.disabled = mandatory;
    rule.textContent = mandatory ? "Für diese Dokumentart ist der Workflow zwingend erforderlich." : "Für diese Dokumentart kann der Workflow optional gestartet werden.";
    assignee.disabled = !enabled.checked;
  };
  type.onchange = updateRule;
  enabled.onchange = () => { assignee.disabled = !enabled.checked; };
  updateRule();
  const input = document.querySelector("#doc-file"), choose = document.querySelector("#choose-file-btn"), zone = document.querySelector("#drop-zone");
  choose.onclick = () => input.click();
  input.onchange = () => setPendingFile(input.files?.[0]);
  ["dragenter","dragover"].forEach(ev => zone.addEventListener(ev, e => { e.preventDefault(); zone.classList.add("dragover"); }));
  ["dragleave","drop"].forEach(ev => zone.addEventListener(ev, e => { e.preventDefault(); zone.classList.remove("dragover"); }));
  zone.addEventListener("drop", e => setPendingFile(e.dataTransfer?.files?.[0]));
  const pdfInput = document.querySelector("#doc-pdf"), pdfChoose = document.querySelector("#choose-pdf-btn"), pdfZone = document.querySelector("#pdf-drop-zone");
  pdfChoose.onclick = () => pdfInput.click();
  pdfInput.onchange = () => setPendingPdfFile(pdfInput.files?.[0]);
  ["dragenter","dragover"].forEach(ev => pdfZone.addEventListener(ev, e => { e.preventDefault(); pdfZone.classList.add("dragover"); }));
  ["dragleave","drop"].forEach(ev => pdfZone.addEventListener(ev, e => { e.preventDefault(); pdfZone.classList.remove("dragover"); }));
  pdfZone.addEventListener("drop", e => setPendingPdfFile(e.dataTransfer?.files?.[0]));
  document.querySelector("#new-doc-form").onsubmit = submitNewDocument;
}
function setPendingFile(file) {
  if (!file) return;
  pendingUploadFile = file;
  document.querySelector("#file-selected").innerHTML = `<strong>${esc(file.name)}</strong><span>${humanSize(file.size)}</span>`;
  document.querySelector("#drop-zone").classList.add("has-file");
}
function setPendingPdfFile(file) {
  if (!file) return;
  if (!(file.type === "application/pdf" || /\.pdf$/i.test(file.name || ""))) return toast("Bitte als Lesefassung eine PDF-Datei auswählen.");
  pendingPdfFile = file;
  document.querySelector("#pdf-selected").innerHTML = `<strong>${esc(file.name)}</strong><span>${humanSize(file.size)}</span>`;
  document.querySelector("#pdf-drop-zone").classList.add("has-file");
}
async function submitNewDocument(e) {
  e.preventDefault();
  const type = document.querySelector("#doc-type").value;
  const workflowMandatory = MANDATORY_WORKFLOW_TYPES.has(type);
  const workflowEnabled = workflowMandatory || document.querySelector("#workflow-enabled").checked;
  const assigneeId = document.querySelector("#workflow-assignee").value.trim();
  const assignee = colleagues.find(c => c.id === assigneeId) || null;
  if (!document.querySelector("#doc-title").value.trim()) return toast("Bitte einen Titel eingeben.");
  if (!pendingUploadFile) return toast("Bitte eine Datei auswählen oder hineinziehen.");
  if (workflowEnabled && !assignee) return toast("Bitte einen Kollegen für die Workflow-Aufgabe auswählen.");
  const sourceIsPdf = pendingUploadFile && (pendingUploadFile.type === "application/pdf" || /\.pdf$/i.test(pendingUploadFile.name || ""));
  if (!sourceIsPdf && !pendingPdfFile) return toast("Bitte zusätzlich eine PDF-Lesefassung hochladen.");
  try {
    const doc = await createDocument({
      id: document.querySelector("#doc-number").value,
      title: document.querySelector("#doc-title").value,
      type,
      company: document.querySelector("#doc-company").value,
      area: document.querySelector("#doc-area").value,
      version: document.querySelector("#doc-version").value || "1.0",
      review: document.querySelector("#doc-review").value || "–",
      note: document.querySelector("#doc-note").value,
      owner: currentProfile.name || currentProfile.email || "",
      createdBy: currentProfile.name || currentProfile.email || "",
      workflowMandatory,
      workflowEnabled,
      workflowAssignee: assignee?.name || assignee?.email || "",
      workflowAssigneeId: assignee?.id || "",
      createdById: currentUser?.uid || "",
    }, pendingUploadFile, pendingPdfFile);
    if (workflowEnabled) createWorkflowTask(doc, assignee, currentProfile.name || currentProfile.email || "", currentUser?.uid || "");
    closeModal();
    toast(workflowEnabled ? "Dokument hochgeladen und Workflow gestartet." : "Dokument hochgeladen und direkt veröffentlicht.");
    render("documents");
  } catch (err) {
    console.error(err); toast(err.message || "Dokument konnte nicht angelegt werden.");
  }
}

function openEditDoc(id) {
  const d = getDocument(id); if (!d) return;
  const actor = { ...currentProfile, uid: currentUser?.uid };
  const creator = isDocumentCreator(d, actor);
  const admin = currentProfile?.role === "admin";
  if (!creator && !admin) return toast("Sie dürfen die Dokumentdaten nicht bearbeiten.");
  modalContent.innerHTML = `<form id="edit-doc-form" class="modal-box"><div class="modal-head"><div><h2>${esc(d.id)} bearbeiten</h2><p>Metadaten anpassen${admin ? " und als Admin die Dokumentnummer korrigieren" : ""}.</p></div><button class="close-btn" type="button" onclick="closeModal()">×</button></div><div class="form-grid"><label class="field"><span>Dokumentnummer</span><input id="edit-number" value="${esc(d.id)}" ${admin ? "" : "readonly"}></label><label class="field"><span>Version</span><input id="edit-version" value="${esc(d.version)}"></label><label class="field full"><span>Titel</span><input id="edit-title" value="${esc(d.title)}" required></label><label class="field"><span>Unternehmen</span><select id="edit-company">${companies.slice(1).concat(["Alle Unternehmen"]).map(x => `<option ${x===d.company?'selected':''}>${esc(x)}</option>`).join("")}</select></label><label class="field"><span>Bereich</span><input id="edit-area" value="${esc(d.area)}"></label><label class="field"><span>Nächste Prüfung</span><input id="edit-review" type="date" value="${d.review && d.review !== '–' ? esc(d.review) : ''}"></label><label class="field full"><span>Bemerkung</span><textarea id="edit-note">${esc(d.note || '')}</textarea></label></div><div class="modal-footer"><button class="btn secondary" type="button" onclick="closeModal()">Abbrechen</button><button class="btn" type="submit">Änderungen speichern</button></div></form>`;
  modal.showModal();
  document.querySelector("#edit-doc-form").onsubmit = async e => {
    e.preventDefault();
    try {
      const oldId = id;
      let newId = oldId;
      if (admin) {
        newId = document.querySelector("#edit-number").value.trim();
        if (newId !== oldId) {
          await renameDocumentNumber(oldId, newId, currentProfile.name || currentProfile.email || "");
          renameWorkflowDocument(oldId, newId);
        }
      }
      updateDocumentMetadata(newId, { title: document.querySelector("#edit-title").value, company: document.querySelector("#edit-company").value, area: document.querySelector("#edit-area").value, version: document.querySelector("#edit-version").value, review: document.querySelector("#edit-review").value || "–", note: document.querySelector("#edit-note").value }, currentProfile.name || currentProfile.email || "");
      closeModal(); toast("Dokumentdaten gespeichert."); render("documents");
    } catch (err) { toast(err.message || "Dokumentdaten konnten nicht gespeichert werden."); }
  };
}
function openReviewTask(taskId) {
  const task = getWorkflowTasks().find(t => t.id === taskId);
  if (!task || task.status !== "Offen") return toast("Diese Prüfaufgabe ist nicht mehr offen.");
  const mine = getTasksForUser({ ...currentProfile, uid: currentUser?.uid });
  if (!mine.some(t => t.id === taskId)) return toast("Diese Prüfaufgabe ist Ihnen nicht zugewiesen.");
  const d = getDocument(task.documentId);
  if (!d) return toast("Das zugehörige Dokument wurde nicht gefunden.");
  modalContent.innerHTML = `<div class="modal-box review-modal"><div class="modal-head"><div><h2>Dokument prüfen</h2><p>${esc(d.id)} · ${esc(d.title)}</p></div><button class="close-btn" type="button" onclick="closeModal()">×</button></div><div class="review-summary"><div><span>Dokumentart</span><strong>${esc(d.type)}</strong></div><div><span>Ersteller</span><strong>${esc(d.createdBy || "–")}</strong></div><div><span>Version</span><strong>${esc(d.version)}</strong></div><div><span>Status</span><strong>Zu prüfen</strong></div></div><div class="info-strip">Zur Prüfung wird ausschließlich die PDF-Lesefassung geöffnet. Die Originaldatei bleibt beim Ersteller.</div><div class="review-open"><button class="btn" type="button" onclick="openPdfCurrentDoc('${d.id}')">Dokument öffnen</button></div><label class="field full review-note"><span>Anmerkung / Hinweis</span><textarea id="review-note" placeholder="Optional bei Freigabe. Bei Ablehnung muss hier zwingend ein Grund eingetragen werden."></textarea><small class="field-hint">Der Text wird in der Dokumenthistorie gespeichert und ist für den Ersteller nachvollziehbar.</small></label><div class="modal-footer"><button class="btn secondary" type="button" onclick="closeModal()">Abbrechen</button><button class="btn danger" type="button" onclick="finishReview('${task.id}','${d.id}','reject')">Ablehnen</button><button class="btn" type="button" onclick="finishReview('${task.id}','${d.id}','approve')">Freigeben</button></div></div>`;
  modal.showModal();
}

function finishReview(taskId, docId, decision) {
  const note = document.querySelector("#review-note")?.value.trim() || "";
  if (decision === "reject" && !note) return toast("Bitte bei einer Ablehnung zwingend einen Grund angeben.");
  const by = currentProfile.name || currentProfile.email || "";
  decideWorkflowTask(taskId, decision, by, note);
  updateDocumentStatus(docId, decision === "reject" ? "Abgelehnt" : "Freigegeben", by, note);
  closeModal();
  toast(decision === "reject" ? "Dokument wurde mit Begründung zur Überarbeitung zurückgegeben." : "Dokument wurde freigegeben und veröffentlicht.");
  render(current === "dashboard" ? "dashboard" : "workflow");
}

function openRevisionDoc(id) {
  const d = getDocument(id); if (!d) return toast("Dokument wurde nicht gefunden.");
  const actor = { ...currentProfile, uid: currentUser?.uid };
  if (!isDocumentCreator(d, actor)) return toast("Nur der Ersteller darf neue Original- und PDF-Dateien hochladen.");
  if (d.status === "In Prüfung") return toast("Während einer laufenden Prüfung können die Dateien nicht ausgetauscht werden.");
  pendingUploadFile = null; pendingPdfFile = null;
  modalContent.innerHTML = `<form id="revision-doc-form" class="modal-box"><div class="modal-head"><div><h2>${esc(d.id)} überarbeiten</h2><p>Überarbeitete Originaldatei und PDF-Lesefassung hochladen. Bei workflowpflichtigen Dokumenten wird die Prüfung erneut gestartet.</p></div><button class="close-btn" type="button" onclick="closeModal()">×</button></div><div class="form-grid"><label class="field"><span>Version</span><input id="revision-version" value="${esc(d.version)}"></label><label class="field"><span>Erneut prüfen lassen durch *</span><select id="revision-assignee"><option value="">Kollegen auswählen …</option>${colleagues.map(c => `<option value="${esc(c.id)}" ${c.id===d.workflowAssigneeId?'selected':''}>${esc(c.name)}${c.email ? ` · ${esc(c.email)}` : ""}</option>`).join("")}</select></label><label class="field full"><span>Bemerkung zur Überarbeitung</span><textarea id="revision-note" placeholder="Optional: Was wurde angepasst?"></textarea></label></div><div class="upload-section"><span class="upload-label">Überarbeitete Originaldatei *</span><div id="revision-source-zone" class="drop-zone"><div class="drop-icon">⇧</div><strong>Originaldatei hier hineinziehen und ablegen</strong><span>oder</span><button type="button" class="btn secondary" id="revision-source-btn">Originaldatei auswählen</button><input id="revision-source" type="file" hidden><div id="revision-source-selected" class="file-selected">Noch keine Datei ausgewählt</div></div></div><div class="upload-section"><span class="upload-label">Überarbeitete PDF-Lesefassung</span><div id="revision-pdf-zone" class="drop-zone"><div class="drop-icon">PDF</div><strong>PDF hier hineinziehen und ablegen</strong><span>oder</span><button type="button" class="btn secondary" id="revision-pdf-btn">PDF auswählen</button><input id="revision-pdf" type="file" accept="application/pdf,.pdf" hidden><div id="revision-pdf-selected" class="file-selected">Nur entbehrlich, wenn die Originaldatei selbst ein PDF ist.</div></div></div><div class="modal-footer"><button class="btn secondary" type="button" onclick="closeModal()">Abbrechen</button><button class="btn" type="submit">Neu einreichen</button></div></form>`;
  modal.showModal();
  const bindZone = (zoneId, inputId, btnId, setter) => {
    const zone=document.querySelector(zoneId), input=document.querySelector(inputId), btn=document.querySelector(btnId);
    btn.onclick=()=>input.click(); input.onchange=()=>setter(input.files?.[0]);
    ["dragenter","dragover"].forEach(ev=>zone.addEventListener(ev,e=>{e.preventDefault();zone.classList.add("dragover");}));
    ["dragleave","drop"].forEach(ev=>zone.addEventListener(ev,e=>{e.preventDefault();zone.classList.remove("dragover");}));
    zone.addEventListener("drop",e=>setter(e.dataTransfer?.files?.[0]));
  };
  bindZone("#revision-source-zone","#revision-source","#revision-source-btn",file=>{
    if(!file)return; pendingUploadFile=file; document.querySelector("#revision-source-selected").innerHTML=`<strong>${esc(file.name)}</strong><span>${humanSize(file.size)}</span>`; document.querySelector("#revision-source-zone").classList.add("has-file");
  });
  bindZone("#revision-pdf-zone","#revision-pdf","#revision-pdf-btn",file=>{
    if(!file)return; if(!(file.type==="application/pdf"||/\.pdf$/i.test(file.name||"")))return toast("Bitte eine PDF-Datei auswählen."); pendingPdfFile=file; document.querySelector("#revision-pdf-selected").innerHTML=`<strong>${esc(file.name)}</strong><span>${humanSize(file.size)}</span>`; document.querySelector("#revision-pdf-zone").classList.add("has-file");
  });
  document.querySelector("#revision-doc-form").onsubmit = async e => {
    e.preventDefault();
    const assigneeId=document.querySelector("#revision-assignee").value.trim();
    const assignee=colleagues.find(c=>c.id===assigneeId)||null;
    if(!pendingUploadFile)return toast("Bitte die überarbeitete Originaldatei hochladen.");
    const sourceIsPdf=pendingUploadFile.type==="application/pdf"||/\.pdf$/i.test(pendingUploadFile.name||"");
    if(!sourceIsPdf&&!pendingPdfFile)return toast("Bitte zusätzlich die überarbeitete PDF-Lesefassung hochladen.");
    const workflowEnabled = Boolean(d.workflowMandatory || d.workflowEnabled);
    if(workflowEnabled && !assignee)return toast("Bitte einen Kollegen für die erneute Prüfung auswählen.");
    try {
      const updated=await replaceDocumentFiles(id,pendingUploadFile,pendingPdfFile,{version:document.querySelector("#revision-version").value||d.version,note:document.querySelector("#revision-note").value,workflowEnabled,workflowAssignee:workflowEnabled ? (assignee?.name||assignee?.email||"") : "",workflowAssigneeId:workflowEnabled ? (assignee?.id||"") : ""},currentProfile.name||currentProfile.email||"");
      if(workflowEnabled) createWorkflowTask(updated,assignee,currentProfile.name||currentProfile.email||"",currentUser?.uid||"");
      closeModal(); toast(workflowEnabled ? "Überarbeitete Dokumente hochgeladen. Der Workflow wurde neu gestartet." : "Überarbeitete Dokumente hochgeladen und veröffentlicht."); render("dashboard");
    } catch(err){toast(err.message||"Dokument konnte nicht neu eingereicht werden.");}
  };
}

function archiveCurrentDoc(id) {
  archiveDocument(id, currentProfile.name || currentProfile.email || "");
  closeModal(); toast("Dokument wurde archiviert."); render("documents");
}

async function deleteCurrentDoc(id) {
  if (currentProfile?.role !== "admin") return toast("Nur ein Admin darf Dokumente löschen.");
  if (!confirm(`Dokument ${id} wirklich endgültig löschen? Die gespeicherten Dateien und zugehörigen Workflow-Aufgaben werden ebenfalls entfernt.`)) return;
  try {
    await deleteDocument(id);
    deleteWorkflowTasksForDocument(id);
    closeModal(); toast("Dokument wurde gelöscht."); render("documents");
  } catch (err) { toast(err.message || "Dokument konnte nicht gelöscht werden."); }
}

async function editCurrentDoc(id) {
  const d = getDocument(id);
  if (!canAccessOriginal(d, { ...currentProfile, uid: currentUser?.uid })) return toast("Nur der Ersteller darf die Originaldatei bearbeiten.");
  try { await downloadOriginalFile(id); } catch (e) { toast(e.message); }
}

async function openPdfCurrentDoc(id) {
  const d = getDocument(id);
  if (!canAccessPdf(d, { ...currentProfile, uid: currentUser?.uid })) return toast("Die PDF-Lesefassung ist für Sie nicht freigegeben.");
  try { await openPdfFile(id); } catch (e) { toast(e.message); }
}
function closeModal() { if (modal.open) modal.close(); }
function toast(msg) { const t = document.querySelector("#toast"); t.textContent = msg; t.classList.add("show"); setTimeout(() => t.classList.remove("show"), 2800); }

async function applyProfile(profile, user) {
  currentProfile = profile;
  currentUser = user;
  portalView = profile.role === "employee" ? "employee" : "full";
  document.querySelector(".role-heading").textContent = profile.role === "admin" ? "Adminbereich" : profile.role === "supervisor" ? "Vorgesetztenbereich" : "Mitarbeiterbereich";
  document.querySelector("#user-name").textContent = profile.name || profile.email || "Mitarbeiter";
  document.querySelector("#user-role").textContent = ROLE_LABELS[profile.role] || profile.role;
  document.querySelector("#user-avatar").textContent = initials(profile.name || profile.email);
  const settingsBtn = document.querySelector("#settings-link");
  if (settingsBtn) settingsBtn.style.display = profile.role === "admin" ? "" : "none";
  colleagues = profile.role === "employee" ? [] : await loadAssignableColleagues(profile, user);
  current = "dashboard";
  render("dashboard");
}
function showLogin(message = "") { currentProfile = null; currentUser = null; document.querySelector("#app-shell").classList.add("hidden"); document.querySelector("#login-page").classList.remove("hidden"); document.querySelector("#login-message").textContent = message; }
async function showPortal(profile, user) { document.querySelector("#login-message").textContent = ""; document.querySelector("#login-page").classList.add("hidden"); document.querySelector("#app-shell").classList.remove("hidden"); await applyProfile(profile, user); }

Object.assign(window, { render, openDoc, openNewDoc, openEditDoc, openReviewTask, finishReview, openRevisionDoc, closeModal, toast, archiveCurrentDoc, deleteCurrentDoc, editCurrentDoc, openPdfCurrentDoc });
document.querySelector("#settings-link").onclick = () => render("settings");
document.querySelector("#logout-btn").onclick = () => logout();
document.querySelector("#portal-info").onclick = () => { modalContent.innerHTML = `<div class="modal-box"><div class="modal-head"><div><h2>TP-Managementportal</h2><p>Version 0.4</p></div><button class="close-btn" onclick="closeModal()">×</button></div><p style="font-size:12px;line-height:1.65">Zentrale Plattform für Unternehmensdokumente, Freigabeworkflows, öffentliche Informationen, persönliche Dateien und freigegebene Arbeitsbereiche.</p><p style="font-size:12px;line-height:1.65"><strong>V0.4:</strong> Prüfungen erfolgen jetzt in einem eigenen Prüffenster mit PDF-Anzeige, Anmerkung, Freigabe und begründungspflichtiger Ablehnung. Ersteller können abgelehnte Dokumente überarbeiten und neu einreichen; Admins können Dokumentnummern korrigieren und Dokumente löschen.</p><div class="modal-footer"><button class="btn" onclick="closeModal()">Schließen</button></div></div>`; modal.showModal(); };
document.querySelector("#personalmanagement-link").onclick = () => { const url = localStorage.getItem("tpPersonalmanagementUrl") || ""; if (url) window.open(url, "_blank", "noopener"); else toast("Die produktive URL des TP-Personalmanagements wird hier noch hinterlegt."); };
document.querySelector("#login-form").addEventListener("submit", async e => { e.preventDefault(); const msg = document.querySelector("#login-message"); msg.textContent = "Anmeldung läuft …"; try { await login(document.querySelector("#login-identifier").value, document.querySelector("#login-password").value); } catch (err) { console.error(err); msg.textContent = "Anmeldung nicht möglich. Bitte Zugangsdaten prüfen."; } });
document.querySelector("#forgot-password-btn").onclick = async () => { try { await requestPasswordReset(document.querySelector("#login-identifier").value); toast("Passwort-Link wurde angefordert."); } catch (err) { toast(err.message || "Passwort-Link konnte nicht angefordert werden."); } };
observeAuth(async user => { if (!user) return showLogin(); try { const profile = await loadPortalProfile(user); await showPortal(profile, user); } catch (err) { console.error(err); await logout(); showLogin(err.message || "Der Zugang zum TP-Managementportal ist nicht möglich."); } });

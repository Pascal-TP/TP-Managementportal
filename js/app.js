import {
  login,
  logout,
  requestPasswordReset,
  loadPortalProfile,
  observeAuth,
  ROLE_LABELS,
  initials
} from "./auth.js";

const companies = [
  "Alle Unternehmen",
  "TP Holding GmbH",
  "Norddeutsche Flächenheizsysteme GmbH",
  "TGA Systemtechnik GmbH",
  "Ulf Roesler GmbH",
];
const companyMeta = {
  "TP Holding GmbH": { logo: "assets/tp.png", short: "TP Holding" },
  "Norddeutsche Flächenheizsysteme GmbH": {
    logo: "assets/ndf.png",
    short: "NDF",
  },
  "TGA Systemtechnik GmbH": {
    logo: "assets/tga.png",
    short: "TGA Systemtechnik",
  },
  "Ulf Roesler GmbH": { logo: "assets/ur.png", short: "Ulf Roesler" },
};
const docs = [
  {
    id: "AA.022.01",
    title: "Führerscheinkontrolle",
    type: "Arbeitsanweisung",
    area: "Fuhrpark",
    company: "TP Holding GmbH",
    version: "1.0",
    status: "Freigegeben",
    owner: "Fuhrparkmanagement",
    review: "15.06.2027",
    note: "Regelt Ablauf und Dokumentation der Führerscheinkontrolle.",
  },
  {
    id: "VA.004.03",
    title: "Meldung und Untersuchung von Arbeitsunfällen",
    type: "Verfahrensanweisung",
    area: "Arbeitssicherheit",
    company: "Alle Unternehmen",
    version: "3.1",
    status: "Freigegeben",
    owner: "Arbeitssicherheit",
    review: "01.03.2027",
    note: "Einheitlicher Prozess bei Arbeits- und Wegeunfällen.",
  },
  {
    id: "BA.014.03",
    title: "Retanol Xtreme",
    type: "Betriebsanweisung",
    area: "Gefahrstoffe",
    company: "Norddeutsche Flächenheizsysteme GmbH",
    version: "2.0",
    status: "Freigegeben",
    owner: "Arbeitssicherheit",
    review: "30.04.2027",
    note: "Betriebsanweisung zum sicheren Umgang mit Retanol Xtreme.",
  },
  {
    id: "FO.008.02",
    title: "Mängelmeldung Gebäude",
    type: "Formular",
    area: "Gebäudetechnik",
    company: "Alle Unternehmen",
    version: "2.0",
    status: "Freigegeben",
    owner: "Gebäudetechnik",
    review: "12.11.2027",
    note: "Meldeformular für technische und bauliche Mängel.",
  },
  {
    id: "RL.003.01",
    title: "Homeoffice-Regelung",
    type: "Richtlinie",
    area: "Personal",
    company: "TP Holding GmbH",
    version: "1.2",
    status: "In Prüfung",
    owner: "Personalabteilung",
    review: "20.09.2026",
    note: "Rahmenbedingungen für mobiles Arbeiten.",
  },
  {
    id: "BEF.001.02",
    title: "Steuerbefreiung E-Fahrzeug HH-TP 417",
    type: "Befristeter Nachweis",
    area: "Fuhrpark",
    company: "TP Holding GmbH",
    version: "1.0",
    status: "Freigegeben",
    owner: "Fuhrparkmanagement",
    review: "18.09.2026",
    note: "Befristete Steuerbefreiung. Automatische Erinnerung vor Ablauf.",
  },
  {
    id: "ZERT.012.01",
    title: "ISO 9001 Zertifikat",
    type: "Zertifikat",
    area: "Qualitätsmanagement",
    company: "Alle Unternehmen",
    version: "1.0",
    status: "Freigegeben",
    owner: "IMS",
    review: "31.12.2026",
    note: "Aktuelles Zertifikat des Qualitätsmanagementsystems.",
  },
  {
    id: "AA.031.02",
    title: "Wareneingangsprüfung",
    type: "Arbeitsanweisung",
    area: "Einkauf / Lager",
    company: "Ulf Roesler GmbH",
    version: "2.3",
    status: "Entwurf",
    owner: "Lagerleitung",
    review: "01.08.2027",
    note: "Prüfschritte und Dokumentation bei Wareneingängen.",
  },
  {
    id: "SDB.006.01",
    title: "Retanol Xtreme – Sicherheitsdatenblatt",
    type: "Sicherheitsdatenblatt",
    area: "Gefahrstoffe",
    company: "Norddeutsche Flächenheizsysteme GmbH",
    version: "1.0",
    status: "Freigegeben",
    owner: "Arbeitssicherheit",
    review: "31.05.2027",
    note: "Aktuelles Sicherheitsdatenblatt für den verwendeten Gefahrstoff.",
  },
  {
    id: "VO.003.01",
    title: "Vorlage Unterweisungsnachweis",
    type: "Vorlage",
    area: "Arbeitssicherheit",
    company: "Alle Unternehmen",
    version: "1.4",
    status: "Freigegeben",
    owner: "Arbeitssicherheit",
    review: "10.02.2027",
    note: "Freigegebene Vorlage zur Dokumentation von Unterweisungen.",
  },
];
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
const employeeTypes = [
  "Arbeitsanweisung",
  "Verfahrensanweisung",
  "Formular",
  "Vorlage",
  "Betriebsanweisung",
  "Sicherheitsdatenblatt",
];
let current = "dashboard";
let portalView = "employee";
let currentProfile = null;
const content = document.querySelector("#content"),
  title = document.querySelector("#page-title"),
  subtitle = document.querySelector("#page-subtitle"),
  modal = document.querySelector("#modal"),
  modalContent = document.querySelector("#modal-content");
function esc(s = "") {
  return String(s).replace(
    /[&<>"']/g,
    (m) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[m],
  );
}
function status(s) {
  const c =
    s === "Freigegeben"
      ? "good"
      : s === "In Prüfung"
        ? "warn"
        : s === "Entwurf"
          ? "gray"
          : "info";
  return `<span class="badge ${c}"><i class="dot"></i>${s}</span>`;
}
function initNav() {
  const nav = portalView === "employee" ? employeeNav : fullNav;
  document.querySelector("#main-nav").innerHTML = nav
    .map(
      ([id, ic, l]) =>
        `<button class="nav-btn ${id === current ? "active" : ""}" data-page="${id}"><span class="icon">${ic}</span>${l}</button>`,
    )
    .join("");
  document
    .querySelectorAll("#main-nav [data-page]")
    .forEach((b) => (b.onclick = () => render(b.dataset.page)));
}
function setHead(t, s) {
  title.textContent = t;
  subtitle.textContent = s;
}
function render(page) {
  if (!currentProfile) return;
  if (page === "settings" && currentProfile.role !== "admin") page = "dashboard";
  if (portalView === "employee" && !employeeNav.some((x) => x[0] === page))
    page = "dashboard";
  current = page;
  initNav();
  if (portalView === "employee") {
    ({ dashboard: renderEmployeeDashboard, documents: renderEmployeeDocuments, areas: renderAreas, myfiles: renderMyFiles, shared: renderShared }[page] || renderEmployeeDashboard)();
  } else {
    (
      ({
        dashboard: renderDashboard,
        documents: renderDocuments,
        workflow: renderWorkflow,
        deadlines: renderDeadlines,
        areas: renderAreas,
        companies: renderCompanies,
        archive: renderArchive,
        myfiles: renderMyFiles,
        shared: renderShared,
        settings: renderSettings,
      })[page] || renderDashboard
    )();
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
}
function renderDashboard() {
  setHead(
    "Dashboard",
    "Zentrale Übersicht des integrierten Managementsystems.",
  );
  content.innerHTML = `

<div class="kpi-grid"><div class="kpi"><span>Gültige Dokumente</span><strong>126</strong><small>davon 38 Arbeitsanweisungen</small></div><div class="kpi warn"><span>Offene Freigaben</span><strong>7</strong><small>3 Aufgaben sind Ihnen zugeordnet</small></div><div class="kpi bad"><span>Fristen & Wiedervorlagen</span><strong>5</strong><small>innerhalb der nächsten 30 Tage</small></div><div class="kpi"><span>Unternehmen</span><strong>4</strong><small>zentral verwaltet und filterbar</small></div></div>
<div class="two-col"><div class="card"><div class="card-head"><div><h2>Meine offenen Aufgaben</h2><p>Prüfungen, Freigaben und Wiedervorlagen.</p></div><button class="btn secondary small" onclick="render('workflow')">Alle Aufgaben</button></div><div class="task-list">
${task("📝", "Homeoffice-Regelung prüfen", "RL.003.01 · Version 1.2", "Heute", "bad")}${task("⏰", "Steuerbefreiung prüfen", "HH-TP 417 · Befristung läuft aus", "21 Tage", "warn")}${task("✓", "Wareneingangsprüfung freigeben", "AA.031.02 · Version 2.3", "5 Tage", "warn")}</div></div>
<div class="card"><div class="card-head"><div><h2>Nächste Fristen</h2><p>Automatische Wiedervorlagen für Dokumente und Nachweise.</p></div></div><div class="task-list">${task("🚗", "Steuerbefreiung E-Fahrzeug", "HH-TP 417", "18.09.2026", "bad")}${task("📜", "ISO 9001 Zertifikat", "Rezertifizierung / Gültigkeit", "31.12.2026", "warn")}${task("🦺", "VA Arbeitsunfälle", "turnusmäßige Prüfung", "01.03.2027", "")}</div></div></div>
<div class="card"><div class="card-head"><div><h2>Zuletzt bearbeitete Dokumente</h2><p>Schneller Zugriff auf häufig benötigte Inhalte.</p></div><div class="actions"><button class="btn secondary" onclick="render('documents')">Dokumentenregister</button><button class="btn" onclick="openNewDoc()">+ Neues Dokument</button></div></div>${docTable(docs.slice(0, 5))}</div>`;
}
function employeeDocs() {
  return docs.filter(
    (d) => d.status === "Freigegeben" && employeeTypes.includes(d.type),
  );
}
function employeeDocTable(rows) {
  return `<div class="table-wrap"><table class="data-table"><thead><tr><th>Nr.</th><th>Dokument</th><th>Dokumentart</th><th>Unternehmen</th><th>Bereich</th><th>Version</th></tr></thead><tbody>${rows.map((d) => `<tr><td><strong>${d.id}</strong></td><td><div class="doc-title" onclick="openDoc('${d.id}')">${esc(d.title)}<small>Dokument öffnen</small></div></td><td>${esc(d.type)}</td><td>${esc(d.company)}</td><td>${esc(d.area)}</td><td>${d.version}</td></tr>`).join("")}</tbody></table></div>`;
}
function renderEmployeeDashboard() {
  setHead(
    "Dashboard",
    "Aktuelle Informationen und freigegebene Dokumente für Beschäftigte.",
  );
  const eDocs = employeeDocs();
  content.innerHTML = `
  <div class="employee-welcome"><div><span class="employee-eyebrow">Mitarbeiterportal</span><h2>Alles Wichtige an einer Stelle</h2><p>Hier werden neue und geänderte Dokumente bekannt gegeben. Im Dokumentenregister stehen ausschließlich die für Beschäftigte freigegebenen Inhalte zur Verfügung.</p></div><button class="btn" onclick="render('documents')">Zum Dokumentenregister</button></div>
  <div class="kpi-grid employee-kpis"><div class="kpi"><span>Neue Dokumente</span><strong>3</strong><small>seit Ihrem letzten Besuch</small></div><div class="kpi warn"><span>Geänderte Dokumente</span><strong>2</strong><small>neue Version veröffentlicht</small></div><div class="kpi"><span>Freigegebene Dokumente</span><strong>84</strong><small>für Ihre Ansicht verfügbar</small></div><div class="kpi"><span>Unternehmen</span><strong>4</strong><small>Dokumente zentral filterbar</small></div></div>
  <div class="two-col"><div class="card"><div class="card-head"><div><h2>Neu veröffentlicht</h2><p>Neue Dokumente, die für Beschäftigte bereitgestellt wurden.</p></div></div><div class="announcement-list">
    ${announcement("Neu", "AA.022.01", "Führerscheinkontrolle", "Arbeitsanweisung · TP Holding GmbH", "27.08.2026", "new")}
    ${announcement("Neu", "SDB.006.01", "Retanol Xtreme – Sicherheitsdatenblatt", "Sicherheitsdatenblatt · Norddeutsche Flächenheizsysteme GmbH", "25.08.2026", "new")}
    ${announcement("Neu", "VO.003.01", "Vorlage Unterweisungsnachweis", "Vorlage · Alle Unternehmen", "22.08.2026", "new")}
  </div></div><div class="card"><div class="card-head"><div><h2>Geänderte Dokumente</h2><p>Aktualisierte Fassungen bereits bekannter Dokumente.</p></div></div><div class="announcement-list">
    ${announcement("Geändert", "VA.004.03", "Meldung und Untersuchung von Arbeitsunfällen", "Version 3.0 → 3.1 · Alle Unternehmen", "26.08.2026", "changed")}
    ${announcement("Geändert", "BA.014.03", "Retanol Xtreme", "Version 1.5 → 2.0 · NDF", "21.08.2026", "changed")}
  </div></div></div>
  <div class="card"><div class="card-head"><div><h2>Schnellzugriff</h2><p>Zuletzt veröffentlichte Arbeits- und Sicherheitsdokumente.</p></div><button class="btn secondary" onclick="render('documents')">Alle Dokumente</button></div>${employeeDocTable(eDocs.slice(0, 6))}</div>`;
}
function announcement(label, id, titleText, meta, date, kind) {
  return `<button class="announcement ${kind}" onclick="openDoc('${id}')"><span class="announcement-badge">${label}</span><span class="announcement-copy"><strong>${esc(titleText)}</strong><small>${esc(meta)}</small></span><span class="announcement-date">${date}</span><span class="announcement-arrow">›</span></button>`;
}
function renderEmployeeDocuments() {
  setHead(
    "Dokumentenregister",
    "Freigegebene Arbeits- und Sicherheitsdokumente zentral abrufen.",
  );
  const rows = employeeDocs();
  const types = ["Alle Dokumentarten", ...employeeTypes];
  content.innerHTML = `<div class="info-strip"><strong>Mitarbeiteransicht:</strong> Angezeigt werden nur freigegebene Arbeitsanweisungen, Verfahrensanweisungen, Formulare/Vorlagen, Betriebsanweisungen und Sicherheitsdatenblätter.</div><div class="card"><div class="card-head"><div><h2>Dokumentenregister</h2><p>Gültige Dokumente suchen und nach Unternehmen, Bereich oder Dokumentart filtern.</p></div></div><div class="filter-bar employee-filter"><input id="eq" placeholder="Dokumentnummer oder Titel suchen…"><select id="ec">${companies.map((x) => `<option>${x}</option>`).join("")}</select><select id="ea"><option>Alle Bereiche</option>${[...new Set(rows.map((x) => x.area))].map((x) => `<option>${x}</option>`).join("")}</select><select id="et">${types.map((x) => `<option>${x}</option>`).join("")}</select><button class="btn secondary" id="ereset">Zurücksetzen</button></div><div id="employee-docs-table">${employeeDocTable(rows)}</div></div>`;
  ["eq", "ec", "ea", "et"].forEach(
    (id) => (document.querySelector("#" + id).oninput = filterEmployeeDocs),
  );
  document.querySelector("#ereset").onclick = () => renderEmployeeDocuments();
}
function filterEmployeeDocs() {
  const q = document.querySelector("#eq").value.toLowerCase(),
    c = document.querySelector("#ec").value,
    a = document.querySelector("#ea").value,
    t = document.querySelector("#et").value;
  const r = employeeDocs().filter(
    (d) =>
      (!q || (d.id + " " + d.title + " " + d.type).toLowerCase().includes(q)) &&
      (c === "Alle Unternehmen" ||
        d.company === c ||
        d.company === "Alle Unternehmen") &&
      (a === "Alle Bereiche" || d.area === a) &&
      (t === "Alle Dokumentarten" || d.type === t),
  );
  document.querySelector("#employee-docs-table").innerHTML =
    employeeDocTable(r);
}
function task(ic, a, b, c, cl = "") {
  return `<div class="task"><div class="task-icon">${ic}</div><div><strong>${a}</strong><span>${b}</span></div><div class="deadline ${cl}">${c}</div></div>`;
}
function docTable(rows) {
  return `<div class="table-wrap"><table class="data-table"><thead><tr><th>Nr.</th><th>Dokument</th><th>Unternehmen</th><th>Bereich</th><th>Version</th><th>Status</th><th>Nächste Prüfung</th></tr></thead><tbody>${rows.map((d) => `<tr><td><strong>${d.id}</strong></td><td><div class="doc-title" onclick="openDoc('${d.id}')">${esc(d.title)}<small>${esc(d.type)}</small></div></td><td>${esc(d.company)}</td><td>${esc(d.area)}</td><td>${d.version}</td><td>${status(d.status)}</td><td>${d.review}</td></tr>`).join("")}</tbody></table></div>`;
}
function renderDocuments() {
  setHead(
    "Dokumentenregister",
    "Alle gelenkten Dokumente zentral suchen, filtern und verwalten.",
  );
  content.innerHTML = `<div class="card"><div class="card-head"><div><h2>Dokumentenregister</h2><p>Aktuell gültige Dokumente einschließlich Version, Freigabestatus und Wiedervorlage.</p></div><button class="btn" onclick="openNewDoc()">+ Neues Dokument</button></div><div class="filter-bar"><input id="q" placeholder="Dokumentnummer oder Titel suchen…"><select id="fc">${companies.map((x) => `<option>${x}</option>`).join("")}</select><select id="fa"><option>Alle Bereiche</option>${[...new Set(docs.map((x) => x.area))].map((x) => `<option>${x}</option>`).join("")}</select><select id="fs"><option>Alle Status</option><option>Freigegeben</option><option>In Prüfung</option><option>Entwurf</option></select><button class="btn secondary" id="reset">Zurücksetzen</button></div><div id="docs-table">${docTable(docs)}</div></div>`;
  ["q", "fc", "fa", "fs"].forEach(
    (id) => (document.querySelector("#" + id).oninput = filterDocs),
  );
  document.querySelector("#reset").onclick = () => renderDocuments();
}
function filterDocs() {
  const q = document.querySelector("#q").value.toLowerCase(),
    c = document.querySelector("#fc").value,
    a = document.querySelector("#fa").value,
    s = document.querySelector("#fs").value;
  const r = docs.filter(
    (d) =>
      (!q || (d.id + " " + d.title + " " + d.type).toLowerCase().includes(q)) &&
      (c === "Alle Unternehmen" ||
        d.company === c ||
        d.company === "Alle Unternehmen") &&
      (a === "Alle Bereiche" || d.area === a) &&
      (s === "Alle Status" || d.status === s),
  );
  document.querySelector("#docs-table").innerHTML = docTable(r);
}
function renderWorkflow() {
  setHead(
    "Freigaben & Aufgaben",
    "Dokumente nachvollziehbar prüfen, freigeben oder zurückgeben.",
  );
  content.innerHTML = `<div class="kpi-grid"><div class="kpi warn"><span>Meine Prüfungen</span><strong>3</strong><small>davon 1 heute fällig</small></div><div class="kpi"><span>Meine Freigaben</span><strong>2</strong><small>noch nicht abgeschlossen</small></div><div class="kpi"><span>Zurückgegeben</span><strong>1</strong><small>mit Kommentar</small></div><div class="kpi"><span>Diese Woche erledigt</span><strong>9</strong><small>vollständig protokolliert</small></div></div><div class="card"><div class="card-head"><div><h2>Dokumentenfreigabe</h2><p>VA.018.04 · Fremdfirmenmanagement · Version 2.0</p></div>${status("In Prüfung")}</div><div class="workflow"><div class="workflow-step done">1. Entwurf<br><strong>erstellt</strong></div><div class="workflow-step done">2. Fachprüfung<br><strong>abgeschlossen</strong></div><div class="workflow-step active">3. IMS-Prüfung<br><strong>offen</strong></div><div class="workflow-step">4. Freigabe<br><strong>Geschäftsführung</strong></div><div class="workflow-step">5. Veröffentlichung<br><strong>automatisch</strong></div></div><div class="actions" style="margin-top:16px"><button class="btn" onclick="toast('Dokument wurde freigegeben und an die nächste Stufe weitergeleitet.')">✓ Prüfen & weiterleiten</button><button class="btn danger" onclick="toast('Dokument wurde mit Kommentar an den Ersteller zurückgegeben.')">Zurückgeben</button><button class="btn secondary" onclick="openDoc('VA.004.03')">Dokument anzeigen</button></div></div><div class="card"><div class="card-head"><div><h2>Offene Aufgaben</h2><p>Aufgaben werden rollen- und zuständigkeitsbezogen angezeigt.</p></div></div><div class="task-list">${task("📝", "RL.003.01 – Homeoffice-Regelung", "Fachprüfung durch Personal / IMS", "Heute", "bad")}${task("✅", "AA.031.02 – Wareneingangsprüfung", "Freigabe durch Bereichsleitung", "02.09.2026", "warn")}${task("📄", "VA.018.04 – Fremdfirmenmanagement", "IMS-Prüfung", "04.09.2026", "warn")}</div></div>`;
}
function renderDeadlines() {
  setHead(
    "Fristen & Wiedervorlagen",
    "Befristungen und regelmäßige Prüfungen automatisch im Blick behalten.",
  );
  content.innerHTML = `<div class="info-strip">Neben Dokumenten können hier auch <strong>befristete Bescheide, Steuerbefreiungen, Zertifikate, Verträge oder Genehmigungen</strong> überwacht werden. Erinnerungsstufen könnten z. B. 90, 60, 30 und 14 Tage vor Ablauf erfolgen.</div><div class="card"><div class="card-head"><div><h2>Aktive Wiedervorlagen</h2><p>Priorisiert nach Fälligkeit.</p></div><button class="btn" onclick="toast('Neue Wiedervorlage angelegt.')">+ Wiedervorlage</button></div><div class="task-list">${task("🚗", "Steuerbefreiung E-Fahrzeug HH-TP 417", "TP Holding GmbH · Fuhrpark · Verantwortlich: Fuhrparkmanagement", "18.09.2026", "bad")}${task("📑", "Rahmenvertrag Entsorgungsdienstleister", "TGA Systemtechnik GmbH · Einkauf", "30.09.2026", "bad")}${task("📜", "ISO 9001 Zertifikat", "Alle Unternehmen · Qualitätsmanagement", "31.12.2026", "warn")}${task("🦺", "VA.004.03 Arbeitsunfälle", "Alle Unternehmen · Arbeitssicherheit", "01.03.2027", "")}${task("🧪", "Gefahrstoffverzeichnis", "Norddeutsche Flächenheizsysteme GmbH · Arbeitssicherheit", "15.04.2027", "")}</div></div>`;
}
function renderAreas() {
  setHead("Öffentliche Bereiche", "Zentrale Dateien und Informationen für alle Beschäftigten.");
  const folders = [
    ["📁", "Ansprechpartner", "Kontaktdaten und Zuständigkeiten"],
    ["📁", "Arbeitssicherheit", "Informationen, Hinweise und Unterlagen"],
    ["📁", "Doku-Management", "Allgemeine Dokumentation"],
    ["📁", "Flyer_Unternehmenspräsentation", "Freigegebene Flyer und Präsentationen"],
    ["📁", "Fotos", "Öffentlich bereitgestellte Unternehmensfotos"],
    ["📁", "Geburtstagsliste", "Aktuelle Geburtstagsübersicht"],
    ["📁", "Organigramm", "Organigramme des Unternehmensverbunds"],
    ["📁", "Video", "Freigegebene Videos"],
    ["📁", "Vorlagen & Layouts", "Word-, Excel- und Layoutvorlagen zum Download"]
  ];
  content.innerHTML = `<div class="card"><div class="card-head"><div><h2>Öffentlicher Bereich</h2><p>Die heute gemeinsam genutzten Inhalte werden zentral im TP-Managementportal bereitgestellt.</p></div>${portalView === "full" ? '<button class="btn" onclick="toast(\'Neuer Ordner kann angelegt werden.\')">+ Neuer Ordner</button>' : ''}</div><div class="folder-list">${folders.map(f => `<button class="folder-row" onclick="toast('Ordner ${f[1]} geöffnet.')"><span class="folder-icon">${f[0]}</span><span><strong>${f[1]}</strong><small>${f[2]}</small></span><span class="folder-arrow">›</span></button>`).join("")}</div></div>`;
}
function renderMyFiles() {
  setHead("Meine Dateien", "Ihr persönlicher Arbeitsbereich im TP-Managementportal.");
  content.innerHTML = `<div class="info-strip"><strong>Persönlicher Bereich:</strong> Auf diese Dateien und Ordner hat standardmäßig nur der angemeldete Mitarbeiter Zugriff.</div><div class="card"><div class="card-head"><div><h2>Meine Ordner</h2><p>Eigene Ordnerstruktur anlegen und Arbeitsdateien zentral speichern.</p></div><div class="actions"><button class="btn secondary" onclick="toast('Dateiauswahl geöffnet.')">↑ Datei hochladen</button><button class="btn" onclick="toast('Neuer persönlicher Ordner angelegt.')">+ Neuer Ordner</button></div></div><div class="folder-list">${[["Projekte","3 Ordner · 12 Dateien"],["Fuhrpark","2 Ordner · 4 Dateien"],["Formulare","7 Dateien"],["Sonstiges","5 Dateien"]].map(f=>`<button class="folder-row" onclick="toast('Ordner ${f[0]} geöffnet.')"><span class="folder-icon">📁</span><span><strong>${f[0]}</strong><small>${f[1]}</small></span><span class="folder-arrow">›</span></button>`).join('')}</div></div>`;
}
function renderShared() {
  setHead("Für mich freigegeben", "Ordner und Dateien, die gezielt mit Ihnen geteilt wurden.");
  content.innerHTML = `<div class="info-strip">Freigaben können für einzelne Personen vergeben werden. Unterordner übernehmen standardmäßig die Berechtigung des übergeordneten Ordners.</div><div class="card"><div class="card-head"><div><h2>Freigegebene Ordner</h2><p>Gemeinsame Arbeitsbereiche außerhalb des öffentlichen Bereichs.</p></div>${portalView === "full" ? '<button class="btn" onclick="toast(\'Freigabe kann verwaltet werden.\')">Freigaben verwalten</button>' : ''}</div><div class="folder-list">${[["Projekt Neubau Lagerhalle","Freigegeben für 4 Personen · Bearbeiten erlaubt"],["Fuhrpark – Jahresplanung","Freigegeben für 3 Personen · Bearbeiten erlaubt"],["IMS Projektunterlagen","Freigegeben für 5 Personen · Lesen erlaubt"]].map(f=>`<button class="folder-row" onclick="toast('Ordner ${f[0]} geöffnet.')"><span class="folder-icon">📁</span><span><strong>${f[0]}</strong><small>${f[1]}</small></span><span class="share-pill">Personenfreigabe</span><span class="folder-arrow">›</span></button>`).join('')}</div></div>`;
}
function renderCompanies() {
  setHead(
    "Unternehmen",
    "Dokumente und Verantwortlichkeiten für den gesamten Unternehmensverbund strukturieren.",
  );
  content.innerHTML = `<div class="card"><div class="card-head"><div><h2>Unternehmensverbund</h2><p>Ein Dokument kann einer Firma oder allen Unternehmen zugeordnet werden.</p></div><button class="btn">+ Unternehmen</button></div><div class="company-grid">${companies
    .slice(1)
    .map((c, i) => {
      const m = companyMeta[c];
      return `<div class="company-card" onclick="render('documents')"><div class="company-logo-wrap"><img src="${m.logo}" alt="${esc(c)} Logo"></div><div class="company-card-copy"><strong>${c}</strong><span>${[42, 31, 28, 25][i]} zugeordnete Dokumente · ${[3, 2, 1, 1][i]} offene Aufgaben</span></div><div class="company-card-arrow">›</div></div>`;
    })
    .join("")}</div></div>`;
}
function renderArchive() {
  setHead(
    "Archiv / Historie",
    "Alte Versionen und Änderungen revisionsnah nachvollziehen.",
  );
  content.innerHTML = `<div class="info-strip">Freigegebene Vorgängerversionen werden nicht überschrieben, sondern automatisch archiviert. So bleibt jederzeit nachvollziehbar, welche Fassung zu welchem Zeitpunkt gültig war.</div><div class="card"><div class="card-head"><div><h2>Versionshistorie – AA.022.01</h2><p>Führerscheinkontrolle</p></div></div>${docTable(
    [
      {
        ...docs[0],
        version: "1.0",
        status: "Freigegeben",
        review: "15.06.2027",
      },
      { ...docs[0], version: "0.9", status: "Archiviert", review: "–" },
      { ...docs[0], version: "0.8", status: "Archiviert", review: "–" },
    ],
  )}</div>`;
}
function renderUsers() {
  setHead("Benutzer & Rechte", "Rollen und Zugriffe zentral steuern.");
  content.innerHTML = `<div class="card"><div class="card-head"><div><h2>Beispielhafte Rollen</h2><p>Rechte können zusätzlich auf Unternehmen und Bereiche eingeschränkt werden.</p></div><button class="btn">+ Benutzer</button></div><div class="table-wrap"><table class="data-table"><thead><tr><th>Rolle</th><th>Lesen</th><th>Dokumente erstellen</th><th>Prüfen</th><th>Freigeben</th><th>Administration</th></tr></thead><tbody><tr><td><strong>Mitarbeiter</strong></td><td>Freigegebene Inhalte</td><td>–</td><td>–</td><td>–</td><td>–</td></tr><tr><td><strong>Bereichsverantwortlicher</strong></td><td>Eigene Bereiche</td><td>✓</td><td>✓</td><td>optional</td><td>–</td></tr><tr><td><strong>IMS-Verantwortlicher</strong></td><td>Alle Bereiche</td><td>✓</td><td>✓</td><td>✓</td><td>Workflow</td></tr><tr><td><strong>Geschäftsführung</strong></td><td>Alle Bereiche</td><td>–</td><td>✓</td><td>✓</td><td>–</td></tr><tr><td><strong>Administrator</strong></td><td>Alle</td><td>✓</td><td>✓</td><td>✓</td><td>✓</td></tr></tbody></table></div></div>`;
}
function renderSettings() {
  setHead(
    "Systemeinstellungen",
    "Nummernsystem, Dokumentarten und Workflows konfigurieren.",
  );
  content.innerHTML = `<div class="three-col"><div class="card"><h2>Dokumentarten</h2><p class="muted">AA · Arbeitsanweisung<br>VA · Verfahrensanweisung<br>BA · Betriebsanweisung<br>FO · Formular<br>RL · Richtlinie<br>ZERT · Zertifikat</p></div><div class="card"><h2>Nummernsystem</h2><p class="muted">Automatische Vergabe je Dokumentart und Bereich. Beispiel: <strong>AA.022.01</strong></p></div><div class="card"><h2>Erinnerungsstufen</h2><p class="muted">Standard: 90 / 60 / 30 / 14 Tage vor Fälligkeit. Je Dokument individuell anpassbar.</p></div></div>`;
}
function openDoc(id) {
  const d = docs.find((x) => x.id === id) || docs[0];
  if (portalView === "employee") {
    modalContent.innerHTML = `<div class="modal-box"><div class="modal-head"><div><h2>${d.id} · ${esc(d.title)}</h2><p>${esc(d.type)} · Version ${d.version}</p></div><button class="close-btn" onclick="closeModal()">×</button></div><div class="detail-grid"><div class="detail-item"><span>Unternehmen</span><strong>${esc(d.company)}</strong></div><div class="detail-item"><span>Bereich</span><strong>${esc(d.area)}</strong></div><div class="detail-item"><span>Dokumentart</span><strong>${esc(d.type)}</strong></div><div class="detail-item"><span>Version</span><strong>${d.version}</strong></div></div><p style="font-size:12px;line-height:1.55">${esc(d.note)}</p><div class="employee-document-note">Es wird immer die aktuell freigegebene Version bereitgestellt.</div><div class="modal-footer"><button class="btn secondary" onclick="closeModal()">Schließen</button><button class="btn" onclick="toast('Dokument wird geöffnet.')">Dokument öffnen</button></div></div>`;
  } else {
    modalContent.innerHTML = `<div class="modal-box"><div class="modal-head"><div><h2>${d.id} · ${esc(d.title)}</h2><p>${esc(d.type)} · Version ${d.version}</p></div><button class="close-btn" onclick="closeModal()">×</button></div><div class="detail-grid"><div class="detail-item"><span>Unternehmen</span><strong>${esc(d.company)}</strong></div><div class="detail-item"><span>Bereich</span><strong>${esc(d.area)}</strong></div><div class="detail-item"><span>Status</span><strong>${d.status}</strong></div><div class="detail-item"><span>Verantwortlich</span><strong>${esc(d.owner)}</strong></div><div class="detail-item"><span>Nächste Prüfung</span><strong>${d.review}</strong></div><div class="detail-item"><span>Version</span><strong>${d.version}</strong></div></div><p style="font-size:12px;line-height:1.55">${esc(d.note)}</p><h3 style="font-size:13px">Freigabe- / Änderungshistorie</h3><div class="timeline"><div class="timeline-item"><strong>Freigabe abgeschlossen</strong><span>durch Geschäftsführung · 15.06.2026, 10:42 Uhr</span></div><div class="timeline-item"><strong>IMS-Prüfung abgeschlossen</strong><span>durch IMS-Administration · 14.06.2026, 14:16 Uhr</span></div><div class="timeline-item"><strong>Dokument eingestellt</strong><span>durch ${esc(d.owner)} · 12.06.2026, 09:08 Uhr</span></div></div><div class="modal-footer"><button class="btn secondary" onclick="toast('PDF-Vorschau wird geöffnet.')">PDF anzeigen</button><button class="btn" onclick="toast('Neue Version wird aus dem aktuellen Dokument erzeugt.')">Neue Version erstellen</button></div></div>`;
  }
  modal.showModal();
}
function openNewDoc() {
  modalContent.innerHTML = `<div class="modal-box"><div class="modal-head"><div><h2>Neues Dokument anlegen</h2><p>Strukturierte Aufnahme in die Dokumentenlenkung.</p></div><button class="close-btn" onclick="closeModal()">×</button></div><div class="form-grid"><label class="field"><span>Dokumentart</span><select><option>Arbeitsanweisung</option><option>Verfahrensanweisung</option><option>Betriebsanweisung</option><option>Formular</option><option>Richtlinie</option></select></label><label class="field"><span>Dokumentnummer</span><input value="wird automatisch vergeben" disabled></label><label class="field full"><span>Titel</span><input placeholder="Titel des Dokuments"></label><label class="field"><span>Unternehmen</span><select>${companies
    .slice(1)
    .concat(["Alle Unternehmen"])
    .map((x) => `<option>${x}</option>`)
    .join(
      "",
    )}</select></label><label class="field"><span>Bereich</span><select><option>Arbeitssicherheit</option><option>Personal</option><option>Fuhrpark</option><option>Qualitätsmanagement</option><option>Einkauf / Lager</option></select></label><label class="field"><span>Prüfintervall</span><select><option>12 Monate</option><option>24 Monate</option><option>36 Monate</option><option>individuelles Datum</option></select></label><label class="field"><span>Freigabeworkflow</span><select><option>Fachprüfung → IMS → Geschäftsführung</option><option>Fachprüfung → Bereichsleitung</option><option>IMS → Geschäftsführung</option></select></label><label class="field full"><span>Datei</span><input type="file"></label></div><div class="modal-footer"><button class="btn secondary" onclick="closeModal()">Abbrechen</button><button class="btn" onclick="closeModal();toast('Dokument angelegt und Freigabeworkflow gestartet.')">Anlegen & Workflow starten</button></div></div>`;
  modal.showModal();
}
function closeModal() {
  modal.close();
}
function toast(msg) {
  const t = document.querySelector("#toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2600);
}
function applyProfile(profile) {
  currentProfile = profile;
  portalView = profile.role === "employee" ? "employee" : "full";
  document.querySelector(".role-heading").textContent =
    profile.role === "admin"
      ? "Adminbereich"
      : profile.role === "supervisor"
        ? "Vorgesetztenbereich"
        : "Mitarbeiterbereich";
  document.querySelector("#user-name").textContent = profile.name || profile.email || "Mitarbeiter";
  document.querySelector("#user-role").textContent = ROLE_LABELS[profile.role] || profile.role;
  document.querySelector("#user-avatar").textContent = initials(profile.name || profile.email);
  const settingsBtn = document.querySelector("#settings-link");
  if (settingsBtn) settingsBtn.style.display = profile.role === "admin" ? "" : "none";
  current = "dashboard";
  render("dashboard");
}

function showLogin(message = "") {
  currentProfile = null;
  document.querySelector("#app-shell").classList.add("hidden");
  document.querySelector("#login-page").classList.remove("hidden");
  document.querySelector("#login-message").textContent = message;
}

function showPortal(profile) {
  document.querySelector("#login-message").textContent = "";
  document.querySelector("#login-page").classList.add("hidden");
  document.querySelector("#app-shell").classList.remove("hidden");
  applyProfile(profile);
}

window.render = render;
window.openDoc = openDoc;
window.openNewDoc = openNewDoc;
window.closeModal = closeModal;
window.toast = toast;

document.querySelector("#settings-link").onclick = () => render("settings");
document.querySelector("#logout-btn").onclick = () => logout();
document.querySelector("#portal-info").onclick = () => {
  modalContent.innerHTML = `<div class="modal-box"><div class="modal-head"><div><h2>TP-Managementportal</h2><p>Version 0.2</p></div><button class="close-btn" onclick="closeModal()">×</button></div><p style="font-size:12px;line-height:1.65">Zentrale Plattform für gelenkte Unternehmensdokumente, öffentliche Informationen, persönliche Dateien und gezielt freigegebene Arbeitsbereiche.</p><p style="font-size:12px;line-height:1.65">Die Anmeldung und Zugangsberechtigung werden über das TP-Personalmanagement gesteuert. Die Rollen Mitarbeiter, Vorgesetzter und Admin bestimmen automatisch den Funktionsumfang.</p><div class="modal-footer"><button class="btn" onclick="closeModal()">Schließen</button></div></div>`;
  modal.showModal();
};

document.querySelector("#personalmanagement-link").onclick = () => {
  const url = localStorage.getItem("tpPersonalmanagementUrl") || "";
  if (url) window.open(url, "_blank", "noopener");
  else toast("Die produktive URL des TP-Personalmanagements wird hier noch hinterlegt.");
};

document.querySelector("#login-form").addEventListener("submit", async e => {
  e.preventDefault();
  const msg = document.querySelector("#login-message");
  msg.textContent = "Anmeldung läuft …";
  try {
    await login(
      document.querySelector("#login-identifier").value,
      document.querySelector("#login-password").value
    );
  } catch (err) {
    console.error(err);
    msg.textContent = "Anmeldung nicht möglich. Bitte Zugangsdaten prüfen.";
  }
});

document.querySelector("#forgot-password-btn").onclick = async () => {
  try {
    await requestPasswordReset(document.querySelector("#login-identifier").value);
    toast("Passwort-Link wurde angefordert.");
  } catch (err) {
    toast(err.message || "Passwort-Link konnte nicht angefordert werden.");
  }
};

observeAuth(async user => {
  if (!user) {
    showLogin();
    return;
  }
  try {
    const profile = await loadPortalProfile(user);
    showPortal(profile);
  } catch (err) {
    console.error(err);
    await logout();
    showLogin(err.message || "Der Zugang zum TP-Managementportal ist nicht möglich.");
  }
});

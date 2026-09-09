const KEY = "tpManagementPortal.workflows.v03";

function readRows() {
  try {
    const rows = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

function writeRows(rows) {
  localStorage.setItem(KEY, JSON.stringify(rows));
}

function matchesUser(task, profile, side = "assignee") {
  const uid = String(profile?.id || profile?.uid || "").trim();
  const name = String(profile?.name || "").trim().toLowerCase();
  const email = String(profile?.email || "").trim().toLowerCase();
  if (side === "assignee") {
    if (task.assigneeId && uid) return task.assigneeId === uid;
    const a = String(task.assignee || "").trim().toLowerCase();
    const ae = String(task.assigneeEmail || "").trim().toLowerCase();
    return Boolean((a && (a === name || a === email)) || (ae && ae === email));
  }
  if (task.createdById && uid) return task.createdById === uid;
  const cb = String(task.createdBy || "").trim().toLowerCase();
  return Boolean(cb && (cb === name || cb === email));
}

export function createWorkflowTask(document, assignee, createdBy = "", createdById = "", kind = "review") {
  const rows = readRows();
  const now = new Date().toISOString();
  const task = {
    id: `WF-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    kind,
    documentId: document.id,
    documentTitle: document.title,
    documentType: document.type,
    assignee: String(assignee?.name || assignee?.email || "").trim(),
    assigneeEmail: String(assignee?.email || "").trim(),
    assigneeId: String(assignee?.id || "").trim(),
    createdBy,
    createdById: String(createdById || "").trim(),
    status: "Offen",
    decisionNote: "",
    createdAt: now,
    updatedAt: now,
  };
  rows.push(task);
  writeRows(rows);
  return task;
}

export function createQmWorkflowTask(document, qmUser, createdBy = "", createdById = "") {
  return createWorkflowTask(document, qmUser, createdBy, createdById, "qm");
}

export function getWorkflowTasks() {
  return readRows().sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
}

export function getTasksForUser(profile) {
  return getWorkflowTasks().filter((t) => t.status === "Offen" && matchesUser(t, profile, "assignee"));
}

export function getRejectedTasksForCreator(profile, documents = []) {
  const rejectedDocIds = new Set(documents.filter(d => d.status === "Abgelehnt").map(d => d.id));
  return getWorkflowTasks().filter((t) => t.status === "Abgelehnt" && rejectedDocIds.has(t.documentId) && matchesUser(t, profile, "creator"));
}

export function getWorkflowTasksVisibleToUser(profile) {
  return getWorkflowTasks().filter((t) => matchesUser(t, profile, "assignee") || matchesUser(t, profile, "creator"));
}

export function decideWorkflowTask(id, decision, completedBy = "", note = "") {
  const rows = readRows();
  const task = rows.find((x) => x.id === id);
  if (!task) return null;
  task.status = decision === "reject" ? "Abgelehnt" : decision === "publish" ? "Veröffentlicht" : "Freigegeben";
  task.completedBy = completedBy;
  task.decisionNote = String(note || "").trim();
  task.updatedAt = new Date().toISOString();
  writeRows(rows);
  return task;
}

export function renameWorkflowDocument(oldId, newId) {
  const rows = readRows();
  rows.forEach(t => { if (t.documentId === oldId) t.documentId = newId; });
  writeRows(rows);
}

export function deleteWorkflowTasksForDocument(documentId) {
  writeRows(readRows().filter(t => t.documentId !== documentId));
}

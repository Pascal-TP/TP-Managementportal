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

export function createWorkflowTask(document, assignee, createdBy = "", createdById = "") {
  const rows = readRows();
  const now = new Date().toISOString();
  const task = {
    id: `WF-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    documentId: document.id,
    documentTitle: document.title,
    documentType: document.type,
    assignee: String(assignee?.name || assignee?.email || "").trim(),
    assigneeEmail: String(assignee?.email || "").trim(),
    assigneeId: String(assignee?.id || "").trim(),
    createdBy,
    createdById: String(createdById || "").trim(),
    status: "Offen",
    createdAt: now,
    updatedAt: now,
  };
  rows.push(task);
  writeRows(rows);
  return task;
}

export function getWorkflowTasks() {
  return readRows().sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
}

export function getTasksForUser(profile) {
  const uid = String(profile?.id || "").trim();
  const name = String(profile?.name || "").trim().toLowerCase();
  const email = String(profile?.email || "").trim().toLowerCase();
  return getWorkflowTasks().filter((t) => {
    if (t.status !== "Offen") return false;
    if (t.assigneeId && uid) return t.assigneeId === uid;
    const a = String(t.assignee || "").trim().toLowerCase();
    const ae = String(t.assigneeEmail || "").trim().toLowerCase();
    return Boolean((a && (a === name || a === email)) || (ae && ae === email));
  });
}

export function getWorkflowTasksVisibleToUser(profile) {
  const uid = String(profile?.id || profile?.uid || "").trim();
  const name = String(profile?.name || "").trim().toLowerCase();
  const email = String(profile?.email || "").trim().toLowerCase();
  return getWorkflowTasks().filter((t) => {
    if (t.assigneeId && uid && t.assigneeId === uid) return true;
    if (t.createdById && uid && t.createdById === uid) return true;
    const a = String(t.assignee || "").trim().toLowerCase();
    const ae = String(t.assigneeEmail || "").trim().toLowerCase();
    const cb = String(t.createdBy || "").trim().toLowerCase();
    return Boolean((a && (a === name || a === email)) || (ae && ae === email) || (cb && (cb === name || cb === email)));
  });
}

export function completeWorkflowTask(id, completedBy = "") {
  const rows = readRows();
  const task = rows.find((x) => x.id === id);
  if (!task) return null;
  task.status = "Erledigt";
  task.completedBy = completedBy;
  task.updatedAt = new Date().toISOString();
  writeRows(rows);
  return task;
}

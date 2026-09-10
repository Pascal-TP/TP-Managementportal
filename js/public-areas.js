import { auth, cloudFunctions } from "./firebase.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-functions.js";

const callList = httpsCallable(cloudFunctions, "listManagementPortalPublicItems");
const callCreateFolder = httpsCallable(cloudFunctions, "createManagementPortalPublicFolder");
const callUpdateItem = httpsCallable(cloudFunctions, "updateManagementPortalPublicItem");
const callCreateLink = httpsCallable(cloudFunctions, "createManagementPortalPublicLink");
const callUpload = httpsCallable(cloudFunctions, "uploadManagementPortalPublicFile");
const callUrl = httpsCallable(cloudFunctions, "getManagementPortalPublicFileUrl");
const callDelete = httpsCallable(cloudFunctions, "deleteManagementPortalPublicItem");

const state = {
  folderId: null,
  breadcrumbs: [],
  items: { folders: [], files: [], links: [] },
  busy: false
};

function token() {
  return auth.currentUser?.getIdToken() || Promise.reject(new Error("Keine aktive Anmeldung gefunden."));
}

function unwrap(result) { return result?.data || {}; }
function safeEsc(esc, value) { return esc ? esc(value) : String(value ?? ""); }
function errorText(err, fallback) { return err?.message?.replace(/^Firebase:\s*/i, "") || fallback; }

function fmtDateTime(value) {
  if (!value) return "–";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "–" : d.toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" });
}

function humanSize(bytes = 0) {
  const n = Number(bytes) || 0;
  if (!n) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = n, i = 0;
  while (value >= 1024 && i < units.length - 1) { value /= 1024; i += 1; }
  return `${value.toFixed(i ? 1 : 0)} ${units[i]}`;
}

function isPreviewable(file) {
  const type = String(file?.contentType || "").toLowerCase();
  const name = String(file?.name || "").toLowerCase();
  return type === "application/pdf" || name.endsWith(".pdf") || type.startsWith("image/") || type.startsWith("text/");
}

function fileIcon(file) {
  const type = String(file?.contentType || "").toLowerCase();
  const name = String(file?.name || "").toLowerCase();
  if (type === "application/pdf" || name.endsWith(".pdf")) return "PDF";
  if (/\.(doc|docx|odt)$/i.test(name)) return "W";
  if (/\.(xls|xlsx|ods|csv)$/i.test(name)) return "X";
  if (/\.(ppt|pptx|odp)$/i.test(name)) return "P";
  if (type.startsWith("image/")) return "IMG";
  if (/\.(zip|7z|rar)$/i.test(name)) return "ZIP";
  if (/\.(mp4|mov|avi|webm|mkv)$/i.test(name)) return "VID";
  return "DOC";
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || "").split(",")[1] || "");
    reader.onerror = () => reject(reader.error || new Error("Datei konnte nicht gelesen werden."));
    reader.readAsDataURL(file);
  });
}

export async function renderPublicAreasModule(ctx) {
  const { content, modal, modalContent, esc, toast, profile } = ctx;
  const isAdmin = profile?.role === "admin";

  content.innerHTML = `
    <div class="public-shell">
      <div class="public-toolbar">
        <div class="public-toolbar-left">
          ${isAdmin ? `
            <button class="btn" id="public-new-folder">+ Neuer Ordner</button>
            <button class="btn secondary" id="public-upload">⇧ Dateien hochladen</button>
            <button class="btn secondary" id="public-new-link">🔗 Link anlegen</button>
            <input id="public-file-input" type="file" multiple hidden>
          ` : ""}
          <button class="btn secondary" id="public-refresh">↻ Aktualisieren</button>
        </div>
        ${isAdmin ? '<span class="public-admin-pill">Bearbeitung: Admin</span>' : '<span class="public-read-pill">Nur Lesen</span>'}
      </div>

      <div class="public-breadcrumbs" id="public-breadcrumbs"></div>

      ${isAdmin ? `<div class="public-dropzone" id="public-dropzone">
        <span class="public-drop-icon">⇧</span>
        <div><strong>Dateien hier hineinziehen und ablegen</strong><small>Alle Dateiformate möglich · maximal 20 MB je Datei</small></div>
      </div>` : ""}

      <div class="card public-card">
        <div class="public-list-head">
          <div>Name</div><div>Geändert</div><div>Größe</div><div>Aktionen</div>
        </div>
        <div id="public-list" class="public-list"><div class="public-loading">Öffentlicher Bereich wird geladen …</div></div>
      </div>
    </div>`;

  const list = content.querySelector("#public-list");
  const crumbs = content.querySelector("#public-breadcrumbs");
  const input = content.querySelector("#public-file-input");
  const drop = content.querySelector("#public-dropzone");

  const showBusy = (text = "Bitte warten …") => { list.innerHTML = `<div class="public-loading">${safeEsc(esc, text)}</div>`; };

  async function loadCurrent() {
    if (state.busy) return;
    state.busy = true;
    showBusy();
    try {
      const idToken = await token();
      const data = unwrap(await callList({ idToken, parentId: state.folderId }));
      state.items = { folders: data.folders || [], files: data.files || [], links: data.links || [] };
      state.breadcrumbs = data.breadcrumbs || [];
      drawBreadcrumbs();
      draw();
    } catch (err) {
      list.innerHTML = `<div class="public-error">${safeEsc(esc, errorText(err, "Öffentlicher Bereich konnte nicht geladen werden."))}</div>`;
    } finally {
      state.busy = false;
    }
  }

  function drawBreadcrumbs() {
    if (!state.folderId) {
      crumbs.innerHTML = "";
      crumbs.hidden = true;
      return;
    }
    crumbs.hidden = false;
    const root = `<button data-public-folder="" class="public-crumb">Öffentliche Bereiche</button>`;
    const rest = state.breadcrumbs.map((b, i) => `<span>›</span><button data-public-folder="${safeEsc(esc, b.id)}" class="public-crumb ${i === state.breadcrumbs.length - 1 ? "active" : ""}">${safeEsc(esc, b.name)}</button>`).join("");
    crumbs.innerHTML = root + rest;
    crumbs.querySelectorAll("[data-public-folder]").forEach(btn => btn.onclick = () => {
      state.folderId = btn.dataset.publicFolder || null;
      loadCurrent();
    });
  }

  function folderRow(folder) {
    return `<div class="public-row folder">
      <button class="public-name-cell" data-open-folder="${safeEsc(esc, folder.id)}">
        <span class="public-type-icon folder">▰</span>
        <span><strong>${safeEsc(esc, folder.name)}</strong><small>${safeEsc(esc, folder.description || "Ordner")}</small></span>
      </button>
      <div>${fmtDateTime(folder.updatedAt || folder.createdAt)}</div><div>–</div>
      <div class="public-actions">
        ${isAdmin ? `<button class="btn secondary small" data-edit-folder="${safeEsc(esc, folder.id)}">Bearbeiten</button><button class="btn danger small" data-delete-folder="${safeEsc(esc, folder.id)}">Löschen</button>` : '<span class="public-open-hint">Öffnen ›</span>'}
      </div>
    </div>`;
  }

  function fileRow(file) {
    const primary = isPreviewable(file) ? "Öffnen" : "Herunterladen";
    return `<div class="public-row file">
      <button class="public-name-cell" data-open-file="${safeEsc(esc, file.id)}">
        <span class="public-type-icon">${fileIcon(file)}</span>
        <span><strong>${safeEsc(esc, file.name)}</strong><small>${safeEsc(esc, file.contentType || "Datei")}</small></span>
      </button>
      <div>${fmtDateTime(file.updatedAt || file.createdAt)}</div><div>${humanSize(file.size)}</div>
      <div class="public-actions">
        <button class="btn small" data-open-file="${safeEsc(esc, file.id)}">${primary}</button>
        ${isAdmin ? `<button class="btn secondary small" data-edit-file="${safeEsc(esc, file.id)}">Umbenennen</button><button class="btn danger small" data-delete-file="${safeEsc(esc, file.id)}">Löschen</button>` : ""}
      </div>
    </div>`;
  }

  function linkRow(link) {
    return `<div class="public-row link">
      <button class="public-name-cell" data-open-link="${safeEsc(esc, link.id)}">
        <span class="public-type-icon link">↗</span>
        <span><strong>${safeEsc(esc, link.name)}</strong><small>${safeEsc(esc, link.description || link.url)}</small></span>
      </button>
      <div>${fmtDateTime(link.updatedAt || link.createdAt)}</div><div>Link</div>
      <div class="public-actions">
        <button class="btn small" data-open-link="${safeEsc(esc, link.id)}">Öffnen</button>
        ${isAdmin ? `<button class="btn secondary small" data-edit-link="${safeEsc(esc, link.id)}">Bearbeiten</button><button class="btn danger small" data-delete-link="${safeEsc(esc, link.id)}">Löschen</button>` : ""}
      </div>
    </div>`;
  }

  function draw() {
    const rows = [
      ...(state.items.folders || []).map(folderRow),
      ...(state.items.files || []).map(fileRow),
      ...(state.items.links || []).map(linkRow)
    ];
    list.innerHTML = rows.length ? rows.join("") : `<div class="public-empty"><span>▱</span><strong>Dieser Ordner ist leer</strong><small>${isAdmin ? "Legen Sie einen Unterordner, eine Datei oder einen Link an." : "Hier wurden noch keine Inhalte bereitgestellt."}</small></div>`;
    bindRows();
  }

  function bindRows() {
    list.querySelectorAll("[data-open-folder]").forEach(btn => btn.onclick = () => { state.folderId = btn.dataset.openFolder; loadCurrent(); });
    list.querySelectorAll("[data-open-file]").forEach(btn => btn.onclick = () => openFile(btn.dataset.openFile));
    list.querySelectorAll("[data-open-link]").forEach(btn => btn.onclick = () => openLink(btn.dataset.openLink));
    if (!isAdmin) return;
    list.querySelectorAll("[data-edit-folder]").forEach(btn => btn.onclick = () => editFolderDialog(btn.dataset.editFolder));
    list.querySelectorAll("[data-edit-file]").forEach(btn => btn.onclick = () => renameFileDialog(btn.dataset.editFile));
    list.querySelectorAll("[data-edit-link]").forEach(btn => btn.onclick = () => editLinkDialog(btn.dataset.editLink));
    list.querySelectorAll("[data-delete-folder]").forEach(btn => btn.onclick = () => deleteItem("folder", btn.dataset.deleteFolder));
    list.querySelectorAll("[data-delete-file]").forEach(btn => btn.onclick = () => deleteItem("file", btn.dataset.deleteFile));
    list.querySelectorAll("[data-delete-link]").forEach(btn => btn.onclick = () => deleteItem("link", btn.dataset.deleteLink));
  }

  function closeModal() { if (modal.open) modal.close(); }

  function createFolderDialog() {
    modalContent.innerHTML = `<form id="public-folder-form" class="modal-box small-modal"><div class="modal-head"><div><h2>Neuen Ordner anlegen</h2><p>Ordnername und Kurzbeschreibung werden in der öffentlichen Übersicht angezeigt.</p></div><button class="close-btn" type="button">×</button></div><label class="field full"><span>Ordnername *</span><input id="public-folder-name" maxlength="180" required autofocus></label><label class="field full"><span>Kurzbeschreibung</span><input id="public-folder-description" maxlength="240" placeholder="z. B. Informationen, Hinweise und Unterlagen"></label><div class="modal-footer"><button type="button" class="btn secondary" id="public-folder-cancel">Abbrechen</button><button type="submit" class="btn">Ordner anlegen</button></div></form>`;
    modal.showModal();
    modalContent.querySelector(".close-btn").onclick = closeModal;
    modalContent.querySelector("#public-folder-cancel").onclick = closeModal;
    modalContent.querySelector("#public-folder-form").onsubmit = async e => {
      e.preventDefault();
      try {
        const idToken = await token();
        await callCreateFolder({ idToken, parentId: state.folderId, name: modalContent.querySelector("#public-folder-name").value.trim(), description: modalContent.querySelector("#public-folder-description").value.trim() });
        closeModal(); toast("Ordner wurde angelegt."); await loadCurrent();
      } catch (err) { toast(errorText(err, "Ordner konnte nicht angelegt werden.")); }
    };
  }

  function editFolderDialog(id) {
    const item = state.items.folders.find(x => x.id === id); if (!item) return;
    modalContent.innerHTML = `<form id="public-folder-edit-form" class="modal-box small-modal"><div class="modal-head"><div><h2>Ordner bearbeiten</h2><p>Name und Kurzbeschreibung können jederzeit angepasst werden.</p></div><button class="close-btn" type="button">×</button></div><label class="field full"><span>Ordnername *</span><input id="public-folder-edit-name" maxlength="180" required value="${safeEsc(esc, item.name)}"></label><label class="field full"><span>Kurzbeschreibung</span><input id="public-folder-edit-description" maxlength="240" value="${safeEsc(esc, item.description || "")}"></label><div class="modal-footer"><button type="button" class="btn secondary" id="public-folder-edit-cancel">Abbrechen</button><button type="submit" class="btn">Speichern</button></div></form>`;
    modal.showModal();
    modalContent.querySelector(".close-btn").onclick = closeModal;
    modalContent.querySelector("#public-folder-edit-cancel").onclick = closeModal;
    modalContent.querySelector("#public-folder-edit-form").onsubmit = async e => {
      e.preventDefault();
      try {
        const idToken = await token();
        await callUpdateItem({ idToken, kind: "folder", itemId: id, name: modalContent.querySelector("#public-folder-edit-name").value.trim(), description: modalContent.querySelector("#public-folder-edit-description").value.trim() });
        closeModal(); toast("Ordner wurde aktualisiert."); await loadCurrent();
      } catch (err) { toast(errorText(err, "Ordner konnte nicht geändert werden.")); }
    };
  }

  function linkDialog(item = null) {
    const editing = !!item;
    modalContent.innerHTML = `<form id="public-link-form" class="modal-box small-modal"><div class="modal-head"><div><h2>${editing ? "Link bearbeiten" : "Link anlegen"}</h2><p>Webseiten und andere Web-Ressourcen können wie in Teams direkt im Ordner abgelegt werden.</p></div><button class="close-btn" type="button">×</button></div><label class="field full"><span>Name *</span><input id="public-link-name" maxlength="180" required value="${safeEsc(esc, item?.name || "")}"></label><label class="field full"><span>Internetadresse *</span><input id="public-link-url" type="text" required placeholder="https://..." value="${safeEsc(esc, item?.url || "")}"></label><label class="field full"><span>Kurzbeschreibung</span><input id="public-link-description" maxlength="240" value="${safeEsc(esc, item?.description || "")}"></label><div class="modal-footer"><button type="button" class="btn secondary" id="public-link-cancel">Abbrechen</button><button type="submit" class="btn">${editing ? "Speichern" : "Link anlegen"}</button></div></form>`;
    modal.showModal();
    modalContent.querySelector(".close-btn").onclick = closeModal;
    modalContent.querySelector("#public-link-cancel").onclick = closeModal;
    modalContent.querySelector("#public-link-form").onsubmit = async e => {
      e.preventDefault();
      const payload = { idToken: await token(), name: modalContent.querySelector("#public-link-name").value.trim(), url: modalContent.querySelector("#public-link-url").value.trim(), description: modalContent.querySelector("#public-link-description").value.trim() };
      try {
        if (editing) await callUpdateItem({ ...payload, kind: "link", itemId: item.id });
        else await callCreateLink({ ...payload, parentId: state.folderId });
        closeModal(); toast(editing ? "Link wurde aktualisiert." : "Link wurde angelegt."); await loadCurrent();
      } catch (err) { toast(errorText(err, "Link konnte nicht gespeichert werden.")); }
    };
  }

  function editLinkDialog(id) { const item = state.items.links.find(x => x.id === id); if (item) linkDialog(item); }

  function renameFileDialog(id) {
    const item = state.items.files.find(x => x.id === id); if (!item) return;
    modalContent.innerHTML = `<form id="public-file-edit-form" class="modal-box small-modal"><div class="modal-head"><div><h2>Datei umbenennen</h2><p>Die Datei selbst bleibt unverändert.</p></div><button class="close-btn" type="button">×</button></div><label class="field full"><span>Dateiname *</span><input id="public-file-edit-name" maxlength="180" required value="${safeEsc(esc, item.name)}"></label><div class="modal-footer"><button type="button" class="btn secondary" id="public-file-edit-cancel">Abbrechen</button><button type="submit" class="btn">Speichern</button></div></form>`;
    modal.showModal();
    modalContent.querySelector(".close-btn").onclick = closeModal;
    modalContent.querySelector("#public-file-edit-cancel").onclick = closeModal;
    modalContent.querySelector("#public-file-edit-form").onsubmit = async e => {
      e.preventDefault();
      try {
        const idToken = await token();
        await callUpdateItem({ idToken, kind: "file", itemId: id, name: modalContent.querySelector("#public-file-edit-name").value.trim() });
        closeModal(); toast("Datei wurde umbenannt."); await loadCurrent();
      } catch (err) { toast(errorText(err, "Datei konnte nicht umbenannt werden.")); }
    };
  }

  async function uploadFiles(fileList) {
    const files = [...(fileList || [])]; if (!files.length) return;
    let uploaded = 0;
    for (const file of files) {
      if (file.size > 20 * 1024 * 1024) { toast(`${file.name}: maximal 20 MB je Datei.`); continue; }
      showBusy(`„${file.name}“ wird hochgeladen …`);
      try {
        const idToken = await token();
        const base64Data = await fileToBase64(file);
        await callUpload({ idToken, parentId: state.folderId, fileName: file.name, contentType: file.type || "application/octet-stream", base64Data });
        uploaded += 1;
      } catch (err) { toast(`${file.name}: ${errorText(err, "Upload fehlgeschlagen.")}`); }
    }
    if (uploaded) toast(uploaded === 1 ? "Datei wurde hochgeladen." : `${uploaded} Dateien wurden hochgeladen.`);
    await loadCurrent();
  }

  async function openFile(fileId) {
    const file = state.items.files.find(x => x.id === fileId); if (!file) return;
    try {
      const idToken = await token();
      const data = unwrap(await callUrl({ idToken, fileId, mode: isPreviewable(file) ? "inline" : "attachment" }));
      if (!data.url) throw new Error("Keine Datei-URL erhalten.");
      const w = window.open(data.url, "_blank", "noopener,noreferrer");
      if (!w) window.location.href = data.url;
    } catch (err) { toast(errorText(err, "Datei konnte nicht geöffnet werden.")); }
  }

  function openLink(id) {
    const item = state.items.links.find(x => x.id === id); if (!item?.url) return;
    const w = window.open(item.url, "_blank", "noopener,noreferrer");
    if (!w) window.location.href = item.url;
  }

  async function deleteItem(kind, id) {
    const source = kind === "folder" ? state.items.folders : kind === "file" ? state.items.files : state.items.links;
    const item = source.find(x => x.id === id); if (!item) return;
    const message = kind === "folder" ? `Leeren Ordner „${item.name}“ endgültig löschen?` : `${kind === "link" ? "Link" : "Datei"} „${item.name}“ endgültig löschen?`;
    if (!confirm(message)) return;
    try {
      const idToken = await token();
      await callDelete({ idToken, kind, itemId: id });
      toast(kind === "folder" ? "Ordner wurde gelöscht." : kind === "link" ? "Link wurde gelöscht." : "Datei wurde gelöscht.");
      await loadCurrent();
    } catch (err) { toast(errorText(err, "Löschen fehlgeschlagen.")); }
  }

  content.querySelector("#public-refresh").onclick = loadCurrent;
  if (isAdmin) {
    content.querySelector("#public-new-folder").onclick = createFolderDialog;
    content.querySelector("#public-new-link").onclick = () => linkDialog();
    content.querySelector("#public-upload").onclick = () => input.click();
    input.onchange = () => { uploadFiles(input.files); input.value = ""; };
    ["dragenter", "dragover"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add("dragover"); }));
    ["dragleave", "drop"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove("dragover"); }));
    drop.addEventListener("drop", e => uploadFiles(e.dataTransfer?.files));
  }

  await loadCurrent();
}

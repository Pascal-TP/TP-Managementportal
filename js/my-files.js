import { auth, cloudFunctions } from "./firebase.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-functions.js";

const callList = httpsCallable(cloudFunctions, "listManagementPortalPrivateItems");
const callCreateFolder = httpsCallable(cloudFunctions, "createManagementPortalPrivateFolder");
const callUpload = httpsCallable(cloudFunctions, "uploadManagementPortalPrivateFile");
const callRename = httpsCallable(cloudFunctions, "renameManagementPortalPrivateItem");
const callDelete = httpsCallable(cloudFunctions, "deleteManagementPortalPrivateItem");
const callUrl = httpsCallable(cloudFunctions, "getManagementPortalPrivateFileUrl");
const callFavorite = httpsCallable(cloudFunctions, "setManagementPortalPrivateFavorite");

const state = {
  folderId: null,
  breadcrumbs: [],
  items: { folders: [], files: [] },
  favoritesOnly: false,
  busy: false
};

function token() {
  return auth.currentUser?.getIdToken() || Promise.reject(new Error("Keine aktive Anmeldung gefunden."));
}

function unwrap(result) {
  return result?.data || {};
}

function errorText(err, fallback) {
  return err?.message?.replace(/^Firebase:\s*/i, "") || fallback;
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
  return "DOC";
}

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

function safeEsc(esc, value) { return esc ? esc(value) : String(value ?? ""); }

export async function renderMyFilesModule(ctx) {
  const { content, modal, modalContent, esc, toast, profile } = ctx;
  if (!profile || (profile.role === "employee" && profile.managementPortalDocumentAccess !== true)) {
    content.innerHTML = `<div class="card"><div class="empty-state"><strong>Kein Zugriff</strong><p>Für diesen Benutzer ist der persönliche Dateibereich nicht freigeschaltet.</p></div></div>`;
    return;
  }

  content.innerHTML = `
    <div class="myfiles-shell">
      <div class="myfiles-toolbar">
        <div class="myfiles-toolbar-left">
          <button class="btn" id="myfiles-new-folder">+ Neuer Ordner</button>
          <button class="btn secondary" id="myfiles-upload">⇧ Dateien hochladen</button>
          <input id="myfiles-file-input" type="file" multiple hidden>
          <button class="btn secondary" id="myfiles-refresh">↻ Aktualisieren</button>
        </div>
        <button class="btn secondary myfiles-favorite-filter" id="myfiles-favorites">☆ Nur Favoriten</button>
      </div>
      <div class="myfiles-breadcrumbs" id="myfiles-breadcrumbs"></div>
      <div class="myfiles-dropzone" id="myfiles-dropzone">
        <span class="myfiles-drop-icon">⇧</span>
        <div><strong>Dateien hier hineinziehen und ablegen</strong><small>oder oben „Dateien hochladen“ wählen · maximal 20 MB je Datei</small></div>
      </div>
      <div class="card myfiles-card">
        <div class="myfiles-list-head">
          <div>Name</div><div>Geändert</div><div>Größe</div><div>Aktionen</div>
        </div>
        <div id="myfiles-list" class="myfiles-list"><div class="myfiles-loading">Dateien werden geladen …</div></div>
      </div>
    </div>`;

  const list = content.querySelector("#myfiles-list");
  const crumbs = content.querySelector("#myfiles-breadcrumbs");
  const input = content.querySelector("#myfiles-file-input");
  const drop = content.querySelector("#myfiles-dropzone");
  const favoriteBtn = content.querySelector("#myfiles-favorites");

  const showBusy = (text = "Bitte warten …") => { list.innerHTML = `<div class="myfiles-loading">${safeEsc(esc, text)}</div>`; };

  async function loadCurrent() {
    if (state.busy) return;
    state.busy = true;
    showBusy("Dateien werden geladen …");
    try {
      const idToken = await token();
      const data = unwrap(await callList({ idToken, parentId: state.folderId }));
      state.items = { folders: data.folders || [], files: data.files || [] };
      state.breadcrumbs = data.breadcrumbs || [];
      draw();
    } catch (err) {
      list.innerHTML = `<div class="myfiles-error">${safeEsc(esc, errorText(err, "Dateien konnten nicht geladen werden."))}</div>`;
    } finally {
      state.busy = false;
    }
  }

  function drawBreadcrumbs() {
    const root = `<button data-folder="" class="myfiles-crumb ${state.folderId ? "" : "active"}">Meine Dateien</button>`;
    const rest = state.breadcrumbs.map((b, i) => `<span>›</span><button data-folder="${safeEsc(esc, b.id)}" class="myfiles-crumb ${i === state.breadcrumbs.length - 1 ? "active" : ""}">${safeEsc(esc, b.name)}</button>`).join("");
    crumbs.innerHTML = root + rest;
    crumbs.querySelectorAll("[data-folder]").forEach(btn => btn.onclick = () => {
      state.folderId = btn.dataset.folder || null;
      state.favoritesOnly = false;
      favoriteBtn.textContent = "☆ Nur Favoriten";
      loadCurrent();
    });
  }

  function rowFolder(folder) {
    return `<div class="myfiles-row folder" data-folder-id="${safeEsc(esc, folder.id)}">
      <button class="myfiles-name-cell" data-open-folder="${safeEsc(esc, folder.id)}"><span class="myfiles-type-icon folder-icon2">▰</span><span><strong>${safeEsc(esc, folder.name)}</strong><small>Ordner</small></span></button>
      <div>${fmtDateTime(folder.updatedAt || folder.createdAt)}</div><div>–</div>
      <div class="myfiles-actions">
        <button class="icon-btn" data-favorite-folder="${safeEsc(esc, folder.id)}" title="Favorit">${folder.favorite ? "★" : "☆"}</button>
        <button class="btn secondary small" data-rename-folder="${safeEsc(esc, folder.id)}">Umbenennen</button>
        <button class="btn danger small" data-delete-folder="${safeEsc(esc, folder.id)}">Löschen</button>
      </div></div>`;
  }

  function rowFile(file) {
    const primary = isPreviewable(file) ? "Öffnen" : "Herunterladen";
    return `<div class="myfiles-row file" data-file-id="${safeEsc(esc, file.id)}">
      <button class="myfiles-name-cell" data-open-file="${safeEsc(esc, file.id)}"><span class="myfiles-type-icon">${fileIcon(file)}</span><span><strong>${safeEsc(esc, file.name)}</strong><small>${safeEsc(esc, file.contentType || "Datei")}</small></span></button>
      <div>${fmtDateTime(file.updatedAt || file.createdAt)}</div><div>${humanSize(file.size)}</div>
      <div class="myfiles-actions">
        <button class="icon-btn" data-favorite-file="${safeEsc(esc, file.id)}" title="Favorit">${file.favorite ? "★" : "☆"}</button>
        <button class="btn small" data-open-file="${safeEsc(esc, file.id)}">${primary}</button>
        <button class="btn secondary small" data-rename-file="${safeEsc(esc, file.id)}">Umbenennen</button>
        <button class="btn danger small" data-delete-file="${safeEsc(esc, file.id)}">Löschen</button>
      </div></div>`;
  }

  function draw() {
    drawBreadcrumbs();
    favoriteBtn.textContent = state.favoritesOnly ? "★ Favoriten anzeigen" : "☆ Nur Favoriten";
    let folders = state.items.folders || [];
    let files = state.items.files || [];
    if (state.favoritesOnly) {
      folders = folders.filter(x => x.favorite === true);
      files = files.filter(x => x.favorite === true);
    }
    const rows = [...folders.map(rowFolder), ...files.map(rowFile)];
    list.innerHTML = rows.length ? rows.join("") : `<div class="myfiles-empty"><span>▱</span><strong>${state.favoritesOnly ? "Keine Favoriten in diesem Ordner" : "Dieser Ordner ist leer"}</strong><small>Neue Ordner anlegen oder Dateien hineinziehen.</small></div>`;
    bindRows();
  }

  function bindRows() {
    list.querySelectorAll("[data-open-folder]").forEach(btn => btn.onclick = () => { state.folderId = btn.dataset.openFolder; state.favoritesOnly = false; loadCurrent(); });
    list.querySelectorAll("[data-open-file]").forEach(btn => btn.onclick = () => openFile(btn.dataset.openFile));
    list.querySelectorAll("[data-rename-folder]").forEach(btn => btn.onclick = () => renameItem("folder", btn.dataset.renameFolder));
    list.querySelectorAll("[data-rename-file]").forEach(btn => btn.onclick = () => renameItem("file", btn.dataset.renameFile));
    list.querySelectorAll("[data-delete-folder]").forEach(btn => btn.onclick = () => deleteItem("folder", btn.dataset.deleteFolder));
    list.querySelectorAll("[data-delete-file]").forEach(btn => btn.onclick = () => deleteItem("file", btn.dataset.deleteFile));
    list.querySelectorAll("[data-favorite-folder]").forEach(btn => btn.onclick = () => favoriteItem("folder", btn.dataset.favoriteFolder));
    list.querySelectorAll("[data-favorite-file]").forEach(btn => btn.onclick = () => favoriteItem("file", btn.dataset.favoriteFile));
  }

  async function createFolderDialog() {
    modalContent.innerHTML = `<form id="myfiles-folder-form" class="modal-box small-modal"><div class="modal-head"><div><h2>Neuen Ordner anlegen</h2><p>Der Ordner wird im aktuellen Verzeichnis erstellt.</p></div><button class="close-btn" type="button">×</button></div><label class="field full"><span>Ordnername *</span><input id="myfiles-folder-name" maxlength="120" required autofocus></label><div class="modal-footer"><button type="button" class="btn secondary" id="myfiles-folder-cancel">Abbrechen</button><button type="submit" class="btn">Ordner anlegen</button></div></form>`;
    modal.showModal();
    const close = () => modal.close();
    modalContent.querySelector(".close-btn").onclick = close;
    modalContent.querySelector("#myfiles-folder-cancel").onclick = close;
    modalContent.querySelector("#myfiles-folder-form").onsubmit = async e => {
      e.preventDefault();
      const name = modalContent.querySelector("#myfiles-folder-name").value.trim();
      if (!name) return;
      try {
        const idToken = await token();
        await callCreateFolder({ idToken, parentId: state.folderId, name });
        close(); toast("Ordner wurde angelegt."); await loadCurrent();
      } catch (err) { toast(errorText(err, "Ordner konnte nicht angelegt werden.")); }
    };
  }

  async function uploadFiles(fileList) {
    const files = [...(fileList || [])];
    if (!files.length) return;
    for (const file of files) {
      if (file.size > 20 * 1024 * 1024) { toast(`${file.name}: maximal 20 MB je Datei.`); continue; }
      showBusy(`„${file.name}“ wird hochgeladen …`);
      try {
        const idToken = await token();
        const base64Data = await fileToBase64(file);
        await callUpload({ idToken, parentId: state.folderId, fileName: file.name, contentType: file.type || "application/octet-stream", base64Data });
      } catch (err) { toast(`${file.name}: ${errorText(err, "Upload fehlgeschlagen.")}`); }
    }
    toast(files.length === 1 ? "Datei wurde hochgeladen." : "Dateiupload abgeschlossen.");
    await loadCurrent();
  }

  async function openFile(fileId) {
    const file = (state.items.files || []).find(x => x.id === fileId);
    if (!file) return;
    try {
      const idToken = await token();
      const mode = isPreviewable(file) ? "inline" : "attachment";
      const data = unwrap(await callUrl({ idToken, fileId, mode }));
      if (!data.url) throw new Error("Keine Datei-URL erhalten.");
      const w = window.open(data.url, "_blank", "noopener,noreferrer");
      if (!w) window.location.href = data.url;
    } catch (err) { toast(errorText(err, "Datei konnte nicht geöffnet werden.")); }
  }

  async function renameItem(kind, id) {
    const item = kind === "folder" ? state.items.folders.find(x => x.id === id) : state.items.files.find(x => x.id === id);
    if (!item) return;
    const name = prompt("Neuer Name:", item.name);
    if (!name || name.trim() === item.name) return;
    try {
      const idToken = await token();
      await callRename({ idToken, kind, itemId: id, name: name.trim() });
      toast("Name wurde geändert."); await loadCurrent();
    } catch (err) { toast(errorText(err, "Umbenennen fehlgeschlagen.")); }
  }

  async function deleteItem(kind, id) {
    const item = kind === "folder" ? state.items.folders.find(x => x.id === id) : state.items.files.find(x => x.id === id);
    if (!item) return;
    const message = kind === "folder" ? `Ordner „${item.name}“ einschließlich aller Unterordner und Dateien endgültig löschen?` : `Datei „${item.name}“ endgültig löschen?`;
    if (!confirm(message)) return;
    try {
      const idToken = await token();
      await callDelete({ idToken, kind, itemId: id });
      toast(kind === "folder" ? "Ordner wurde gelöscht." : "Datei wurde gelöscht."); await loadCurrent();
    } catch (err) { toast(errorText(err, "Löschen fehlgeschlagen.")); }
  }

  async function favoriteItem(kind, id) {
    const item = kind === "folder" ? state.items.folders.find(x => x.id === id) : state.items.files.find(x => x.id === id);
    if (!item) return;
    try {
      const idToken = await token();
      await callFavorite({ idToken, kind, itemId: id, favorite: item.favorite !== true });
      await loadCurrent();
    } catch (err) { toast(errorText(err, "Favorit konnte nicht geändert werden.")); }
  }

  content.querySelector("#myfiles-new-folder").onclick = createFolderDialog;
  content.querySelector("#myfiles-upload").onclick = () => input.click();
  content.querySelector("#myfiles-refresh").onclick = loadCurrent;
  favoriteBtn.onclick = () => { state.favoritesOnly = !state.favoritesOnly; draw(); };
  input.onchange = () => { uploadFiles(input.files); input.value = ""; };
  ["dragenter", "dragover"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add("dragover"); }));
  ["dragleave", "drop"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove("dragover"); }));
  drop.addEventListener("drop", e => uploadFiles(e.dataTransfer?.files));

  await loadCurrent();
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || "").split(",")[1] || "");
    reader.onerror = () => reject(reader.error || new Error("Datei konnte nicht gelesen werden."));
    reader.readAsDataURL(file);
  });
}

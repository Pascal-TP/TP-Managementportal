import { portalConfirm, portalPrompt } from "./ui-feedback.js";
import { getPortalSettings } from "./settings.js";
import { auth, cloudFunctions } from "./firebase.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-functions.js";
import { beginPortalLoading, endPortalLoading } from "./loading-indicator.js";

const callList = httpsCallable(cloudFunctions, "listManagementPortalPrivateItems");
const callCreateFolder = httpsCallable(cloudFunctions, "createManagementPortalPrivateFolder");
const callUpload = httpsCallable(cloudFunctions, "uploadManagementPortalPrivateFile");
const callRename = httpsCallable(cloudFunctions, "renameManagementPortalPrivateItem");
const callDelete = httpsCallable(cloudFunctions, "deleteManagementPortalPrivateItem");
const callUrl = httpsCallable(cloudFunctions, "getManagementPortalPrivateFileUrl");
const callFavorite = httpsCallable(cloudFunctions, "setManagementPortalPrivateFavorite");
const callDeadline = httpsCallable(cloudFunctions, "setManagementPortalPrivateFileDeadline");
const callPrepareLargeVideo = httpsCallable(cloudFunctions, "prepareManagementPortalLargeVideoUpload");
const callFinalizeLargeVideo = httpsCallable(cloudFunctions, "finalizeManagementPortalLargeVideoUpload");
const callShareFolder = httpsCallable(cloudFunctions, "setManagementPortalPrivateFolderShare");

const state = {
  folderId: null,
  breadcrumbs: [],
  items: { folders: [], files: [] },
  favoritesOnly: false,
  viewMode: "list",
  galleryUrls: new Map(),
  busy: false,
  tree: {
    children: new Map(),
    expanded: new Set(),
    loading: new Set()
  }
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

function isImageFile(file) {
  const type = String(file?.contentType || "").toLowerCase();
  const name = String(file?.name || "").toLowerCase();
  return type.startsWith("image/") || /\.(jpg|jpeg|png|gif|webp|bmp|avif)$/i.test(name);
}
function galleryStorageKey(folderId) { return `tp-managementportal-myfiles-view:${folderId || "root"}`; }
function loadViewMode(folderId) { try { return localStorage.getItem(galleryStorageKey(folderId)) === "gallery" ? "gallery" : "list"; } catch { return "list"; } }
function saveViewMode(folderId, mode) { try { localStorage.setItem(galleryStorageKey(folderId), mode); } catch {} }

export async function renderMyFilesModule(ctx) {
  const { content, modal, modalContent, esc, toast, profile, colleagues = [] } = ctx;
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
        <div class="myfiles-toolbar-right">
          <div class="public-view-toggle" aria-label="Ansicht wählen">
            <button class="public-view-btn" id="myfiles-view-list" type="button" title="Listenansicht">☷ Liste</button>
            <button class="public-view-btn" id="myfiles-view-gallery" type="button" title="Bildvorschau">▦ Vorschau</button>
          </div>
          <button class="btn secondary myfiles-favorite-filter" id="myfiles-favorites">☆ Nur Favoriten</button>
        </div>
      </div>
      <div class="myfiles-explorer">
        <aside class="myfiles-tree-panel" id="myfiles-tree-panel">
          <div class="myfiles-tree-head"><strong>Verzeichnisse</strong><button class="myfiles-tree-collapse" id="myfiles-tree-collapse" type="button" title="Verzeichnisstruktur ausblenden">‹</button></div>
          <div class="myfiles-tree" id="myfiles-tree"><div class="myfiles-tree-loading">Verzeichnisse werden geladen …</div></div>
        </aside>
        <section class="myfiles-main">
          <button class="btn secondary small myfiles-tree-show" id="myfiles-tree-show" type="button">☰ Verzeichnisse</button>
          <div class="myfiles-breadcrumbs" id="myfiles-breadcrumbs"></div>
          <div class="myfiles-dropzone" id="myfiles-dropzone">
            <span class="myfiles-drop-icon">⇧</span>
            <div><strong>Dateien hier hineinziehen und ablegen</strong><small>oder oben „Dateien hochladen“ wählen · maximal ${getPortalSettings().uploadMaxMB || 20} MB je Datei · Videos ohne Portal-Größenlimit</small></div>
          </div>
          <div class="card myfiles-card">
            <div class="myfiles-list-head" id="myfiles-list-head">
              <div>Name</div><div>Geändert</div><div>Größe</div><div>Aktionen</div>
            </div>
            <div id="myfiles-list" class="myfiles-list"><div class="myfiles-loading">Dateien werden geladen …</div></div>
          </div>
        </section>
      </div>
    </div>`;

  const list = content.querySelector("#myfiles-list");
  const crumbs = content.querySelector("#myfiles-breadcrumbs");
  const input = content.querySelector("#myfiles-file-input");
  const drop = content.querySelector("#myfiles-dropzone");
  const favoriteBtn = content.querySelector("#myfiles-favorites");
  const tree = content.querySelector("#myfiles-tree");
  const explorer = content.querySelector(".myfiles-explorer");
  const treeCollapse = content.querySelector("#myfiles-tree-collapse");
  const treeShow = content.querySelector("#myfiles-tree-show");
  const listHead = content.querySelector("#myfiles-list-head");
  const viewListBtn = content.querySelector("#myfiles-view-list");
  const viewGalleryBtn = content.querySelector("#myfiles-view-gallery");
  state.viewMode = loadViewMode(state.folderId);

  const showBusy = (text = "Bitte warten …") => { list.innerHTML = `<div class="myfiles-loading">${safeEsc(esc, text)}</div>`; };

  function treeKey(parentId) { return parentId || "__root__"; }

  async function loadTreeChildren(parentId = null, force = false) {
    const key = treeKey(parentId);
    if (!force && state.tree.children.has(key)) return state.tree.children.get(key);
    if (state.tree.loading.has(key)) return state.tree.children.get(key) || [];
    state.tree.loading.add(key);
    drawTree();
    try {
      const idToken = await token();
      const data = unwrap(await callList({ idToken, parentId, foldersOnly: true }));
      const folders = data.folders || [];
      state.tree.children.set(key, folders);
      return folders;
    } finally {
      state.tree.loading.delete(key);
      drawTree();
    }
  }

  function folderHasLoadedChildren(folderId) {
    return (state.tree.children.get(treeKey(folderId)) || []).length > 0;
  }

  function drawTreeBranch(parentId = null, depth = 0) {
    const key = treeKey(parentId);
    const folders = state.tree.children.get(key) || [];
    return folders.map(folder => {
      const expanded = state.tree.expanded.has(folder.id);
      const loading = state.tree.loading.has(treeKey(folder.id));
      const loaded = state.tree.children.has(treeKey(folder.id));
      const hasChildren = folderHasLoadedChildren(folder.id);
      const arrow = loading ? "…" : (expanded ? "▾" : "▸");
      const childHtml = expanded ? `<div class="myfiles-tree-children">${drawTreeBranch(folder.id, depth + 1)}${loaded && !hasChildren ? `<div class="myfiles-tree-empty-child" style="--tree-depth:${depth + 1}">Keine Unterordner</div>` : ""}</div>` : "";
      return `<div class="myfiles-tree-node">
        <div class="myfiles-tree-row ${state.folderId === folder.id ? "active" : ""}" style="--tree-depth:${depth}">
          <button class="myfiles-tree-toggle" type="button" data-tree-toggle="${safeEsc(esc, folder.id)}" title="Unterordner ${expanded ? "einklappen" : "anzeigen"}">${arrow}</button>
          <button class="myfiles-tree-name" type="button" data-tree-open="${safeEsc(esc, folder.id)}" title="${safeEsc(esc, folder.name)}"><span class="myfiles-tree-folder">▰</span><span>${safeEsc(esc, folder.name)}</span></button>
        </div>${childHtml}
      </div>`;
    }).join("");
  }

  function drawTree() {
    if (!tree) return;
    const rootLoading = state.tree.loading.has(treeKey(null));
    const rootFolders = state.tree.children.get(treeKey(null));
    tree.innerHTML = `<div class="myfiles-tree-row root ${state.folderId ? "" : "active"}" style="--tree-depth:0">
      <span class="myfiles-tree-toggle placeholder">${rootLoading ? "…" : ""}</span>
      <button class="myfiles-tree-name" type="button" data-tree-open=""><span class="myfiles-tree-root-icon">⌂</span><span>Meine Dateien</span></button>
    </div>${rootFolders ? drawTreeBranch(null, 0) : `<div class="myfiles-tree-loading">Verzeichnisse werden geladen …</div>`}`;
    tree.querySelectorAll("[data-tree-open]").forEach(btn => btn.onclick = () => {
      state.folderId = btn.dataset.treeOpen || null;
      state.favoritesOnly = false;
      favoriteBtn.textContent = "☆ Nur Favoriten";
      loadCurrent();
    });
    tree.querySelectorAll("[data-tree-toggle]").forEach(btn => btn.onclick = async () => {
      const id = btn.dataset.treeToggle;
      if (state.tree.expanded.has(id)) { state.tree.expanded.delete(id); drawTree(); return; }
      state.tree.expanded.add(id);
      drawTree();
      try { await loadTreeChildren(id); } catch (err) { toast(errorText(err, "Unterordner konnten nicht geladen werden.")); }
    });
  }

  async function syncTreeWithCurrent(forceParent = false) {
    const currentKey = treeKey(state.folderId);
    state.tree.children.set(currentKey, state.items.folders || []);
    if (forceParent && state.folderId) {
      const parentId = state.breadcrumbs.length > 1 ? state.breadcrumbs[state.breadcrumbs.length - 2].id : null;
      await loadTreeChildren(parentId, true);
    }
    for (const crumb of state.breadcrumbs) state.tree.expanded.add(crumb.id);
    drawTree();
  }

  async function refreshTreeAfterMutation() {
    state.tree.children.delete(treeKey(state.folderId));
    if (state.folderId) {
      const parentId = state.breadcrumbs.length > 1 ? state.breadcrumbs[state.breadcrumbs.length - 2].id : null;
      state.tree.children.delete(treeKey(parentId));
    }
    await loadCurrent();
  }

  async function loadCurrent() {
    if (state.busy) return;
    state.busy = true;
    const loadingId = beginPortalLoading(state.folderId ? "Ordnerinhalt wird geladen …" : "Dateien werden geladen …");
    showBusy("Dateien werden geladen …");
    try {
      const idToken = await token();
      const data = unwrap(await callList({ idToken, parentId: state.folderId }));
      state.items = { folders: data.folders || [], files: data.files || [] };
      state.breadcrumbs = data.breadcrumbs || [];
      state.viewMode = loadViewMode(state.folderId);
      state.galleryUrls.clear();
      draw();
      await syncTreeWithCurrent();
    } catch (err) {
      list.innerHTML = `<div class="myfiles-error">${safeEsc(esc, errorText(err, "Dateien konnten nicht geladen werden."))}</div>`;
    } finally {
      state.busy = false;
      endPortalLoading(loadingId);
    }
  }

  function drawBreadcrumbs() {
    if (!state.folderId) {
      crumbs.innerHTML = "";
      crumbs.hidden = true;
      return;
    }
    crumbs.hidden = false;
    const root = `<button data-folder="" class="myfiles-crumb">Meine Dateien</button>`;
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
    const isShared = folder.shareAll === true || (Array.isArray(folder.sharedWithUserIds) && folder.sharedWithUserIds.length > 0);
    const shareLabel = isShared ? "Freigegeben" : "Freigeben";
    const shareClass = isShared ? "btn shared small" : "btn secondary small";
    return `<div class="myfiles-row folder" data-folder-id="${safeEsc(esc, folder.id)}">
      <button class="myfiles-name-cell" data-open-folder="${safeEsc(esc, folder.id)}"><span class="myfiles-type-icon folder-icon2">▰</span><span><strong>${safeEsc(esc, folder.name)}</strong><small>Ordner</small></span></button>
      <div>${fmtDateTime(folder.updatedAt || folder.createdAt)}</div><div>–</div>
      <div class="myfiles-actions">
        <button class="icon-btn" data-favorite-folder="${safeEsc(esc, folder.id)}" title="Favorit">${folder.favorite ? "★" : "☆"}</button>
        <button class="${shareClass}" data-share-folder="${safeEsc(esc, folder.id)}">${shareLabel}</button>
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
        <button class="btn secondary small" data-deadline-file="${safeEsc(esc, file.id)}">${file.deadline ? `Frist: ${new Date(file.deadline+"T00:00:00").toLocaleDateString("de-DE")}` : "Frist"}</button>
        <button class="btn secondary small" data-rename-file="${safeEsc(esc, file.id)}">Umbenennen</button>
        <button class="btn danger small" data-delete-file="${safeEsc(esc, file.id)}">Löschen</button>
      </div></div>`;
  }

  function setViewMode(mode) {
    state.viewMode = mode === "gallery" ? "gallery" : "list";
    saveViewMode(state.folderId, state.viewMode);
    draw();
  }

  function updateViewButtons() {
    viewListBtn?.classList.toggle("active", state.viewMode === "list");
    viewGalleryBtn?.classList.toggle("active", state.viewMode === "gallery");
  }

  function galleryTile(file, index) {
    return `<article class="public-gallery-tile" data-gallery-index="${index}">
      <button class="public-gallery-image" data-gallery-open="${safeEsc(esc, file.id)}" aria-label="${safeEsc(esc, file.name)} öffnen"><span class="public-gallery-placeholder">IMG</span><img data-gallery-thumb="${safeEsc(esc, file.id)}" alt="${safeEsc(esc, file.name)}" loading="lazy"></button>
      <div class="public-gallery-caption"><strong title="${safeEsc(esc, file.name)}">${safeEsc(esc, file.name)}</strong><small>${humanSize(file.size)}</small></div>
      <div class="public-gallery-actions"><button class="icon-btn" data-favorite-file="${safeEsc(esc, file.id)}" title="Favorit">${file.favorite ? "★" : "☆"}</button><button class="btn secondary small" data-deadline-file="${safeEsc(esc, file.id)}">${file.deadline ? `Frist: ${new Date(file.deadline+"T00:00:00").toLocaleDateString("de-DE")}` : "Frist"}</button><button class="btn secondary small" data-rename-file="${safeEsc(esc, file.id)}">Umbenennen</button><button class="btn danger small" data-delete-file="${safeEsc(esc, file.id)}">Löschen</button></div>
    </article>`;
  }

  async function galleryUrl(fileId) {
    if (state.galleryUrls.has(fileId)) return state.galleryUrls.get(fileId);
    const idToken = await token();
    const data = unwrap(await callUrl({ idToken, fileId, mode: "inline" }));
    if (!data.url) throw new Error("Keine Datei-URL erhalten.");
    state.galleryUrls.set(fileId, data.url); return data.url;
  }

  function loadGalleryThumbs() {
    const images = [...list.querySelectorAll("img[data-gallery-thumb]")];
    const loadOne = async img => { if (img.dataset.loaded) return; img.dataset.loaded = "1"; try { img.src = await galleryUrl(img.dataset.galleryThumb); img.onload = () => img.closest(".public-gallery-image")?.classList.add("loaded"); } catch { img.closest(".public-gallery-image")?.classList.add("failed"); } };
    if (!("IntersectionObserver" in window)) { images.forEach(loadOne); return; }
    const observer = new IntersectionObserver(entries => entries.forEach(entry => { if (entry.isIntersecting) { observer.unobserve(entry.target); loadOne(entry.target); } }), { rootMargin: "250px" }); images.forEach(img => observer.observe(img));
  }

  async function openGalleryLightbox(fileId) {
    let images = (state.items.files || []).filter(isImageFile); if (state.favoritesOnly) images = images.filter(x => x.favorite === true);
    let index = images.findIndex(x => x.id === fileId); if (index < 0) return;
    const overlay = document.createElement("div"); overlay.className = "public-lightbox"; overlay.innerHTML = `<button class="public-lightbox-close" type="button" aria-label="Schließen">×</button><button class="public-lightbox-nav prev" type="button" aria-label="Vorheriges Bild">‹</button><div class="public-lightbox-stage"><div class="public-lightbox-loading">Bild wird geladen …</div><img alt=""><div class="public-lightbox-caption"></div></div><button class="public-lightbox-nav next" type="button" aria-label="Nächstes Bild">›</button>`; document.body.appendChild(overlay);
    const img = overlay.querySelector("img"), caption = overlay.querySelector(".public-lightbox-caption"), loading = overlay.querySelector(".public-lightbox-loading");
    const close = () => { document.removeEventListener("keydown", key); overlay.remove(); };
    const show = async nextIndex => { index = (nextIndex + images.length) % images.length; const file = images[index]; img.classList.remove("ready"); loading.hidden = false; loading.textContent = "Bild wird geladen …"; caption.textContent = `${file.name} · ${index + 1} von ${images.length}`; try { img.src = await galleryUrl(file.id); img.alt = file.name || "Bild"; img.onload = () => { loading.hidden = true; img.classList.add("ready"); }; } catch (err) { loading.textContent = errorText(err, "Bild konnte nicht geladen werden."); } };
    const key = e => { if (e.key === "Escape") close(); if (e.key === "ArrowLeft") show(index - 1); if (e.key === "ArrowRight") show(index + 1); }; overlay.querySelector(".public-lightbox-close").onclick = close; overlay.querySelector(".prev").onclick = () => show(index - 1); overlay.querySelector(".next").onclick = () => show(index + 1); overlay.onclick = e => { if (e.target === overlay) close(); }; document.addEventListener("keydown", key); await show(index);
  }

  function draw() {
    drawBreadcrumbs(); updateViewButtons(); favoriteBtn.textContent = state.favoritesOnly ? "★ Favoriten anzeigen" : "☆ Nur Favoriten";
    let folders = state.items.folders || [], files = state.items.files || []; if (state.favoritesOnly) { folders = folders.filter(x => x.favorite === true); files = files.filter(x => x.favorite === true); }
    if (state.viewMode === "gallery") {
      const images = files.filter(isImageFile), otherFiles = files.filter(x => !isImageFile(x)); listHead.hidden = true;
      const gallery = images.length ? `<div class="public-gallery"><div class="public-gallery-info"><strong>${images.length} ${images.length === 1 ? "Bild" : "Bilder"}</strong><span>Klicken zum Vergrößern · mit ← → durchblättern</span></div><div class="public-gallery-grid">${images.map(galleryTile).join("")}</div></div>` : "";
      const others = [...folders.map(rowFolder), ...otherFiles.map(rowFile)], otherBlock = others.length ? `<div class="public-gallery-other"><div class="public-gallery-section-title">Weitere Inhalte</div>${others.join("")}</div>` : "";
      list.innerHTML = gallery || otherBlock ? gallery + otherBlock : `<div class="myfiles-empty"><span>▱</span><strong>${state.favoritesOnly ? "Keine Favoriten in diesem Ordner" : "Dieser Ordner ist leer"}</strong><small>Neue Ordner anlegen oder Dateien hineinziehen.</small></div>`; bindRows(); loadGalleryThumbs(); return;
    }
    listHead.hidden = false; const rows = [...folders.map(rowFolder), ...files.map(rowFile)]; list.innerHTML = rows.length ? rows.join("") : `<div class="myfiles-empty"><span>▱</span><strong>${state.favoritesOnly ? "Keine Favoriten in diesem Ordner" : "Dieser Ordner ist leer"}</strong><small>Neue Ordner anlegen oder Dateien hineinziehen.</small></div>`; bindRows();
  }
  function bindRows() {
    list.querySelectorAll("[data-open-folder]").forEach(btn => btn.onclick = () => { state.folderId = btn.dataset.openFolder; state.favoritesOnly = false; loadCurrent(); });
    list.querySelectorAll("[data-gallery-open]").forEach(btn => btn.onclick = e => { e.stopPropagation(); openGalleryLightbox(btn.dataset.galleryOpen); });
    list.querySelectorAll("[data-open-file]").forEach(btn => btn.onclick = () => openFile(btn.dataset.openFile));
    list.querySelectorAll("[data-share-folder]").forEach(btn => btn.onclick = () => shareFolderDialog(btn.dataset.shareFolder));
    list.querySelectorAll("[data-rename-folder]").forEach(btn => btn.onclick = () => renameItem("folder", btn.dataset.renameFolder));
    list.querySelectorAll("[data-rename-file]").forEach(btn => btn.onclick = () => renameItem("file", btn.dataset.renameFile));
    list.querySelectorAll("[data-deadline-file]").forEach(btn => btn.onclick = () => deadlineDialog(btn.dataset.deadlineFile));
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
        close(); toast("Ordner wurde angelegt."); await refreshTreeAfterMutation();
      } catch (err) { toast(errorText(err, "Ordner konnte nicht angelegt werden.")); }
    };
  }

  function isVideo(file){ return String(file?.type||"").toLowerCase().startsWith("video/") || /\.(mp4|mov|m4v|avi|wmv|webm|mkv|mpeg|mpg)$/i.test(file?.name||""); }
  function duplicate(file){ return (state.items.files||[]).find(x => String(x.name||"").toLocaleLowerCase("de-DE") === String(file.name||"").toLocaleLowerCase("de-DE")); }
  async function directVideoUpload(file, overwrite){
    const idToken=await token();
    const prep=unwrap(await callPrepareLargeVideo({idToken,area:"private",parentId:state.folderId,fileName:file.name,contentType:file.type||"application/octet-stream",size:file.size,overwrite}));
    const response=await fetch(prep.uploadUrl,{method:"PUT",headers:{"Content-Type":file.type||"application/octet-stream"},body:file});
    if(!response.ok) throw new Error(`Direktupload fehlgeschlagen (${response.status}).`);
    await callFinalizeLargeVideo({idToken,area:"private",parentId:state.folderId,fileId:prep.fileId,storagePath:prep.storagePath,name:prep.name,contentType:file.type||"application/octet-stream",size:file.size,oldStoragePath:prep.oldStoragePath||null});
  }
  async function uploadFiles(fileList) {
    const files = [...(fileList || [])]; if (!files.length) return; let uploaded=0;
    for (const file of files) {
      const existing=duplicate(file); let overwrite=false;
      if(existing){ overwrite=await portalConfirm("Eine Datei mit identischen Namen existiert bereits. Möchten Sie diese überschreiben?", { title: "Datei bereits vorhanden", confirmText: "Überschreiben" }); if(!overwrite) continue; }
      if (!isVideo(file) && file.size > (getPortalSettings().uploadMaxMB || 20) * 1024 * 1024) { toast(`${file.name}: maximal ${getPortalSettings().uploadMaxMB || 20} MB je Datei.`); continue; }
      showBusy(`„${file.name}“ wird hochgeladen …`);
      try {
        if(isVideo(file) && file.size > (getPortalSettings().uploadMaxMB || 20)*1024*1024) await directVideoUpload(file,overwrite);
        else { const idToken=await token(); const base64Data=await fileToBase64(file); await callUpload({idToken,parentId:state.folderId,fileName:file.name,contentType:file.type||"application/octet-stream",base64Data,overwrite}); }
        uploaded++;
      } catch (err) { toast(`${file.name}: ${errorText(err, "Upload fehlgeschlagen.")}`); }
    }
    if(uploaded) toast(uploaded===1?"Datei wurde hochgeladen.":`${uploaded} Dateien wurden hochgeladen.`); await loadCurrent();
  }

  async function deadlineDialog(id){
    const item=(state.items.files||[]).find(x=>x.id===id); if(!item)return;
    modalContent.innerHTML=`<form id="deadline-form" class="modal-box small-modal"><div class="modal-head"><div><h2>Frist festlegen</h2><p>${safeEsc(esc,item.name)}</p></div><button class="close-btn" type="button">×</button></div><label class="field full"><span>Frist</span><input id="deadline-date" type="date" value="${safeEsc(esc,item.deadline||"")}"><small class="field-hint">Datum leeren, um eine vorhandene Frist zu entfernen.</small></label><div class="modal-footer"><button type="button" class="btn secondary" id="deadline-cancel">Abbrechen</button><button type="submit" class="btn">Speichern</button></div></form>`;
    modal.showModal(); const close=()=>modal.close(); modalContent.querySelector(".close-btn").onclick=close; modalContent.querySelector("#deadline-cancel").onclick=close;
    modalContent.querySelector("#deadline-form").onsubmit=async e=>{e.preventDefault();try{await callDeadline({idToken:await token(),fileId:id,deadline:modalContent.querySelector("#deadline-date").value||null});close();toast("Frist wurde gespeichert.");await loadCurrent();}catch(err){toast(errorText(err,"Frist konnte nicht gespeichert werden."));}};
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


  async function shareFolderDialog(id) {
    const folder = state.items.folders.find(x => x.id === id);
    if (!folder) return;
    const selected = new Set((folder.sharedWithUserIds || []).map(String));
    const people = colleagues.filter(c => String(c.id) !== String(auth.currentUser?.uid || ""));
    modalContent.innerHTML = `<form id="myfiles-share-form" class="modal-box"><div class="modal-head"><div><h2>Ordner freigeben</h2><p>„${safeEsc(esc, folder.name)}“ und alle enthaltenen Unterordner und Dateien werden schreibgeschützt freigegeben.</p></div><button class="close-btn" type="button">×</button></div><div class="visibility-options"><label class="visibility-radio"><input type="radio" name="share-mode" value="all" ${folder.shareAll===true?'checked':''}><span><strong>Alle Portalnutzer</strong><small>Jeder Benutzer mit Zugang zum Managementportal kann den Ordner öffnen.</small></span></label><label class="visibility-radio"><input type="radio" name="share-mode" value="selected" ${folder.shareAll===true?'':'checked'}><span><strong>Ausgewählte Mitarbeiter</strong><small>Mehrere Mitarbeiter können gleichzeitig ausgewählt werden.</small></span></label></div><div id="share-people" class="visibility-people ${folder.shareAll===true?'hidden':''}"><div class="visibility-person-list">${people.map(c=>`<label class="visibility-person"><input type="checkbox" class="share-person" value="${safeEsc(esc,c.id)}" ${selected.has(String(c.id))?'checked':''}><span><strong>${safeEsc(esc,c.name)}</strong><small>${safeEsc(esc,c.email||'')}</small></span></label>`).join('') || '<div class="visibility-empty">Keine weiteren Portalnutzer gefunden.</div>'}</div></div><div class="modal-footer"><button type="button" class="btn secondary" id="share-cancel">Abbrechen</button><button type="submit" class="btn">Freigabe speichern</button></div></form>`;
    modal.showModal();
    const close=()=>modal.close();
    modalContent.querySelector('.close-btn').onclick=close; modalContent.querySelector('#share-cancel').onclick=close;
    modalContent.querySelectorAll('input[name="share-mode"]').forEach(r=>r.onchange=()=>modalContent.querySelector('#share-people').classList.toggle('hidden',r.value==='all'&&r.checked));
    modalContent.querySelector('#myfiles-share-form').onsubmit=async e=>{e.preventDefault(); const mode=modalContent.querySelector('input[name="share-mode"]:checked')?.value||'selected'; const ids=[...modalContent.querySelectorAll('.share-person:checked')].map(x=>x.value); try{const idToken=await token(); await callShareFolder({idToken,folderId:id,shareAll:mode==='all',userIds:mode==='all'?[]:ids}); toast(mode==='all'||ids.length?'Freigabe wurde gespeichert.':'Freigabe wurde aufgehoben.'); close(); await loadCurrent();}catch(err){toast(errorText(err,'Freigabe konnte nicht gespeichert werden.'));}};
  }

  async function renameItem(kind, id) {
    const item = kind === "folder" ? state.items.folders.find(x => x.id === id) : state.items.files.find(x => x.id === id);
    if (!item) return;
    const name = await portalPrompt("Neuer Name:", item.name, { title: "Umbenennen" });
    if (!name || name.trim() === item.name) return;
    try {
      const idToken = await token();
      await callRename({ idToken, kind, itemId: id, name: name.trim() });
      toast("Name wurde geändert."); await refreshTreeAfterMutation();
    } catch (err) { toast(errorText(err, "Umbenennen fehlgeschlagen.")); }
  }

  async function deleteItem(kind, id) {
    const item = kind === "folder" ? state.items.folders.find(x => x.id === id) : state.items.files.find(x => x.id === id);
    if (!item) return;
    const message = kind === "folder" ? `Leeren Ordner „${item.name}“ in das Archiv verschieben?` : `Datei „${item.name}“ in das Archiv verschieben?`;
    if (!await portalConfirm(message, { title: "Ins Archiv verschieben", confirmText: "Ins Archiv verschieben" })) return;
    try {
      const idToken = await token();
      await callDelete({ idToken, kind, itemId: id });
      toast(kind === "folder" ? "Ordner wurde in das Archiv verschoben." : "Datei wurde in das Archiv verschoben.");
      if (kind === "folder") await refreshTreeAfterMutation(); else await loadCurrent();
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
  viewListBtn.onclick = () => setViewMode("list");
  viewGalleryBtn.onclick = () => setViewMode("gallery");
  content.querySelector("#myfiles-refresh").onclick = loadCurrent;
  favoriteBtn.onclick = () => { state.favoritesOnly = !state.favoritesOnly; draw(); };
  input.onchange = () => { uploadFiles(input.files); input.value = ""; };
  ["dragenter", "dragover"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add("dragover"); }));
  ["dragleave", "drop"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove("dragover"); }));
  drop.addEventListener("drop", e => uploadFiles(e.dataTransfer?.files));
  treeCollapse.onclick = () => explorer.classList.add("tree-collapsed");
  treeShow.onclick = () => explorer.classList.remove("tree-collapsed");
  if (window.matchMedia("(max-width: 760px)").matches) explorer.classList.add("tree-collapsed");

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

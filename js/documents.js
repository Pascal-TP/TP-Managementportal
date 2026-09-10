import { portalCall, uploadPayload } from "./document-store.js";

export let DOCUMENT_TYPES = ["Arbeitsanweisung","Verfahrensanweisung","Betriebsanweisung","Formular / Vorlage","Monatsbericht","Sicherheitsdatenblatt","Richtlinie","Zertifikat","Bescheinigung / Nachweis","Vertrag","Sonstiges Dokument"];
export let MANDATORY_WORKFLOW_TYPES = new Set(["Arbeitsanweisung","Verfahrensanweisung","Betriebsanweisung","Formular / Vorlage","Monatsbericht"]);
export let QM_CONTROLLED_TYPES = MANDATORY_WORKFLOW_TYPES;
let PREFIX = {"Arbeitsanweisung":"AA","Verfahrensanweisung":"VA","Betriebsanweisung":"BA","Formular / Vorlage":"FO","Monatsbericht":"MB"};
let NEXT_NUMBER = {};
export function applyDocumentSettings(settings={}){ const rows=(settings.documentTypes||[]).filter(x=>x.active!==false); if(rows.length){ DOCUMENT_TYPES=rows.map(x=>x.name); MANDATORY_WORKFLOW_TYPES=new Set(rows.filter(x=>x.workflow===true).map(x=>x.name)); QM_CONTROLLED_TYPES=new Set(rows.filter(x=>x.qmNumber===true||x.qmVersion===true||x.retentionLocked===true).map(x=>x.name)); PREFIX=Object.fromEntries(rows.map(x=>[x.name,String(x.prefix||'DOK').toUpperCase()])); NEXT_NUMBER=Object.fromEntries(rows.map(x=>[x.name,Math.max(1,Number(x.nextNumber||1))])); } }
let cache = [];

function cleanDoc(d = {}) { return { ...d, id: String(d.id || "") }; }
export async function initializeDocuments() { const r = await portalCall("listManagementPortalDocuments"); cache = (r.documents || []).map(cleanDoc); return getDocuments(); }
export async function refreshDocuments() { return initializeDocuments(); }
export function getDocuments() { return [...cache].sort((a,b)=>String(b.createdAt||"").localeCompare(String(a.createdAt||""))); }
export function getDocument(id) { return cache.find(d => d.id === id) || null; }
function replaceCache(doc, oldId="") { if (oldId && oldId !== doc.id) cache = cache.filter(d=>d.id!==oldId); const i=cache.findIndex(d=>d.id===doc.id); if(i>=0) cache[i]=cleanDoc(doc); else cache.push(cleanDoc(doc)); return cleanDoc(doc); }
function userKey(user={}) { return {uid:String(user.uid||user.id||""),name:String(user.name||"").trim().toLowerCase(),email:String(user.email||"").trim().toLowerCase()}; }
export function isDocumentCreator(d,user={}) { const u=userKey(user); if(d?.createdById&&u.uid)return d.createdById===u.uid; const x=String(d?.createdBy||"").trim().toLowerCase(); return Boolean(x&&(x===u.name||x===u.email)); }
export function isDocumentReviewer(d,user={}) { const u=userKey(user); if(d?.workflowAssigneeId&&u.uid)return d.workflowAssigneeId===u.uid; const x=String(d?.workflowAssignee||"").trim().toLowerCase(); return Boolean(x&&(x===u.name||x===u.email)); }
export function isDocumentQmReviewer(d,user={}) { const u=userKey(user); if(d?.qmAssigneeId&&u.uid)return d.qmAssigneeId===u.uid; const x=String(d?.qmAssignee||"").trim().toLowerCase(); return Boolean(x&&(x===u.name||x===u.email)); }
function isAdminUser(u={}) { return String(u.role||"").toLowerCase()==="admin"; }
export function getDocumentVisibilityMode(d){return d?.visibilityMode==="selected"?"selected":"all";}
export function isDocumentVisibilityRecipient(d,user={}) { if(getDocumentVisibilityMode(d)!=="selected")return true; const u=userKey(user); const ids=(d.visibilityUserIds||[]).map(String); if(u.uid&&ids.includes(u.uid))return true; return (d.visibilityUsers||[]).some(r=>{const x=userKey(r);return (u.uid&&x.uid===u.uid)||(u.email&&x.email===u.email)||(u.name&&x.name===u.name);}); }
export function canViewDocument(d,user={}) { if(!d||d.archived===true)return false; if(isAdminUser(user))return true; if(d.status==="Freigegeben")return isDocumentCreator(d,user)||isDocumentVisibilityRecipient(d,user); return isDocumentCreator(d,user)||isDocumentReviewer(d,user)||isDocumentQmReviewer(d,user); }
export function canAccessOriginal(d,user={}) { return isDocumentCreator(d,user); }
export function canAccessPdf(d,user={}) { return canViewDocument(d,user); }
export function getVisibleDocumentsForUser(user={}) { return getDocuments().filter(d=>canViewDocument(d,user)); }
export function getVisibleDocumentsForEmployee(user={}) { return getDocuments().filter(d=>d.status==="Freigegeben"&&canViewDocument(d,user)); }
export function generateDocumentNumber(type) { const p=PREFIX[type]||"DOK"; const max=cache.filter(d=>String(d.id||"").startsWith(p+".")).reduce((m,d)=>{const n=Number(String(d.id).split(".")[1]);return Number.isFinite(n)?Math.max(m,n):m;},0); const next=Math.max(max+1,Number(NEXT_NUMBER[type]||1)); return `${p}.${String(next).padStart(3,"0")}.01`; }
export function generateNextVersion(v="") { const m=String(v||"").trim().match(/^(\d+)(?:\.(\d+))?$/); if(!m)return !v||v==="–"?"1.0":v; return `${Number(m[1])}.${Number(m[2]||0)+1}`; }
export function generateTemporaryDocumentId(){return `ENTW-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;}
export function getDisplayDocumentNumber(d){if(!d)return"–";return d.numberAssigned===false||String(d.id||"").startsWith("ENTW-")?"–":d.id||"–";}
function isPdf(f){return Boolean(f&&(f.type==="application/pdf"||/\.pdf$/i.test(f.name||"")));}

export async function createDocument(payload, sourceFile, pdfFile=null) {
  if(!sourceFile)throw new Error("Bitte die Originaldatei auswählen oder hineinziehen.");
  const reading=isPdf(sourceFile)?sourceFile:pdfFile; if(!reading||!isPdf(reading))throw new Error("Bitte zusätzlich eine PDF-Lesefassung hochladen.");
  const r=await portalCall("createManagementPortalDocument",{payload,source:await uploadPayload(sourceFile),pdf:await uploadPayload(reading)}); return replaceCache(r.document);
}
async function action(action,id,data={}) { const r=await portalCall("updateManagementPortalDocument",{action,documentId:id,...data}); if(r.document)return replaceCache(r.document,r.oldId||""); return null; }
export function updateDocumentMetadata(id,patch,by=""){return action("metadata",id,{patch,by});}
export function updateDocumentStatus(id,status,by="",note=""){return action("status",id,{status,by,note});}
export function setDocumentVersionByQm(id,version,by=""){return action("qmVersion",id,{version,by});}
export function sendDocumentToQm(id,qmUser,by="",note=""){return action("sendQm",id,{qmUser,by,note});}
export function markDocumentNumberAssigned(id,by=""){return action("markNumber",id,{by});}
export async function renameDocumentNumber(oldId,newId,by=""){const r=await portalCall("renameManagementPortalDocumentNumber",{documentId:oldId,newId,by});return replaceCache(r.document,oldId);}
export async function replaceDocumentFiles(id,sourceFile,pdfFile,payload={},by="") { if(!sourceFile)throw new Error("Bitte die überarbeitete Originaldatei auswählen."); const reading=isPdf(sourceFile)?sourceFile:pdfFile; if(!reading||!isPdf(reading))throw new Error("Bitte zusätzlich die überarbeitete PDF-Lesefassung hochladen."); const r=await portalCall("replaceManagementPortalDocumentFiles",{documentId:id,payload,by,source:await uploadPayload(sourceFile),pdf:await uploadPayload(reading)}); return replaceCache(r.document); }
export async function archiveDocument(id,by=""){const r=await portalCall("archiveManagementPortalDocument",{documentId:id,by});cache=cache.filter(d=>d.id!==id);return r;}
export async function deleteDocument(id){return archiveDocument(id,"");}
export async function downloadOriginalFile(id){const r=await portalCall("getManagementPortalDocumentFileUrl",{documentId:id,variant:"source",mode:"attachment"});window.open(r.url,"_blank","noopener");}
export async function openPdfFile(id){const r=await portalCall("getManagementPortalDocumentFileUrl",{documentId:id,variant:"pdf",mode:"inline"});window.open(r.url,"_blank","noopener");}
export function clearPrototypeDocuments(){ /* V2.0: keine lokalen Dokumentdaten mehr. */ }

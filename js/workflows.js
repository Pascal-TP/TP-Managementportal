import { portalCall } from "./document-store.js";
let cache=[];
export async function initializeWorkflows(){const r=await portalCall("listManagementPortalWorkflows");cache=r.workflows||[];return getWorkflowTasks();}
export async function refreshWorkflows(){return initializeWorkflows();}
function matchesUser(t,p,side="assignee"){const uid=String(p?.id||p?.uid||"");const name=String(p?.name||"").trim().toLowerCase();const email=String(p?.email||"").trim().toLowerCase();if(side==="assignee"){if(t.assigneeId&&uid)return t.assigneeId===uid;const a=String(t.assignee||"").toLowerCase(),ae=String(t.assigneeEmail||"").toLowerCase();return Boolean((a&&(a===name||a===email))||(ae&&ae===email));}if(t.createdById&&uid)return t.createdById===uid;const cb=String(t.createdBy||"").toLowerCase();return Boolean(cb&&(cb===name||cb===email));}
export async function createWorkflowTask(document,assignee,createdBy="",createdById="",kind="review"){const r=await portalCall("createManagementPortalWorkflow",{documentId:document.id,assignee,createdBy,createdById,kind});cache.push(r.workflow);return r.workflow;}
export function createQmWorkflowTask(document,qmUser,createdBy="",createdById=""){return createWorkflowTask(document,qmUser,createdBy,createdById,"qm");}
export function getWorkflowTasks(){return [...cache].sort((a,b)=>String(b.createdAt||"").localeCompare(String(a.createdAt||"")));}
export function getTasksForUser(p){return getWorkflowTasks().filter(t=>t.status==="Offen"&&matchesUser(t,p));}
export function getRejectedTasksForCreator(p,docs=[]){const ids=new Set(docs.filter(d=>d.status==="Abgelehnt").map(d=>d.id));return getWorkflowTasks().filter(t=>t.status==="Abgelehnt"&&ids.has(t.documentId)&&matchesUser(t,p,"creator"));}
export function getWorkflowTasksVisibleToUser(p){return getWorkflowTasks().filter(t=>matchesUser(t,p)||matchesUser(t,p,"creator"));}
export async function decideWorkflowTask(id,decision,completedBy="",note=""){const r=await portalCall("decideManagementPortalWorkflow",{workflowId:id,decision,completedBy,note});const i=cache.findIndex(t=>t.id===id);if(i>=0)cache[i]=r.workflow;return r.workflow;}
export async function renameWorkflowDocument(oldId,newId){const r=await portalCall("renameManagementPortalWorkflowDocument",{oldId,newId});await initializeWorkflows();return r;}
export async function deleteWorkflowTasksForDocument(documentId){const r=await portalCall("archiveManagementPortalWorkflowsForDocument",{documentId});cache=cache.filter(t=>t.documentId!==documentId);return r;}

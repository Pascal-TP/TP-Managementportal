import { portalCall } from "./document-store.js";
export async function loadArchive(){const r=await portalCall("listManagementPortalArchive");return r.items||[];}
export async function restoreArchiveItem(id){return portalCall("restoreManagementPortalArchiveItem",{archiveId:id});}
export async function permanentlyDeleteArchiveItem(id){return portalCall("deleteManagementPortalArchiveItem",{archiveId:id});}
export async function getArchiveFileUrl(id,mode="inline"){return portalCall("getManagementPortalArchiveFileUrl",{archiveId:id,mode});}

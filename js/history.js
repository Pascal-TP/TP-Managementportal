import { portalCall } from "./document-store.js";
export async function loadHistory(limit=500){const r=await portalCall("listManagementPortalHistory",{limit});return r.entries||[];}

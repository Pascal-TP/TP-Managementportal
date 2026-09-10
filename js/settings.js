import { portalCall, uploadPayload } from './document-store.js';

const DEFAULTS = {
  companies: [
    {id:'tp', name:'TP Holding GmbH', short:'TP Holding', logo:'assets/tp.png', active:true},
    {id:'ndf', name:'Norddeutsche Flächenheizsysteme GmbH', short:'NDF', logo:'assets/ndf.png', active:true},
    {id:'tga', name:'TGA Systemtechnik GmbH', short:'TGA Systemtechnik', logo:'assets/tga.png', active:true},
    {id:'ur', name:'Ulf Roesler GmbH', short:'Ulf Roesler', logo:'assets/ur.png', active:true}
  ],
  areas: ['Allgemein','Arbeitssicherheit','Personal','Fuhrpark','Qualitätsmanagement','Einkauf / Lager','Gebäudetechnik','IT','Vertrieb'],
  documentTypes: [
    {name:'Arbeitsanweisung',prefix:'AA',nextNumber:1,workflow:true,qmNumber:true,qmVersion:true,retentionLocked:true,active:true},
    {name:'Verfahrensanweisung',prefix:'VA',nextNumber:1,workflow:true,qmNumber:true,qmVersion:true,retentionLocked:true,active:true},
    {name:'Betriebsanweisung',prefix:'BA',nextNumber:1,workflow:true,qmNumber:true,qmVersion:true,retentionLocked:true,active:true},
    {name:'Formular / Vorlage',prefix:'FO',nextNumber:1,workflow:true,qmNumber:true,qmVersion:true,retentionLocked:true,active:true},
    {name:'Monatsbericht',prefix:'MB',nextNumber:1,workflow:true,qmNumber:true,qmVersion:true,retentionLocked:true,active:true},
    {name:'Sicherheitsdatenblatt',prefix:'SDB',nextNumber:1,workflow:false,qmNumber:false,qmVersion:false,retentionLocked:false,active:true},
    {name:'Richtlinie',prefix:'RI',nextNumber:1,workflow:false,qmNumber:false,qmVersion:false,retentionLocked:false,active:true},
    {name:'Zertifikat',prefix:'ZE',nextNumber:1,workflow:false,qmNumber:false,qmVersion:false,retentionLocked:false,active:true},
    {name:'Bescheinigung / Nachweis',prefix:'BN',nextNumber:1,workflow:false,qmNumber:false,qmVersion:false,retentionLocked:false,active:true},
    {name:'Vertrag',prefix:'VT',nextNumber:1,workflow:false,qmNumber:false,qmVersion:false,retentionLocked:false,active:true},
    {name:'Sonstiges Dokument',prefix:'DOK',nextNumber:1,workflow:false,qmNumber:false,qmVersion:false,retentionLocked:false,active:true}
  ],
  uploadMaxMB: 20,
  archiveAutoCleanup: false,
  archiveRetentionDays: 90
};
let cache = structuredClone(DEFAULTS);
export function getPortalSettings(){ return cache; }
export async function loadPortalSettings(){ try { const r=await portalCall('getManagementPortalSettings'); cache={...structuredClone(DEFAULTS),...(r.settings||{})}; } catch(e){ console.warn('Einstellungen konnten nicht geladen werden, Standardwerte werden verwendet.',e); } return cache; }
export async function savePortalSettings(settings){ const r=await portalCall('updateManagementPortalSettings',{settings}); cache={...cache,...(r.settings||settings)}; return cache; }
export async function uploadCompanyLogo(file, companyId){ const r=await portalCall('uploadManagementPortalCompanyLogo',{companyId,file:await uploadPayload(file)}); return r; }

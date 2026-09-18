import { portalCall } from "./document-store.js";

let ctx = null;
let conversations = [];
let activeId = "";
let pollTimer = null;
let lastMessageSignature = "";
let unreadCallback = null;

function esc(s=""){return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"})[m]);}
function fmt(v){if(!v)return "";const d=new Date(v);return Number.isNaN(d.getTime())?"":d.toLocaleString("de-DE",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"});}
function initials(name=""){return String(name).split(/\s+/).filter(Boolean).map(x=>x[0]).join("").slice(0,2).toUpperCase()||"TP";}
function myUid(){return String(ctx?.user?.uid||"");}
function displayName(c){if(c.type==="group")return c.title||"Gruppe";const other=(c.members||[]).find(m=>String(m.uid)!==myUid());return other?.name||other?.email||"Direktchat";}
function subtitle(c){if(c.type==="group")return `${(c.memberIds||[]).length} Mitglieder`;const other=(c.members||[]).find(m=>String(m.uid)!==myUid());return other?.roleLabel||other?.email||"Direktnachricht";}
function isUnread(c){return Boolean(c.unread);}

export function stopChatModule(){if(pollTimer){clearInterval(pollTimer);pollTimer=null;}ctx=null;activeId="";lastMessageSignature="";}
export function setChatUnreadCallback(fn){unreadCallback=fn;}

export async function getChatUnreadCount(){
  try{const r=await portalCall("listManagementPortalChats");return Number(r.unreadCount||0);}catch(e){console.warn("Chat-Zähler nicht verfügbar",e);return 0;}
}

export async function renderChatModule(options){
  stopChatModule(); ctx=options;
  ctx.setHead?.("Chat","Interne Kommunikation im TP-Managementportal.");
  ctx.content.innerHTML=`<div class="chat-loading">Chat wird geladen …</div>`;
  await refreshConversations(true);
  pollTimer=setInterval(()=>{if(ctx)refreshConversations(false).catch(()=>{});},4000);
}

async function refreshConversations(initial=false){
  if(!ctx)return;
  const r=await portalCall("listManagementPortalChats");
  conversations=Array.isArray(r.conversations)?r.conversations:[];
  unreadCallback?.(Number(r.unreadCount||0));
  if(initial){activeId=activeId||conversations[0]?.id||"";renderShell(); if(activeId)await loadMessages(true);}
  else {renderConversationList(); if(activeId)await loadMessages(false);}
}

function renderShell(){
  if(!ctx)return;
  ctx.content.innerHTML=`<div class="chat-shell">
    <aside class="chat-list-pane">
      <div class="chat-list-head"><div><strong>Unterhaltungen</strong><span>Direkt- und Gruppenchats</span></div><button class="chat-new-btn" id="chat-new" title="Neuen Chat starten">＋</button></div>
      <div class="chat-search"><input id="chat-search" type="search" placeholder="Chats durchsuchen …"></div>
      <div id="chat-conversation-list" class="chat-conversation-list"></div>
    </aside>
    <section id="chat-main" class="chat-main"></section>
  </div>`;
  document.querySelector("#chat-new").onclick=openNewChatDialog;
  document.querySelector("#chat-search").oninput=renderConversationList;
  renderConversationList(); renderEmptyMain();
}

function renderConversationList(){
  const box=document.querySelector("#chat-conversation-list"); if(!box)return;
  const q=(document.querySelector("#chat-search")?.value||"").trim().toLowerCase();
  const rows=conversations.filter(c=>`${displayName(c)} ${c.lastMessageText||""}`.toLowerCase().includes(q));
  box.innerHTML=rows.length?rows.map(c=>`<button class="chat-conversation ${c.id===activeId?"active":""} ${isUnread(c)?"unread":""}" data-chat-id="${esc(c.id)}">
    <span class="chat-avatar ${c.type==="group"?"group":""}">${c.type==="group"?"👥":esc(initials(displayName(c)))}</span>
    <span class="chat-conv-copy"><span class="chat-conv-top"><strong>${esc(displayName(c))}</strong><small>${fmt(c.lastMessageAt)}</small></span><span class="chat-preview">${esc(c.lastMessageText||subtitle(c))}</span></span>${isUnread(c)?'<i class="chat-unread-dot"></i>':''}
  </button>`).join(""):`<div class="chat-list-empty">${q?"Keine passenden Chats gefunden.":"Noch keine Unterhaltung vorhanden."}</div>`;
  box.querySelectorAll("[data-chat-id]").forEach(b=>b.onclick=async()=>{activeId=b.dataset.chatId;lastMessageSignature="";renderConversationList();await loadMessages(true);});
}

function renderEmptyMain(){const main=document.querySelector("#chat-main");if(main)main.innerHTML=`<div class="chat-empty-main"><div class="chat-empty-icon">💬</div><h2>TP Chat</h2><p>Wählen Sie links eine Unterhaltung aus oder starten Sie einen neuen Chat.</p><button class="btn" id="chat-empty-new">+ Neuer Chat</button></div>`;document.querySelector("#chat-empty-new")?.addEventListener("click",openNewChatDialog);}

async function loadMessages(force){
  if(!ctx||!activeId)return;
  const c=conversations.find(x=>x.id===activeId); if(!c){activeId="";renderEmptyMain();return;}
  const r=await portalCall("getManagementPortalChatMessages",{conversationId:activeId});
  const messages=Array.isArray(r.messages)?r.messages:[];
  const sig=messages.map(m=>`${m.id}:${m.updatedAt||m.createdAt}`).join("|");
  if(force||sig!==lastMessageSignature){lastMessageSignature=sig;renderMain(c,messages);}
  if(c.unread){await portalCall("markManagementPortalChatRead",{conversationId:activeId}).catch(()=>{});c.unread=false;renderConversationList();}
}

function renderMain(c,messages){
  const main=document.querySelector("#chat-main");if(!main)return;
  main.innerHTML=`<div class="chat-main-head"><div class="chat-head-avatar ${c.type==="group"?"group":""}">${c.type==="group"?"👥":esc(initials(displayName(c)))}</div><div><strong>${esc(displayName(c))}</strong><span>${esc(subtitle(c))}</span></div></div>
  <div id="chat-messages" class="chat-messages">${messages.length?messages.map(messageHtml).join(""):'<div class="chat-first-message">Noch keine Nachricht. Schreiben Sie die erste Nachricht.</div>'}</div>
  <form id="chat-compose" class="chat-compose"><textarea id="chat-text" rows="1" maxlength="4000" placeholder="Nachricht schreiben …"></textarea><button class="chat-send" type="submit" title="Senden">➤</button></form>`;
  const area=document.querySelector("#chat-text");
  area.addEventListener("input",()=>{area.style.height="auto";area.style.height=Math.min(area.scrollHeight,120)+"px";});
  area.addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();document.querySelector("#chat-compose").requestSubmit();}});
  document.querySelector("#chat-compose").onsubmit=sendMessage;
  const box=document.querySelector("#chat-messages");box.scrollTop=box.scrollHeight;
}
function messageHtml(m){const mine=String(m.senderUid)===myUid();return `<div class="chat-message-row ${mine?"mine":"theirs"}">${!mine?`<div class="chat-mini-avatar">${esc(initials(m.senderName))}</div>`:""}<div class="chat-bubble"><div class="chat-message-meta">${!mine?`<strong>${esc(m.senderName||"Mitarbeiter")}</strong>`:""}<span>${fmt(m.createdAt)}</span></div><div class="chat-message-text">${esc(m.text).replace(/\n/g,"<br>")}</div></div></div>`;}
async function sendMessage(e){e.preventDefault();const area=document.querySelector("#chat-text");const text=area.value.trim();if(!text||!activeId)return;area.value="";area.style.height="auto";try{await portalCall("sendManagementPortalChatMessage",{conversationId:activeId,text});await loadMessages(true);await refreshConversations(false);}catch(err){ctx.toast?.(err.message||"Nachricht konnte nicht gesendet werden.");area.value=text;}}

function openNewChatDialog(){
  const people=(ctx.colleagues||[]).filter(p=>String(p.id)!==myUid());
  ctx.modalContent.innerHTML=`<form id="chat-new-form" class="modal-box"><div class="modal-head"><div><h2>Neuen Chat starten</h2><p>Direktnachricht oder Gruppe erstellen.</p></div><button class="close-btn" type="button" id="chat-new-close">×</button></div>
  <div class="chat-type-switch"><label><input type="radio" name="chat-type" value="direct" checked> Direktchat</label><label><input type="radio" name="chat-type" value="group"> Gruppenchat</label></div>
  <label class="field chat-group-title hidden" id="chat-group-title-wrap"><span>Gruppenname</span><input id="chat-group-title" maxlength="80" placeholder="z. B. Einkauf oder Projekt 12345"></label>
  <div class="chat-people-head"><strong>Teilnehmer auswählen</strong><input id="chat-people-search" type="search" placeholder="Mitarbeiter suchen …"></div>
  <div id="chat-people-list" class="chat-people-list">${people.map(p=>`<label class="chat-person" data-search="${esc(`${p.name} ${p.email||""}`.toLowerCase())}"><input type="checkbox" value="${esc(p.id)}"><span class="chat-mini-avatar">${esc(initials(p.name))}</span><span><strong>${esc(p.name)}</strong><small>${esc(p.email||"")}</small></span></label>`).join("")||'<div class="chat-list-empty">Keine weiteren Portalnutzer gefunden.</div>'}</div>
  <div class="modal-footer"><button class="btn secondary" type="button" id="chat-new-cancel">Abbrechen</button><button class="btn" type="submit">Chat starten</button></div></form>`;
  ctx.modal.showModal();
  const close=()=>ctx.modal.close();document.querySelector("#chat-new-close").onclick=close;document.querySelector("#chat-new-cancel").onclick=close;
  const updateType=()=>{const group=document.querySelector('input[name="chat-type"]:checked').value==="group";document.querySelector("#chat-group-title-wrap").classList.toggle("hidden",!group);document.querySelectorAll("#chat-people-list input").forEach(x=>{x.type=group?"checkbox":"radio";x.name="chat-person-select";});};
  document.querySelectorAll('input[name="chat-type"]').forEach(x=>x.onchange=updateType);updateType();
  document.querySelector("#chat-people-search").oninput=e=>{const q=e.target.value.trim().toLowerCase();document.querySelectorAll(".chat-person").forEach(x=>x.hidden=Boolean(q&&!x.dataset.search.includes(q)));};
  document.querySelector("#chat-new-form").onsubmit=async e=>{e.preventDefault();const type=document.querySelector('input[name="chat-type"]:checked').value;const ids=[...document.querySelectorAll("#chat-people-list input:checked")].map(x=>x.value);if(!ids.length)return ctx.toast?.("Bitte mindestens einen Teilnehmer auswählen.");if(type==="direct"&&ids.length!==1)return ctx.toast?.("Für einen Direktchat bitte genau einen Mitarbeiter auswählen.");const title=(document.querySelector("#chat-group-title")?.value||"").trim();if(type==="group"&&!title)return ctx.toast?.("Bitte einen Namen für die Gruppe eingeben.");try{const r=await portalCall("createManagementPortalChat",{type,title,memberIds:ids});ctx.modal.close();activeId=r.conversation?.id||"";await refreshConversations(true);}catch(err){ctx.toast?.(err.message||"Chat konnte nicht erstellt werden.");}};
}

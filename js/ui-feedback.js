const dialog = () => document.querySelector("#feedback-dialog");
const box = () => document.querySelector("#feedback-content");

function esc(value){
  return String(value ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
}

function openFeedback(html){
  const d=dialog(), b=box();
  if(!d||!b) return false;
  b.innerHTML=html;
  if(!d.open) d.showModal();
  return true;
}


export function portalAlert(message, options={}){
  const d=dialog();
  if(!d){ window.alert(message); return Promise.resolve(); }
  const title=options.title||"Hinweis";
  const buttonText=options.buttonText||"OK";
  const kind=options.kind||"warning";
  const icon=kind==="error"?"!":kind==="success"?"✓":"i";
  return new Promise(resolve=>{
    openFeedback(`<div class="feedback-box feedback-${esc(kind)}"><div class="feedback-icon">${icon}</div><h2>${esc(title)}</h2><p style="white-space:pre-line">${esc(message)}</p><div class="feedback-actions"><button class="btn primary" data-feedback-ok>${esc(buttonText)}</button></div></div>`);
    let settled=false;
    const finish=()=>{if(settled)return;settled=true;d.close();resolve();};
    box().querySelector('[data-feedback-ok]').onclick=finish;
    d.oncancel=e=>{e.preventDefault();finish();};
  });
}

export function portalConfirm(message, options={}){
  const d=dialog();
  if(!d) return Promise.resolve(window.confirm(message));
  const title=options.title||"Bitte bestätigen";
  const confirmText=options.confirmText||"Bestätigen";
  const cancelText=options.cancelText||"Abbrechen";
  const danger=options.danger===true;
  return new Promise(resolve=>{
    openFeedback(`<div class="feedback-box ${danger?'feedback-danger':''}"><div class="feedback-icon">${danger?'!':'?'}</div><h2>${esc(title)}</h2><p>${esc(message)}</p><div class="feedback-actions"><button class="btn" data-feedback-cancel>${esc(cancelText)}</button><button class="btn primary ${danger?'danger-btn':''}" data-feedback-ok>${esc(confirmText)}</button></div></div>`);
    let settled=false;
    const finish=value=>{if(settled)return;settled=true;d.close();resolve(value);};
    box().querySelector('[data-feedback-cancel]').onclick=()=>finish(false);
    box().querySelector('[data-feedback-ok]').onclick=()=>finish(true);
    d.oncancel=e=>{e.preventDefault();finish(false);};
  });
}

export function portalPrompt(message, defaultValue="", options={}){
  const d=dialog();
  if(!d) return Promise.resolve(window.prompt(message,defaultValue));
  const title=options.title||"Eingabe";
  return new Promise(resolve=>{
    openFeedback(`<form class="feedback-box" id="feedback-prompt-form"><div class="feedback-icon">✎</div><h2>${esc(title)}</h2><p>${esc(message)}</p><input class="feedback-input" id="feedback-prompt-input" value="${esc(defaultValue)}" autocomplete="off"><div class="feedback-actions"><button type="button" class="btn" data-feedback-cancel>Abbrechen</button><button type="submit" class="btn primary">Übernehmen</button></div></form>`);
    const input=box().querySelector('#feedback-prompt-input');
    let settled=false;
    const finish=value=>{if(settled)return;settled=true;d.close();resolve(value);};
    box().querySelector('[data-feedback-cancel]').onclick=()=>finish(null);
    box().querySelector('#feedback-prompt-form').onsubmit=e=>{e.preventDefault();finish(input.value);};
    d.oncancel=e=>{e.preventDefault();finish(null);};
    setTimeout(()=>{input.focus();input.select();},0);
  });
}

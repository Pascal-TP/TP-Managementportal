// V3.6.5: Visuelle Rückmeldung bei Datenabrufen; keine erfundenen Prozentangaben.
let pending = new Set();
let timer = null;
let observer = null;
let active = false;
let activeLabel = "Daten werden geladen …";
const loadingSelectors = '.myfiles-loading,.myfiles-tree-loading,.public-loading,.public-lightbox-loading,.myfiles-empty strong,#shared-list .myfiles-empty strong';
function ensure() {
  let root = document.getElementById('tp-loading-indicator');
  if (root) return root;
  root = document.createElement('div');
  root.id = 'tp-loading-indicator';
  root.setAttribute('role','status');
  root.setAttribute('aria-live','polite');
  root.hidden = true;
  root.innerHTML = '<div class="tp-loading-card"><span class="tp-loading-spinner" aria-hidden="true"></span><strong id="tp-loading-label">Daten werden geladen …</strong><span class="tp-loading-track" aria-hidden="true"><span></span></span><small>Bitte einen Moment Geduld.</small></div>';
  document.body.append(root);
  return root;
}
function paint() {
  const root = ensure();
  const visible = pending.size > 0 || active;
  if (!visible) { clearTimeout(timer); timer=null; root.hidden=true; return; }
  const label = pending.size ? [...pending].at(-1) : activeLabel;
  root.querySelector('#tp-loading-label').textContent = label;
  if (!root.hidden || timer) return;
  timer = setTimeout(() => { timer=null; if (pending.size || active) root.hidden=false; }, 350);
}
export function beginPortalLoading(label='Dashboard wird geladen …') {
  const key = Symbol('loading'); pending.add(key); paint();
  return () => { pending.delete(key); paint(); };
}
export function watchPortalLoading() {
  if (observer) return;
  const content = document.getElementById('content');
  if (!content) return;
  const inspect = () => {
    const candidates = [...content.querySelectorAll(loadingSelectors)];
    const loading = candidates.find(el => el.getClientRects().length && /wird geladen|werden geladen|bitte warten|lade/i.test(el.textContent || ''));
    active = !!loading;
    if (loading) activeLabel = (loading.textContent || '').trim().slice(0,110);
    paint();
  };
  observer = new MutationObserver(inspect);
  observer.observe(content,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['hidden','class']});
  inspect();
}

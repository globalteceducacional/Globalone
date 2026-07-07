/* Globaltec One - Editor Master discreto
 * Objetivo: permitir edição manual de blocos/containers do G.One sem programação.
 * Modo padrão: persistência localStorage. Em produção, Manus deve ligar SAVE_ENDPOINT/LOAD_ENDPOINT.
 */
(function(){
  const cfg = window.GONE_MASTER_EDITOR_CONFIG || {};
  const STORAGE_KEY = cfg.storageKey || 'gone_master_content_edits_v1';
  const SAVE_ENDPOINT = cfg.saveEndpoint || '';
  const LOAD_ENDPOINT = cfg.loadEndpoint || '';
  const EDITABLE_SELECTOR = cfg.editableSelector || '[data-editable], .card, .feature-card, .repo-card, .technology-card, .portfolio-card, .dashboard-card, .course-card, .project-card, .partner-card, section, article, .panel, .container, .module, .content-card';
  const ROLE_KEYS = ['goneUserRole','GONE_ROLE','userRole','role'];
  let enabled = false;
  let clickToEdit = false;
  let edits = {};

  function currentRole(){
    for(const k of ROLE_KEYS){ const v = localStorage.getItem(k) || sessionStorage.getItem(k); if(v) return String(v).toLowerCase(); }
    const b = document.body; const r = b?.dataset?.role || b?.getAttribute('data-user-role') || '';
    return String(r || 'master').toLowerCase(); // em demo fica liberado; em produção, integrar com auth real.
  }
  function canEdit(){ return ['admin','master','administrador','usuario_master','usuário master'].includes(currentRole()); }
  function slugify(s){ return String(s||'bloco').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,80) || 'bloco'; }
  function blockId(el){
    if(el.dataset.goneEditId) return el.dataset.goneEditId;
    const title = findTitle(el) || el.id || el.className || el.tagName;
    const id = 'gone-' + slugify(title) + '-' + Math.abs(hashPath(el));
    el.dataset.goneEditId = id;
    return id;
  }
  function hashPath(el){
    let s='', n=el, i=0;
    while(n && n !== document.body && i++<5){
      let idx=0, p=n; while((p=p.previousElementSibling)) idx++;
      s += n.tagName + ':' + idx + '/'; n=n.parentElement;
    }
    let h=0; for(let j=0;j<s.length;j++) h=((h<<5)-h)+s.charCodeAt(j)|0;
    return h;
  }
  function findTitle(el){
    const q = el.querySelector?.('h1,h2,h3,h4,.title,.card-title,strong,b');
    return (q?.innerText || el.getAttribute('aria-label') || el.id || '').trim().slice(0,120);
  }
  function textOf(el){ return (el.innerText||'').trim().replace(/\s+/g,' ').slice(0,1500); }
  function firstImg(el){ return el.querySelector?.('img'); }
  function firstVideo(el){ return el.querySelector?.('video, source'); }
  function loadLocal(){ try { edits = JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}'); } catch(e){ edits = {}; } }
  async function loadRemote(){
    if(!LOAD_ENDPOINT) return;
    try{ const r=await fetch(LOAD_ENDPOINT,{credentials:'include'}); if(r.ok){ const d=await r.json(); edits=d.edits||d||edits; } }catch(e){ console.warn('G.One editor: falha ao carregar remoto',e); }
  }
  async function persist(){
    localStorage.setItem(STORAGE_KEY, JSON.stringify(edits));
    if(SAVE_ENDPOINT){
      try{ await fetch(SAVE_ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json'},credentials:'include',body:JSON.stringify({edits})}); }catch(e){ console.warn('G.One editor: salvo localmente; remoto falhou',e); }
    }
  }
  function applyEdits(){
    document.querySelectorAll(EDITABLE_SELECTOR).forEach(el=>{
      if(!isUsable(el)) return;
      const id=blockId(el), e=edits[id]; if(!e) return;
      if(e.html && e.allowHtml){ el.innerHTML = e.html; }
      else {
        const titleEl = el.querySelector('h1,h2,h3,h4,.title,.card-title,strong,b');
        const textEl = el.querySelector('p,.description,.text,.card-text');
        if(e.title && titleEl) titleEl.textContent=e.title;
        if(e.text && textEl) textEl.textContent=e.text;
      }
      const img=firstImg(el); if(e.imageUrl && img) img.src=e.imageUrl;
      const vid=el.querySelector('video'); if(e.videoUrl && vid){ vid.src=e.videoUrl; vid.load?.(); }
    });
  }
  function isUsable(el){
    if(!el || el.closest('#gone-editor-panel,#gone-editor-modal,#gone-suite-floating-links')) return false;
    const rect=el.getBoundingClientRect();
    if(rect.width < 120 || rect.height < 50) return false;
    if(['SCRIPT','STYLE','LINK','META','BODY','HTML','NAV','HEADER'].includes(el.tagName)) return false;
    return true;
  }
  function ensurePanel(){
    if(document.getElementById('gone-editor-panel')) return;
    const panel=document.createElement('div');
    panel.id='gone-editor-panel';
    panel.innerHTML=`<button class="gone-editor-config-btn" type="button" title="Segure e arraste para mover • Clique para abrir">⚙️ <span class="gone-editor-config-label">Configurações</span></button>
      <span class="gone-editor-drag-hint">arraste para mover</span>
      <div class="gone-editor-dropdown" hidden>
        <div class="gone-editor-head">Edição Master</div>
        <button type="button" data-action="toggleDots">Ativar três pontinhos sutis</button>
        <button type="button" data-action="toggleClick">Editar qualquer ponto da página</button>
        <button type="button" data-action="resetPos">Reposicionar botão</button>
        <button type="button" data-action="export">Exportar edições JSON</button>
        <button type="button" data-action="clear">Limpar edições locais</button>
        <small>Visível apenas para perfil Master/Admin. Em produção, conectar ao login real.</small>
      </div>`;
    document.body.appendChild(panel);
    const style=document.createElement('style');
    style.textContent=`#gone-editor-panel{font-family:Inter,system-ui,Arial,sans-serif}.gone-editor-config-btn{border:1px solid rgba(255,255,255,.25);background:rgba(15,23,42,.78);color:#fff;border-radius:999px;padding:9px 13px;font-weight:700;box-shadow:0 8px 24px rgba(0,0,0,.18);backdrop-filter:blur(10px)}.gone-editor-dropdown{margin-top:0;background:#fff;color:#0f172a;border-radius:16px;padding:12px;box-shadow:0 18px 50px rgba(0,0,0,.28);border:1px solid #e5e7eb}.gone-editor-head{font-weight:900;margin-bottom:8px;color:#063a64}.gone-editor-dropdown button{display:block;width:100%;text-align:left;margin:6px 0;border:1px solid #e5e7eb;background:#f8fafc;border-radius:10px;padding:9px 10px;cursor:pointer}.gone-editor-dropdown small{display:block;color:#64748b;margin-top:8px;line-height:1.35}.gone-edit-dot{position:absolute;right:8px;top:8px;z-index:2147482000;width:28px;height:28px;border-radius:999px;border:1px solid rgba(15,23,42,.18);background:rgba(255,255,255,.82);color:#0f172a;box-shadow:0 5px 14px rgba(0,0,0,.14);cursor:pointer;font-weight:900;line-height:1}.gone-editable-outline{outline:1px dashed rgba(6,58,100,.28);outline-offset:3px}.gone-click-edit *{cursor:crosshair!important}#gone-editor-modal{position:fixed;inset:0;background:rgba(2,6,23,.58);z-index:2147483200;display:flex;align-items:center;justify-content:center;padding:20px;font-family:Inter,system-ui,Arial,sans-serif}#gone-editor-modal .box{width:min(760px,96vw);max-height:90vh;overflow:auto;background:#fff;border-radius:18px;padding:18px;box-shadow:0 24px 80px rgba(0,0,0,.35)}#gone-editor-modal h3{margin:0 0 10px;color:#063a64}#gone-editor-modal label{display:block;font-weight:800;margin:10px 0 4px;color:#1f2937}#gone-editor-modal input,#gone-editor-modal textarea{width:100%;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:10px;padding:10px;font:inherit}#gone-editor-modal textarea{min-height:100px}#gone-editor-modal .actions{display:flex;gap:10px;justify-content:flex-end;margin-top:14px;flex-wrap:wrap}#gone-editor-modal button{border:0;border-radius:10px;padding:10px 14px;font-weight:800;cursor:pointer}#gone-editor-modal .save{background:#063a64;color:#fff}#gone-editor-modal .cancel{background:#e5e7eb;color:#111827}#gone-editor-modal .danger{background:#fee2e2;color:#991b1b}`;
    document.head.appendChild(style);
    const btn=panel.querySelector('.gone-editor-config-btn');
    makePanelDraggable(panel, btn);
    btn.addEventListener('click', ev=>{ if(panel.dataset.dragged==='1'){ ev.preventDefault(); panel.dataset.dragged='0'; return; } const dd=panel.querySelector('.gone-editor-dropdown'); dd.hidden=!dd.hidden; });
    panel.addEventListener('click', ev=>{
      const a=ev.target?.dataset?.action; if(!a) return;
      if(a==='toggleDots'){ enabled=!enabled; refreshDots(); ev.target.textContent=enabled?'Ocultar três pontinhos':'Ativar três pontinhos sutis'; }
      if(a==='toggleClick'){ clickToEdit=!clickToEdit; document.body.classList.toggle('gone-click-edit',clickToEdit); ev.target.textContent=clickToEdit?'Desativar edição por clique':'Editar qualquer ponto da página'; }
      if(a==='resetPos'){ localStorage.removeItem(POS_KEY); panel.style.cssText=''; applyDefaultPanelPosition(panel); panel.querySelector('.gone-editor-dropdown').hidden=true; }
      if(a==='export') exportEdits();
      if(a==='clear'){ if(confirm('Limpar edições locais?')){ edits={}; localStorage.removeItem(STORAGE_KEY); location.reload(); } }
    });
  }
  const POS_KEY='gone_editor_panel_pos_v1';
  function applyDefaultPanelPosition(panel){
    if(localStorage.getItem(POS_KEY)) return;
    panel.style.right='auto';
    panel.style.bottom='auto';
    if(window.innerWidth<=760){
      panel.style.left='12px';
      panel.style.top=Math.max(12, window.innerHeight-148)+'px';
    }else{
      panel.style.left='auto';
      panel.style.top='18px';
      panel.style.right='18px';
    }
  }
  function loadPanelPosition(panel){
    try{
      const pos=JSON.parse(localStorage.getItem(POS_KEY)||'null');
      if(!pos) return applyDefaultPanelPosition(panel);
      panel.style.left=pos.left+'px';
      panel.style.top=pos.top+'px';
      panel.style.right='auto';
      panel.style.bottom='auto';
    }catch(e){ applyDefaultPanelPosition(panel); }
  }
  function clampPanel(panel, left, top){
    const pad=8, w=panel.offsetWidth||120, h=panel.offsetHeight||48;
    const maxL=Math.max(pad, window.innerWidth-w-pad);
    const maxT=Math.max(pad, window.innerHeight-h-pad);
    return { left: Math.min(Math.max(pad, left), maxL), top: Math.min(Math.max(pad, top), maxT) };
  }
  function makePanelDraggable(panel, handle){
    loadPanelPosition(panel);
    let dragging=false, moved=false, sx=0, sy=0, sl=0, st=0;
    function onDown(e){
      if(e.target.closest('.gone-editor-dropdown')) return;
      dragging=true; moved=false;
      const r=panel.getBoundingClientRect();
      sx=e.clientX; sy=e.clientY; sl=r.left; st=r.top;
      panel.style.right='auto'; panel.style.bottom='auto';
      panel.classList.add('is-dragging');
      handle.setPointerCapture?.(e.pointerId);
      e.preventDefault();
    }
    function onMove(e){
      if(!dragging) return;
      const dx=e.clientX-sx, dy=e.clientY-sy;
      if(Math.abs(dx)>5||Math.abs(dy)>5) moved=true;
      const p=clampPanel(panel, sl+dx, st+dy);
      panel.style.left=p.left+'px'; panel.style.top=p.top+'px';
    }
    function onUp(e){
      if(!dragging) return;
      dragging=false; panel.classList.remove('is-dragging');
      handle.releasePointerCapture?.(e.pointerId);
      if(moved){
        panel.dataset.dragged='1';
        localStorage.setItem(POS_KEY, JSON.stringify({ left: parseInt(panel.style.left,10), top: parseInt(panel.style.top,10) }));
        panel.querySelector('.gone-editor-dropdown').hidden=true;
      }
    }
    handle.addEventListener('pointerdown', onDown);
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
    handle.addEventListener('pointercancel', onUp);
    window.addEventListener('resize', ()=>{
      const r=panel.getBoundingClientRect();
      const p=clampPanel(panel, r.left, r.top);
      panel.style.left=p.left+'px'; panel.style.top=p.top+'px';
    });
  }
  function refreshDots(){
    document.querySelectorAll('.gone-edit-dot').forEach(x=>x.remove());
    document.querySelectorAll('.gone-editable-outline').forEach(x=>x.classList.remove('gone-editable-outline'));
    if(!enabled) return;
    document.querySelectorAll(EDITABLE_SELECTOR).forEach(el=>{
      if(!isUsable(el)) return;
      if(getComputedStyle(el).position==='static') el.style.position='relative';
      el.classList.add('gone-editable-outline');
      const b=document.createElement('button'); b.type='button'; b.className='gone-edit-dot'; b.textContent='⋯'; b.title='Editar bloco';
      b.addEventListener('click', ev=>{ ev.preventDefault(); ev.stopPropagation(); openEditor(el); });
      el.appendChild(b);
    });
  }
  function nearestEditable(target){
    let el=target; for(let i=0; el && el!==document.body && i<8; i++, el=el.parentElement){ if(el.matches?.(EDITABLE_SELECTOR) && isUsable(el)) return el; }
    return null;
  }
  function openEditor(el){
    const id=blockId(el), old=edits[id]||{};
    const img=firstImg(el), vid=el.querySelector('video, source');
    const title=findTitle(el), text=textOf(el);
    const modal=document.createElement('div'); modal.id='gone-editor-modal';
    modal.innerHTML=`<div class="box"><h3>Editar conteúdo da página</h3><p style="margin:0;color:#64748b">ID: ${id}</p>
      <label>Título</label><input name="title" value="${esc(old.title||title)}">
      <label>Texto/descrição</label><textarea name="text">${esc(old.text||text)}</textarea>
      <label>URL da imagem principal</label><input name="imageUrl" placeholder="https://.../imagem.webp" value="${esc(old.imageUrl||img?.getAttribute('src')||'')}">
      <label>URL do vídeo principal</label><input name="videoUrl" placeholder="https://.../video.mp4" value="${esc(old.videoUrl||vid?.getAttribute('src')||'')}">
      <label>HTML interno avançado opcional</label><textarea name="html" style="min-height:160px">${esc(old.html||'')}</textarea>
      <label style="display:flex;gap:8px;align-items:center;font-weight:700"><input type="checkbox" name="allowHtml" ${old.allowHtml?'checked':''} style="width:auto"> aplicar HTML avançado</label>
      <div class="actions"><button class="danger" data-act="delete">Excluir edição</button><button class="cancel" data-act="cancel">Cancelar</button><button class="save" data-act="save">Salvar</button></div></div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', async ev=>{
      const act=ev.target?.dataset?.act; if(!act) return;
      if(act==='cancel'){ modal.remove(); return; }
      if(act==='delete'){ delete edits[id]; await persist(); modal.remove(); location.reload(); return; }
      if(act==='save'){
        const fd=new FormData(modal.querySelector('.box'));
        edits[id]={ title:fd.get('title'), text:fd.get('text'), imageUrl:fd.get('imageUrl'), videoUrl:fd.get('videoUrl'), html:fd.get('html'), allowHtml:!!fd.get('allowHtml'), updatedAt:new Date().toISOString() };
        await persist(); modal.remove(); applyEdits(); refreshDots();
      }
    });
  }
  function exportEdits(){
    const blob=new Blob([JSON.stringify({exportedAt:new Date().toISOString(),edits},null,2)],{type:'application/json'});
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='gone-edicoes-master.json'; a.click(); URL.revokeObjectURL(a.href);
  }
  function esc(s){ return String(s||'').replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
  async function boot(){
    if(!canEdit()) return;
    loadLocal(); await loadRemote(); applyEdits(); ensurePanel();
    document.addEventListener('click', ev=>{ if(!clickToEdit) return; if(ev.target.closest('#gone-editor-panel,#gone-editor-modal,.gone-edit-dot')) return; const el=nearestEditable(ev.target); if(el){ ev.preventDefault(); ev.stopPropagation(); openEditor(el); } }, true);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();

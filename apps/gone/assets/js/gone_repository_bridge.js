/* Globaltec One - Ponte aparente Repositório → AVA/ERP/TECA
 * Adiciona ações contextuais em cards/containers do repositório sem quebrar o visual original.
 * Manus deve substituir esta ponte por integração nativa quando mapear tecnologia_id/course_id/project_id.
 */
(function(){
  function cfg(){ return window.GONE_SUITE || {}; }
  function slugify(s){ return String(s||'tecnologia').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,80) || 'tecnologia'; }
  function cardTitle(el){
    const t=el.querySelector?.('h1,h2,h3,h4,.title,.card-title,strong,b');
    return (t?.innerText || el.getAttribute('data-title') || el.getAttribute('aria-label') || '').trim();
  }
  function isRepoContext(el){
    const text=(el.innerText||'').toLowerCase();
    const cls=(el.className||'').toString().toLowerCase();
    return cls.includes('repo') || cls.includes('technology') || cls.includes('portfolio') || text.includes('open-source') || text.includes('tecnologia') || text.includes('curso') || text.includes('projeto');
  }
  function addActions(){
    if((window.GONE_SUITE||{}).MODE==='gone-only') return;
    if(document.getElementById('gone-repo-bridge-style')) return;
    const style=document.createElement('style'); style.id='gone-repo-bridge-style';
    style.textContent=`.gone-repo-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:10px}.gone-repo-actions a{font-family:Inter,system-ui,Arial,sans-serif;text-decoration:none;border-radius:999px;padding:7px 10px;font-size:12px;font-weight:800;border:1px solid rgba(6,58,100,.18);background:rgba(255,255,255,.82);color:#063a64;box-shadow:0 4px 12px rgba(0,0,0,.08)}.gone-repo-actions a:hover{background:#063a64;color:#fff}`;
    document.head.appendChild(style);
    const candidates=document.querySelectorAll('[data-technology-id], [data-tech-id], .technology-card, .repo-card, .portfolio-card, .card');
    candidates.forEach(el=>{
      if(el.querySelector('.gone-repo-actions')) return;
      const title=cardTitle(el); if(!title || title.length<3) return;
      if(!isRepoContext(el)) return;
      const s=slugify(title), c=cfg();
      const ava=(c.AVA_URL||'/ava') + '/course/search.php?search=' + encodeURIComponent(title);
      const erp=(c.ERP_URL||'/erp') + '/projects?technology=' + encodeURIComponent(s) + '&title=' + encodeURIComponent(title);
      const teca=(c.TECA_URL||'/teca') + '/?context=' + encodeURIComponent('technology:'+s) + '&q=' + encodeURIComponent('Explique a tecnologia '+title+' e indique curso e projeto no G.One.');
      const wrap=document.createElement('div'); wrap.className='gone-repo-actions';
      wrap.innerHTML=`<a href="${ava}" target="_blank" rel="noopener">Ver curso</a><a href="${erp}" target="_blank" rel="noopener">Abrir projeto</a><a href="${teca}" target="_blank" rel="noopener">Perguntar à TECA</a>`;
      el.appendChild(wrap);
    });
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>setTimeout(addActions,900)); else setTimeout(addActions,900);
})();

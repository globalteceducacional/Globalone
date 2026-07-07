(function(){
  function addSuiteLinks(){
    var cfg = window.GONE_SUITE || {};
    if (cfg.MODE === 'gone-only' || (!cfg.ERP_URL && !cfg.AVA_URL && !cfg.TECA_URL)) return;
    var erp = cfg.ERP_URL || '/erp';
    var ava = cfg.AVA_URL || '/ava';
    var teca = cfg.TECA_URL || '/teca';
    var wrap = document.createElement('div');
    wrap.id = 'gone-suite-floating-links';
    wrap.innerHTML = '<a class="suite-link suite-link-teca" href="'+teca+'" target="_blank" rel="noopener">Abrir TECA</a><a class="suite-link suite-link-ava" href="'+ava+'" target="_blank" rel="noopener">Abrir AVA</a><a class="suite-link suite-link-erp" href="'+erp+'" target="_blank" rel="noopener">Abrir ERP</a>';
    document.body.appendChild(wrap);
    var style = document.createElement('style');
    style.textContent = '#gone-suite-floating-links{position:fixed;right:18px;bottom:18px;z-index:999999;display:flex;gap:10px;flex-wrap:wrap}.suite-link{font-family:Inter,system-ui,Arial,sans-serif;text-decoration:none;border-radius:999px;padding:11px 16px;font-weight:800;box-shadow:0 10px 28px rgba(0,0,0,.28);border:1px solid rgba(255,255,255,.28);backdrop-filter:blur(8px)}.suite-link-teca{background:#5b21b6;color:white}.suite-link-ava{background:#0b6b5b;color:white}.suite-link-erp{background:#083b7a;color:white}@media(max-width:700px){#gone-suite-floating-links{left:14px;right:14px;bottom:12px}.suite-link{flex:1;text-align:center;padding:10px 12px}}';
    document.head.appendChild(style);
    document.addEventListener('click', function(ev){
      var el = ev.target && ev.target.closest && ev.target.closest('[data-open-teca],[data-open-ava],[data-open-erp],.open-teca,.open-ava,.open-erp');
      if(!el) return;
      if(el.matches('[data-open-teca],.open-teca')) { ev.preventDefault(); window.open(teca,'_blank'); }
      if(el.matches('[data-open-ava],.open-ava')) { ev.preventDefault(); window.open(ava,'_blank'); }
      if(el.matches('[data-open-erp],.open-erp')) { ev.preventDefault(); window.open(erp,'_blank'); }
    });
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addSuiteLinks); else addSuiteLinks();
})();

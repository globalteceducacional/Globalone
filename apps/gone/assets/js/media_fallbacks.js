
(function(){
  const fallback = 'assets/images/fallback-gone.png';
  const dataFallback = 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 625"><rect width="1000" height="625" rx="32" fill="#083c34"/><rect x="40" y="40" width="920" height="545" rx="24" fill="none" stroke="#f2bd2d" stroke-width="8"/><text x="82" y="130" font-family="Arial" font-size="64" font-weight="700" fill="#f2bd2d">G.One</text><text x="82" y="205" font-family="Arial" font-size="34" fill="#fff">Mídia externa não carregada</text><text x="82" y="255" font-family="Arial" font-size="24" fill="#dff5ee">Fallback visual automático do MVP.</text></svg>`);
  function setFallback(img){
    if(!img || img.dataset.goneFallbackApplied) return;
    img.dataset.goneFallbackApplied = '1';
    img.src = (location.protocol === 'file:' ? dataFallback : fallback);
  }
  window.addEventListener('error', function(ev){
    const t = ev.target;
    if(!t) return;
    if(t.tagName === 'IMG') setFallback(t);
    if(t.tagName === 'VIDEO'){
      const local = 'assets/videos/gone-apresentacao-demo.mp4';
      if(t.src && !t.src.includes('gone-apresentacao-demo.mp4')){ t.src = local; try{ t.load(); }catch(e){} }
    }
  }, true);
  document.addEventListener('DOMContentLoaded', function(){
    document.querySelectorAll('img').forEach(img => { if(img.complete && img.naturalWidth === 0) setFallback(img); });
  });
})();

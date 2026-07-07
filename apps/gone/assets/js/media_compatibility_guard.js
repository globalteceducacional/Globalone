/* Globaltec One - guarda de mídia: imagens/vídeos bugados e formatos não suportados */
(function(){
  const fallback = 'assets/images/fallback-gone.png';
  const videoFormats = ['.mp4','.webm','.ogg','.ogv'];
  function ext(src){ try{ return new URL(src, location.href).pathname.toLowerCase(); }catch(e){ return String(src||'').toLowerCase(); } }
  function markVideo(v,msg){
    if(v.dataset.goneMediaMarked) return; v.dataset.goneMediaMarked='1';
    const box=document.createElement('div');
    box.style.cssText='border:1px dashed #cbd5e1;background:#f8fafc;color:#334155;border-radius:12px;padding:12px;margin:8px 0;font-family:Inter,system-ui,Arial,sans-serif;font-size:14px';
    box.innerHTML='<strong>Vídeo indisponível.</strong><br>'+msg+'<br><small>Use MP4/H.264, WebM ou Ogg para compatibilidade web.</small>';
    v.replaceWith(box);
  }
  function scan(){
    document.querySelectorAll('img').forEach(img=>{
      img.addEventListener('error',()=>{ if(!img.dataset.fallbackApplied){ img.dataset.fallbackApplied='1'; img.src=fallback; img.alt=img.alt||'Imagem indisponível'; } },{once:true});
      const p=ext(img.getAttribute('src')||'');
      if(/\.(heic|heif|tif|tiff|raw|psd|ai)$/i.test(p)) img.src=fallback;
    });
    document.querySelectorAll('video').forEach(v=>{
      const src=v.currentSrc || v.getAttribute('src') || v.querySelector('source')?.getAttribute('src') || '';
      if(src && !videoFormats.some(f=>ext(src).includes(f))) markVideo(v,'Formato detectado não é recomendado para navegador: '+src);
      v.addEventListener('error',()=>markVideo(v,'Não foi possível carregar o arquivo de vídeo informado.'),{once:true});
    });
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',scan); else scan();
})();

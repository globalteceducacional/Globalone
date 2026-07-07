(function(){
  const cfg = window.GONE_CONFIG || {};
  const configured = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && window.supabase);
  window.GONE = window.GONE || {};
  window.GONE.configured = configured;
  window.GONE.edgeBase = cfg.EDGE_FUNCTIONS_BASE_URL || (cfg.SUPABASE_URL ? `${cfg.SUPABASE_URL}/functions/v1` : '');
  window.GONE.client = configured ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY) : null;
})();

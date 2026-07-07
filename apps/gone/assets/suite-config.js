(function(){
  var host = window.location.hostname;
  var protocol = window.location.protocol;
  var isLocal = host === 'localhost' || host === '127.0.0.1' || host.startsWith('192.168.') || host.startsWith('10.') || host.startsWith('172.');
  if (isLocal) {
    window.GONE_SUITE = {
      ERP_URL: protocol + '//localhost:5174',
      AVA_URL: protocol + '//localhost:8081',
      TECA_URL: protocol + '//localhost:8083',
      MODE: 'docker-suite-local'
    };
    return;
  }
  // Portal único em domínio raiz (ex.: globaltecone.tech) — sem AVA/ERP/TECA por hora
  var goneOnlyHosts = ['globaltecone.tech', 'www.globaltecone.tech'];
  if (goneOnlyHosts.indexOf(host) !== -1) {
    window.GONE_SUITE = {
      ERP_URL: null,
      AVA_URL: null,
      TECA_URL: null,
      MODE: 'gone-only'
    };
    return;
  }
  var root = host.replace(/^one\./,'').replace(/^g-one\./,'');
  window.GONE_SUITE = {
    ERP_URL: protocol + '//erp.' + root,
    AVA_URL: protocol + '//ava.' + root,
    TECA_URL: protocol + '//teca.' + root,
    MODE: 'docker-suite-production'
  };
})();

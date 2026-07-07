(function(){
  function byId(id){ return document.getElementById(id); }
  function htmlEsc(v){ return String(v ?? '').replace(/[&<>"]/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[s])); }
  function canUseSupabase(){ return !!(window.GONE && window.GONE.client); }
  async function invokeFunction(name, body){
    if(!canUseSupabase()) throw new Error('Supabase não configurado.');
    const { data, error } = await window.GONE.client.functions.invoke(name, { body });
    if(error) throw error;
    return data;
  }
  async function sbSelect(table, query='*'){
    if(!canUseSupabase()) return null;
    const { data, error } = await window.GONE.client.from(table).select(query);
    if(error) { console.warn('[G.One] Falha ao consultar '+table, error); return null; }
    return data;
  }
  function mapTechnology(row){
    return {
      id: row.id,
      name: row.name,
      category: row.category || '',
      group_id: row.group_id || '',
      group: row.group_title || row.area || '',
      area: row.area || '',
      disciplines: row.disciplines || '',
      difficulty: row.difficulty || '',
      software: row.software || '',
      license: row.license || '',
      risk: row.risk || '',
      price: row.price_text || '',
      repo: row.repo_url || '',
      docs: row.docs_url || '',
      cad: row.cad_url || '',
      source: row.source || 'Supabase',
      main: !!row.is_main,
      campi: row.campi || [],
      visual: row.visual_key || '',
      video: row.video_url || '',
      embed: '',
      search: [row.id,row.name,row.category,row.area,row.disciplines,row.description].filter(Boolean).join(' ').toLowerCase()
    };
  }
  async function loadSupabaseIntoOriginalVisual(){
    if(!canUseSupabase()) return false;
    try{
      const [groups, technologies, campuses, courses, projects] = await Promise.all([
        sbSelect('technology_groups','*'),
        sbSelect('technologies','*'),
        sbSelect('campuses','*'),
        sbSelect('courses','*'),
        sbSelect('projects','*')
      ]);
      if(typeof APP_DATA !== 'undefined'){
        if(groups && groups.length){
          APP_DATA.portfolio.groups = groups.map(g => ({
            id:g.id, title:g.title, area:g.area, disciplines:g.disciplines, count:g.count, main_count:g.main_count,
            visual:g.visual_key, hero_item:g.hero_item_id, hero_item_name:g.hero_item_name
          }));
        }
        if(technologies && technologies.length){ APP_DATA.portfolio.items = technologies.map(mapTechnology); }
        if(campuses && campuses.length){
          APP_DATA.portfolio.campi = campuses.map(c => ({
            name:c.name, slug:c.slug, city:c.city, state:c.state, tier:c.tier, strengths:c.strengths, attention:c.attention,
            courses:c.courses || [], areas:c.areas || [], groups:c.groups || [], techs:(c.raw && c.raw.techs) || []
          }));
        }
      }
      if(typeof state !== 'undefined'){
        if(courses && courses.length){
          state.courses = courses.map(c => ({id:c.id,title:c.title,source:c.source,hours:c.hours,level:c.level,area:c.area,public:c.target_public,desc:c.description,modules:(c.raw && c.raw.modules)||[],skills:c.skills||[]}));
        }
        if(projects && projects.length){
          state.projects = projects.map(p => ({id:p.id,title:p.title,status:p.status,progress:p.progress,supervisor:p.supervisor,value:p.value,type:p.type,trl:p.trl,priority:p.priority,objective:p.objective,summary:p.summary,goals:p.goals||[],steps:p.steps||[],deliverables:p.deliverables||[],courses:p.courses||[]}));
        }
      }
      if(typeof renderAll === 'function') renderAll();
      return true;
    }catch(e){ console.warn('[G.One] Modo Supabase indisponível; mantendo demo visual original.', e); return false; }
  }

  const oldDoLogin = (typeof doLogin === 'function') ? doLogin : null;
  if(oldDoLogin){
    doLogin = async function(){
      const u = byId('loginUser')?.value?.trim();
      const p = byId('loginPass')?.value;
      if(canUseSupabase() && u && u.includes('@')){
        const { data, error } = await window.GONE.client.auth.signInWithPassword({ email:u, password:p });
        if(error){ alert('Login Supabase inválido: '+error.message); return; }
        const { data: prof } = await window.GONE.client.from('profiles').select('role_key,full_name,status').eq('id', data.user.id).single();
        if(typeof state !== 'undefined'){
          state.user = { login:u, role:prof?.role_key || 'visitante', name:prof?.full_name || u };
          if(typeof save === 'function') save();
        }
        await loadSupabaseIntoOriginalVisual();
        if(typeof showApp === 'function') showApp();
        return;
      }
      return oldDoLogin();
    }
  }

  async function insertTechnologyToSupabase(t){
    const payload = {
      id:t.id, name:t.name, category:t.category, group_id:t.group_id, group_title:t.group,
      area:t.area, disciplines:t.disciplines, description:t.desc, difficulty:t.difficulty,
      price_text:t.price, repo_url:t.repo, docs_url:t.docs, video_url:t.video,
      is_main:false, visual_key:t.visual || '', raw:t
    };
    const { error } = await window.GONE.client.from('technologies').insert(payload);
    if(error) throw error;
  }
  async function deleteTechnologyFromSupabase(id){
    const { error } = await window.GONE.client.from('technologies').delete().eq('id', id);
    if(error) throw error;
  }

  window.newTechnology = function(){
    if(typeof APP_DATA === 'undefined') return alert('Base de tecnologias não carregada.');
    const groups = APP_DATA.portfolio.groups || [];
    const groupOptions = groups.map(g => `<option value="${htmlEsc(g.id)}">${htmlEsc(g.title)}</option>`).join('');
    const form = `
      <div class="grid grid-2">
        <div><label>Nome da tecnologia</label><input id="admTechName" placeholder="Ex.: OpenLoong Educacional"></div>
        <div><label>Categoria</label><input id="admTechCategory" placeholder="Robótica humanoide"></div>
        <div><label>Grupo temático</label><select id="admTechGroup">${groupOptions}</select></div>
        <div><label>Dificuldade</label><select id="admTechDifficulty"><option>Básico</option><option selected>Médio</option><option>Avançado</option><option>Especialista</option></select></div>
        <div><label>Valor estimado</label><input id="admTechPrice" placeholder="R$ 10.000–50.000"></div>
        <div><label>Link do repositório</label><input id="admTechRepo" placeholder="https://github.com/..."></div>
        <div><label>Documentação</label><input id="admTechDocs" placeholder="https://..."></div>
        <div><label>Vídeo</label><input id="admTechVideo" placeholder="https://youtube.com/..."></div>
      </div>
      <label>Descrição técnica</label><textarea id="admTechDesc" rows="5" placeholder="Descreva a tecnologia, aplicação educacional, requisitos e entregas."></textarea>
      <div class="actions" style="margin-top:14px">
        <button class="btn primary" onclick="submitNewTechnology()">Salvar tecnologia</button>
        <button class="btn" onclick="closeModal&&closeModal()">Cancelar</button>
      </div>
      <p class="muted">Quando o Supabase estiver configurado, esta ação grava no banco. Sem Supabase, grava apenas na sessão demonstrativa.</p>`;
    if(typeof modal === 'function') modal('Nova tecnologia', form); else alert('Modal não disponível.');
  };

  window.submitNewTechnology = async function(){
    const name = byId('admTechName')?.value?.trim();
    if(!name){ alert('Informe o nome da tecnologia.'); return; }
    const groupId = byId('admTechGroup')?.value || 'g01';
    const group = (APP_DATA.portfolio.groups || []).find(g => g.id === groupId) || {};
    const id = 'TEC-NEW-' + Date.now();
    const t = {
      id, name,
      category: byId('admTechCategory')?.value || 'Nova tecnologia',
      group_id: groupId,
      group: group.title || groupId,
      area: group.area || '',
      disciplines: group.disciplines || '',
      difficulty: byId('admTechDifficulty')?.value || 'Médio',
      software: '', license:'', risk:'Cadastro administrativo',
      price: byId('admTechPrice')?.value || 'Sob consulta',
      repo: byId('admTechRepo')?.value || '',
      docs: byId('admTechDocs')?.value || '',
      video: byId('admTechVideo')?.value || '',
      desc: byId('admTechDesc')?.value || '',
      source:'Admin G.One', main:false, campi:[], visual:'', embed:'',
      search: [id,name,group.title,byId('admTechDesc')?.value].filter(Boolean).join(' ').toLowerCase()
    };
    try{
      if(canUseSupabase()) await insertTechnologyToSupabase(t);
      APP_DATA.portfolio.items.unshift(t);
      if(typeof state !== 'undefined') state.repo.page = 1;
      if(typeof save === 'function') save();
      if(typeof closeModal === 'function') closeModal();
      if(typeof showView === 'function') showView('repositorio');
      alert(canUseSupabase() ? 'Tecnologia salva no Supabase.' : 'Tecnologia adicionada no modo demonstrativo.');
    }catch(e){ alert('Erro ao salvar tecnologia: '+(e.message || e)); }
  };

  window.adminDeleteTechnology = async function(id){
    if(!confirm('Excluir a tecnologia '+id+'?')) return;
    try{
      if(canUseSupabase()) await deleteTechnologyFromSupabase(id);
      const arr = APP_DATA.portfolio.items || [];
      const idx = arr.findIndex(t => t.id === id);
      if(idx >= 0) arr.splice(idx, 1);
      if(typeof renderAdmin === 'function') renderAdmin();
      alert(canUseSupabase() ? 'Tecnologia excluída do Supabase.' : 'Tecnologia excluída no modo demonstrativo.');
    }catch(e){ alert('Erro ao excluir tecnologia: '+(e.message || e)); }
  };

  window.newUser = function(){
    const form = `
      <div class="grid grid-2">
        <div><label>E-mail/login</label><input id="admUserEmail" placeholder="usuario@instituicao.br"></div>
        <div><label>Senha provisória</label><input id="admUserPass" type="password" placeholder="Senha inicial"></div>
        <div><label>Nome</label><input id="admUserName" placeholder="Nome completo"></div>
        <div><label>Perfil</label><select id="admUserRole"><option value="admin">Administrador</option><option value="master">Master</option><option value="professor">Professor</option><option value="pesquisador">Pesquisador</option><option value="aluno">Aluno</option><option value="parceiro">Parceiro</option><option value="visitante">Visitante</option></select></div>
      </div>
      <div class="actions" style="margin-top:14px">
        <button class="btn primary" onclick="submitNewUser()">Criar usuário</button>
        <button class="btn" onclick="closeModal&&closeModal()">Cancelar</button>
      </div>
      <p class="muted">Com Supabase configurado, usa a Edge Function admin-create-user. Sem Supabase, registra usuário somente para demonstração local.</p>`;
    if(typeof modal === 'function') modal('Criar usuário', form); else alert('Modal não disponível.');
  };

  window.submitNewUser = async function(){
    const email = byId('admUserEmail')?.value?.trim();
    const password = byId('admUserPass')?.value;
    const full_name = byId('admUserName')?.value?.trim();
    const role_key = byId('admUserRole')?.value || 'visitante';
    if(!email || !password){ alert('Informe e-mail/login e senha provisória.'); return; }
    try{
      if(canUseSupabase()){
        await invokeFunction('admin-create-user', { email, password, full_name, role_key });
      }else{
        if(typeof state !== 'undefined'){
          state.adminUsers = state.adminUsers || [];
          state.adminUsers.unshift({ email, full_name, role_key, status:'active', created_at:new Date().toISOString() });
          if(typeof save === 'function') save();
        }
      }
      if(typeof closeModal === 'function') closeModal();
      if(typeof renderAdmin === 'function') renderAdmin();
      alert(canUseSupabase() ? 'Usuário criado no Supabase.' : 'Usuário criado no modo demonstrativo.');
    }catch(e){ alert('Erro ao criar usuário: '+(e.message || e)); }
  };

  window.adminDeleteUser = async function(email){
    if(!confirm('Excluir/desativar usuário '+email+'?')) return;
    try{
      if(canUseSupabase()){
        await invokeFunction('admin-delete-user', { email });
      }else if(typeof state !== 'undefined'){
        state.adminUsers = (state.adminUsers || []).filter(u => u.email !== email);
        if(typeof save === 'function') save();
      }
      if(typeof renderAdmin === 'function') renderAdmin();
      alert(canUseSupabase() ? 'Solicitação de exclusão enviada.' : 'Usuário removido do modo demonstrativo.');
    }catch(e){ alert('Erro ao excluir usuário: '+(e.message || e)); }
  };

  function adminExtraHTML(){
    const techs = (typeof APP_DATA !== 'undefined' ? APP_DATA.portfolio.items || [] : []).slice(0, 12);
    const users = (typeof state !== 'undefined' ? (state.adminUsers || []) : []);
    return `
      <div class="card">
        <h2>Gestão de tecnologias</h2>
        <p class="muted">Administrador pode incluir novas tecnologias, editar a base e excluir cadastros incorretos.</p>
        <div class="actions"><button class="btn primary" onclick="newTechnology()">+ Nova tecnologia</button><button class="btn" onclick="showView('repositorio')">Ver repositório</button></div>
        <table class="table" style="margin-top:12px"><tr><th>ID</th><th>Tecnologia</th><th>Grupo</th><th>Ação</th></tr>${techs.map(t => `<tr><td>${htmlEsc(t.id)}</td><td>${htmlEsc(t.name)}</td><td>${htmlEsc(t.group || t.group_id || '')}</td><td><button class="btn red" onclick="adminDeleteTechnology('${htmlEsc(t.id)}')">Excluir</button></td></tr>`).join('')}</table>
      </div>
      <div class="card">
        <h2>Gestão de usuários</h2>
        <p class="muted">Administrador pode incluir, atualizar ou excluir usuários. Em produção, a exclusão usa Edge Function segura com service role.</p>
        <div class="actions"><button class="btn primary" onclick="newUser()">+ Novo usuário</button></div>
        ${users.length ? `<table class="table" style="margin-top:12px"><tr><th>Usuário</th><th>Nome</th><th>Perfil</th><th>Ação</th></tr>${users.map(u => `<tr><td>${htmlEsc(u.email)}</td><td>${htmlEsc(u.full_name||'')}</td><td>${htmlEsc(u.role_key)}</td><td><button class="btn red" onclick="adminDeleteUser('${htmlEsc(u.email)}')">Excluir</button></td></tr>`).join('')}</table>` : '<p class="muted">Nenhum usuário criado nesta sessão demonstrativa.</p>'}
      </div>`;
  }

  const oldRenderAdmin = (typeof renderAdmin === 'function') ? renderAdmin : null;
  if(oldRenderAdmin){
    renderAdmin = function(){ oldRenderAdmin(); const el = byId('view-admin'); if(el && !el.querySelector('[data-gone-admin-extra="1"]')){ const wrap = document.createElement('div'); wrap.setAttribute('data-gone-admin-extra','1'); wrap.innerHTML = adminExtraHTML(); el.appendChild(wrap); } };
  }

  window.addEventListener('load', function(){
    // Se Supabase estiver configurado, tenta substituir os dados locais pela base real sem alterar o visual.
    if(canUseSupabase()) loadSupabaseIntoOriginalVisual();
  });
})();

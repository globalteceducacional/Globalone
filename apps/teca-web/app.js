const API = '/api';
let token = localStorage.getItem('teca_token') || '';
let user = JSON.parse(localStorage.getItem('teca_user') || 'null');
let chatId = localStorage.getItem('teca_chat_id') || '';
let mode = 'voz';
const $ = id => document.getElementById(id);
function guessRoot(prefix){ const h=location.hostname.replace(/^teca\./,'').replace(/^one\./,''); return location.protocol+'//'+prefix+'.'+h; }
$('linkGone').href = guessRoot('one'); $('linkAva').href = guessRoot('ava'); $('linkErp').href = guessRoot('erp');
async function api(path, opts={}){ const res=await fetch(API+path,{...opts,headers:{'Content-Type':'application/json',...(opts.headers||{}),...(token?{Authorization:'Bearer '+token}:{})}}); const data=await res.json().catch(()=>({})); if(!res.ok) throw new Error(data.error||'Erro '+res.status); return data; }
function showLogin(){ $('loginView').classList.remove('hidden'); $('chatView').classList.add('hidden'); }
function showChat(){ $('loginView').classList.add('hidden'); $('chatView').classList.remove('hidden'); $('userInfo').textContent=(user?.name||'Usuário')+' • '+(user?.role||''); }
function msg(text, who='bot', meta=''){ const el=document.createElement('div'); el.className='msg '+(who==='user'?'user':'bot'); el.textContent=text; if(meta){ const s=document.createElement('small'); s.textContent=meta; el.appendChild(s); } $('messages').appendChild(el); $('messages').scrollTop=$('messages').scrollHeight; }
async function ensureChat(){ if(chatId) return chatId; const c=await api('/chats',{method:'POST',body:JSON.stringify({title:'Chat Teca IA',participants:[user.userId||user.id]})}); chatId=c.id; localStorage.setItem('teca_chat_id',chatId); return chatId; }
async function login(){ const data=await api('/auth/login',{method:'POST',body:JSON.stringify({email:$('email').value,password:$('password').value})}); token=data.token; user=data; localStorage.setItem('teca_token',token); localStorage.setItem('teca_user',JSON.stringify(user)); showChat(); msg('Olá, eu sou a TECA. Como posso ajudar?','bot'); }
async function register(){ const data=await api('/auth/register',{method:'POST',body:JSON.stringify({name:'Aluno Demo',email:$('email').value,password:$('password').value,role:'STUDENT'})}); token=data.token; user=data; localStorage.setItem('teca_token',token); localStorage.setItem('teca_user',JSON.stringify(user)); showChat(); msg('Usuário criado. Vamos começar.','bot'); }
async function send(prompt){ const text=(prompt||$('messageInput').value).trim(); if(!text) return; $('messageInput').value=''; msg(text,'user'); const loading=document.createElement('div'); loading.className='msg bot'; loading.textContent='Pensando...'; $('messages').appendChild(loading); $('messages').scrollTop=$('messages').scrollHeight; try{ const cid=await ensureChat(); const data=await api('/ai/chat',{method:'POST',body:JSON.stringify({message:text,mode,voice:'Teca_v2',chatId:cid})}); loading.remove(); msg(data.text,'bot','fonte: '+data.source+(data.hasAudio?' • áudio disponível no servidor TCP':'') ); }catch(e){ loading.remove(); msg('Erro: '+e.message,'bot'); } }
async function health(){ try{ const r=await fetch(API+'/health'); const d=await r.json(); $('statusBox').textContent='API online • TCP '+(d.tcp?'ativo':'off')+' • Gemini '+(d.gemini?'ativo':'off'); }catch(e){ $('statusBox').textContent='API indisponível'; } }
document.querySelectorAll('.modes button').forEach(b=>b.onclick=()=>{document.querySelectorAll('.modes button').forEach(x=>x.classList.remove('active'));b.classList.add('active');mode=b.dataset.mode;});
document.querySelectorAll('.hints button').forEach(b=>b.onclick=()=>send(b.dataset.prompt));
$('loginBtn').onclick=()=>login().catch(e=>alert(e.message)); $('registerBtn').onclick=()=>register().catch(e=>alert(e.message)); $('sendBtn').onclick=()=>send(); $('messageInput').onkeydown=e=>{if(e.key==='Enter')send();}; $('logoutBtn').onclick=()=>{localStorage.clear();token='';user=null;chatId='';showLogin();};
health(); if(token&&user) showChat(); else showLogin();

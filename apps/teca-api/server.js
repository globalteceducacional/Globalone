import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import net from 'node:net';
import { Pool } from 'pg';
import { randomUUID } from 'crypto';

const PORT = Number(process.env.PORT || 3002);
const JWT_SECRET = process.env.TECA_JWT_SECRET || process.env.JWT_SECRET || 'troque_este_segredo_teca';
const JWT_EXPIRES_IN = process.env.TECA_JWT_EXPIRES_IN || '7d';
const DATABASE_URL = process.env.DATABASE_URL;
const CORS_ORIGINS = (process.env.CORS_ORIGINS || '*').split(',').map(s => s.trim()).filter(Boolean);
const TECA_IA_HOST = process.env.TECA_IA_HOST || '';
const TECA_IA_PORT = Number(process.env.TECA_IA_PORT || 6000);
const TECA_TCP_ENABLED = String(process.env.TECA_TCP_ENABLED || 'false').toLowerCase() === 'true';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';

if (!DATABASE_URL) {
  console.error('DATABASE_URL não definida.');
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL });
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const app = express();
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));
app.use(cors({ origin: CORS_ORIGINS.includes('*') ? true : CORS_ORIGINS, credentials: true }));

function normalizeRole(role) {
  const r = String(role || 'STUDENT').toUpperCase();
  if (['ADMIN', 'TEACHER', 'PROFESSOR', 'PROFESSOR_PESQUISADOR'].includes(r)) return r === 'PROFESSOR' ? 'TEACHER' : r;
  return 'STUDENT';
}

function publicUser(row) {
  if (!row) return null;
  const role = normalizeRole(row.role);
  const profile = { id: row.id, name: row.name, schoolId: row.school_id || null };
  return {
    id: row.id,
    userId: row.id,
    name: row.name,
    email: row.email,
    role,
    schoolId: row.school_id || null,
    student: role === 'STUDENT' ? profile : undefined,
    teacher: role === 'TEACHER' ? profile : undefined,
    admin: role === 'ADMIN' ? profile : undefined
  };
}

function signUser(row) {
  return jwt.sign({ sub: row.id, email: row.email, role: row.role }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

async function authRequired(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return res.status(401).json({ error: 'Token ausente' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const { rows } = await pool.query('select * from teca_users where id=$1', [payload.sub]);
    if (!rows[0]) return res.status(401).json({ error: 'Usuário não encontrado' });
    req.user = rows[0];
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Token inválido ou expirado' });
  }
}

async function initDb() {
  await pool.query(`
    create table if not exists teca_users (
      id uuid primary key default gen_random_uuid(),
      name text not null,
      email text unique not null,
      password_hash text not null,
      role text not null default 'STUDENT',
      school_id text,
      created_at timestamptz not null default now()
    );
    create table if not exists teca_chats (
      id uuid primary key default gen_random_uuid(),
      title text not null,
      school_id text,
      created_by uuid references teca_users(id) on delete set null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create table if not exists teca_chat_participants (
      chat_id uuid references teca_chats(id) on delete cascade,
      user_id uuid references teca_users(id) on delete cascade,
      primary key(chat_id, user_id)
    );
    create table if not exists teca_messages (
      id uuid primary key default gen_random_uuid(),
      chat_id uuid references teca_chats(id) on delete cascade,
      user_id uuid references teca_users(id) on delete set null,
      content text not null,
      is_ai boolean not null default false,
      personagem text,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now()
    );
    create table if not exists teca_files (
      id uuid primary key default gen_random_uuid(),
      chat_id uuid references teca_chats(id) on delete set null,
      user_id uuid references teca_users(id) on delete set null,
      filename text not null,
      mime_type text,
      size_bytes integer,
      content_text text,
      created_at timestamptz not null default now()
    );
  `);

  const adminEmail = process.env.TECA_ADMIN_EMAIL || 'admin@teca.local';
  const adminPass = process.env.TECA_ADMIN_PASSWORD || 'admin123456';
  const adminName = process.env.TECA_ADMIN_NAME || 'Administrador TECA';
  const { rows } = await pool.query('select id from teca_users where email=$1', [adminEmail.toLowerCase()]);
  if (!rows[0]) {
    const hash = await bcrypt.hash(adminPass, 10);
    await pool.query('insert into teca_users(name,email,password_hash,role) values($1,$2,$3,$4)', [adminName, adminEmail.toLowerCase(), hash, 'ADMIN']);
    console.log(`Usuário admin TECA criado: ${adminEmail}`);
  }
}

function sendPacket(socket, text) {
  const buf = Buffer.from(text, 'utf8');
  const header = Buffer.from(String(buf.length).padStart(10, '0'), 'ascii');
  socket.write(Buffer.concat([header, buf]));
}

async function callTcpIA({ funcao, message, voice }) {
  if (!TECA_TCP_ENABLED || !TECA_IA_HOST) throw new Error('Servidor TCP TECA desativado');
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: TECA_IA_HOST, port: TECA_IA_PORT }, () => {
      const payload = { ID: 'cliente', funcao, parametro: message, stream: true };
      if (voice) payload.voice = voice;
      socket.write(JSON.stringify(payload));
    });
    let buf = Buffer.alloc(0);
    let chunks = [];
    let finalText = '';
    let hasAudio = false;
    const started = Date.now();
    const timeout = setTimeout(() => {
      socket.destroy();
      reject(new Error('Tempo esgotado ao chamar IA TCP'));
    }, Number(process.env.TECA_TCP_TIMEOUT_MS || 120000));

    function readPacket() {
      while (buf.length >= 10) {
        const header = buf.subarray(0, 10).toString('ascii');
        const size = Number.parseInt(header, 10);
        if (!Number.isFinite(size)) {
          const loose = buf.subarray(0, Math.min(buf.length, 256)).toString('utf8');
          chunks.push(loose);
          buf = Buffer.alloc(0);
          return;
        }
        if (buf.length < 10 + size) return;
        const payload = buf.subarray(10, 10 + size);
        buf = buf.subarray(10 + size);
        if (size === 0) continue;
        const maybeText = payload.toString('utf8');
        if (maybeText === '<<STREAM_START>>') continue;
        if (maybeText === '<<STREAM_END>>') {
          clearTimeout(timeout);
          socket.end();
          resolve({ text: finalText || chunks.join(''), source: 'teca-tcp', hasAudio, durationMs: Date.now() - started });
          return;
        }
        if (maybeText === '<<AUDIO>>') {
          hasAudio = true;
          continue;
        }
        if (maybeText.startsWith('<<FINAL>>')) {
          finalText = maybeText.replace(/^<<FINAL>>\s*/s, '');
          continue;
        }
        if (maybeText && !maybeText.includes('\u0000')) chunks.push(maybeText);
      }
    }
    socket.on('data', data => { buf = Buffer.concat([buf, data]); readPacket(); });
    socket.on('error', err => { clearTimeout(timeout); reject(err); });
    socket.on('close', () => {
      clearTimeout(timeout);
      if (finalText || chunks.length) resolve({ text: finalText || chunks.join(''), source: 'teca-tcp', hasAudio, durationMs: Date.now() - started });
    });
  });
}

async function callGemini({ message, mode }) {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY não configurada');
  const system = mode === 'matematica'
    ? 'Responda em português, com rigor matemático e LaTeX quando útil.'
    : mode === 'explicativo'
      ? 'Responda em português com explicação didática, tópicos e exemplos.'
      : 'Responda em português como a TECA, assistente educacional da Globaltec.';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: `${system}\n\nPergunta: ${message}` }] }] })
  });
  if (!resp.ok) throw new Error(`Gemini retornou ${resp.status}`);
  const data = await resp.json();
  const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('\n') || '';
  return { text: text || 'Não consegui gerar resposta.', source: 'gemini', hasAudio: false };
}

function fallbackAnswer({ message, mode }) {
  const m = String(message || '').toLowerCase();
  if (m.includes('erp')) return { text: 'No ERP do G.One, você pode transformar tecnologias em projetos, cadastrar metas, etapas, BOM, custos, cronograma e evidências.', source: 'fallback', hasAudio: false };
  if (m.includes('ava') || m.includes('curso')) return { text: 'No AVA, você pode organizar cursos, módulos, aulas, materiais, atividades, progresso e certificados vinculados às tecnologias.', source: 'fallback', hasAudio: false };
  if (m.includes('tecnologia') || m.includes('reposit')) return { text: 'O repositório G.One organiza tecnologias por áreas, documentação, imagens, cursos, projetos e possibilidades de transferência tecnológica.', source: 'fallback', hasAudio: false };
  if (mode === 'matematica') return { text: 'Envie a questão matemática completa. Posso estruturar a resolução passo a passo e usar notação LaTeX.', source: 'fallback', hasAudio: false };
  return { text: 'Olá, eu sou a TECA. Posso ajudar com tecnologias, projetos no ERP, cursos no AVA, evidências, tutoria e dúvidas pedagógicas.', source: 'fallback', hasAudio: false };
}

async function answerIA({ message, mode = 'voz', voice = 'Teca_v2' }) {
  const funcao = mode === 'matematica' ? 'responda_matematica' : mode === 'explicativo' ? 'responda_explicativo' : 'responda';
  try { return await callTcpIA({ funcao, message, voice }); } catch (tcpErr) {
    console.warn('IA TCP indisponível:', tcpErr.message);
    try { return await callGemini({ message, mode }); } catch (gemErr) {
      console.warn('Gemini indisponível:', gemErr.message);
      return fallbackAnswer({ message, mode });
    }
  }
}

app.get('/health', async (req, res) => res.json({ ok: true, service: 'teca-api', tcp: TECA_TCP_ENABLED, host: TECA_IA_HOST || null, gemini: Boolean(GEMINI_API_KEY) }));

app.post('/auth/register', async (req, res) => {
  try {
    const { name, email, password, role, schoolId } = req.body || {};
    if (!name || !email || !password) return res.status(400).json({ error: 'Nome, e-mail e senha são obrigatórios' });
    const hash = await bcrypt.hash(password, 10);
    const normalizedRole = normalizeRole(role);
    const { rows } = await pool.query(
      'insert into teca_users(name,email,password_hash,role,school_id) values($1,$2,$3,$4,$5) returning *',
      [name, String(email).toLowerCase(), hash, normalizedRole, schoolId || null]
    );
    const user = publicUser(rows[0]);
    res.status(201).json({ ...user, token: signUser(rows[0]) });
  } catch (e) {
    if (String(e.message).includes('duplicate')) return res.status(409).json({ error: 'E-mail já cadastrado' });
    res.status(500).json({ error: e.message });
  }
});

app.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const { rows } = await pool.query('select * from teca_users where email=$1', [String(email || '').toLowerCase()]);
    const user = rows[0];
    if (!user || !(await bcrypt.compare(password || '', user.password_hash))) return res.status(401).json({ error: 'Credenciais inválidas' });
    res.json({ ...publicUser(user), token: signUser(user) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/auth/verify', authRequired, (req, res) => res.json({ valid: true, user: publicUser(req.user) }));
app.get('/auth/me', authRequired, (req, res) => res.json(publicUser(req.user)));

app.get('/chats/user/:userId', authRequired, async (req, res) => {
  const { rows } = await pool.query(`
    select c.* from teca_chats c
    join teca_chat_participants p on p.chat_id=c.id
    where p.user_id=$1 order by c.updated_at desc`, [req.params.userId]);
  res.json(rows);
});

app.post('/chats', authRequired, async (req, res) => {
  const { title, participants = [], schoolId } = req.body || {};
  const creator = req.user.id;
  const { rows } = await pool.query('insert into teca_chats(title,school_id,created_by) values($1,$2,$3) returning *', [title || 'Novo chat', schoolId || req.user.school_id || null, creator]);
  const chat = rows[0];
  const ids = new Set([creator, ...participants.filter(Boolean)]);
  for (const id of ids) await pool.query('insert into teca_chat_participants(chat_id,user_id) values($1,$2) on conflict do nothing', [chat.id, id]);
  res.status(201).json(chat);
});

app.get('/chats/:chatId', authRequired, async (req, res) => {
  const { rows } = await pool.query('select * from teca_chats where id=$1', [req.params.chatId]);
  if (!rows[0]) return res.status(404).json({ error: 'Chat não encontrado' });
  res.json(rows[0]);
});

app.put('/chats/:chatId', authRequired, async (req, res) => {
  const { title } = req.body || {};
  const { rows } = await pool.query('update teca_chats set title=coalesce($1,title), updated_at=now() where id=$2 returning *', [title, req.params.chatId]);
  res.json(rows[0] || {});
});

app.delete('/chats/:chatId', authRequired, async (req, res) => {
  await pool.query('delete from teca_chats where id=$1', [req.params.chatId]);
  res.json({ ok: true });
});

app.get('/chats/:chatId/messages', authRequired, async (req, res) => {
  const { rows } = await pool.query('select * from teca_messages where chat_id=$1 order by created_at asc', [req.params.chatId]);
  res.json(rows.map(r => ({ id: r.id, chatId: r.chat_id, userId: r.user_id, content: r.content, isAI: r.is_ai, personagem: r.personagem, createdAt: r.created_at, metadata: r.metadata })));
});

app.post('/chats/:chatId/messages', authRequired, upload.single('file'), async (req, res) => {
  const isAI = req.body.isAI === true || req.body.isAI === 'true';
  const userId = isAI ? null : (req.body.userId || req.user.id);
  const content = req.body.content || '';
  const personagem = req.body.personagem || null;
  const metadata = {};
  if (req.file) {
    metadata.file = { filename: req.file.originalname, size: req.file.size, mimeType: req.file.mimetype };
  }
  const { rows } = await pool.query(
    'insert into teca_messages(chat_id,user_id,content,is_ai,personagem,metadata) values($1,$2,$3,$4,$5,$6) returning *',
    [req.params.chatId, userId, content, isAI, personagem, metadata]
  );
  await pool.query('update teca_chats set updated_at=now() where id=$1', [req.params.chatId]);
  res.status(201).json(rows[0]);
});

app.post('/ai/chat', authRequired, async (req, res) => {
  const { message, mode = 'voz', voice = 'Teca_v2', chatId } = req.body || {};
  if (!message) return res.status(400).json({ error: 'Mensagem obrigatória' });
  if (chatId) {
    await pool.query('insert into teca_messages(chat_id,user_id,content,is_ai) values($1,$2,$3,false)', [chatId, req.user.id, message]);
  }
  const answer = await answerIA({ message, mode, voice });
  if (chatId) {
    await pool.query('insert into teca_messages(chat_id,user_id,content,is_ai,personagem,metadata) values($1,null,$2,true,$3,$4)', [chatId, answer.text, voice || 'Teca_v2', { source: answer.source, hasAudio: answer.hasAudio }]);
    await pool.query('update teca_chats set updated_at=now() where id=$1', [chatId]);
  }
  res.json({ ok: true, text: answer.text, source: answer.source, hasAudio: answer.hasAudio, mode, voice });
});

app.post('/upload', authRequired, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Arquivo obrigatório' });
  const text = req.file.mimetype?.includes('text') ? req.file.buffer.toString('utf8') : `[Arquivo ${req.file.originalname}, ${req.file.size} bytes]`;
  const prompt = `${req.body.message || 'Analise o arquivo enviado.'}\n\nConteúdo/descrição do arquivo:\n${text.slice(0, 20000)}`;
  const answer = await answerIA({ message: prompt, mode: req.body.mode || 'explicativo' });
  const { rows } = await pool.query('insert into teca_files(chat_id,user_id,filename,mime_type,size_bytes,content_text) values($1,$2,$3,$4,$5,$6) returning *', [req.body.chatId || null, req.user.id, req.file.originalname, req.file.mimetype, req.file.size, text.slice(0, 20000)]);
  res.json({ ok: true, file: rows[0], text: answer.text, source: answer.source });
});

await initDb();
app.listen(PORT, () => console.log(`TECA API online na porta ${PORT}`));

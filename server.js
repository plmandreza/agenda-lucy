// =====================================================================
//  LUCY CABELEIREIRA — server.js
//  O "funcionário dos bastidores": recebe os pedidos das páginas,
//  confere quem está pedindo e só então conversa com o banco (Supabase).
//
//  Etapa 2: servidor no ar + segurança básica + login da Lucy.
//  As próximas etapas vão acrescentando rotas na seção 6.
// =====================================================================
import express from 'express';
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'node:url';


// ---------------------------------------------------------------------
// 1. CONFIGURAÇÃO
//    Os valores secretos NÃO ficam escritos aqui: eles moram nas
//    "variáveis de ambiente" da Vercel (um cofre que só o servidor lê).
// ---------------------------------------------------------------------
const SUPABASE_URL        = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
const ADMIN_EMAIL         = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
// Outros sites que podem chamar este servidor (ex.: a versão React),
// separados por vírgula. O próprio site já é sempre permitido.
const ORIGENS_EXTRAS = (process.env.ALLOWED_ORIGINS || '')
  .split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean);

const FALTANDO = ['SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'ADMIN_EMAIL']
  .filter((nome) => !process.env[nome]);
if (FALTANDO.length) {
  console.error('[config] Faltam variáveis de ambiente:', FALTANDO.join(', '));
}

// "Sem sessão": o servidor não guarda login de ninguém na memória.
const SEM_SESSAO = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };

// Cliente com a chave secreta: é o único que passa pela "tranca" das tabelas.
const banco = FALTANDO.length ? null : createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, SEM_SESSAO);

// Para fazer login usamos um cliente NOVO a cada vez. Assim a sessão
// da Lucy nunca "gruda" no cliente que tem a chave secreta.
const novoClienteDeLogin = () => createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, SEM_SESSAO);


// ---------------------------------------------------------------------
// 2. O APLICATIVO EXPRESS
// ---------------------------------------------------------------------
const app = express();
app.disable('x-powered-by');   // não anuncia qual tecnologia usamos
app.set('trust proxy', true);  // a Vercel fica na frente e informa o IP real


// ---------------------------------------------------------------------
// 3. SEGURANÇA EM TODA REQUISIÇÃO
// ---------------------------------------------------------------------

// 3a. Só HTTPS (conexão criptografada). A Vercel já faz isso; aqui é
//     uma segunda garantia. No computador local (localhost) não se aplica.
app.use((req, res, next) => {
  const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.host || '');
  if (!local && req.headers['x-forwarded-proto'] === 'http') {
    return res.redirect(308, `https://${req.headers.host}${req.originalUrl}`);
  }
  next();
});

// 3b. Cabeçalhos de proteção (instruções que o navegador obedece).
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-Frame-Options': 'DENY',
    'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
  });
  if (req.path.startsWith('/api')) res.set('Cache-Control', 'no-store');
  next();
});

// 3c. CORS: a lista de "sites que podem conversar com este servidor".
function origemPermitida(origem, req) {
  const propria = `${req.protocol}://${req.headers.host}`;
  return origem === propria || ORIGENS_EXTRAS.includes(origem);
}
app.use((req, res, next) => {
  const origem = req.headers.origin;
  if (!origem) return next();  // pedido sem origem (ex.: abrir o link direto)
  if (!origemPermitida(origem, req)) {
    return res.status(403).json({ erro: 'Origem não permitida.' });
  }
  res.set({
    'Access-Control-Allow-Origin': origem,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  });
  if (req.method === 'OPTIONS') return res.sendStatus(204);  // "posso?" → "pode"
  next();
});

// 3d. Lê os dados enviados em formato JSON (com limite de tamanho).
app.use(express.json({ limit: '100kb' }));

// 3e. Só no computador local: entrega as páginas da pasta "public".
//     (Na Vercel quem entrega essas páginas é a própria Vercel.)
app.use(express.static(fileURLToPath(new URL('./public', import.meta.url))));


// ---------------------------------------------------------------------
// 4. PORTEIROS (verificações reutilizáveis)
// ---------------------------------------------------------------------

// Servidor configurado? Se faltar alguma variável, avisa em vez de quebrar.
function exigirConfiguracao(req, res, next) {
  if (!banco) {
    return res.status(503).json({ erro: 'Servidor sem configuração: faltam variáveis de ambiente na Vercel.' });
  }
  next();
}

// Limite de tentativas de login: até 10 a cada 15 minutos por aparelho.
// Dificulta que alguém fique "chutando" a senha da Lucy.
const TENTATIVAS = new Map();
const JANELA_MS = 15 * 60 * 1000;
const MAX_TENTATIVAS = 10;
function limitarTentativas(req, res, next) {
  const agora = Date.now();
  if (TENTATIVAS.size > 5000) TENTATIVAS.clear();  // evita encher a memória
  const t = TENTATIVAS.get(req.ip);
  if (!t || agora - t.desde > JANELA_MS) {
    TENTATIVAS.set(req.ip, { n: 1, desde: agora });
    return next();
  }
  if (t.n >= MAX_TENTATIVAS) {
    res.set('Retry-After', String(Math.ceil((t.desde + JANELA_MS - agora) / 1000)));
    return res.status(429).json({ erro: 'Muitas tentativas. Espere 15 minutos e tente de novo.' });
  }
  t.n += 1;
  next();
}

// Só a Lucy passa: confere o "crachá" (token) enviado pela página.
async function exigirLucy(req, res, next) {
  const [tipo, token] = (req.headers.authorization || '').split(' ');
  if (tipo !== 'Bearer' || !token) {
    return res.status(401).json({ erro: 'Faça login para continuar.' });
  }
  const { data, error } = await banco.auth.getUser(token);
  const email = data?.user?.email?.toLowerCase();
  if (error || email !== ADMIN_EMAIL) {
    return res.status(401).json({ erro: 'Sua sessão expirou. Entre de novo.' });
  }
  req.lucy = data.user;
  req.token = token;
  next();
}

// O que devolvemos para a página depois de um login.
const sessaoParaPagina = (s) => ({
  access_token: s.access_token,
  refresh_token: s.refresh_token,
  expires_at: s.expires_at,
  email: s.user?.email,
});


// ---------------------------------------------------------------------
// 5. ROTAS DA ETAPA 2
// ---------------------------------------------------------------------

// "Está tudo funcionando?" — confere servidor e banco.
app.get('/api/saude', async (req, res) => {
  if (!banco) {
    return res.status(503).json({ ok: false, servidor: true, banco: false,
      erro: 'Faltam variáveis de ambiente na Vercel.' });
  }
  const { data, error } = await banco.from('configuracoes').select('nome_salao').eq('id', 1).maybeSingle();
  if (error || !data) {
    console.error('[saude]', error?.message || 'configuracoes vazia');
    return res.status(503).json({ ok: false, servidor: true, banco: false,
      erro: 'O servidor não conseguiu ler o banco. O banco.sql foi rodado no Supabase?' });
  }
  res.json({ ok: true, servidor: true, banco: true, salao: data.nome_salao });
});

// Login da Lucy (e-mail + senha).
app.post('/api/login', limitarTentativas, exigirConfiguracao, async (req, res) => {
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  const senha = String(req.body?.senha ?? '');
  if (!email || !senha) return res.status(400).json({ erro: 'Informe e-mail e senha.' });

  const negar = () => res.status(401).json({ erro: 'E-mail ou senha incorretos.' });
  if (email !== ADMIN_EMAIL) return negar();  // só a Lucy entra no painel

  const { data, error } = await novoClienteDeLogin().auth.signInWithPassword({ email, password: senha });
  if (error || !data?.session) return negar();

  TENTATIVAS.delete(req.ip);
  res.json(sessaoParaPagina(data.session));
});

// Renova o "crachá" (ele vence a cada 1 hora, por segurança).
app.post('/api/renovar', exigirConfiguracao, async (req, res) => {
  const refresh_token = String(req.body?.refresh_token ?? '');
  if (!refresh_token) return res.status(400).json({ erro: 'Sessão ausente.' });

  const { data, error } = await novoClienteDeLogin().auth.refreshSession({ refresh_token });
  const email = data?.session?.user?.email?.toLowerCase();
  if (error || !data?.session || email !== ADMIN_EMAIL) {
    return res.status(401).json({ erro: 'Sua sessão expirou. Entre de novo.' });
  }
  res.json(sessaoParaPagina(data.session));
});

// Sair: invalida o crachá no Supabase.
app.post('/api/sair', exigirConfiguracao, exigirLucy, async (req, res) => {
  const { error } = await banco.auth.admin.signOut(req.token, 'local');
  if (error) console.error('[sair]', error.message);
  res.json({ ok: true });
});

// Rota de teste protegida: só responde para a Lucy logada.
app.get('/api/lucy/eu', exigirConfiguracao, exigirLucy, (req, res) => {
  res.json({ email: req.lucy.email });
});


// ---------------------------------------------------------------------
// 6. (Próximas etapas: rotas de agendamento, clientes, agenda...)
// ---------------------------------------------------------------------


// ---------------------------------------------------------------------
// 7. ERROS
// ---------------------------------------------------------------------
app.use('/api', (req, res) => res.status(404).json({ erro: 'Rota não encontrada.' }));

app.use((err, req, res, _next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ erro: 'Dados em formato inválido.' });
  if (err.type === 'entity.too.large')   return res.status(413).json({ erro: 'Dados grandes demais.' });
  console.error('[erro]', err);
  res.status(500).json({ erro: 'Algo deu errado no servidor. Tente de novo.' });
});


// ---------------------------------------------------------------------
// 8. LIGAR O SERVIDOR
//    Na Vercel, ela mesma liga (usando o "export default").
//    No computador: `npm start` e abra http://localhost:3000
// ---------------------------------------------------------------------
if (!process.env.VERCEL) {
  const porta = Number(process.env.PORT) || 3000;
  app.listen(porta, () => console.log(`Lucy cabeleireira rodando em http://localhost:${porta}`));
}

export default app;

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

// Fábrica de "limites": no máximo N pedidos por aparelho dentro de uma janela.
// (Fica na memória do servidor; é uma proteção simples contra abuso.)
function criarLimite(max, janelaMin, mensagem) {
  const registro = new Map();
  const janelaMs = janelaMin * 60 * 1000;
  const limitar = (req, res, next) => {
    const agora = Date.now();
    if (registro.size > 5000) registro.clear();  // evita encher a memória
    const t = registro.get(req.ip);
    if (!t || agora - t.desde > janelaMs) {
      registro.set(req.ip, { n: 1, desde: agora });
      return next();
    }
    if (t.n >= max) {
      res.set('Retry-After', String(Math.ceil((t.desde + janelaMs - agora) / 1000)));
      return res.status(429).json({ erro: mensagem });
    }
    t.n += 1;
    next();
  };
  limitar.zerar = (ip) => registro.delete(ip);
  return limitar;
}

// Login: até 10 tentativas a cada 15 minutos (dificulta "chutar" a senha da Lucy).
const limitarTentativas = criarLimite(10, 15, 'Muitas tentativas. Espere 15 minutos e tente de novo.');
// Pedidos de horário: até 10 por hora por aparelho (evita pedidos falsos em massa).
const limitarPedidos = criarLimite(10, 60, 'Muitos pedidos seguidos. Tente de novo mais tarde ou fale com a Lucy pelo WhatsApp.');
// Remarcar/cancelar: até 30 por hora.
const limitarAlteracoes = criarLimite(30, 60, 'Muitas alterações seguidas. Tente de novo mais tarde.');

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

  limitarTentativas.zerar(req.ip);
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
// 6. PÁGINA DA CLIENTE (Etapa 3) — rotas públicas, sem senha
//
//    A cliente pode: VER os serviços e horários livres, CRIAR um pedido,
//    e, com o link pessoal (token), VER, REMARCAR (editar) e CANCELAR
//    o PRÓPRIO pedido. Ela nunca enxerga dados de outras clientes.
// ---------------------------------------------------------------------

// --- 6a. Ferramentas de data/hora -----------------------------------
// O salão fica no horário de Brasília (UTC-3, sem horário de verão desde 2019).
const FUSO = '-03:00';
const UM_MINUTO = 60 * 1000;
const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;
const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const hojeNoSalao = () => new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
const dataNoSalao = (instanteISO) => new Date(Date.parse(instanteISO) - 3 * 3600 * 1000).toISOString().slice(0, 10);
const somarDias = (data, n) => {
  const d = new Date(`${data}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const dataValida = (data) => RE_DATA.test(data) && somarDias(data, 0) === data;
const emMinutos = (hhmm) => { const [h, m] = String(hhmm).split(':').map(Number); return h * 60 + m; };
const emHora = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
const instante = (data, minutos) => new Date(`${data}T${emHora(minutos)}:00${FUSO}`);
const diaDaSemana = (data) => new Date(`${data}T12:00:00${FUSO}`).getUTCDay();

// Erro "para a cliente ler" (vira uma mensagem amigável, não um erro 500).
class ErroPublico extends Error {
  constructor(status, mensagem) { super(mensagem); this.status = status; this.publico = true; }
}
// Executa uma consulta ao banco e, se der erro, avisa o tratador de erros.
async function q(consulta) {
  const { data, error } = await consulta;
  if (error) throw error;
  return data;
}

// --- 6b. Regras da agenda --------------------------------------------
async function lerConfiguracoes() {
  return q(banco.from('configuracoes').select('*').eq('id', 1).single());
}

// Horário em que o salão abre num dia específico (ou null se fechado).
async function janelaDoDia(data) {
  const especial = await q(banco.from('dias_especiais').select('tipo, abre, fecha').eq('data', data).maybeSingle());
  if (especial) {
    if (especial.tipo === 'fechado') return null;
    return { abre: emMinutos(especial.abre), fecha: emMinutos(especial.fecha), pausa: null };
  }
  const h = await q(banco.from('horarios_funcionamento').select('*').eq('dia_semana', diaDaSemana(data)).maybeSingle());
  if (!h || !h.trabalha) return null;
  return {
    abre: emMinutos(h.abre),
    fecha: emMinutos(h.fecha),
    pausa: h.pausa_inicio ? [emMinutos(h.pausa_inicio), emMinutos(h.pausa_fim)] : null,
  };
}

// Lista os horários livres de um dia para uma certa duração.
// Considera ocupados os pedidos ainda não respondidos E os confirmados,
// para que duas clientes não peçam o mesmo horário.
async function horariosLivres(data, duracao, cfg, ignorarId = null) {
  const hoje = hojeNoSalao();
  if (data < hoje || data > somarDias(hoje, cfg.dias_a_frente)) return [];
  const janela = await janelaDoDia(data);
  if (!janela) return [];

  const inicioDoDia = instante(data, 0).toISOString();
  const fimDoDia = instante(somarDias(data, 1), 0).toISOString();
  const marcados = await q(banco.from('agendamentos').select('id, inicio, fim')
    .in('status', ['solicitado', 'agendado']).lt('inicio', fimDoDia).gt('fim', inicioDoDia));
  const ocupados = marcados.filter((a) => a.id !== ignorarId)
    .map((a) => [Date.parse(a.inicio), Date.parse(a.fim)]);

  const cedoDemais = Date.now() + cfg.antecedencia_min_horas * 3600 * 1000;
  const passo = cfg.intervalo_agenda_min > 0 ? cfg.intervalo_agenda_min : 30;
  const livres = [];
  for (let m = janela.abre; m + duracao <= janela.fecha; m += passo) {
    const ini = instante(data, m).getTime();
    const fim = ini + duracao * UM_MINUTO;
    if (ini < cedoDemais) continue;
    if (janela.pausa && m < janela.pausa[1] && m + duracao > janela.pausa[0]) continue;
    if (ocupados.some(([a, b]) => ini < b && fim > a)) continue;
    livres.push({ hora: emHora(m), inicio: new Date(ini).toISOString() });
  }
  return livres;
}

// Confere os serviços escolhidos e calcula duração e preço total.
async function servicosEscolhidos(ids) {
  if (!Array.isArray(ids)) throw new ErroPublico(400, 'Escolha pelo menos um serviço.');
  const unicos = [...new Set(ids.map(String))];
  if (unicos.length < 1) throw new ErroPublico(400, 'Escolha pelo menos um serviço.');
  if (unicos.length > 6 || !unicos.every((id) => RE_UUID.test(id))) {
    throw new ErroPublico(400, 'Serviços inválidos.');
  }
  const lista = await q(banco.from('servicos').select('id, nome, preco, duracao_min')
    .in('id', unicos).eq('ativo', true));
  if (lista.length !== unicos.length) {
    throw new ErroPublico(400, 'Algum serviço escolhido não está mais disponível. Atualize a página.');
  }
  return {
    lista,
    duracao: lista.reduce((s, x) => s + x.duracao_min, 0),
    total: lista.reduce((s, x) => s + Number(x.preco), 0),
  };
}

// --- 6c. Validação dos dados da cliente ------------------------------
function texto(valor, max) {
  const t = String(valor ?? '').trim();
  return t.length > max ? t.slice(0, max) : t;
}
// WhatsApp: guarda só os números, com 55 (Brasil) na frente.
function normalizarWhatsapp(valor) {
  let n = String(valor ?? '').replace(/\D/g, '');
  if (n.length === 10 || n.length === 11) n = '55' + n;
  return /^55\d{10,11}$/.test(n) ? n : null;
}
const emailValido = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

// --- 6d. Busca do pedido pelo link pessoal ---------------------------
const STATUS_TEXTO = {
  solicitado: 'Aguardando confirmação da Lucy',
  agendado: 'Confirmado',
  recusado: 'A Lucy não pôde atender neste horário',
  concluido: 'Atendimento realizado',
  cancelado: 'Cancelado',
  faltou: 'Não compareceu',
};

async function pedidoPorToken(token) {
  if (!RE_UUID.test(String(token))) return null;
  const p = await q(banco.from('agendamentos')
    .select('id, token, cliente_id, status, inicio, fim, valor_total, observacao_cliente, criado_em')
    .eq('token', token).maybeSingle());
  if (!p) return null;
  const cliente = await q(banco.from('clientes').select('nome').eq('id', p.cliente_id).single());
  const servicos = await q(banco.from('agendamento_servicos')
    .select('servico_id, nome, preco, duracao_min').eq('agendamento_id', p.id));
  return { ...p, cliente_nome: cliente.nome, servicos };
}

const podeAlterar = (p) => ['solicitado', 'agendado'].includes(p.status) && Date.parse(p.inicio) > Date.now();

// O que a cliente pode ver do próprio pedido (sem ids internos).
const pedidoParaCliente = (p) => ({
  token: p.token,
  status: p.status,
  status_texto: STATUS_TEXTO[p.status] || p.status,
  inicio: p.inicio,
  fim: p.fim,
  valor_total: Number(p.valor_total),
  observacao_cliente: p.observacao_cliente,
  primeiro_nome: String(p.cliente_nome || '').split(' ')[0],
  servicos: p.servicos.map((s) => ({ id: s.servico_id, nome: s.nome, preco: Number(s.preco), duracao_min: s.duracao_min })),
  pode_alterar: podeAlterar(p),
});

// Confere se o horário pedido ainda está livre; devolve o início "oficial".
async function conferirHorario(inicioPedido, duracao, cfg, ignorarId = null) {
  const ms = Date.parse(String(inicioPedido ?? ''));
  if (Number.isNaN(ms)) throw new ErroPublico(400, 'Escolha um horário.');
  const inicio = new Date(ms).toISOString();
  const livres = await horariosLivres(dataNoSalao(inicio), duracao, cfg, ignorarId);
  if (!livres.some((h) => h.inicio === inicio)) {
    throw new ErroPublico(409, 'Esse horário não está mais disponível. Escolha outro, por favor.');
  }
  return { inicio, fim: new Date(ms + duracao * UM_MINUTO).toISOString() };
}

async function gravarServicosDoPedido(agendamentoId, lista) {
  await q(banco.from('agendamento_servicos').insert(lista.map((s) => ({
    agendamento_id: agendamentoId, servico_id: s.id, nome: s.nome, preco: s.preco, duracao_min: s.duracao_min,
  }))));
}

// --- 6e. As rotas ----------------------------------------------------

// VER: dados do salão, serviços, horários da semana e promoções ativas.
app.get('/api/publico/salao', exigirConfiguracao, async (req, res) => {
  const cfg = await lerConfiguracoes();
  const hoje = hojeNoSalao();
  const ate = somarDias(hoje, cfg.dias_a_frente);
  const [servicos, horarios, especiais, promocoes] = await Promise.all([
    q(banco.from('servicos').select('id, nome, descricao, duracao_min, preco').eq('ativo', true).order('ordem')),
    q(banco.from('horarios_funcionamento').select('dia_semana, trabalha, abre, fecha').order('dia_semana')),
    q(banco.from('dias_especiais').select('data, tipo, abre, fecha, motivo').gte('data', hoje).lte('data', ate).order('data')),
    q(banco.from('promocoes').select('id, titulo, descricao, valida_ate').eq('ativa', true)),
  ]);
  res.json({
    salao: { nome: cfg.nome_salao, endereco: cfg.endereco, whatsapp: cfg.whatsapp_lucy },
    servicos: servicos.map((s) => ({ ...s, preco: Number(s.preco) })),
    horarios,
    especiais,
    promocoes: promocoes.filter((p) => !p.valida_ate || p.valida_ate >= hoje),
    agenda: { hoje, ate },
  });
});

// VER: horários livres de um dia para os serviços escolhidos.
// Ex.: /api/publico/horarios?data=2026-12-04&servicos=ID1,ID2
app.get('/api/publico/horarios', exigirConfiguracao, async (req, res) => {
  const data = String(req.query.data ?? '');
  if (!dataValida(data)) throw new ErroPublico(400, 'Data inválida.');
  const { duracao } = await servicosEscolhidos(String(req.query.servicos ?? '').split(',').filter(Boolean));
  const cfg = await lerConfiguracoes();
  let ignorarId = null;
  if (req.query.pedido) ignorarId = (await pedidoPorToken(req.query.pedido))?.id ?? null;  // ao remarcar
  res.json({ data, duracao, horarios: await horariosLivres(data, duracao, cfg, ignorarId) });
});

// CRIAR: a cliente pede um horário.
app.post('/api/publico/pedidos', limitarPedidos, exigirConfiguracao, async (req, res) => {
  const b = req.body ?? {};
  const nome = texto(b.nome, 80);
  const whatsapp = normalizarWhatsapp(b.whatsapp);
  const email = texto(b.email, 120).toLowerCase();
  const necessidades = texto(b.necessidades, 500);
  const observacao = texto(b.observacao, 500);

  if (nome.length < 2) throw new ErroPublico(400, 'Informe seu nome.');
  if (!whatsapp) throw new ErroPublico(400, 'Informe um WhatsApp válido, com DDD. Ex.: (00) 00000-0000');
  if (email && !emailValido(email)) throw new ErroPublico(400, 'Confira o e-mail digitado (ou deixe em branco).');

  const { lista, duracao, total } = await servicosEscolhidos(b.servicos);
  const cfg = await lerConfiguracoes();
  const { inicio, fim } = await conferirHorario(b.inicio, duracao, cfg);

  // Encontra a cliente pelo WhatsApp ou cria a ficha dela.
  // Se ela já existe, NÃO sobrescrevemos o que a Lucy anotou: só completamos o que está vazio.
  let cliente = await q(banco.from('clientes').select('id, email, necessidades_especificas')
    .eq('whatsapp', whatsapp).maybeSingle());
  let obs = observacao;
  if (!cliente) {
    cliente = await q(banco.from('clientes').insert({
      nome, whatsapp, email: email || null,
      necessidades_especificas: necessidades || null,
      aceita_lembrete_email: b.lembrete_email !== false,
    }).select('id').single());
  } else {
    const completar = {};
    if (email && !cliente.email) completar.email = email;
    if (necessidades && !cliente.necessidades_especificas) completar.necessidades_especificas = necessidades;
    else if (necessidades && necessidades !== cliente.necessidades_especificas) {
      obs = [obs, `Necessidades informadas neste pedido: ${necessidades}`].filter(Boolean).join('\n');
    }
    if (Object.keys(completar).length) await q(banco.from('clientes').update(completar).eq('id', cliente.id));
  }

  const novo = await q(banco.from('agendamentos').insert({
    cliente_id: cliente.id, inicio, fim, status: 'solicitado', origem: 'cliente',
    valor_total: total, observacao_cliente: obs || null,
  }).select('id, token').single());

  try {
    await gravarServicosDoPedido(novo.id, lista);
  } catch (e) {
    await banco.from('agendamentos').delete().eq('id', novo.id);  // desfaz o pedido incompleto
    throw e;
  }

  res.status(201).json(pedidoParaCliente(await pedidoPorToken(novo.token)));
});

// VER: o próprio pedido, pelo link pessoal.
app.get('/api/publico/pedidos/:token', exigirConfiguracao, async (req, res) => {
  const p = await pedidoPorToken(req.params.token);
  if (!p) throw new ErroPublico(404, 'Pedido não encontrado. Confira o link.');
  res.json(pedidoParaCliente(p));
});

// EDITAR (remarcar): troca o horário e, se quiser, os serviços.
// Volta para "aguardando confirmação", porque a Lucy precisa aprovar de novo.
app.patch('/api/publico/pedidos/:token', limitarAlteracoes, exigirConfiguracao, async (req, res) => {
  const p = await pedidoPorToken(req.params.token);
  if (!p) throw new ErroPublico(404, 'Pedido não encontrado. Confira o link.');
  if (!podeAlterar(p)) throw new ErroPublico(409, 'Este pedido não pode mais ser alterado.');

  const trocouServicos = Array.isArray(req.body?.servicos);
  const ids = trocouServicos ? req.body.servicos : p.servicos.map((s) => s.servico_id);
  if (ids.some((id) => !id)) throw new ErroPublico(400, 'Escolha os serviços novamente.');
  const { lista, duracao, total } = await servicosEscolhidos(ids);
  const cfg = await lerConfiguracoes();
  const { inicio, fim } = await conferirHorario(req.body?.inicio, duracao, cfg, p.id);

  await q(banco.from('agendamentos').update({
    inicio, fim, valor_total: total, status: 'solicitado', confirmado_em: null,
  }).eq('id', p.id));
  if (trocouServicos) {
    await q(banco.from('agendamento_servicos').delete().eq('agendamento_id', p.id));
    await gravarServicosDoPedido(p.id, lista);
  }
  res.json(pedidoParaCliente(await pedidoPorToken(p.token)));
});

// CANCELAR: a cliente desiste do horário (pode ser até no mesmo dia).
app.post('/api/publico/pedidos/:token/cancelar', limitarAlteracoes, exigirConfiguracao, async (req, res) => {
  const p = await pedidoPorToken(req.params.token);
  if (!p) throw new ErroPublico(404, 'Pedido não encontrado. Confira o link.');
  if (!podeAlterar(p)) throw new ErroPublico(409, 'Este pedido não pode mais ser cancelado por aqui. Fale com a Lucy.');
  await q(banco.from('agendamentos').update({ status: 'cancelado', cancelado_por: 'cliente' }).eq('id', p.id));
  res.json(pedidoParaCliente(await pedidoPorToken(p.token)));
});


// ---------------------------------------------------------------------
// 7. ERROS
// ---------------------------------------------------------------------
app.use('/api', (req, res) => res.status(404).json({ erro: 'Rota não encontrada.' }));

app.use((err, req, res, _next) => {
  if (err.publico) return res.status(err.status).json({ erro: err.message });
  if (err.code === '23P01') {  // a trava "uma cliente por vez" do banco
    return res.status(409).json({ erro: 'Esse horário acabou de ser ocupado. Escolha outro, por favor.' });
  }
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

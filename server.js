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
    .select('id, token, cliente_id, status, inicio, fim, valor_total, observacao_cliente, criado_em, forma_pagamento, pago, concluido_em')
    .eq('token', token).maybeSingle());
  if (!p) return null;
  const [cliente, servicos, avaliacao, retornos] = await Promise.all([
    q(banco.from('clientes').select('nome').eq('id', p.cliente_id).single()),
    q(banco.from('agendamento_servicos').select('servico_id, nome, preco, duracao_min').eq('agendamento_id', p.id)),
    q(banco.from('avaliacoes').select('nota, comentario').eq('agendamento_id', p.id).maybeSingle()),
    q(banco.from('agendamentos').select('id').eq('retorno_de', p.id).in('status', ['solicitado', 'agendado', 'concluido'])),
  ]);
  // De quantos em quantos dias a cliente costuma voltar (o menor entre os serviços feitos)
  const ids = servicos.map((x) => x.servico_id).filter(Boolean);
  const dias = ids.length ? (await q(banco.from('servicos').select('retorno_dias').in('id', ids))).map((x) => x.retorno_dias).filter(Boolean) : [];
  return {
    ...p, cliente_nome: cliente.nome, servicos, avaliacao,
    tem_retorno: retornos.length > 0, retorno_dias: dias.length ? Math.min(...dias) : null,
  };
}

const podeAlterar = (p) => ['solicitado', 'agendado'].includes(p.status) && Date.parse(p.inicio) > Date.now();

// Quando oferecer o retorno à cliente: depende da escolha da Lucy na aba Salão
// ("ao finalizar o serviço" ou "depois do pagamento").
function sugestaoDeRetorno(p, cfg) {
  if (p.status !== 'concluido' || p.tem_retorno) return null;
  if (cfg?.retorno_momento === 'apos_pagamento' && !p.pago) return null;
  const base = dataNoSalao(p.concluido_em || p.inicio);
  return { dias: p.retorno_dias ?? 30, sugerido_para: somarDias(base, p.retorno_dias ?? 30) };
}

// O que a cliente pode ver do próprio pedido (sem ids internos).
const pedidoParaCliente = (p, cfg) => ({
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
  // Pagamento (Etapa 6): a cliente escolhe como prefere pagar; a Lucy confirma o recebimento.
  forma_pagamento: p.forma_pagamento,
  pago: p.pago,
  pode_pagar: ['agendado', 'concluido'].includes(p.status) && !p.pago,
  pix_disponivel: ['agendado', 'concluido'].includes(p.status) && !p.pago && Boolean(cfg?.chave_pix),
  // Avaliação e retorno (Etapa 6)
  avaliacao: p.avaliacao ?? null,
  pode_avaliar: p.status === 'concluido' && !p.avaliacao,
  retorno: sugestaoDeRetorno(p, cfg),
});

// Monta a resposta completa do pedido para a cliente.
async function respostaCliente(token) {
  const p = await pedidoPorToken(token);
  if (!p) throw new ErroPublico(404, 'Pedido não encontrado. Confira o link.');
  return pedidoParaCliente(p, await lerConfiguracoes());
}

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
    // Catálogos de revenda: só aparecem as marcas com código ou link preenchido.
    // (O link só é enviado se começar com http:// ou https://, por segurança.)
    catalogos: [['Avon', 'avon'], ['Natura', 'natura'], ['Hinode', 'hinode']]
      .map(([marca, chave]) => {
        const link = cfg[`link_${chave}`];
        return { marca, codigo: cfg[`codigo_${chave}`] || null, link: link && /^https?:\/\//i.test(link) ? link : null };
      })
      .filter((c) => c.codigo || c.link),
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

  // Se for um retorno (veio do botão "agendar retorno"), liga ao atendimento anterior.
  const anterior = b.retorno_de ? await pedidoPorToken(b.retorno_de) : null;
  const novo = await q(banco.from('agendamentos').insert({
    cliente_id: cliente.id, inicio, fim, status: 'solicitado', origem: 'cliente',
    valor_total: total, observacao_cliente: obs || null,
    retorno_de: anterior && anterior.cliente_id === cliente.id ? anterior.id : null,
  }).select('id, token').single());

  try {
    await gravarServicosDoPedido(novo.id, lista);
  } catch (e) {
    await banco.from('agendamentos').delete().eq('id', novo.id);  // desfaz o pedido incompleto
    throw e;
  }

  res.status(201).json(await respostaCliente(novo.token));
});

// VER: o próprio pedido, pelo link pessoal.
app.get('/api/publico/pedidos/:token', exigirConfiguracao, async (req, res) => {
  res.json(await respostaCliente(req.params.token));
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
  res.json(await respostaCliente(p.token));
});

// CANCELAR: a cliente desiste do horário (pode ser até no mesmo dia).
app.post('/api/publico/pedidos/:token/cancelar', limitarAlteracoes, exigirConfiguracao, async (req, res) => {
  const p = await pedidoPorToken(req.params.token);
  if (!p) throw new ErroPublico(404, 'Pedido não encontrado. Confira o link.');
  if (!podeAlterar(p)) throw new ErroPublico(409, 'Este pedido não pode mais ser cancelado por aqui. Fale com a Lucy.');
  await q(banco.from('agendamentos').update({ status: 'cancelado', cancelado_por: 'cliente' }).eq('id', p.id));
  res.json(await respostaCliente(p.token));
});


// ---------------------------------------------------------------------
// 7. PAINEL DA LUCY (Etapa 4) — tudo aqui exige o login da Lucy
//
//    CRUD = Criar, Ler (visualizar), Atualizar (editar) e Deletar (excluir)
//    para: agendamentos, clientes (fichas), histórico, serviços, horários,
//    dias especiais, promoções, configurações e avaliações.
// ---------------------------------------------------------------------
const soLucy = [exigirConfiguracao, exigirLucy];

// --- 7a. Validação genérica dos formulários --------------------------
// Cada campo diz o tipo esperado; o servidor confere tudo antes de gravar.
// Chave Pix no formato que o banco exige:
//  e-mail (minúsculo) · chave aleatória · celular +55DDDNÚMERO · CPF (11 números) · CNPJ (14 números).
// Celular escrito "do jeito comum" — (85) 90000-0000 — vira +5585900000000.
// 11 números sem parênteses nem "+" são lidos como CPF (regra do Pix: celular sempre com +55).
function normalizarChavePix(v) {
  const t = String(v ?? '').trim();
  if (!t) return null;
  if (t.includes('@')) return emailValido(t) && t.length <= 77 ? t.toLowerCase() : null;
  if (RE_UUID.test(t)) return t.toLowerCase();
  const n = t.replace(/\D/g, '');
  if (t.startsWith('+')) return /^55\d{10,11}$/.test(n) ? '+' + n : null;
  if (/[()]/.test(t) || /^\d{2}\s+\d{4,5}[\s-]?\d{4}$/.test(t)) return /^\d{10,11}$/.test(n) ? '+55' + n : null;
  if (/^[\d.\-/\s]+$/.test(t) && (n.length === 11 || n.length === 14)) return n;
  return null;
}
const TIPOS = {
  texto: (v, c) => {
    const t = String(v ?? '').trim();
    if (t.length > (c.max ?? 500)) throw new Error();
    return t || null;
  },
  inteiro: (v, c) => {
    if (v === '' || v === null || v === undefined) return c.padrao ?? null;  // vazio → valor padrão (se houver)
    const n = Number(v);
    if (!Number.isInteger(n) || n < (c.min ?? -1e9) || n > (c.max ?? 1e9)) throw new Error();
    return n;
  },
  dinheiro: (v) => {
    const n = Number(String(v ?? '').replace(',', '.'));
    if (String(v ?? '').trim() === '' || !(n >= 0) || n > 100000) throw new Error();
    return Math.round(n * 100) / 100;
  },
  bool: (v) => v === true || v === 'true' || v === 1 || v === 'on',
  data: (v) => { if (!v) return null; if (!dataValida(String(v))) throw new Error(); return String(v); },
  hora: (v) => {
    if (!v) return null;
    if (!/^([01]\d|2[0-3]):[0-5]\d(:00)?$/.test(String(v))) throw new Error();
    return String(v).slice(0, 5);
  },
  opcao: (v, c) => { if (!c.opcoes.includes(v)) throw new Error(); return v; },
  url: (v) => {
    const t = String(v ?? '').trim();
    if (!t) return null;
    let u;
    try { u = new URL(t); } catch { throw new Error(); }
    if (!['http:', 'https:'].includes(u.protocol) || t.length > 300) throw new Error();
    return u.href;
  },
  whatsapp: (v) => { if (!v) return null; const n = normalizarWhatsapp(v); if (!n) throw new Error(); return n; },
  // Chave Pix: e-mail, celular (+55...), CPF/CNPJ (só números) ou chave aleatória.
  chavePix: (v) => {
    if (!String(v ?? '').trim()) return null;
    const c = normalizarChavePix(v);
    if (!c) throw new Error();
    return c;
  },
  email: (v) => {
    const e = String(v ?? '').trim().toLowerCase();
    if (!e) return null;
    if (!emailValido(e) || e.length > 120) throw new Error();
    return e;
  },
};

function limparDados(corpo, campos, parcial = false) {
  const entrada = corpo ?? {};
  const saida = {};
  for (const [nome, c] of Object.entries(campos)) {
    if (!(nome in entrada)) {
      if (!parcial && c.obrigatorio) throw new ErroPublico(400, `Preencha: ${c.rotulo}.`);
      continue;
    }
    let valor;
    try { valor = TIPOS[c.tipo](entrada[nome], c); } catch { throw new ErroPublico(400, `Confira o campo "${c.rotulo}".`); }
    if (c.obrigatorio && (valor === null || valor === '')) throw new ErroPublico(400, `Preencha: ${c.rotulo}.`);
    saida[nome] = valor;
  }
  return saida;
}

function exigirId(id) {
  if (!RE_UUID.test(String(id))) throw new ErroPublico(404, 'Registro não encontrado.');
  return id;
}

// --- 7b. CRUD genérico (serve para várias tabelas parecidas) ---------
function crud({ rota, tabela, campos, ordem = [], listar = true, aoExcluir }) {
  const base = `/api/lucy/${rota}`;
  if (listar) {
    app.get(base, ...soLucy, async (req, res) => {
      let consulta = banco.from(tabela).select('*');
      for (const [coluna, crescente = true] of ordem) consulta = consulta.order(coluna, { ascending: crescente });
      res.json(await q(consulta));
    });
  }
  app.post(base, ...soLucy, async (req, res) => {
    const dados = limparDados(req.body, campos);
    res.status(201).json(await q(banco.from(tabela).insert(dados).select('*').single()));
  });
  app.patch(`${base}/:id`, ...soLucy, async (req, res) => {
    const id = exigirId(req.params.id);
    const dados = limparDados(req.body, campos, true);
    if (!Object.keys(dados).length) throw new ErroPublico(400, 'Nada para alterar.');
    const r = await q(banco.from(tabela).update(dados).eq('id', id).select('*'));
    if (!r.length) throw new ErroPublico(404, 'Registro não encontrado.');
    res.json(r[0]);
  });
  app.delete(`${base}/:id`, ...soLucy, async (req, res) => {
    const id = exigirId(req.params.id);
    if (aoExcluir) {
      const alternativa = await aoExcluir(id);
      if (alternativa) return res.json(alternativa);
    }
    const r = await q(banco.from(tabela).delete().eq('id', id).select('id'));
    if (!r.length) throw new ErroPublico(404, 'Registro não encontrado.');
    res.json({ excluido: true });
  });
}

// --- 7c. Serviços ----------------------------------------------------
crud({
  rota: 'servicos', tabela: 'servicos', ordem: [['ordem'], ['nome']],
  campos: {
    nome: { tipo: 'texto', max: 80, obrigatorio: true, rotulo: 'Nome' },
    descricao: { tipo: 'texto', max: 200, rotulo: 'Descrição' },
    duracao_min: { tipo: 'inteiro', min: 5, max: 600, obrigatorio: true, rotulo: 'Duração (minutos)' },
    preco: { tipo: 'dinheiro', obrigatorio: true, rotulo: 'Preço' },
    retorno_dias: { tipo: 'inteiro', min: 1, max: 730, rotulo: 'Retorno (dias)' },
    ordem: { tipo: 'inteiro', min: 0, max: 999, padrao: 0, rotulo: 'Ordem' },
    ativo: { tipo: 'bool', rotulo: 'Ativo' },
  },
  // Serviço já usado em algum atendimento é DESATIVADO (não some do histórico).
  aoExcluir: async (id) => {
    const usos = await q(banco.from('agendamento_servicos').select('id').eq('servico_id', id));
    if (!usos.length) return null;
    await q(banco.from('servicos').update({ ativo: false }).eq('id', id));
    return { desativado: true, mensagem: 'Este serviço já foi usado em atendimentos, então foi desativado (não aparece mais para as clientes) em vez de apagado.' };
  },
});

// --- 7d. Promoções e dias especiais ----------------------------------
crud({
  rota: 'promocoes', tabela: 'promocoes', ordem: [['criado_em', false]],
  campos: {
    titulo: { tipo: 'texto', max: 80, obrigatorio: true, rotulo: 'Título' },
    descricao: { tipo: 'texto', max: 400, rotulo: 'Descrição' },
    valida_ate: { tipo: 'data', rotulo: 'Válida até' },
    ativa: { tipo: 'bool', rotulo: 'Ativa' },
  },
});

crud({
  rota: 'dias-especiais', tabela: 'dias_especiais', ordem: [['data']],
  campos: {
    data: { tipo: 'data', obrigatorio: true, rotulo: 'Data' },
    tipo: { tipo: 'opcao', opcoes: ['fechado', 'horario_especial'], obrigatorio: true, rotulo: 'Tipo' },
    abre: { tipo: 'hora', rotulo: 'Abre' },
    fecha: { tipo: 'hora', rotulo: 'Fecha' },
    motivo: { tipo: 'texto', max: 120, rotulo: 'Motivo' },
  },
});

// --- 7e. Horários da semana (os 7 dias de uma vez) -------------------
app.get('/api/lucy/horarios', ...soLucy, async (req, res) => {
  res.json(await q(banco.from('horarios_funcionamento').select('*').order('dia_semana')));
});
app.put('/api/lucy/horarios', ...soLucy, async (req, res) => {
  const dias = req.body;
  if (!Array.isArray(dias) || dias.length !== 7) throw new ErroPublico(400, 'Envie os 7 dias da semana.');
  const campos = {
    trabalha: { tipo: 'bool', rotulo: 'Trabalha' },
    abre: { tipo: 'hora', rotulo: 'Abre' }, fecha: { tipo: 'hora', rotulo: 'Fecha' },
    pausa_inicio: { tipo: 'hora', rotulo: 'Início da pausa' }, pausa_fim: { tipo: 'hora', rotulo: 'Fim da pausa' },
  };
  const limpos = dias.map((d, i) => {
    const x = limparDados(d, campos);
    const nome = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'][i];
    if (x.trabalha && (!x.abre || !x.fecha || x.abre >= x.fecha)) throw new ErroPublico(400, `Confira o horário de ${nome}: abre antes de fechar?`);
    if (!x.trabalha) Object.assign(x, { abre: null, fecha: null, pausa_inicio: null, pausa_fim: null });
    if (!!x.pausa_inicio !== !!x.pausa_fim || (x.pausa_inicio && x.pausa_inicio >= x.pausa_fim)) {
      throw new ErroPublico(400, `Confira a pausa de ${nome}: preencha início e fim, com início antes do fim.`);
    }
    return x;
  });
  for (let i = 0; i < 7; i++) await q(banco.from('horarios_funcionamento').update(limpos[i]).eq('dia_semana', i));
  res.json(await q(banco.from('horarios_funcionamento').select('*').order('dia_semana')));
});

// --- 7f. Configurações do salão --------------------------------------
const CAMPOS_CONFIG = {
  nome_salao: { tipo: 'texto', max: 80, obrigatorio: true, rotulo: 'Nome do salão' },
  endereco: { tipo: 'texto', max: 200, rotulo: 'Endereço' },
  whatsapp_lucy: { tipo: 'whatsapp', rotulo: 'WhatsApp do salão' },
  email_lucy: { tipo: 'email', rotulo: 'E-mail' },
  chave_pix: { tipo: 'chavePix', rotulo: 'Chave Pix' },
  nome_recebedor_pix: { tipo: 'texto', max: 25, rotulo: 'Nome no Pix' },
  cidade_pix: { tipo: 'texto', max: 15, rotulo: 'Cidade no Pix' },
  retorno_momento: { tipo: 'opcao', opcoes: ['ao_finalizar', 'apos_pagamento'], rotulo: 'Quando oferecer retorno' },
  intervalo_agenda_min: { tipo: 'inteiro', min: 10, max: 120, padrao: 30, rotulo: 'Intervalo da agenda' },
  antecedencia_min_horas: { tipo: 'inteiro', min: 0, max: 168, padrao: 2, rotulo: 'Antecedência mínima' },
  antecedencia_cancelamento_horas: { tipo: 'inteiro', min: 0, max: 168, padrao: 0, rotulo: 'Antecedência para cancelar' },
  dias_a_frente: { tipo: 'inteiro', min: 1, max: 180, padrao: 45, rotulo: 'Dias à frente' },
  codigo_avon: { tipo: 'texto', max: 40, rotulo: 'Código Avon' }, link_avon: { tipo: 'url', rotulo: 'Link do catálogo Avon' },
  codigo_natura: { tipo: 'texto', max: 40, rotulo: 'Código Natura' }, link_natura: { tipo: 'url', rotulo: 'Link do catálogo Natura' },
  codigo_hinode: { tipo: 'texto', max: 40, rotulo: 'Código Hinode' }, link_hinode: { tipo: 'url', rotulo: 'Link do catálogo Hinode' },
};
app.get('/api/lucy/configuracoes', ...soLucy, async (req, res) => res.json(await lerConfiguracoes()));
app.patch('/api/lucy/configuracoes', ...soLucy, async (req, res) => {
  const dados = limparDados(req.body, CAMPOS_CONFIG, true);
  if (!Object.keys(dados).length) throw new ErroPublico(400, 'Nada para alterar.');
  dados.atualizado_em = new Date().toISOString();
  res.json(await q(banco.from('configuracoes').update(dados).eq('id', 1).select('*').single()));
});

// --- 7g. Clientes (fichas) -------------------------------------------
const CAMPOS_CLIENTE = {
  nome: { tipo: 'texto', max: 80, obrigatorio: true, rotulo: 'Nome' },
  whatsapp: { tipo: 'whatsapp', obrigatorio: true, rotulo: 'WhatsApp' },
  email: { tipo: 'email', rotulo: 'E-mail' },
  data_nascimento: { tipo: 'data', rotulo: 'Data de nascimento' },
  alergias: { tipo: 'texto', max: 500, rotulo: 'Alergias' },
  observacoes: { tipo: 'texto', max: 2000, rotulo: 'Anotações' },
  necessidades_especificas: { tipo: 'texto', max: 500, rotulo: 'Necessidades específicas' },
  aceita_lembrete_email: { tipo: 'bool', rotulo: 'Aceita lembrete por e-mail' },
};
crud({ rota: 'clientes', tabela: 'clientes', campos: CAMPOS_CLIENTE, listar: false });

app.get('/api/lucy/clientes', ...soLucy, async (req, res) => {
  const lista = await q(banco.from('clientes').select('id, nome, whatsapp, email').order('nome'));
  const busca = String(req.query.busca ?? '').trim().toLowerCase();
  const soNumeros = busca.replace(/\D/g, '');
  res.json(busca ? lista.filter((c) =>
    c.nome.toLowerCase().includes(busca) || (soNumeros.length >= 3 && c.whatsapp.includes(soNumeros))) : lista);
});

// Junta cliente e serviços em cada agendamento (para as telas da Lucy).
async function completarAgendamentos(lista) {
  if (!lista.length) return [];
  const idsClientes = [...new Set(lista.map((a) => a.cliente_id))];
  const [clientes, itens] = await Promise.all([
    q(banco.from('clientes').select('id, nome, whatsapp, email, aceita_lembrete_email, alergias, necessidades_especificas').in('id', idsClientes)),
    q(banco.from('agendamento_servicos').select('agendamento_id, servico_id, nome, preco, duracao_min').in('agendamento_id', lista.map((a) => a.id))),
  ]);
  return lista.map((a) => ({
    ...a,
    valor_total: Number(a.valor_total),
    cliente: clientes.find((c) => c.id === a.cliente_id) ?? null,
    servicos: itens.filter((i) => i.agendamento_id === a.id).map((i) => ({ ...i, preco: Number(i.preco) })),
  }));
}

app.get('/api/lucy/clientes/:id', ...soLucy, async (req, res) => {
  const id = exigirId(req.params.id);
  const cliente = await q(banco.from('clientes').select('*').eq('id', id).maybeSingle());
  if (!cliente) throw new ErroPublico(404, 'Cliente não encontrada.');
  const [agendamentos, historico] = await Promise.all([
    q(banco.from('agendamentos').select('*').eq('cliente_id', id).order('inicio', { ascending: false })),
    q(banco.from('historico_atendimentos').select('*').eq('cliente_id', id).order('data', { ascending: false })),
  ]);
  res.json({ ...cliente, agendamentos: await completarAgendamentos(agendamentos), historico });
});

// --- 7h. Histórico de atendimentos (dentro da ficha) -----------------
const CAMPOS_HISTORICO = {
  data: { tipo: 'data', obrigatorio: true, rotulo: 'Data' },
  servicos_realizados: { tipo: 'texto', max: 300, rotulo: 'Serviços realizados' },
  tintura_utilizada: { tipo: 'texto', max: 200, rotulo: 'Tintura utilizada' },
  tintura_quantidade: { tipo: 'texto', max: 80, rotulo: 'Quantidade de tintura' },
  anotacoes: { tipo: 'texto', max: 2000, rotulo: 'Anotações' },
};
app.post('/api/lucy/clientes/:id/historico', ...soLucy, async (req, res) => {
  const clienteId = exigirId(req.params.id);
  const dados = limparDados(req.body, CAMPOS_HISTORICO);
  res.status(201).json(await q(banco.from('historico_atendimentos').insert({ ...dados, cliente_id: clienteId }).select('*').single()));
});
crud({ rota: 'historico', tabela: 'historico_atendimentos', campos: CAMPOS_HISTORICO, listar: false });

// --- 7i. Agendamentos ------------------------------------------------
// VER: agenda de um período (?de=AAAA-MM-DD&ate=AAAA-MM-DD) ou só os pedidos novos (?status=solicitado)
app.get('/api/lucy/agendamentos', ...soLucy, async (req, res) => {
  let consulta = banco.from('agendamentos').select('*');
  if (req.query.status) consulta = consulta.eq('status', String(req.query.status));
  if (req.query.de) {
    if (!dataValida(String(req.query.de))) throw new ErroPublico(400, 'Data inválida.');
    consulta = consulta.gte('inicio', instante(String(req.query.de), 0).toISOString());
  }
  if (req.query.ate) {
    if (!dataValida(String(req.query.ate))) throw new ErroPublico(400, 'Data inválida.');
    consulta = consulta.lt('inicio', instante(somarDias(String(req.query.ate), 1), 0).toISOString());
  }
  res.json(await completarAgendamentos(await q(consulta.order('inicio'))));
});

async function agendamentoCompleto(id) {
  const a = await q(banco.from('agendamentos').select('*').eq('id', id).maybeSingle());
  if (!a) throw new ErroPublico(404, 'Agendamento não encontrado.');
  return (await completarAgendamentos([a]))[0];
}

// Define início e fim a partir do que a Lucy enviou (fim opcional = soma das durações).
function periodo(inicioEnviado, fimEnviado, duracao) {
  const ini = Date.parse(String(inicioEnviado ?? ''));
  if (Number.isNaN(ini)) throw new ErroPublico(400, 'Informe o dia e a hora de início.');
  const fim = fimEnviado ? Date.parse(String(fimEnviado)) : ini + duracao * UM_MINUTO;
  if (Number.isNaN(fim) || fim <= ini) throw new ErroPublico(400, 'O horário de término precisa ser depois do início.');
  if (fim - ini > 12 * 60 * UM_MINUTO) throw new ErroPublico(400, 'Confira o horário: passou de 12 horas.');
  return { inicio: new Date(ini).toISOString(), fim: new Date(fim).toISOString() };
}

// CRIAR: a Lucy marca um horário (ex.: cliente que ligou). Já entra CONFIRMADO.
app.post('/api/lucy/agendamentos', ...soLucy, async (req, res) => {
  const b = req.body ?? {};
  let clienteId = b.cliente_id ? exigirId(b.cliente_id) : null;
  if (!clienteId) {
    const nova = limparDados(b.cliente ?? {}, { nome: CAMPOS_CLIENTE.nome, whatsapp: CAMPOS_CLIENTE.whatsapp });
    const existente = await q(banco.from('clientes').select('id').eq('whatsapp', nova.whatsapp).maybeSingle());
    clienteId = existente?.id ?? (await q(banco.from('clientes').insert(nova).select('id').single())).id;
  }
  const { lista, duracao, total } = await servicosEscolhidos(b.servicos);
  const { inicio, fim } = periodo(b.inicio, b.fim, duracao);
  const novo = await q(banco.from('agendamentos').insert({
    cliente_id: clienteId, inicio, fim, status: 'agendado', origem: 'lucy',
    confirmado_em: new Date().toISOString(), valor_total: total,
    observacao_cliente: texto(b.observacao, 500) || null,
    retorno_de: b.retorno_de && RE_UUID.test(String(b.retorno_de)) ? b.retorno_de : null,
  }).select('id').single());
  await gravarServicosDoPedido(novo.id, lista);
  res.status(201).json(await agendamentoCompleto(novo.id));
});

// EDITAR: muda horário, término, serviços ou recado.
app.patch('/api/lucy/agendamentos/:id', ...soLucy, async (req, res) => {
  const atual = await agendamentoCompleto(exigirId(req.params.id));
  const b = req.body ?? {};
  const mudar = {};
  let novaLista = null;
  let duracao = atual.servicos.reduce((s, x) => s + x.duracao_min, 0);
  if (Array.isArray(b.servicos)) {
    const e = await servicosEscolhidos(b.servicos);
    novaLista = e.lista; duracao = e.duracao; mudar.valor_total = e.total;
  }
  if (b.inicio || b.fim) Object.assign(mudar, periodo(b.inicio ?? atual.inicio, b.fim, duracao));
  else if (novaLista) Object.assign(mudar, periodo(atual.inicio, null, duracao));
  if ('observacao' in b) mudar.observacao_cliente = texto(b.observacao, 500) || null;
  if (!Object.keys(mudar).length) throw new ErroPublico(400, 'Nada para alterar.');
  await q(banco.from('agendamentos').update(mudar).eq('id', atual.id));
  if (novaLista) {
    await q(banco.from('agendamento_servicos').delete().eq('agendamento_id', atual.id));
    await gravarServicosDoPedido(atual.id, novaLista);
  }
  res.json(await agendamentoCompleto(atual.id));
});

// AÇÕES: confirmar, recusar, cancelar, concluir, faltou.
const ACOES = {
  confirmar: { de: ['solicitado'], para: 'agendado', extra: () => ({ confirmado_em: new Date().toISOString() }) },
  recusar: { de: ['solicitado'], para: 'recusado' },
  cancelar: { de: ['solicitado', 'agendado'], para: 'cancelado', extra: () => ({ cancelado_por: 'lucy' }) },
  concluir: { de: ['agendado'], para: 'concluido', extra: () => ({ concluido_em: new Date().toISOString() }) },
  faltou: { de: ['agendado'], para: 'faltou' },
};
app.post('/api/lucy/agendamentos/:id/:acao', ...soLucy, async (req, res, next) => {
  const acao = ACOES[req.params.acao];
  if (!acao) return next();  // não é uma destas ações (ex.: "pagamento", mais abaixo)
  const atual = await agendamentoCompleto(exigirId(req.params.id));
  if (!acao.de.includes(atual.status)) {
    throw new ErroPublico(409, `Não dá para ${req.params.acao} um agendamento com situação "${STATUS_TEXTO[atual.status]}".`);
  }
  await q(banco.from('agendamentos').update({ status: acao.para, ...(acao.extra?.() ?? {}) }).eq('id', atual.id));
  res.json(await agendamentoCompleto(atual.id));
});

// EXCLUIR de vez (o normal é cancelar; isto apaga o registro).
app.delete('/api/lucy/agendamentos/:id', ...soLucy, async (req, res) => {
  const r = await q(banco.from('agendamentos').delete().eq('id', exigirId(req.params.id)).select('id'));
  if (!r.length) throw new ErroPublico(404, 'Agendamento não encontrado.');
  res.json({ excluido: true });
});

// --- 7j. Avaliações (ver e excluir) ----------------------------------
app.get('/api/lucy/avaliacoes', ...soLucy, async (req, res) => {
  const lista = await q(banco.from('avaliacoes').select('*').order('criado_em', { ascending: false }));
  if (!lista.length) return res.json([]);
  const ags = await q(banco.from('agendamentos').select('id, cliente_id, inicio').in('id', lista.map((a) => a.agendamento_id)));
  const clientes = await q(banco.from('clientes').select('id, nome').in('id', [...new Set(ags.map((a) => a.cliente_id))]));
  res.json(lista.map((av) => {
    const ag = ags.find((a) => a.id === av.agendamento_id);
    return { ...av, atendimento_em: ag?.inicio ?? null, cliente_nome: clientes.find((c) => c.id === ag?.cliente_id)?.nome ?? null };
  }));
});
app.delete('/api/lucy/avaliacoes/:id', ...soLucy, async (req, res) => {
  const r = await q(banco.from('avaliacoes').delete().eq('id', exigirId(req.params.id)).select('id'));
  if (!r.length) throw new ErroPublico(404, 'Avaliação não encontrada.');
  res.json({ excluido: true });
});


// ---------------------------------------------------------------------
// 8. PAGAMENTO, RETORNO E AVALIAÇÃO (Etapa 6)
//
//    Pix: o sistema monta o "Pix copia e cola" (padrão BR Code do Banco
//    Central) com a chave da Lucy e o valor do atendimento. O dinheiro cai
//    direto na conta dela; o sistema NÃO sabe quando o Pix entra — quem
//    avisa é o app do banco, e a Lucy marca "pago" no painel.
// ---------------------------------------------------------------------
const semAcento = (t) => String(t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^A-Za-z0-9 .-]/g, '').replace(/\s+/g, ' ').trim();
const campoPix = (id, valor) => `${id}${String(valor.length).padStart(2, '0')}${valor}`;
function crc16Pix(texto) {
  let crc = 0xffff;
  for (const byte of Buffer.from(texto, 'utf8')) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}
function payloadPix({ chave, nome, cidade, valor, txid }) {
  const conta = campoPix('00', 'br.gov.bcb.pix') + campoPix('01', chave);
  let p = campoPix('00', '01') + campoPix('26', conta) + campoPix('52', '0000') + campoPix('53', '986')
    + (valor > 0 ? campoPix('54', Number(valor).toFixed(2)) : '') + campoPix('58', 'BR')
    + campoPix('59', semAcento(nome).slice(0, 25) || 'RECEBEDOR')
    + campoPix('60', semAcento(cidade).slice(0, 15) || 'BRASIL')
    + campoPix('62', campoPix('05', String(txid || '***').replace(/[^A-Za-z0-9]/g, '').slice(0, 25) || '***'));
  p += '6304';
  return p + crc16Pix(p);
}
function pixDoAgendamento(a, cfg) {
  if (!cfg.chave_pix) throw new ErroPublico(409, 'A chave Pix ainda não foi cadastrada no painel (aba Salão).');
  const chave = normalizarChavePix(cfg.chave_pix);
  if (!chave) throw new ErroPublico(409, 'A chave Pix cadastrada está num formato que o banco não aceita. Confira na aba Salão.');
  const valor = Number(a.valor_total);
  return {
    valor,
    copia_e_cola: payloadPix({
      chave, nome: cfg.nome_recebedor_pix || cfg.nome_salao, cidade: cfg.cidade_pix,
      valor, txid: 'LUCY' + String(a.id).replace(/-/g, '').slice(0, 12).toUpperCase(),
    }),
  };
}
const FORMAS = ['pix', 'cartao', 'dinheiro'];

// CLIENTE: o Pix do próprio horário (só se confirmado/realizado e ainda não pago)
app.get('/api/publico/pedidos/:token/pix', exigirConfiguracao, async (req, res) => {
  const p = await pedidoPorToken(req.params.token);
  if (!p) throw new ErroPublico(404, 'Pedido não encontrado. Confira o link.');
  if (!['agendado', 'concluido'].includes(p.status) || p.pago) throw new ErroPublico(409, 'Este horário não tem pagamento em aberto.');
  res.json(pixDoAgendamento(p, await lerConfiguracoes()));
});

// CLIENTE: escolhe como prefere pagar (Pix, cartão ou dinheiro)
app.post('/api/publico/pedidos/:token/pagamento', limitarAlteracoes, exigirConfiguracao, async (req, res) => {
  const p = await pedidoPorToken(req.params.token);
  if (!p) throw new ErroPublico(404, 'Pedido não encontrado. Confira o link.');
  const forma = String(req.body?.forma ?? '');
  if (!FORMAS.includes(forma)) throw new ErroPublico(400, 'Escolha Pix, cartão ou dinheiro.');
  if (!['agendado', 'concluido'].includes(p.status) || p.pago) throw new ErroPublico(409, 'Este horário não tem pagamento em aberto.');
  await q(banco.from('agendamentos').update({ forma_pagamento: forma }).eq('id', p.id));
  res.json(await respostaCliente(p.token));
});

// CLIENTE: avalia o atendimento (uma vez, depois de realizado)
app.post('/api/publico/pedidos/:token/avaliacao', limitarAlteracoes, exigirConfiguracao, async (req, res) => {
  const p = await pedidoPorToken(req.params.token);
  if (!p) throw new ErroPublico(404, 'Pedido não encontrado. Confira o link.');
  if (p.status !== 'concluido') throw new ErroPublico(409, 'Dá para avaliar depois que o atendimento for realizado.');
  if (p.avaliacao) throw new ErroPublico(409, 'Você já avaliou este atendimento. Obrigada!');
  const nota = Number(req.body?.nota);
  if (!Number.isInteger(nota) || nota < 1 || nota > 5) throw new ErroPublico(400, 'Escolha de 1 a 5 estrelas.');
  await q(banco.from('avaliacoes').insert({ agendamento_id: p.id, nota, comentario: texto(req.body?.comentario, 600) || null }));
  res.status(201).json(await respostaCliente(p.token));
});

// LUCY: Pix de um horário (para mostrar o QR code na hora)
app.get('/api/lucy/agendamentos/:id/pix', ...soLucy, async (req, res) => {
  const a = await agendamentoCompleto(exigirId(req.params.id));
  res.json(pixDoAgendamento(a, await lerConfiguracoes()));
});

// LUCY: registra o pagamento (ou desfaz)
app.post('/api/lucy/agendamentos/:id/pagamento', ...soLucy, async (req, res) => {
  const a = await agendamentoCompleto(exigirId(req.params.id));
  const pago = req.body?.pago !== false;
  const forma = String(req.body?.forma ?? a.forma_pagamento ?? '');
  if (pago) {
    if (!FORMAS.includes(forma)) throw new ErroPublico(400, 'Escolha Pix, cartão ou dinheiro.');
    if (!['agendado', 'concluido'].includes(a.status)) throw new ErroPublico(409, 'Só dá para registrar pagamento de horário confirmado ou realizado.');
    await q(banco.from('agendamentos').update({ pago: true, forma_pagamento: forma, pago_em: new Date().toISOString() }).eq('id', a.id));
  } else {
    await q(banco.from('agendamentos').update({ pago: false, pago_em: null }).eq('id', a.id));
  }
  res.json(await agendamentoCompleto(a.id));
});

// LUCY: lista de retornos — clientes cujo retorno está chegando (até 14 dias) ou atrasado,
// e que ainda não têm horário marcado. Só a Lucy vê.
app.get('/api/lucy/retornos', ...soLucy, async (req, res) => {
  const hoje = hojeNoSalao();
  const [concluidos, futuros, servicos] = await Promise.all([
    q(banco.from('agendamentos').select('id, cliente_id, inicio, concluido_em').eq('status', 'concluido').order('inicio', { ascending: false })),
    q(banco.from('agendamentos').select('cliente_id').in('status', ['solicitado', 'agendado']).gte('inicio', new Date().toISOString())),
    q(banco.from('servicos').select('id, retorno_dias')),
  ]);
  const comHorario = new Set(futuros.map((f) => f.cliente_id));
  const ultimo = new Map();
  for (const a of concluidos) if (!ultimo.has(a.cliente_id) && !comHorario.has(a.cliente_id)) ultimo.set(a.cliente_id, a);
  if (!ultimo.size) return res.json([]);
  const lista = await completarAgendamentos([...ultimo.values()].map((a) => ({ ...a, valor_total: 0 })));
  const diasDe = new Map(servicos.map((s) => [s.id, s.retorno_dias]));
  const resultado = lista.map((a) => {
    const dias = a.servicos.map((x) => diasDe.get(x.servico_id)).filter(Boolean);
    if (!dias.length) return null;
    const prazo = somarDias(dataNoSalao(a.concluido_em || a.inicio), Math.min(...dias));
    const faltam = Math.round((Date.parse(prazo) - Date.parse(hoje)) / 86400000);
    return faltam <= 14 ? {
      cliente: a.cliente, ultimo_atendimento: a.inicio, servicos: a.servicos.map((x) => x.nome),
      servico_ids: a.servicos.map((x) => x.servico_id).filter(Boolean),
      retorno_previsto: prazo, faltam_dias: faltam, agendamento_id: a.id,
    } : null;
  }).filter(Boolean).sort((x, y) => x.faltam_dias - y.faltam_dias);
  res.json(resultado);
});


// ---------------------------------------------------------------------
// 9. ERROS
// ---------------------------------------------------------------------
app.use('/api', (req, res) => res.status(404).json({ erro: 'Rota não encontrada.' }));

app.use((err, req, res, _next) => {
  if (err.publico) return res.status(err.status).json({ erro: err.message });
  if (err.code === '23P01') {  // a trava "uma cliente por vez" do banco
    return res.status(409).json({ erro: 'Já existe um horário confirmado nesse período. Escolha outro horário.' });
  }
  if (err.code === '23505') {  // valor repetido (ex.: mesmo WhatsApp, mesmo nome de serviço, mesma data)
    return res.status(409).json({ erro: 'Já existe um cadastro com esse dado (nome, WhatsApp ou data). Confira.' });
  }
  if (err.code === '23502') {  // campo obrigatório vazio
    return res.status(400).json({ erro: 'Faltou preencher um campo obrigatório.' });
  }
  if (err.code === '23514') {  // regra do banco não atendida (ex.: horário especial sem horas)
    return res.status(400).json({ erro: 'Algum dado não foi aceito. Confira os campos e tente de novo.' });
  }
  if (err.type === 'entity.parse.failed') return res.status(400).json({ erro: 'Dados em formato inválido.' });
  if (err.type === 'entity.too.large')   return res.status(413).json({ erro: 'Dados grandes demais.' });
  console.error('[erro]', err);
  res.status(500).json({ erro: 'Algo deu errado no servidor. Tente de novo.' });
});


// ---------------------------------------------------------------------
// 10. LIGAR O SERVIDOR
//    Na Vercel, ela mesma liga (usando o "export default").
//    No computador: `npm start` e abra http://localhost:3000
// ---------------------------------------------------------------------
if (!process.env.VERCEL) {
  const porta = Number(process.env.PORT) || 3000;
  app.listen(porta, () => console.log(`Lucy Cabeleireira rodando em http://localhost:${porta}`));
}

export default app;

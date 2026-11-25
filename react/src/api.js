// Conversa com o servidor (o mesmo server.js da versão em HTML).
// O endereço vem da variável VITE_API_URL (veja .env.example).
import { guardado } from './ferramentas.js';

const API = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

export class ErroApi extends Error {
  constructor(mensagem, status, dados = null) { super(mensagem); this.status = status; this.dados = dados; }
}

// O "crachá" da Lucy, para ela não ter que digitar a senha toda vez.
export const sessao = {
  ler: () => guardado.ler('lucy.sessao', null),
  salvar: (s) => guardado.salvar('lucy.sessao', s),
  apagar: () => guardado.apagar('lucy.sessao'),
};

// Se o crachá da Lucy venceu, renova sozinho uma vez.
export async function api(caminho, { metodo = 'GET', corpo, autenticado = false, renovado = false } = {}) {
  const headers = {};
  if (corpo !== undefined) headers['Content-Type'] = 'application/json';
  if (autenticado) {
    let s = sessao.ler();
    if (s && !renovado && s.expires_at && s.expires_at * 1000 - Date.now() < 60_000) s = await renovarSessao();
    if (s) headers.Authorization = 'Bearer ' + s.access_token;
  }
  let resposta;
  try {
    resposta = await fetch(API + caminho, { method: metodo, headers, body: corpo !== undefined ? JSON.stringify(corpo) : undefined });
  } catch {
    throw new ErroApi('Sem conexão com o servidor. Confira a internet e tente de novo.', 0);
  }
  if (resposta.status === 401 && autenticado && !renovado && await renovarSessao()) {
    return api(caminho, { metodo, corpo, autenticado, renovado: true });
  }
  const dados = await resposta.json().catch(() => ({}));
  if (!resposta.ok) throw new ErroApi(dados.erro || 'Algo deu errado. Tente de novo.', resposta.status, dados);
  return dados;
}

export async function renovarSessao() {
  const s = sessao.ler();
  if (!s?.refresh_token) return null;
  try {
    const nova = await api('/api/renovar', { metodo: 'POST', corpo: { refresh_token: s.refresh_token } });
    sessao.salvar(nova);
    return nova;
  } catch {
    sessao.apagar();
    return null;
  }
}

// Dados do salão (serviços, horários...). Busca uma vez e reaproveita.
let salaoCache = null;
export async function carregarSalao(forcar = false) {
  if (!salaoCache || forcar) salaoCache = await api('/api/publico/salao');
  return salaoCache;
}

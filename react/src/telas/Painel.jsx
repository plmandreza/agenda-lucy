// ÁREA DA LUCY: login, abas e as janelinhas (perguntas, avisos) usadas por todas as abas.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, sessao } from '../api.js';
import { PainelContexto, painelApi } from '../painel/comum.jsx';
import Login from '../painel/Login.jsx';
import AbaPedidos from '../painel/AbaPedidos.jsx';
import AbaAgenda from '../painel/AbaAgenda.jsx';

const ABAS = [
  ['pedidos', 'Pedidos'], ['agenda', 'Agenda'], ['retornos', 'Retornos'], ['clientes', 'Clientes'], ['servicos', 'Serviços'],
  ['horarios', 'Horários'], ['promocoes', 'Promoções'], ['salao', 'Salão'], ['relatorios', 'Relatórios'], ['avaliacoes', 'Avaliações'],
];
const TELAS = { pedidos: AbaPedidos, agenda: AbaAgenda };
const SITE_PRINCIPAL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

export default function Painel({ sub, params, chave }) {
  const [logada, setLogada] = useState(() => Boolean(sessao.ler()));
  const [avisoLogin, setAvisoLogin] = useState('');
  const [cfg, setCfg] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [dialogo, setDialogo] = useState(null);

  const sessaoVencida = useCallback(() => {
    sessao.apagar(); setLogada(false); setAvisoLogin('Sua sessão expirou. Entre de novo.');
  }, []);
  const sair = async () => {
    try { await api('/api/sair', { metodo: 'POST', autenticado: true }); } catch { /* já saiu */ }
    sessao.apagar(); setCfg(null); setLogada(false); setAvisoLogin('');
  };

  // Painel logado usa a tela mais larga (classe "largo" do estilo)
  useEffect(() => {
    document.body.classList.toggle('largo', logada);
    return () => document.body.classList.remove('largo');
  }, [logada]);

  // Dados do salão (endereço, WhatsApp da Lucy, nome), lidos uma vez depois do login
  useEffect(() => {
    if (logada && !cfg) painelApi('/configuracoes').then(setCfg).catch((e) => e.status === 401 && sessaoVencida());
  }, [logada, cfg, sessaoVencida]);

  // Aviso no topo (some sozinho). "extra" pode ter botões (ex.: WhatsApp).
  // Ele é da tela onde nasceu: se a Lucy muda de tela, o aviso some.
  const avisar = useCallback((mensagem, tipo = 'sucesso', extra = null) => {
    setAviso({ mensagem, tipo, extra, onde: location.hash, id: Date.now() });
  }, []);
  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), aviso.extra ? 20000 : 6000);
    return () => clearTimeout(t);
  }, [aviso]);
  useEffect(() => { setAviso((a) => (a && a.onde !== location.hash ? null : a)); }, [chave]);
  const refAviso = useRef(null);
  useEffect(() => { if (aviso) refAviso.current?.scrollIntoView({ block: 'nearest' }); }, [aviso]);

  // "Tem certeza?" numa janelinha da própria página. Devolve true ou false.
  const perguntar = useCallback((conteudo, { sim = 'Sim, excluir', nao = 'Não' } = {}) =>
    new Promise((responder) => setDialogo({ tipo: 'pergunta', conteudo, sim, nao, responder })), []);
  // Janelinha com conteúdo livre e botão Fechar
  const janela = useCallback((titulo, conteudo) => setDialogo({ tipo: 'janela', titulo, conteudo }), []);
  const fecharJanela = useCallback(() => setDialogo(null), []);

  const contexto = useMemo(() => ({ cfg, setCfg, avisar, perguntar, janela, fecharJanela, sessaoVencida }),
    [cfg, avisar, perguntar, janela, fecharJanela, sessaoVencida]);

  if (!logada) return <Login aviso={avisoLogin} entrou={() => { setLogada(true); setAvisoLogin(''); }} />;

  const [aba = 'pedidos', ...resto] = sub.split('/').filter(Boolean);
  const Tela = TELAS[aba];
  return (
    <PainelContexto.Provider value={contexto}>
      <div className="painel-topo">
        <h1>Olá, Lucy!</h1>
        <button className="secundario pequeno" onClick={sair}>Sair</button>
      </div>
      <nav className="abas" aria-label="Seções do painel">
        {ABAS.map(([id, nome]) => (
          <a key={id} href={`#/painel/${id}`} className={id === aba ? 'ativa' : undefined} aria-current={id === aba ? 'page' : undefined}>{nome}</a>
        ))}
      </nav>
      <div id="aviso" role="status" aria-live="polite" ref={refAviso}>
        {aviso && <div className={`mensagem ${aviso.tipo}`}>{aviso.mensagem}{aviso.extra}</div>}
      </div>
      <div id="conteudo">
        {Tela ? <Tela key={chave} resto={resto} params={params} /> : (
          <div className="cartao">
            <h2>{ABAS.find(([id]) => id === aba)?.[1] ?? 'Aba'}</h2>
            <p>Esta aba chega na próxima parte da versão React.</p>
            <a className="botao secundario botao-largo" href={`${SITE_PRINCIPAL}/#/painel/${aba}`}>Abrir no painel do site principal</a>
          </div>
        )}
      </div>
      {dialogo && <Dialogo d={dialogo} fechar={() => setDialogo(null)} />}
    </PainelContexto.Provider>
  );
}

function Dialogo({ d, fechar }) {
  const primeiro = useRef(null);
  const anterior = useRef(document.activeElement);
  useEffect(() => {
    primeiro.current?.focus();
    const foco = anterior.current;
    return () => foco?.focus?.();
  }, []);
  const responder = (r) => { fechar(); d.responder?.(r); };
  const tecla = (e) => { if (e.key === 'Escape') (d.tipo === 'pergunta' ? responder(false) : fechar()); };
  if (d.tipo === 'pergunta') {
    return (
      <div className="fundo-dialogo" onKeyDown={tecla}>
        <div className="dialogo" role="alertdialog" aria-modal="true" aria-labelledby="dlg-t">
          <p id="dlg-t">{d.conteudo}</p>
          <div className="acoes">
            <button className="secundario" ref={primeiro} onClick={() => responder(false)}>{d.nao}</button>
            <button className="perigo-cheio" onClick={() => responder(true)}>{d.sim}</button>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="fundo-dialogo" onKeyDown={tecla} onClick={(e) => e.target === e.currentTarget && fechar()}>
      <div className="dialogo" role="dialog" aria-modal="true" aria-labelledby="jan-t">
        <h2 id="jan-t">{d.titulo}</h2>
        {d.conteudo}
        <button className="secundario botao-largo" ref={primeiro} onClick={fechar}>Fechar</button>
      </div>
    </div>
  );
}

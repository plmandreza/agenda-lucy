// O PEDIDO DA CLIENTE (VISUALIZAR, com atalhos para REMARCAR, CANCELAR, PAGAR e AVALIAR)
import { useCallback, useEffect, useState } from 'react';
import { api, carregarSalao } from '../api.js';
import {
  fmt, zapCom, quandoTexto, servicosTexto, ICONE_ZAP, FORMAS_TXT, meusPedidos, semRemy,
  arquivoAgenda, linkGoogleAgenda, baixarArquivo,
} from '../ferramentas.js';
import { QR } from '../qr.js';
import { Carregando, TelaErro, BotaoVoltar, BotaoCopiar, CampoRemy } from '../componentes/Comuns.jsx';

export default function Pedido({ token, params, voltar }) {
  const [p, setP] = useState(null);
  const [salao, setSalao] = useState(null);
  const [erro, setErro] = useState(null);
  const [aviso, setAviso] = useState(() => (
    params.get('novo') ? 'novo' : params.get('remarcado') ? 'remarcado' : params.get('cancelado') ? 'cancelado' : ''));
  const [corrigido, setCorrigido] = useState(false);

  // Busca o pedido (e de novo, depois de cada mudança)
  const recarregar = useCallback(async () => {
    try {
      const novo = await api(`/api/publico/pedidos/${encodeURIComponent(token)}`);
      meusPedidos.adicionar(novo.token);
      setP(novo);
    } catch (e) {
      if (e.status === 404) meusPedidos.remover(token);
      setErro(e);
    }
  }, [token]);
  useEffect(() => {
    recarregar();
    carregarSalao().then(setSalao).catch(() => setSalao(null));
  }, [recarregar]);

  if (erro) return <TelaErro mensagem={erro.message} tentarDeNovo={erro.status !== 404 ? () => { setErro(null); recarregar(); } : null} />;
  if (!p) return <Carregando texto="Carregando seu pedido…" />;

  const link = `${location.origin}${location.pathname}#/pedido/${p.token}`;
  // Mensagem pronta para a cliente avisar a Lucy pelo WhatsApp
  const textoParaLucy = {
    novo: `Olá, Lucy! Aqui é ${p.primeiro_nome}. Acabei de pedir um horário pelo site: ${servicosTexto(p)}, ${quandoTexto(p)}. ${link}`,
    remarcado: `Olá, Lucy! Aqui é ${p.primeiro_nome}. Remarquei meu horário pelo site para ${quandoTexto(p)} (${servicosTexto(p)}). ${link}`,
    cancelado: `Olá, Lucy! Aqui é ${p.primeiro_nome}. Precisei cancelar meu horário de ${quandoTexto(p)}. Desculpe!`,
    '': `Olá, Lucy! Aqui é ${p.primeiro_nome}. Sobre o meu horário de ${quandoTexto(p)}: ${link}`,
  }[aviso];
  const botaoZap = salao?.salao?.whatsapp && (
    <a className={`botao ${aviso ? '' : 'secundario'} botao-largo`} href={zapCom(salao.salao.whatsapp, textoParaLucy)} target="_blank" rel="noopener">
      {ICONE_ZAP} {aviso ? 'Avisar a Lucy no WhatsApp' : 'Falar com a Lucy no WhatsApp'}
    </a>
  );

  return (
    <>
      <BotaoVoltar voltar={voltar} />
      {aviso === 'novo' && <p className="mensagem sucesso" role="status"><strong>Pedido enviado, {p.primeiro_nome}!</strong> A Lucy vai ver e confirmar o seu horário.</p>}
      {aviso === 'remarcado' && <p className="mensagem sucesso" role="status"><strong>Horário remarcado!</strong> A Lucy vai confirmar o novo horário.</p>}
      {aviso === 'cancelado' && <p className="mensagem sucesso" role="status">Pedido cancelado.</p>}
      {corrigido && <p className="mensagem sucesso" role="status">Correção salva! A Lucy vai ver junto com o pedido.</p>}
      {aviso && botaoZap && <div style={{ margin: '-.25rem 0 1.25rem' }}>{botaoZap}</div>}

      <div className="cartao">
        <span className={`selo ${p.status}`}>{p.status_texto}</span>
        <p className="quando">{fmt.dataLonga(p.inicio)}</p>
        <p className="suave">Às {fmt.hora(p.inicio)}</p>
        <ul className="itens">
          {p.servicos.map((s, i) => <li key={i}><span>{s.nome}</span><span>{fmt.reais(s.preco)}</span></li>)}
          <li className="total"><span>Total</span><span>{fmt.reais(p.valor_total)}</span></li>
        </ul>
        {p.observacao_cliente && <p className="suave" style={{ marginTop: '1rem', whiteSpace: 'pre-line' }}>Recado: {p.observacao_cliente}</p>}
        {p.necessidades && <p className="suave" style={{ whiteSpace: 'pre-line' }}>Necessidades: {p.necessidades}</p>}
        {salao?.remy && p.sem_remy && <p className="suave">Combinado: o gato do salão vai ficar longe durante o seu atendimento.</p>}
        {salao?.remy && !p.sem_remy && !semRemy.ler() && p.status === 'solicitado' && (
          <p className="suave piada-remy">O Remy, secretário do salão, já deixou seu pedido em cima da mesa da Lucy. 🐾</p>
        )}
        {p.pode_editar_detalhes && (
          <CorrigirDetalhes p={p} salao={salao} depois={async () => { await recarregar(); setAviso(''); setCorrigido(true); }} />
        )}
        {p.pode_alterar && <RemarcarCancelar p={p} depois={() => { location.hash = `#/pedido/${p.token}?cancelado=1`; }} />}
        {!aviso && botaoZap && <div style={{ marginTop: '.75rem' }}>{botaoZap}</div>}
      </div>

      {p.status === 'agendado' && Date.parse(p.inicio) > Date.now() && (
        <div className="cartao">
          <h2>Salvar na agenda do celular</h2>
          <p className="suave">Assim o celular te lembra 2 horas antes.</p>
          <div className="lista-links">
            <button className="secundario" id="baixar-ics"
              onClick={() => baixarArquivo(arquivoAgenda(p, salao), 'horario-lucy-cabeleireira.ics', 'text/calendar;charset=utf-8')}>
              Salvar na agenda (iPhone ou Android)
            </button>
            <a className="botao secundario" href={linkGoogleAgenda(p, salao)} target="_blank" rel="noopener">Abrir no Google Agenda</a>
          </div>
        </div>
      )}

      {p.retorno && (
        <div className="cartao destaque">
          <h2>Que tal já deixar seu retorno marcado?</h2>
          <p>Para {servicosTexto(p).toLowerCase()}, o ideal é voltar por volta de <strong>{fmt.partesDoDia(p.retorno.sugerido_para).longa}</strong>.</p>
          <a className="botao botao-largo" href={`#/agendar?retorno=${p.token}`}>Agendar meu retorno</a>
        </div>
      )}

      {(p.pago || p.pode_pagar) && <Pagamento p={p} salao={salao} recarregar={recarregar} />}
      {(p.avaliacao || p.pode_avaliar) && <Avaliacao p={p} recarregar={recarregar} />}

      <div className="cartao">
        <h2>Seu link pessoal</h2>
        <p className="suave">Guarde este link: é por ele que você vê, remarca ou cancela seu horário.
          Neste aparelho, ele também fica em "Meu horário", no topo da página.</p>
        <div className="link-pessoal">
          <input readOnly value={link} aria-label="Seu link pessoal" />
          <BotaoCopiar texto={link} />
        </div>
      </div>
      <a className="botao secundario botao-largo" href="#/agendar">Fazer outro pedido</a>
    </>
  );
}

// Corrigir recado, necessidades e Remy (antes da Lucy responder)
function CorrigirDetalhes({ p, salao, depois }) {
  const [necessidades, setNecessidades] = useState(p.necessidades ?? '');
  const [observacao, setObservacao] = useState(p.observacao_cliente ?? '');
  const [remy, setRemy] = useState({ marcado: Boolean(p.sem_remy), motivo: p.motivo_remy ?? semRemy.ler()?.motivo ?? 'medo' });
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState('');

  const salvar = async (ev) => {
    ev.preventDefault();
    setSalvando(true); setMsg('');
    try {
      const corpo = { necessidades: necessidades.trim(), observacao: observacao.trim() };
      if (salao?.remy) Object.assign(corpo, { sem_remy: remy.marcado, motivo_remy: remy.marcado ? remy.motivo : null });
      await api(`/api/publico/pedidos/${encodeURIComponent(p.token)}/detalhes`, { metodo: 'PATCH', corpo });
      if (salao?.remy) { if (remy.marcado) semRemy.salvar(remy.motivo); else semRemy.apagar(); }
      await depois();
    } catch (e) { setMsg(e.message); setSalvando(false); }
  };
  return (
    <details className="corrigir">
      <summary>Corrigir recado ou necessidades</summary>
      <form noValidate onSubmit={salvar}>
        <label htmlFor="det-necessidades">Necessidades específicas <span className="opcional">(opcional)</span></label>
        <textarea id="det-necessidades" maxLength={500} value={necessidades} onChange={(e) => setNecessidades(e.target.value)} />
        <label htmlFor="det-observacao">Recado para a Lucy <span className="opcional">(opcional)</span></label>
        <textarea id="det-observacao" maxLength={500} value={observacao} onChange={(e) => setObservacao(e.target.value)} />
        {salao?.remy && <CampoRemy prefixo="det" valor={remy} onChange={setRemy} />}
        <p className="suave">Nome e WhatsApp, só a Lucy muda: fale com ela se precisar.</p>
        <p className="mensagem erro" role="alert">{msg}</p>
        <button type="submit" className="botao-largo" disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar correção'}</button>
      </form>
    </details>
  );
}

// Remarcar e cancelar (com confirmação antes de cancelar, sem janelas que travam a página)
function RemarcarCancelar({ p, depois }) {
  const [confirmando, setConfirmando] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const [msg, setMsg] = useState('');
  const cancelar = async () => {
    setCancelando(true); setMsg('');
    try {
      await api(`/api/publico/pedidos/${encodeURIComponent(p.token)}/cancelar`, { metodo: 'POST' });
      depois();
    } catch (e) { setMsg(e.message); setCancelando(false); }
  };
  return (
    <>
      <div className="acoes">
        <a className="botao secundario" href={`#/agendar?remarcar=${p.token}`}>Remarcar</a>
        <button className="perigo" onClick={() => setConfirmando(true)}>Cancelar</button>
      </div>
      {confirmando && (
        <div className="confirmar" role="alertdialog" aria-labelledby="t-conf">
          <p id="t-conf"><strong>Tem certeza que quer cancelar?</strong> O horário fica livre para outra pessoa.</p>
          <div className="acoes" style={{ marginTop: 0 }}>
            <button className="secundario" autoFocus onClick={() => setConfirmando(false)}>Não, manter</button>
            <button className="perigo-cheio" disabled={cancelando} onClick={cancelar}>{cancelando ? 'Cancelando…' : 'Sim, cancelar'}</button>
          </div>
          <p className="mensagem erro" role="alert">{msg}</p>
        </div>
      )}
    </>
  );
}

// Pagamento: escolher a forma e, se for Pix, mostrar o QR code
function Pagamento({ p, salao, recarregar }) {
  const [msg, setMsg] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [pix, setPix] = useState(null);

  const escolher = async (forma) => {
    setOcupado(true); setMsg(''); setPix(null);
    try {
      await api(`/api/publico/pedidos/${encodeURIComponent(p.token)}/pagamento`, { metodo: 'POST', corpo: { forma } });
      await recarregar();
    } catch (e) { setMsg(e.message); }
    setOcupado(false);
  };
  const verPix = async () => {
    setOcupado(true); setMsg('');
    try { setPix(await api(`/api/publico/pedidos/${encodeURIComponent(p.token)}/pix`)); } catch (e) { setMsg(e.message); }
    setOcupado(false);
  };

  if (p.pago) {
    return (
      <div className="cartao" id="pagamento">
        <h2>Pagamento</h2>
        <p className="mensagem sucesso" style={{ margin: 0 }}>
          ✔ Pagamento confirmado pela Lucy{p.forma_pagamento ? ` (${FORMAS_TXT[p.forma_pagamento]})` : ''}. Obrigada!
        </p>
      </div>
    );
  }
  const zapComprovante = pix && salao?.salao?.whatsapp && zapCom(salao.salao.whatsapp,
    `Olá, Lucy! Aqui é ${p.primeiro_nome}. Fiz o Pix de ${fmt.reais(pix.valor)} do meu horário de ${quandoTexto(p)}.`);
  return (
    <div className="cartao" id="pagamento">
      <h2>Pagamento</h2>
      <p className="suave">Como você prefere pagar? Total: <strong>{fmt.reais(p.valor_total)}</strong></p>
      <div className="opcoes-pagamento" role="group" aria-label="Forma de pagamento">
        {[['pix', 'Pix'], ['cartao', 'Cartão'], ['dinheiro', 'Dinheiro']].map(([v, t]) => (
          <button key={v} className={`pequeno ${p.forma_pagamento === v ? '' : 'secundario'}`} aria-pressed={p.forma_pagamento === v}
            disabled={ocupado} onClick={() => escolher(v)}>{t}</button>
        ))}
      </div>
      {p.forma_pagamento === 'pix' && !p.pix_disponivel && (
        <p className="mensagem atencao">A chave Pix ainda não foi cadastrada. Você pode pagar no salão.</p>
      )}
      {p.forma_pagamento === 'pix' && p.pix_disponivel && !pix && (
        <button className="botao-largo" id="ver-pix" disabled={ocupado} onClick={verPix}>Mostrar o QR code do Pix</button>
      )}
      {pix && (
        <>
          {/* O QR é desenhado aqui mesmo (SVG feito pelo nosso código, sem texto de fora dentro dele) */}
          <div className="qr-pix" dangerouslySetInnerHTML={{ __html: QR.svg(pix.copia_e_cola, 'QR code do Pix') }} />
          <p style={{ textAlign: 'center', margin: '.25rem 0 1rem' }}><strong>{fmt.reais(pix.valor)}</strong></p>
          <p className="suave">Abra o app do seu banco, escolha "Pix → Ler QR code" e aponte para a imagem.
            Se estiver no celular, use o <strong>Pix copia e cola</strong>:</p>
          <textarea className="copia-cola" readOnly aria-label="Pix copia e cola" value={pix.copia_e_cola} />
          <BotaoCopiar texto={pix.copia_e_cola} rotulo="Copiar código Pix" copiado="Código copiado!" className="botao-largo" id="copiar-pix" />
          {zapComprovante && (
            <a className="botao secundario botao-largo" href={zapComprovante} target="_blank" rel="noopener">{ICONE_ZAP} Avisar a Lucy que paguei</a>
          )}
          <p className="suave" style={{ marginBottom: 0 }}>A Lucy confere no banco e confirma o pagamento por aqui.</p>
        </>
      )}
      {p.forma_pagamento && p.forma_pagamento !== 'pix' && <p className="suave">Combinado! É só pagar no salão, no dia do atendimento.</p>}
      <p className="mensagem erro" role="alert">{msg}</p>
    </div>
  );
}

// Avaliação com estrelas (uma vez, depois do atendimento)
function Avaliacao({ p, recarregar }) {
  const [nota, setNota] = useState(0);
  const [comentario, setComentario] = useState('');
  const [msg, setMsg] = useState('');
  const [enviando, setEnviando] = useState(false);

  if (p.avaliacao) {
    return (
      <div className="cartao">
        <h2>Sua avaliação</h2>
        <p className="estrelas" aria-label={`${p.avaliacao.nota} de 5 estrelas`}>{'★'.repeat(p.avaliacao.nota)}{'☆'.repeat(5 - p.avaliacao.nota)}</p>
        {p.avaliacao.comentario && <p>{p.avaliacao.comentario}</p>}
        <p className="suave" style={{ margin: 0 }}>Obrigada por avaliar! 💜</p>
      </div>
    );
  }
  const enviar = async (ev) => {
    ev.preventDefault();
    if (!nota) return setMsg('Toque nas estrelas para dar sua nota.');
    setEnviando(true); setMsg('');
    try {
      await api(`/api/publico/pedidos/${encodeURIComponent(p.token)}/avaliacao`, { metodo: 'POST', corpo: { nota, comentario: comentario.trim() } });
      await recarregar();
    } catch (e) { setMsg(e.message); setEnviando(false); }
  };
  return (
    <form className="cartao" id="form-avaliar" noValidate onSubmit={enviar}>
      <h2>Como foi o seu atendimento?</h2>
      <div className="escolher-estrelas" role="radiogroup" aria-label="Nota de 1 a 5 estrelas">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={n === nota} aria-label={`${n} estrela${n > 1 ? 's' : ''}`}
            className={n <= nota ? 'acesa' : ''} onClick={() => setNota(n)}>{n <= nota ? '★' : '☆'}</button>
        ))}
      </div>
      <label htmlFor="comentario">Quer deixar um comentário? <span className="opcional">(opcional)</span></label>
      <textarea id="comentario" maxLength={600} value={comentario} onChange={(e) => setComentario(e.target.value)} />
      <p className="mensagem erro" role="alert">{msg}</p>
      <button type="submit" className="botao-largo" disabled={enviando}>{enviando ? 'Enviando…' : 'Enviar avaliação'}</button>
    </form>
  );
}

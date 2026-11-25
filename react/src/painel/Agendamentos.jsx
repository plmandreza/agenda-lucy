// Cartão de um horário (usado em Pedidos e Agenda) e o formulário de MARCAR / EDITAR horário.
import { useEffect, useRef, useState } from 'react';
import { ErroApi } from '../api.js';
import { fmt, somarDias, dataNoFuso, ICONE_ZAP, FORMAS_TXT, MOTIVO_REMY_TXT, copiarTexto } from '../ferramentas.js';
import { QR } from '../qr.js';
import { usePainel, painelApi, hojeNoSalao, instanteDe, linkZap, zapBonito, primeiroNome, linkZapCliente, STATUS } from './comum.jsx';

// Se o servidor avisar que já tem cliente confirmada no horário, pergunta à Lucy.
// Devolve o resultado, ou null se ela preferir não seguir.
function useSeChocarPerguntar() {
  const { perguntar } = usePainel();
  return async (chamar) => {
    try { return await chamar(false); } catch (e) {
      if (!(e.status === 409 && e.dados?.conflito)) throw e;
      const quem = e.dados.conflitos.map((c, i) => (
        <span key={i}>{i > 0 && ', '}<strong>{c.nome}</strong> ({fmt.hora(c.inicio)} às {fmt.hora(c.fim)})</span>));
      const sim = await perguntar(<>Nesse horário já tem {quem} confirmada.<br />Quer confirmar mesmo assim? As duas ficam no mesmo horário.</>,
        { sim: 'Confirmar mesmo assim', nao: 'Não' });
      return sim ? chamar(true) : null;
    }
  };
}

// Link "Agendar retorno" (abre o formulário já com a cliente, os serviços e o dia sugerido)
let servicosCache = null;
async function linkRetorno(a) {
  servicosCache ??= await painelApi('/servicos').catch(() => []);
  const dias = a.servicos.map((x) => servicosCache.find((s) => s.id === x.servico_id)?.retorno_dias).filter(Boolean);
  const dia = somarDias(hojeNoSalao(), dias.length ? Math.min(...dias) : 30);
  const q = new URLSearchParams({ dia, cliente: a.cliente?.id ?? '', servicos: a.servicos.map((x) => x.servico_id).filter(Boolean).join(','), retorno_de: a.id });
  return (
    <a className="botao secundario pequeno" style={{ marginTop: '.5rem', display: 'flex' }} href={`#/painel/agenda/novo?${q}`}>
      Agendar retorno de {primeiroNome(a.cliente?.nome)} (sugestão: {fmt.partesDoDia(dia).longa})
    </a>
  );
}

export function CartaoAgendamento({ a, comData = false, comAcoes = true, depois }) {
  const { cfg, avisar, perguntar, janela, fecharJanela, sessaoVencida } = usePainel();
  const seChocarPerguntar = useSeChocarPerguntar();
  const [editando, setEditando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const c = a.cliente ?? {};
  const zapStatus = linkZapCliente(a, a.status, {}, cfg);

  // Roda uma ação; erros viram aviso (ou levam ao login se a sessão venceu)
  const tentar = async (fazer) => {
    setOcupado(true);
    try { await fazer(); } catch (e) {
      if (e.status === 401) return sessaoVencida();
      avisar(e.message, 'erro');
    } finally { setOcupado(false); }
  };

  const registrarPagamento = (forma) => tentar(async () => {
    const r = await painelApi(`/agendamentos/${a.id}/pagamento`, { metodo: 'POST', corpo: { forma, pago: true } });
    // Se a Lucy escolheu "oferecer retorno depois do pagamento", oferece aqui.
    const extra = r.status === 'concluido' && cfg?.retorno_momento === 'apos_pagamento' ? await linkRetorno(r) : null;
    avisar(`Pagamento registrado (${FORMAS_TXT[forma]}).`, 'sucesso', extra);
    depois();
  });

  const mostrarPix = () => tentar(async () => {
    let pix;
    try { pix = await painelApi(`/agendamentos/${a.id}/pix`); } catch (e) {
      if (e.status === 401) throw e;
      return avisar(e.message, 'erro', <> <a href="#/painel/salao">Cadastrar a chave Pix</a></>);
    }
    const zap = linkZapCliente(a, 'pix', { valor: pix.valor, copia: pix.copia_e_cola }, cfg);
    janela(`Pix de ${c.nome}`, (
      <>
        <div className="qr-pix" dangerouslySetInnerHTML={{ __html: QR.svg(pix.copia_e_cola, 'QR code do Pix') }} />
        <p style={{ textAlign: 'center', margin: '.25rem 0 1rem' }}><strong>{fmt.reais(pix.valor)}</strong></p>
        <p className="suave">A cliente aponta a câmera do app do banco para o QR code. Ou mande o "copia e cola":</p>
        <textarea className="copia-cola" readOnly aria-label="Pix copia e cola" value={pix.copia_e_cola} />
        <div className="lista-links">
          <button className="secundario" onClick={async (e) => { e.currentTarget.textContent = await copiarTexto(pix.copia_e_cola) ? 'Copiado!' : 'Selecione e copie'; }}>
            Copiar código Pix</button>
          {zap && <a className="botao secundario" target="_blank" rel="noopener" href={zap}>{ICONE_ZAP} Mandar o Pix pelo WhatsApp</a>}
          <button data-recebi onClick={() => { fecharJanela(); registrarPagamento('pix'); }}>Já recebi o Pix (confirmar pagamento)</button>
        </div>
        <p className="suave" style={{ marginTop: 0 }}>Confira no app do seu banco se o Pix entrou antes de confirmar.</p>
      </>
    ));
  });

  const desfazerPagamento = async () => {
    if (!await perguntar(<>Desfazer o pagamento de <strong>{c.nome}</strong>?</>, { sim: 'Sim, desfazer' })) return;
    tentar(async () => {
      await painelApi(`/agendamentos/${a.id}/pagamento`, { metodo: 'POST', corpo: { pago: false } });
      avisar('Pagamento desfeito.'); depois();
    });
  };

  const excluir = async () => {
    if (!await perguntar(<>Excluir de vez o horário de <strong>{c.nome}</strong>?<br />
      <span className="suave">Dica: para manter o histórico, prefira "Cancelar".</span></>)) return;
    tentar(async () => { await painelApi(`/agendamentos/${a.id}`, { metodo: 'DELETE' }); avisar('Horário excluído.'); depois(); });
  };

  const atraso = () => janela(`Avisar ${c.nome} do atraso`, (
    <>
      <p className="suave">Escolha quanto tempo. O WhatsApp abre com a mensagem pronta.</p>
      <div className="lista-links">
        {[10, 15, 20, 30, 45].map((m) => (
          <a key={m} className="botao secundario" target="_blank" rel="noopener" href={linkZapCliente(a, 'atraso', { minutos: m }, cfg)}>{m} minutos</a>
        ))}
      </div>
    </>
  ));

  // Confirmar, recusar, cancelar, concluir, faltou
  const mudarStatus = async (acao) => {
    if (['recusar', 'cancelar'].includes(acao) &&
      !await perguntar(<>{acao === 'recusar' ? 'Recusar o pedido' : 'Cancelar o horário'} de <strong>{c.nome}</strong>?</>,
        { sim: acao === 'recusar' ? 'Sim, recusar' : 'Sim, cancelar' })) return;
    tentar(async () => {
      const r = await seChocarPerguntar((forcar) =>
        painelApi(`/agendamentos/${a.id}/${acao}`, { metodo: 'POST', corpo: forcar ? { forcar: true } : {} }));
      if (!r) return;  // a Lucy preferiu não confirmar
      // Depois da ação: botão para avisar a cliente pelo WhatsApp (mensagem pronta)
      const zap = linkZapCliente(r, r.status, {}, cfg);
      const nome = primeiroNome(r.cliente?.nome);
      const extra = (
        <>
          {zap && ['confirmar', 'recusar', 'cancelar', 'concluir'].includes(acao) && (
            <a className="botao pequeno" style={{ marginTop: '.6rem', display: 'flex' }} href={zap} target="_blank" rel="noopener">
              {ICONE_ZAP} {acao === 'concluir' ? `Agradecer ${nome} e pedir avaliação` : `Avisar ${nome} no WhatsApp`}
            </a>
          )}
          {/* Retorno: oferecer ao finalizar (ou só depois do pagamento, conforme a aba Salão) */}
          {acao === 'concluir' && (cfg?.retorno_momento !== 'apos_pagamento' || r.pago) && await linkRetorno(r)}
        </>
      );
      avisar({ confirmar: 'Horário confirmado!', recusar: 'Pedido recusado.', cancelar: 'Horário cancelado.',
        concluir: 'Atendimento concluído.', faltou: 'Marcado como falta.' }[acao], 'sucesso', extra);
      depois();
    });
  };

  const alertas = [
    c.alergias && `Alergias: ${c.alergias}`,
    c.necessidades_especificas && `Necessidades: ${c.necessidades_especificas}`,
    ...(a.conflitos ?? []).map((x) => `⚠ Mesmo horário que ${x.nome} (${fmt.hora(x.inicio)} às ${fmt.hora(x.fim)}, confirmada)`),
    (a.sem_remy || c.sem_remy) && `Remy longe${c.motivo_sem_remy ? ` (${MOTIVO_REMY_TXT[c.motivo_sem_remy]})` : ''}`,
  ].filter(Boolean);
  const botoes = {
    solicitado: [['confirmar', 'Confirmar', ''], ['recusar', 'Recusar', 'perigo']],
    agendado: [['concluir', 'Concluído', ''], ['faltou', 'Faltou', 'secundario'], ['cancelar', 'Cancelar', 'perigo']],
  }[a.status] ?? [];

  return (
    <div className={`cartao item agendamento ${a.status}`}>
      <div className="linha-titulo">
        <p className="quando">{comData ? fmt.dataLonga(a.inicio) + ' · ' : ''}{fmt.hora(a.inicio)} às {fmt.hora(a.fim)}</p>
        <span className={`selo ${a.status}`}>{STATUS[a.status] ?? a.status}</span>
      </div>
      <p style={{ margin: '.25rem 0' }}>
        <a href={`#/painel/clientes/${c.id}`}><strong>{c.nome ?? 'Cliente'}</strong></a>
        {c.whatsapp && <> · <a href={linkZap(c.whatsapp)} target="_blank" rel="noopener">{zapBonito(c.whatsapp)}</a></>}
      </p>
      <p className="suave" style={{ margin: 0 }}>
        {a.servicos.map((s) => s.nome).join(' + ') || '—'} · <strong>{fmt.reais(a.valor_total)}</strong>
        {a.origem === 'cliente' && ' · pedido pelo site'}
      </p>
      {alertas.map((t, i) => <p className="alerta-cliente" key={i}>{t}</p>)}
      {a.observacao_cliente && <p className="suave" style={{ whiteSpace: 'pre-line', margin: '.5rem 0 0' }}>Recado: {a.observacao_cliente}</p>}

      {comAcoes && ['agendado', 'concluido'].includes(a.status) && (a.pago ? (
        <p className="pago">✔ Pago{a.forma_pagamento ? ` · ${FORMAS_TXT[a.forma_pagamento]}` : ''}
          <button className="secundario pequeno" disabled={ocupado} onClick={desfazerPagamento}>Desfazer</button></p>
      ) : (
        <div className="linha-pagamento">
          <span className="suave">Pagamento{a.forma_pagamento ? ` (prefere ${FORMAS_TXT[a.forma_pagamento]})` : ''}:</span>
          <button className="secundario pequeno" data-acao="pix" disabled={ocupado} onClick={mostrarPix}>Pix (QR code)</button>
          <button className="secundario pequeno" disabled={ocupado} onClick={() => registrarPagamento('cartao')}>Pago no cartão</button>
          <button className="secundario pequeno" disabled={ocupado} onClick={() => registrarPagamento('dinheiro')}>Pago em dinheiro</button>
        </div>
      ))}

      {comAcoes && (
        <>
          <div className="acoes-item">
            {botoes.map(([acao, rotulo, classe]) => (
              <button key={acao} className={`pequeno ${classe}`} data-acao={acao} disabled={ocupado} onClick={() => mudarStatus(acao)}>{rotulo}</button>
            ))}
            {zapStatus && <a className="botao secundario pequeno" href={zapStatus} target="_blank" rel="noopener" title="Abre o WhatsApp com a mensagem pronta">{ICONE_ZAP} WhatsApp</a>}
            {a.status === 'agendado' && dataNoFuso(a.inicio) === hojeNoSalao() && c.whatsapp && (
              <button className="secundario pequeno" onClick={atraso}>Vou atrasar</button>
            )}
            <button className="secundario pequeno" onClick={() => setEditando(true)}>Editar</button>
            <button className="perigo pequeno" disabled={ocupado} onClick={excluir}>Excluir</button>
          </div>
          {editando && <FormularioAgendamento a={a} fechar={() => setEditando(false)} depois={depois} />}
        </>
      )}
    </div>
  );
}

// Formulário de agendamento: serve para MARCAR (novo, "a" vazio) e para EDITAR.
export function FormularioAgendamento({ a = null, padroes = {}, fechar, depois }) {
  const { avisar, sessaoVencida } = usePainel();
  const seChocarPerguntar = useSeChocarPerguntar();
  const [listas, setListas] = useState(null);
  const [cliente, setCliente] = useState(padroes.cliente ?? '');
  const [nova, setNova] = useState({ nome: '', whatsapp: '' });
  const [escolhidos, setEscolhidos] = useState(() => new Set(a ? a.servicos.map((s) => s.servico_id) : (padroes.servicos ?? [])));
  const [dia, setDia] = useState(a ? dataNoFuso(a.inicio) : (padroes.dia ?? hojeNoSalao()));
  const [ini, setIni] = useState(a ? fmt.hora(a.inicio) : (padroes.hora ?? ''));
  const [fim, setFim] = useState(a ? fmt.hora(a.fim) : '');
  const [fimManual, setFimManual] = useState(Boolean(a));
  const [obs, setObs] = useState(a?.observacao_cliente ?? '');
  const [msg, setMsg] = useState('');
  const [salvando, setSalvando] = useState(false);
  const refForm = useRef(null);

  useEffect(() => {
    Promise.all([painelApi('/servicos'), a ? Promise.resolve([]) : painelApi('/clientes')])
      .then(([servicos, clientes]) => setListas({ servicos, clientes }))
      .catch((e) => (e.status === 401 ? sessaoVencida() : setMsg(e.message)));
  }, [a, sessaoVencida]);

  // Término automático: início + soma das durações (até a Lucy mexer no término).
  useEffect(() => {
    if (fimManual || !ini || !listas) return;
    const min = listas.servicos.filter((s) => escolhidos.has(s.id)).reduce((t, s) => t + s.duracao_min, 0);
    const [h, m] = ini.split(':').map(Number);
    const total = Math.min(h * 60 + m + (min || 60), 23 * 60 + 59);
    setFim(`${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`);
  }, [ini, escolhidos, fimManual, listas]);

  // Ao abrir, rola a tela até o formulário
  useEffect(() => { if (listas) refForm.current?.scrollIntoView({ block: 'start' }); }, [listas]);

  if (!listas) return <p className="carregando">{msg || 'Carregando…'}</p>;
  const visiveis = listas.servicos.filter((s) => s.ativo || escolhidos.has(s.id));

  const salvar = async (ev) => {
    ev.preventDefault();
    setSalvando(true); setMsg('');
    try {
      if (!escolhidos.size) throw new ErroApi('Escolha pelo menos um serviço.', 400);
      if (!dia || !ini) throw new ErroApi('Informe o dia e a hora de início.', 400);
      const corpo = {
        servicos: [...escolhidos], inicio: instanteDe(dia, ini), fim: fim ? instanteDe(dia, fim) : null,
        retorno_de: a ? undefined : padroes.retorno_de ?? null, observacao: obs.trim(),
      };
      if (a) {
        if (!await seChocarPerguntar((forcar) => painelApi(`/agendamentos/${a.id}`, { metodo: 'PATCH', corpo: { ...corpo, forcar } }))) {
          throw new ErroApi('Nada foi alterado. Escolha outro horário, se quiser.', 0);
        }
        avisar('Horário atualizado.');
      } else {
        if (!cliente) throw new ErroApi('Escolha a cliente (ou "Cliente nova").', 400);
        if (cliente === 'nova') corpo.cliente = { nome: nova.nome.trim(), whatsapp: nova.whatsapp.trim() };
        else corpo.cliente_id = cliente;
        if (!await seChocarPerguntar((forcar) => painelApi('/agendamentos', { metodo: 'POST', corpo: { ...corpo, forcar } }))) {
          throw new ErroApi('Nada foi marcado. Escolha outro horário, se quiser.', 0);
        }
        avisar('Horário marcado e confirmado!');
      }
      fechar();
      depois(dia);
    } catch (e) {
      if (e.status === 401) return sessaoVencida();
      setMsg(e.message); setSalvando(false);
    }
  };

  const alternar = (id, marcado) => {
    const s = new Set(escolhidos); marcado ? s.add(id) : s.delete(id);
    setEscolhidos(s); if (!a) setFimManual(false);
  };
  return (
    <form className="cartao form-cartao" noValidate onSubmit={salvar} ref={refForm}>
      <h2>{a ? 'Editar horário' : padroes.retorno_de ? 'Agendar retorno' : 'Marcar horário'}</h2>
      {a ? <p><strong>{a.cliente?.nome}</strong></p> : (
        <>
          <label htmlFor="ag-cliente">Cliente</label>
          <select id="ag-cliente" name="cliente" value={cliente} onChange={(e) => setCliente(e.target.value)}>
            <option value="">— escolha —</option>
            <option value="nova">+ Cliente nova</option>
            {listas.clientes.map((cl) => <option key={cl.id} value={cl.id}>{cl.nome} · {zapBonito(cl.whatsapp)}</option>)}
          </select>
          {cliente === 'nova' && (
            <div>
              <label htmlFor="ag-nome">Nome da cliente nova</label>
              <input id="ag-nome" name="nome" maxLength={80} value={nova.nome} onChange={(e) => setNova({ ...nova, nome: e.target.value })} />
              <label htmlFor="ag-zap">WhatsApp</label>
              <input id="ag-zap" name="whatsapp" type="tel" inputMode="tel" placeholder="(00) 00000-0000"
                value={nova.whatsapp} onChange={(e) => setNova({ ...nova, whatsapp: e.target.value })} />
            </div>
          )}
        </>
      )}
      <fieldset style={{ border: 0, padding: 0, margin: '1rem 0 0' }}>
        <legend style={{ fontWeight: 600, marginBottom: '.35rem' }}>Serviços</legend>
        {visiveis.map((s) => (
          <label className="opcao" key={s.id}>
            <input type="checkbox" name="servico" value={s.id} checked={escolhidos.has(s.id)} onChange={(e) => alternar(s.id, e.target.checked)} />
            <span className="info"><span className="nome">{s.nome}</span><span className="suave">{fmt.duracao(s.duracao_min)}</span></span>
            <strong>{fmt.reais(s.preco)}</strong>
          </label>
        ))}
      </fieldset>
      <div className="tres-colunas">
        <div><label htmlFor="ag-data">Dia</label><input id="ag-data" name="data" type="date" value={dia} onChange={(e) => setDia(e.target.value)} /></div>
        <div><label htmlFor="ag-ini">Início</label><input id="ag-ini" name="inicio" type="time" value={ini} onChange={(e) => setIni(e.target.value)} /></div>
        <div><label htmlFor="ag-fim">Término</label><input id="ag-fim" name="fim" type="time" value={fim} onChange={(e) => { setFim(e.target.value); setFimManual(true); }} /></div>
      </div>
      <p className="dica">O término é calculado pela soma dos serviços; você pode ajustar.</p>
      <label htmlFor="ag-obs">Recado / observação <span className="opcional">(opcional)</span></label>
      <textarea id="ag-obs" name="observacao" maxLength={500} value={obs} onChange={(e) => setObs(e.target.value)} />
      <p className="mensagem erro msg-form" role="alert">{msg}</p>
      <div className="acoes">
        <button type="button" className="secundario" onClick={fechar}>Cancelar</button>
        <button type="submit" disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar'}</button>
      </div>
    </form>
  );
}

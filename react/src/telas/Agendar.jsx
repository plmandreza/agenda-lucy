// AGENDAR HORÁRIO (CRIAR) e REMARCAR (EDITAR) — em passos
import { useEffect, useRef, useState } from 'react';
import { api, carregarSalao } from '../api.js';
import { fmt, somarDias, diaDaSemana, dataNoFuso, guardado, meusPedidos, semRemy, MOTIVO_REMY_TXT } from '../ferramentas.js';
import { Carregando, TelaErro, CampoRemy } from '../componentes/Comuns.jsx';

export default function Agendar({ params }) {
  const [salao, setSalao] = useState(null);
  const [erro, setErro] = useState(null);
  const [ag, setAg] = useState(null);  // tudo que a cliente vai escolhendo fica aqui até o envio

  useEffect(() => {
    (async () => {
      let d;
      try { d = await carregarSalao(); } catch (e) { return setErro({ mensagem: e.message, deNovo: true }); }
      const remarcar = params.get('remarcar');
      const retorno = params.get('retorno');
      const longe = semRemy.ler();
      const novo = {
        passo: 1, servicos: new Set(), data: null, inicio: null, remarcar: null,
        nome: '', whatsapp: '', email: '',
        ...guardado.ler('lucy.cliente', {}),  // nome, whatsapp e e-mail usados da última vez neste aparelho
        necessidades: '', observacao: '',
        remy: { marcado: Boolean(longe), motivo: longe?.motivo ?? 'medo' },
      };
      const servicosDoPedido = (p) => p.servicos.forEach((s) => { if (d.servicos.some((x) => x.id === s.id)) novo.servicos.add(s.id); });
      if (remarcar) {
        try {
          const p = await api(`/api/publico/pedidos/${encodeURIComponent(remarcar)}`);
          if (!p.pode_alterar) return setErro({ mensagem: 'Este pedido não pode mais ser alterado.' });
          novo.remarcar = remarcar;
          novo.data = dataNoFuso(p.inicio);  // começa mostrando o dia do próprio pedido
          novo.diaManual = true;
          servicosDoPedido(p);
        } catch (e) { return setErro({ mensagem: e.message, deNovo: true }); }
      }
      if (retorno) {
        // Retorno: já vem com os mesmos serviços e o dia sugerido
        try {
          const p = await api(`/api/publico/pedidos/${encodeURIComponent(retorno)}`);
          novo.retornoDe = retorno;
          servicosDoPedido(p);
          if (p.retorno?.sugerido_para) {
            novo.sugestaoRetorno = p.retorno.sugerido_para;
            novo.data = p.retorno.sugerido_para < d.agenda.ate ? p.retorno.sugerido_para : d.agenda.ate;
          }
        } catch { /* se o link estiver errado, segue como pedido normal */ }
      }
      setSalao(d);
      setAg(novo);
    })();
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps  (roda uma vez ao abrir a tela)

  if (erro) return <TelaErro mensagem={erro.mensagem} tentarDeNovo={erro.deNovo ? () => location.reload() : null} />;
  if (!ag) return <Carregando />;

  const mudar = (campos) => setAg((a) => ({ ...a, ...campos }));
  // Quais passos existem: ao remarcar, não precisa pedir os dados de novo.
  const passos = ag.remarcar ? [1, 2, 4] : [1, 2, 3, 4];
  const ir = (direcao) => { mudar({ passo: passos[passos.indexOf(ag.passo) + direcao] }); window.scrollTo({ top: 0 }); };
  const lista = salao.servicos.filter((s) => ag.servicos.has(s.id));
  const total = lista.reduce((t, s) => t + s.preco, 0);
  const comum = { ag, mudar, ir, salao, lista, total };

  const n = passos.indexOf(ag.passo) + 1;
  const cabecalho = (titulo) => (
    <>
      <p className="passos">{ag.remarcar ? 'Remarcar · ' : ''}Passo {n} de {passos.length}</p>
      <div className="barra" aria-hidden="true"><span style={{ width: `${(n / passos.length) * 100}%` }} /></div>
      <h1>{titulo}</h1>
    </>
  );
  if (ag.passo === 1) return <PassoServicos {...comum} cabecalho={cabecalho} />;
  if (ag.passo === 2) return <PassoQuando {...comum} cabecalho={cabecalho} />;
  if (ag.passo === 3) return <PassoDados {...comum} cabecalho={cabecalho} />;
  return <PassoRevisar {...comum} cabecalho={cabecalho} />;
}

// Passo 1: quais serviços?
function PassoServicos({ ag, mudar, ir, salao, lista, total, cabecalho }) {
  const alternar = (id, marcado) => {
    const s = new Set(ag.servicos);
    marcado ? s.add(id) : s.delete(id);
    mudar({ servicos: s, inicio: null });  // mudou o serviço: o horário escolhido precisa ser revisto
  };
  return (
    <div className="cartao">
      {cabecalho('O que você quer fazer?')}
      <p className="suave">Pode escolher mais de um.</p>
      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="sr">Serviços</legend>
        {salao.servicos.map((s) => (
          <label className="opcao" key={s.id}>
            <input type="checkbox" value={s.id} checked={ag.servicos.has(s.id)} onChange={(e) => alternar(s.id, e.target.checked)} />
            <span className="info"><span className="nome">{s.nome}</span>
              {s.descricao && <span className="suave">{s.descricao}</span>}</span>
            <strong>{fmt.reais(s.preco)}</strong>
          </label>
        ))}
      </fieldset>
      <div className="resumo" aria-live="polite">
        {lista.length
          ? <><span>{lista.length} serviço{lista.length > 1 ? 's' : ''}</span><span>{fmt.reais(total)}</span></>
          : <span>Nenhum serviço escolhido</span>}
      </div>
      <div className="acoes">
        <a className="botao secundario" href={ag.remarcar ? `#/pedido/${ag.remarcar}` : '#/'}>Voltar</a>
        <button id="continuar" disabled={!lista.length} onClick={() => ir(+1)}>Continuar</button>
      </div>
    </div>
  );
}

// Passo 2: quando?
function PassoQuando({ ag, mudar, ir, salao, cabecalho }) {
  const { hoje, ate } = salao.agenda;
  const dias = [];
  for (let d = hoje; d <= ate; d = somarDias(d, 1)) dias.push(d);
  // O salão abre neste dia? (folgas e horários especiais valem mais que a semana)
  const diaAberto = (data) => {
    const especial = salao.especiais.find((e) => e.data === data);
    if (especial) return especial.tipo !== 'fechado';
    return !!salao.horarios.find((h) => h.dia_semana === diaDaSemana(data))?.trabalha;
  };
  const [horas, setHoras] = useState(null);
  const [erro, setErro] = useState('');
  const pulos = useRef(0);
  const selecionado = useRef(null);

  // Se não há dia escolhido (ou ele está fechado), começa no próximo dia aberto
  useEffect(() => {
    if (!ag.data || ag.data > ate || ag.data < hoje || !diaAberto(ag.data)) {
      const base = ag.data && ag.data <= ate ? ag.data : hoje;
      mudar({ data: dias.find((d) => d >= base && diaAberto(d)) ?? dias.find(diaAberto) ?? null });
    }
  }, [ag.data]);  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { selecionado.current?.scrollIntoView({ block: 'nearest', inline: 'center' }); }, [ag.data]);

  // Busca os horários livres do dia escolhido
  useEffect(() => {
    if (!ag.data || !diaAberto(ag.data)) return;
    let valido = true;
    setHoras(null); setErro('');
    const qs = new URLSearchParams({ data: ag.data, servicos: [...ag.servicos].join(',') });
    if (ag.remarcar) qs.set('pedido', ag.remarcar);
    api(`/api/publico/horarios?${qs}`).then((r) => {
      if (!valido) return;
      // Se a página escolheu o dia sozinha e ele está cheio, pula para o próximo dia aberto (até 14 vezes)
      if (!r.horarios.length && !ag.diaManual && pulos.current < 14) {
        let prox = somarDias(ag.data, 1);
        while (prox <= ate && !diaAberto(prox)) prox = somarDias(prox, 1);
        if (prox <= ate) { pulos.current += 1; return mudar({ data: prox }); }
      }
      if (!r.horarios.some((h) => h.inicio === ag.inicio)) mudar({ inicio: null });
      setHoras(r.horarios);
    }).catch((e) => valido && (setHoras([]), setErro(e.message)));
    return () => { valido = false; };
  }, [ag.data]);  // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="cartao">
      {cabecalho('Escolha o dia e o horário')}
      {ag.sugestaoRetorno && (
        <p className="mensagem atencao">Retorno sugerido: por volta de <strong>{fmt.partesDoDia(ag.sugestaoRetorno).longa}</strong>.</p>
      )}
      <div className="dias" role="group" aria-label="Dias">
        {dias.map((d) => {
          const p = fmt.partesDoDia(d), aberto = diaAberto(d), sel = d === ag.data;
          return (
            <button key={d} className={`dia ${sel ? 'selecionado' : ''}`} disabled={!aberto} aria-pressed={sel}
              ref={sel ? selecionado : null} aria-label={`${p.longa}${aberto ? '' : ' (fechado)'}`}
              onClick={() => mudar({ data: d, diaManual: true, inicio: null })}>
              <span className="sem">{p.sem}</span><span className="num">{p.num}</span><span className="mes">{aberto ? p.mes : 'fechado'}</span>
            </button>
          );
        })}
      </div>
      <h2 id="t-horas" style={{ marginTop: '.5rem' }}>{ag.data ? fmt.partesDoDia(ag.data).longa : ''}</h2>
      <div aria-labelledby="t-horas">
        {!ag.data ? <p>Não há dias disponíveis no momento.</p>
          : horas === null ? <Carregando texto="Buscando horários…" />
          : horas.length ? (
            <div className="horas">
              {horas.map((h) => (
                <button key={h.inicio} className={`hora ${h.inicio === ag.inicio ? 'selecionado' : ''}`} aria-pressed={h.inicio === ag.inicio}
                  onClick={() => mudar({ inicio: h.inicio })}>{h.hora}</button>
              ))}
            </div>
          ) : !erro && <p>Não sobrou horário livre neste dia. Que tal outro dia?</p>}
      </div>
      <p className="mensagem erro" role="alert">{erro}</p>
      <div className="acoes">
        <button className="secundario" onClick={() => ir(-1)}>Voltar</button>
        <button id="continuar" disabled={!ag.inicio} onClick={() => ir(+1)}>Continuar</button>
      </div>
    </div>
  );
}

// Passo 3: seus dados
function PassoDados({ ag, mudar, ir, salao, cabecalho }) {
  const [msg, setMsg] = useState('');
  const enviar = (ev) => {
    ev.preventDefault();
    const numeros = ag.whatsapp.replace(/\D/g, '');
    if (ag.nome.trim().length < 2) return setMsg('Informe seu nome.');
    if (![10, 11, 12, 13].includes(numeros.length)) return setMsg('Informe um WhatsApp válido, com DDD.');
    if (ag.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ag.email.trim())) return setMsg('Confira o e-mail (ou deixe em branco).');
    ir(+1);
  };
  const campo = (nome) => ({ value: ag[nome], onChange: (e) => mudar({ [nome]: e.target.value }) });
  return (
    <form className="cartao" id="form-dados" noValidate onSubmit={enviar}>
      {cabecalho('Seus dados')}
      <label htmlFor="nome">Nome</label>
      <input id="nome" autoComplete="name" maxLength={80} required {...campo('nome')} />
      <label htmlFor="whatsapp">WhatsApp <span className="dica">Com DDD. É por ele que a Lucy fala com você.</span></label>
      <input id="whatsapp" type="tel" inputMode="tel" autoComplete="tel" placeholder="(00) 00000-0000" required {...campo('whatsapp')} />
      <label htmlFor="email">E-mail <span className="dica">Opcional.</span></label>
      <input id="email" type="email" inputMode="email" autoComplete="email" maxLength={120} {...campo('email')} />
      <label htmlFor="necessidades">Alguma necessidade específica?
        <span className="dica">Opcional. Por exemplo: acessibilidade ou mobilidade reduzida, sensibilidade a cheiros ou barulho,
          gestação, alergias. Conte o que for importante para a Lucy te receber bem.</span></label>
      <textarea id="necessidades" maxLength={500} {...campo('necessidades')} />
      <label htmlFor="observacao">Quer deixar algum recado? <span className="dica">Opcional.</span></label>
      <textarea id="observacao" maxLength={500} {...campo('observacao')} />
      {salao.remy && <CampoRemy prefixo="pd" valor={ag.remy} onChange={(remy) => mudar({ remy })} />}
      <p className="suave">Seus dados ficam só com a Lucy e são usados apenas para o seu atendimento.</p>
      <p className="mensagem erro" role="alert">{msg}</p>
      <div className="acoes">
        <button type="button" className="secundario" onClick={() => ir(-1)}>Voltar</button>
        <button type="submit">Continuar</button>
      </div>
    </form>
  );
}

// Passo 4: conferir e enviar
function PassoRevisar({ ag, mudar, ir, salao, lista, total, cabecalho }) {
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState(null);
  const remyLonge = salao.remy && ag.remy.marcado;

  const enviar = async () => {
    setEnviando(true); setErro(null);
    try {
      let p;
      if (ag.remarcar) {
        p = await api(`/api/publico/pedidos/${encodeURIComponent(ag.remarcar)}`, {
          metodo: 'PATCH', corpo: { inicio: ag.inicio, servicos: [...ag.servicos] } });
      } else {
        p = await api('/api/publico/pedidos', { metodo: 'POST', corpo: {
          nome: ag.nome.trim(), whatsapp: ag.whatsapp.trim(), email: ag.email.trim(),
          necessidades: ag.necessidades.trim(), observacao: ag.observacao.trim(),
          servicos: [...ag.servicos], inicio: ag.inicio, retorno_de: ag.retornoDe ?? null,
          sem_remy: Boolean(remyLonge), motivo_remy: remyLonge ? ag.remy.motivo : null,
        } });
        guardado.salvar('lucy.cliente', { nome: ag.nome.trim(), whatsapp: ag.whatsapp.trim(), email: ag.email.trim() });
        if (salao.remy) { if (remyLonge) semRemy.salvar(ag.remy.motivo); else semRemy.apagar(); }
      }
      meusPedidos.adicionar(p.token);
      location.hash = `#/pedido/${p.token}?${ag.remarcar ? 'remarcado' : 'novo'}=1`;
    } catch (e) {
      setErro(e); setEnviando(false);
    }
  };

  return (
    <div className="cartao">
      {cabecalho(ag.remarcar ? 'Confira o novo horário' : 'Confira seu pedido')}
      <p className="quando">{fmt.dataLonga(ag.inicio)}</p>
      <p className="suave">Às {fmt.hora(ag.inicio)}</p>
      <ul className="itens">
        {lista.map((s) => <li key={s.id}><span>{s.nome}</span><span>{fmt.reais(s.preco)}</span></li>)}
        <li className="total">
          <span>Total <span className="suave" style={{ fontWeight: 400 }}>(lavagem inclusa)</span></span>
          <span>{fmt.reais(total)}</span>
        </li>
      </ul>
      {!ag.remarcar && (
        <>
          <p className="suave" style={{ marginTop: '1rem' }}>{ag.nome} · {ag.whatsapp}{ag.email ? ' · ' + ag.email : ''}</p>
          {ag.necessidades && <p className="suave">Necessidades: {ag.necessidades}</p>}
          {ag.observacao && <p className="suave">Recado: {ag.observacao}</p>}
          {remyLonge && <p className="suave">O Remy fica longe ({MOTIVO_REMY_TXT[ag.remy.motivo]}).</p>}
        </>
      )}
      <p className="mensagem atencao">Este é um <strong>pedido</strong>. A Lucy vai confirmar o horário com você.
        O pagamento é feito no salão (Pix, cartão ou dinheiro).</p>
      {erro && (
        <div className="mensagem erro" role="alert">
          {erro.message}
          {erro.status === 409 && (  // horário ocupado nesse meio-tempo: volta para escolher outro
            <button className="secundario botao-largo" onClick={() => { mudar({ passo: 2, inicio: null }); window.scrollTo({ top: 0 }); }}>
              Escolher outro horário
            </button>
          )}
        </div>
      )}
      <div className="acoes">
        <button className="secundario" onClick={() => ir(-1)}>Voltar</button>
        <button id="enviar" disabled={enviando} onClick={enviar}>
          {enviando ? 'Enviando…' : ag.remarcar ? 'Remarcar' : 'Enviar pedido'}
        </button>
      </div>
    </div>
  );
}

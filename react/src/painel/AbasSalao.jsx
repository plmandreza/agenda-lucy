// ABAS: Salão (configurações), Relatórios, Retornos e Avaliações
import { useState } from 'react';
import { esquecerSalao } from '../api.js';
import { fmt, somarDias, dataNoFuso, zapCom, ICONE_ZAP, FORMAS_TXT, baixarArquivo } from '../ferramentas.js';
import { usePainel, useCarregar, painelApi, hojeNoSalao, linkZapCliente, zapBonito, STATUS, ErroDaAba } from './comum.jsx';
import { FormCampos } from './Formularios.jsx';

// --- SALÃO
const CAMPOS_SALAO = [
  ['Dados do salão', [
    { nome: 'nome_salao', rotulo: 'Nome do salão', obrigatorio: true, max: 80 },
    { nome: 'endereco', rotulo: 'Endereço', max: 200 },
    { nome: 'whatsapp_lucy', rotulo: 'WhatsApp do salão', tipo: 'tel' },
    { nome: 'email_lucy', rotulo: 'E-mail', tipo: 'email', max: 120 },
  ]],
  ['Pix', [
    { nome: 'chave_pix', rotulo: 'Chave Pix', max: 120, dica: 'E-mail, celular com DDD entre parênteses — ex.: (85) 90000-0000 —, CPF, CNPJ ou chave aleatória. O sistema ajusta para o formato do banco.' },
    { nome: 'nome_recebedor_pix', rotulo: 'Nome no Pix', max: 25, dica: 'Até 25 letras, sem acento.' },
    { nome: 'cidade_pix', rotulo: 'Cidade no Pix', max: 15, dica: 'Até 15 letras, sem acento.' },
  ]],
  ['Agenda', [
    { nome: 'intervalo_agenda_min', rotulo: 'Horários aparecem a cada (minutos)', tipo: 'numero', min: 10, maxNum: 120 },
    { nome: 'antecedencia_min_horas', rotulo: 'Antecedência mínima para pedir (horas)', tipo: 'numero', min: 0 },
    { nome: 'antecedencia_cancelamento_horas', rotulo: 'Antecedência para cancelar (horas)', tipo: 'numero', min: 0, dica: '0 = pode cancelar até a hora marcada.' },
    { nome: 'dias_a_frente', rotulo: 'Até quantos dias no futuro dá para pedir', tipo: 'numero', min: 1, maxNum: 180 },
    { nome: 'retorno_momento', rotulo: 'Quando oferecer o retorno', tipo: 'select',
      opcoes: [['ao_finalizar', 'Ao finalizar o serviço'], ['apos_pagamento', 'Depois do pagamento']] },
  ]],
  ['O Remy (o gato do salão)', [
    { nome: 'remy_ligado', rotulo: 'Mostrar o Remy no site', tipo: 'check',
      dica: 'Desligado: o site não fala do Remy nem pergunta se a cliente prefere ele longe.' },
  ]],
  ['Catálogos (aparecem na página inicial para as clientes)', [
    { nome: 'codigo_avon', rotulo: 'Código de consultora Avon', max: 40 }, { nome: 'link_avon', rotulo: 'Link do catálogo Avon', max: 300, dica: 'Comece com https://' },
    { nome: 'codigo_natura', rotulo: 'Código de consultora Natura', max: 40 }, { nome: 'link_natura', rotulo: 'Link do catálogo Natura', max: 300, dica: 'Comece com https://' },
    { nome: 'codigo_hinode', rotulo: 'Código de consultora Hinode', max: 40 }, { nome: 'link_hinode', rotulo: 'Link do catálogo Hinode', max: 300, dica: 'Comece com https://' },
  ]],
];

export function AbaSalao() {
  const { avisar, setCfg } = usePainel();
  const { dados: cfg, erro } = useCarregar(() => painelApi('/configuracoes'), []);
  if (erro) return <ErroDaAba erro={erro} />;
  if (!cfg) return <p className="carregando">Carregando…</p>;
  // Um formulário só, com um título por grupo de campos
  const campos = CAMPOS_SALAO.flatMap(([titulo, cs]) => cs.map((c, i) => (i === 0 ? { ...c, grupo: titulo } : c)));
  return (
    <div id="form-salao">
      <FormCampos campos={campos} dados={cfg} prefixo="sa" textoBotao="Salvar"
        salvar={async (dados) => {
          setCfg(await painelApi('/configuracoes', { metodo: 'PATCH', corpo: dados }));
          esquecerSalao(); avisar('Dados do salão salvos.');
        }} />
    </div>
  );
}

// --- RELATÓRIOS
const dataCurta = (d) => d.split('-').reverse().join('/');
export function AbaRelatorios({ params }) {
  const { cfg } = usePainel();
  const hoje = hojeNoSalao();
  const inicioMes = (d) => `${d.slice(0, 7)}-01`;
  const segunda = somarDias(hoje, -((new Date(`${hoje}T12:00:00Z`).getUTCDay() + 6) % 7));
  const mesPassado = somarDias(inicioMes(hoje), -1);
  const atalhos = [
    ['Esta semana', segunda, hoje], ['Este mês', inicioMes(hoje), hoje],
    ['Mês passado', inicioMes(mesPassado), mesPassado], ['Este ano', `${hoje.slice(0, 4)}-01-01`, hoje],
  ];
  const de = params.get('de') ?? inicioMes(hoje), ate = params.get('ate') ?? hoje;
  const { dados: r, erro } = useCarregar(() => painelApi(`/relatorio?de=${encodeURIComponent(de)}&ate=${encodeURIComponent(ate)}`), [de, ate]);
  const [periodo, setPeriodo] = useState({ de, ate });

  if (erro) return <ErroDaAba erro={erro} />;
  if (!r) return <p className="carregando">Carregando…</p>;
  const periodoTxt = `${dataCurta(r.de)} a ${dataCurta(r.ate)}`;
  const at = r.atendimentos, din = r.dinheiro;
  const Numero = ({ valor, rotulo, extra }) => <div className="numero"><strong>{valor}</strong><span>{rotulo}</span>{extra && <small>{extra}</small>}</div>;
  const s = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

  const baixarPlanilha = () => {
    // CSV com ";" e BOM: o Excel em português abre direto, com acentos certos
    const cel = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const linhas = [['Data', 'Hora', 'Cliente', 'WhatsApp', 'Serviços', 'Valor', 'Situação', 'Pago', 'Forma', 'Nota']]
      .concat(r.linhas.map((l) => [
        dataCurta(dataNoFuso(l.inicio)), fmt.hora(l.inicio), l.cliente, zapBonito(l.whatsapp),
        l.servicos, l.valor.toFixed(2).replace('.', ','), STATUS[l.status] ?? l.status,
        l.pago ? 'sim' : 'não', l.forma_pagamento ? FORMAS_TXT[l.forma_pagamento] : '', l.nota ?? '']));
    baixarArquivo('﻿' + linhas.map((l) => l.map(cel).join(';')).join('\r\n'), `relatorio-lucy-${r.de}-a-${r.ate}.csv`, 'text/csv;charset=utf-8');
  };
  const resumo = [
    `📊 Resumo do salão — ${periodoTxt}`,
    `Recebido: ${fmt.reais(din.recebido)} (Pix ${fmt.reais(din.por_forma.pix)}, cartão ${fmt.reais(din.por_forma.cartao)}, dinheiro ${fmt.reais(din.por_forma.dinheiro)})`,
    din.a_receber ? `A receber: ${fmt.reais(din.a_receber)}` : '',
    `Atendimentos: ${at.concluidos} · faltas: ${at.faltas} · cancelados: ${at.cancelados}`,
    `Clientes novas: ${r.clientes_novas}`,
    r.servicos.length ? `Mais feitos: ${r.servicos.slice(0, 3).map((x) => `${x.nome} (${x.quantidade})`).join(', ')}` : '',
    r.avaliacoes.quantidade ? `Avaliações: ${String(r.avaliacoes.media).replace('.', ',')} ★ (${r.avaliacoes.quantidade})` : '',
  ].filter(Boolean).join('\n');
  const media = Math.round(r.avaliacoes.media ?? 0);

  return (
    <>
      <h2>Relatórios</h2>
      <div className="acoes-item" role="group" aria-label="Período">
        {atalhos.map(([t, d1, d2]) => (
          <a key={t} className={`botao pequeno ${d1 === r.de && d2 === r.ate ? '' : 'secundario'}`} href={`#/painel/relatorios?de=${d1}&ate=${d2}`}>{t}</a>
        ))}
      </div>
      <form className="periodo" id="form-periodo" onSubmit={(ev) => {
        ev.preventDefault();
        if (periodo.de && periodo.ate) location.hash = `#/painel/relatorios?de=${periodo.de}&ate=${periodo.ate}`;
      }}>
        <label>De <input type="date" name="de" value={periodo.de} max={hoje} onChange={(e) => setPeriodo({ ...periodo, de: e.target.value })} /></label>
        <label>Até <input type="date" name="ate" value={periodo.ate} onChange={(e) => setPeriodo({ ...periodo, ate: e.target.value })} /></label>
        <button className="pequeno">Ver</button>
      </form>
      <p className="suave">Período: <strong>{periodoTxt}</strong> (pelo dia do atendimento).</p>

      <div className="cartao">
        <h3>Dinheiro</h3>
        <div className="numeros">
          <Numero valor={fmt.reais(din.recebido)} rotulo="recebido" />
          <Numero valor={fmt.reais(din.a_receber)} rotulo="a receber" extra={din.a_receber_qtd ? `${s(din.a_receber_qtd, 'atendimento', 'atendimentos')} sem pagamento` : null} />
          <Numero valor={fmt.reais(din.previsto)} rotulo="previsto" extra="horários confirmados" />
        </div>
        <ul className="itens">
          {[['pix', 'Pix'], ['cartao', 'Cartão'], ['dinheiro', 'Dinheiro']].map(([f, t]) => <li key={f}><span>{t}</span><span>{fmt.reais(din.por_forma[f])}</span></li>)}
        </ul>
      </div>

      <div className="cartao">
        <h3>Atendimentos</h3>
        <div className="numeros">
          <Numero valor={at.concluidos} rotulo="realizados" /><Numero valor={at.faltas} rotulo="faltas" />
          <Numero valor={at.cancelados} rotulo="cancelados" /><Numero valor={r.clientes_novas} rotulo="clientes novas" />
        </div>
        <p className="suave" style={{ margin: 0 }}>Ainda no período: {s(at.confirmados, 'confirmado', 'confirmados')} e {s(at.pedidos, 'pedido', 'pedidos')} esperando resposta.
          {at.recusados ? ` ${s(at.recusados, 'recusado', 'recusados')}.` : ''} Pelo site: {at.pelo_site}.</p>
      </div>

      <div className="cartao">
        <h3>Serviços mais feitos</h3>
        {r.servicos.length ? (
          <ul className="itens">{r.servicos.map((x) => <li key={x.nome}><span>{x.nome} <span className="suave">× {x.quantidade}</span></span><span>{fmt.reais(x.valor)}</span></li>)}</ul>
        ) : <p className="suave" style={{ margin: 0 }}>Nenhum atendimento realizado no período.</p>}
      </div>

      <div className="cartao">
        <h3>Clientes que mais vieram</h3>
        {r.clientes.length ? (
          <ol className="ranking">{r.clientes.map((x) => (
            <li key={x.id}><a href={`#/painel/clientes/${x.id}`}>{x.nome}</a> <span className="suave">· {s(x.visitas, 'visita', 'visitas')} · {fmt.reais(x.valor)}</span></li>
          ))}</ol>
        ) : <p className="suave" style={{ margin: 0 }}>Nenhum atendimento realizado no período.</p>}
      </div>

      <div className="cartao">
        <h3>Avaliações</h3>
        {r.avaliacoes.quantidade ? (
          <p style={{ margin: 0 }}><span className="estrelas">{'★'.repeat(media)}{'☆'.repeat(5 - media)}</span>{' '}
            <strong>{String(r.avaliacoes.media).replace('.', ',')}</strong> de média em {r.avaliacoes.quantidade} avaliaç{r.avaliacoes.quantidade > 1 ? 'ões' : 'ão'}.{' '}
            <a href="#/painel/avaliacoes">Ver todas</a></p>
        ) : <p className="suave" style={{ margin: 0 }}>Nenhuma avaliação no período.</p>}
      </div>

      <div className="lista-links">
        <button className="secundario" id="baixar-csv" disabled={!r.linhas.length} onClick={baixarPlanilha}>Baixar planilha (abre no Excel)</button>
        {cfg?.whatsapp_lucy && (
          <a className="botao secundario" target="_blank" rel="noopener" id="resumo-zap" href={zapCom(cfg.whatsapp_lucy, resumo)}>{ICONE_ZAP} Mandar o resumo para o meu WhatsApp</a>
        )}
      </div>
    </>
  );
}

// --- RETORNOS (só a Lucy vê; avisar a cliente é opcional)
export function AbaRetornos() {
  const { cfg } = usePainel();
  const { dados: lista, erro } = useCarregar(() => painelApi('/retornos'), []);
  if (erro) return <ErroDaAba erro={erro} />;
  if (!lista) return <p className="carregando">Carregando…</p>;
  const hoje = hojeNoSalao();
  return (
    <>
      <h2>Retornos</h2>
      <p className="suave">Clientes que costumam voltar nesta época (até 14 dias) e ainda não têm horário marcado.
        Só você vê esta lista. Avisar a cliente é opcional.</p>
      {lista.length ? lista.map((r) => {
        const zap = linkZapCliente({ cliente: r.cliente, servicos: r.servicos.map((nome) => ({ nome })) }, 'retorno', {}, cfg);
        const q = new URLSearchParams({ dia: r.retorno_previsto > hoje ? r.retorno_previsto : hoje, cliente: r.cliente.id, servicos: r.servico_ids.join(','), retorno_de: r.agendamento_id });
        const quando = r.faltam_dias < 0 ? `atrasado ${-r.faltam_dias} dia${r.faltam_dias === -1 ? '' : 's'}`
          : r.faltam_dias === 0 ? 'é hoje' : `em ${r.faltam_dias} dia${r.faltam_dias === 1 ? '' : 's'}`;
        return (
          <div className="cartao item" key={r.agendamento_id}>
            <div className="linha-titulo">
              <p className="quando" style={{ margin: 0 }}><a href={`#/painel/clientes/${r.cliente.id}`}>{r.cliente.nome}</a></p>
              <span className={`selo ${r.faltam_dias < 0 ? 'atrasado' : 'solicitado'}`}>{quando}</span>
            </div>
            <p className="suave" style={{ margin: '.35rem 0 0' }}>Último atendimento: {fmt.dataLonga(r.ultimo_atendimento)} · {r.servicos.join(' + ')}</p>
            <p className="suave" style={{ margin: 0 }}>Retorno previsto: {fmt.partesDoDia(r.retorno_previsto).longa}</p>
            <div className="acoes-item">
              <a className="botao pequeno" href={`#/painel/agenda/novo?${q}`}>Marcar horário</a>
              {zap && <a className="botao secundario pequeno" target="_blank" rel="noopener" href={zap}>{ICONE_ZAP} Lembrar no WhatsApp</a>}
            </div>
          </div>
        );
      }) : <p className="cartao suave">Nenhum retorno chegando nos próximos 14 dias.</p>}
      <p className="suave">O tempo de retorno de cada serviço se ajusta na aba <a href="#/painel/servicos">Serviços</a>.</p>
    </>
  );
}

// --- AVALIAÇÕES (ver e excluir)
export function AbaAvaliacoes() {
  const { avisar, perguntar, sessaoVencida } = usePainel();
  const [versao, setVersao] = useState(0);
  const { dados: lista, erro } = useCarregar(() => painelApi('/avaliacoes'), [versao]);
  if (erro) return <ErroDaAba erro={erro} />;
  if (!lista) return <p className="carregando">Carregando…</p>;
  const excluir = async (a) => {
    if (!await perguntar('Excluir esta avaliação?')) return;
    try { await painelApi(`/avaliacoes/${a.id}`, { metodo: 'DELETE' }); avisar('Avaliação excluída.'); setVersao((v) => v + 1); }
    catch (e) { if (e.status === 401) return sessaoVencida(); avisar(e.message, 'erro'); }
  };
  return (
    <>
      <h2>Avaliações ({lista.length})</h2>
      {lista.length ? lista.map((a) => (
        <div className="cartao item" key={a.id}>
          <p className="estrelas" aria-label={`${a.nota} de 5 estrelas`}>{'★'.repeat(a.nota)}{'☆'.repeat(5 - a.nota)}</p>
          {a.comentario && <p>{a.comentario}</p>}
          <p className="suave" style={{ margin: 0 }}>{a.cliente_nome ?? 'Cliente'}{a.atendimento_em ? ' · atendimento de ' + fmt.dataLonga(a.atendimento_em) : ''}</p>
          <div className="acoes-item"><button className="perigo pequeno" onClick={() => excluir(a)}>Excluir</button></div>
        </div>
      )) : <p className="cartao suave">Ainda não há avaliações. Elas chegam depois dos atendimentos.</p>}
    </>
  );
}

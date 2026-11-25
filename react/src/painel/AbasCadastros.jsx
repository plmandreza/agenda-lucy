// ABAS de cadastro: Serviços, Horários (semana + dias especiais) e Promoções
import { useState } from 'react';
import { esquecerSalao } from '../api.js';
import { fmt, NOMES_DIAS, ICONE_ZAP } from '../ferramentas.js';
import { usePainel, useCarregar, painelApi, hojeNoSalao, linkZapCliente, ErroDaAba } from './comum.jsx';
import { GerenciarLista } from './Formularios.jsx';
import { BotaoCopiar } from '../componentes/Comuns.jsx';

// --- SERVIÇOS
export function AbaServicos() {
  const { avisar } = usePainel();
  return (
    <GerenciarLista op={{
      titulo: 'Serviços', rota: 'servicos', novo: 'Novo serviço', nomeDe: (s) => s.nome, depoisDeSalvar: esquecerSalao,
      intro: <p className="suave">Serviço já usado em atendimentos não é apagado: ele é desativado, para não estragar o histórico.</p>,
      campos: [
        { nome: 'nome', rotulo: 'Nome', obrigatorio: true, max: 80 },
        { nome: 'descricao', rotulo: 'Descrição', max: 200, dica: 'Ex.: Para cabelos curtos e médios' },
        { nome: 'duracao_min', rotulo: 'Duração (minutos)', tipo: 'numero', obrigatorio: true, min: 5, maxNum: 600,
          dica: 'Só você vê. Serve para o sistema avisar quando dois horários se cruzam.' },
        { nome: 'preco', rotulo: 'Preço (R$)', tipo: 'dinheiro', obrigatorio: true },
        { nome: 'retorno_dias', rotulo: 'A cliente costuma voltar a cada (dias)', tipo: 'numero', min: 1, dica: 'Deixe vazio se não quiser acompanhar o retorno.' },
        { nome: 'ordem', rotulo: 'Ordem na lista', tipo: 'numero', min: 0 },
        { nome: 'ativo', rotulo: 'Aparece para as clientes', tipo: 'check', padrao: true },
      ],
      resumo: (s) => (
        <>
          <p className="quando">{s.nome} {!s.ativo && <span className="selo cancelado">Desativado</span>}</p>
          <p className="suave" style={{ margin: 0 }}>{fmt.duracao(s.duracao_min)} · <strong>{fmt.reais(s.preco)}</strong>
            {s.retorno_dias ? ` · volta a cada ${s.retorno_dias} dias` : ''}{s.descricao ? ` · ${s.descricao}` : ''}</p>
        </>
      ),
      extras: (s, { tentar }) => (
        <button className="secundario pequeno" onClick={() => tentar(async () => {
          await painelApi(`/servicos/${s.id}`, { metodo: 'PATCH', corpo: { ativo: !s.ativo } });
          esquecerSalao(); avisar(s.ativo ? 'Serviço desativado.' : 'Serviço ativado.');
        })}>{s.ativo ? 'Desativar' : 'Ativar'}</button>
      ),
    }} />
  );
}

// --- PROMOÇÕES
export function AbaPromocoes() {
  const { avisar } = usePainel();
  return (
    <GerenciarLista op={{
      titulo: 'Promoções', rota: 'promocoes', novo: 'Nova promoção', nomeDe: (p) => p.titulo, depoisDeSalvar: esquecerSalao,
      intro: <p className="suave">Só as promoções <strong>ligadas</strong> aparecem na página das clientes.</p>,
      campos: [
        { nome: 'titulo', rotulo: 'Título', obrigatorio: true, max: 80 },
        { nome: 'descricao', rotulo: 'Descrição', tipo: 'area', max: 400 },
        { nome: 'valida_ate', rotulo: 'Válida até', tipo: 'data' },
        { nome: 'ativa', rotulo: 'Ligada (aparece para as clientes)', tipo: 'check' },
      ],
      resumo: (p) => (
        <>
          <p className="quando">{p.titulo} <span className={`selo ${p.ativa ? 'agendado' : 'cancelado'}`}>{p.ativa ? 'Ligada' : 'Desligada'}</span></p>
          {p.descricao && <p className="suave" style={{ margin: 0 }}>{p.descricao}</p>}
          {p.valida_ate && <p className="suave" style={{ margin: 0 }}>Até {fmt.partesDoDia(p.valida_ate).longa}</p>}
        </>
      ),
      extras: (p, { tentar }) => (
        <button className={`pequeno ${p.ativa ? 'secundario' : ''}`} onClick={() => tentar(async () => {
          await painelApi(`/promocoes/${p.id}`, { metodo: 'PATCH', corpo: { ativa: !p.ativa } });
          esquecerSalao(); avisar(p.ativa ? 'Promoção desligada.' : 'Promoção ligada!');
        })}>{p.ativa ? 'Desligar' : 'Ligar'}</button>
      ),
    }} />
  );
}

// --- HORÁRIOS (semana + dias especiais)
export function AbaHorarios() {
  const { cfg, avisar, janela } = usePainel();
  const { dados: semana, erro } = useCarregar(() => painelApi('/horarios'), []);

  // Avisar as clientes de um dia especial (folga ou horário diferente)
  const avisarClientes = async (d) => {
    const ags = (await painelApi(`/agendamentos?de=${d.data}&ate=${d.data}`)).filter((a) => ['solicitado', 'agendado'].includes(a.status));
    const tipo = d.tipo === 'fechado' ? 'folga' : 'especial';
    const extra = { motivo: d.motivo, abre: d.abre && fmt.horaCurta(d.abre.slice(0, 5)), fecha: d.fecha && fmt.horaCurta(d.fecha.slice(0, 5)) };
    const geral = `📣 Aviso do salão ${cfg?.nome_salao ?? ''}: no dia ${fmt.partesDoDia(d.data).longa} ` +
      (d.tipo === 'fechado' ? 'não vou atender' : `vou atender das ${extra.abre} às ${extra.fecha}`) + (d.motivo ? ` (${d.motivo})` : '') + '. Obrigada! 💜';
    janela(`Avisar sobre ${fmt.partesDoDia(d.data).longa}`, (
      <>
        {ags.length ? (
          <>
            <p className="suave">Clientes com horário nesse dia. Toque em cada nome: o WhatsApp abre com a mensagem pronta.</p>
            <div className="lista-links">
              {ags.map((a) => linkZapCliente(a, tipo, extra, cfg) && (
                <a key={a.id} className="botao secundario" target="_blank" rel="noopener" href={linkZapCliente(a, tipo, extra, cfg)}>
                  {ICONE_ZAP} {a.cliente?.nome} · {fmt.hora(a.inicio)}</a>
              ))}
            </div>
          </>
        ) : <p className="suave">Ninguém tem horário marcado nesse dia.</p>}
        <p className="suave" style={{ marginTop: '1rem' }}>Aviso geral, para colar na sua lista de transmissão ou no status do WhatsApp:</p>
        <p className="cartao" style={{ whiteSpace: 'pre-line', marginBottom: '.5rem' }}>{geral}</p>
        <BotaoCopiar texto={geral} rotulo="Copiar aviso geral" className="pequeno" />
      </>
    ));
  };

  if (erro) return <ErroDaAba erro={erro} />;
  if (!semana) return <p className="carregando">Carregando…</p>;
  return (
    <>
      <FormSemana semana={semana} avisar={avisar} />
      <GerenciarLista op={{
        titulo: 'Feriados, folgas e dias diferentes', rota: 'dias-especiais', novo: 'Novo dia', depoisDeSalvar: esquecerSalao,
        nomeDe: (d) => fmt.partesDoDia(d.data).longa, vazio: 'Nenhum dia especial cadastrado.',
        campos: [
          { nome: 'data', rotulo: 'Data', tipo: 'data', obrigatorio: true },
          { nome: 'tipo', rotulo: 'Neste dia', tipo: 'select', opcoes: [['fechado', 'Não vou trabalhar'], ['horario_especial', 'Vou trabalhar em horário diferente']], padrao: 'fechado' },
          { nome: 'abre', rotulo: 'Abre', tipo: 'hora', dica: 'Só se for horário diferente.' },
          { nome: 'fecha', rotulo: 'Fecha', tipo: 'hora', dica: 'Só se for horário diferente.' },
          { nome: 'motivo', rotulo: 'Motivo', max: 120, dica: 'Ex.: Feriado de Natal, consulta médica' },
        ],
        resumo: (d) => (
          <>
            <p className="quando">{fmt.partesDoDia(d.data).longa}</p>
            <p className="suave" style={{ margin: 0 }}>
              {d.tipo === 'fechado' ? 'Fechado' : `Das ${fmt.horaCurta(d.abre.slice(0, 5))} às ${fmt.horaCurta(d.fecha.slice(0, 5))}`}
              {d.motivo ? ' · ' + d.motivo : ''}{d.data < hojeNoSalao() ? ' · já passou' : ''}
            </p>
          </>
        ),
        extras: (d, { tentar }) => d.data >= hojeNoSalao() && (
          <button className="pequeno" onClick={() => tentar(() => avisarClientes(d))}>Avisar clientes</button>
        ),
      }} />
    </>
  );
}

function FormSemana({ semana, avisar }) {
  const { sessaoVencida } = usePainel();
  const [dias, setDias] = useState(() => semana.map((d) => ({
    dia_semana: d.dia_semana, trabalha: d.trabalha,
    abre: (d.abre ?? '').slice(0, 5), fecha: (d.fecha ?? '').slice(0, 5),
    pausa_inicio: (d.pausa_inicio ?? '').slice(0, 5), pausa_fim: (d.pausa_fim ?? '').slice(0, 5),
  })));
  const [msg, setMsg] = useState('');
  const [salvando, setSalvando] = useState(false);
  const mudar = (i, campo, valor) => setDias((ds) => ds.map((d, j) => (j === i ? { ...d, [campo]: valor } : d)));
  const salvar = async (ev) => {
    ev.preventDefault();
    setSalvando(true); setMsg('');
    try {
      await painelApi('/horarios', { metodo: 'PUT', corpo: dias.map(({ dia_semana, ...resto }) => resto) });
      esquecerSalao(); avisar('Horários salvos.');
    } catch (e) { if (e.status === 401) return sessaoVencida(); setMsg(e.message); }
    setSalvando(false);
  };
  const hora = (i, campo, rotulo) => (
    <label>{rotulo}<input type="time" name={campo} value={dias[i][campo]} disabled={!dias[i].trabalha} onChange={(e) => mudar(i, campo, e.target.value)} /></label>
  );
  return (
    <form className="cartao" id="form-semana" noValidate onSubmit={salvar}>
      <h2>Horário da semana</h2>
      <p className="suave">É a faixa em que as clientes podem pedir horário. Você sempre confirma ou recusa.</p>
      {dias.map((d, i) => (
        <fieldset className={`dia-semana ${d.trabalha ? '' : 'fechado'}`} key={d.dia_semana}>
          <legend><label className="opcao-inline">
            <input type="checkbox" name="trabalha" checked={d.trabalha} onChange={(e) => mudar(i, 'trabalha', e.target.checked)} /> {NOMES_DIAS[d.dia_semana]}
          </label></legend>
          <div className="quatro-colunas">
            {hora(i, 'abre', 'Abre')}{hora(i, 'fecha', 'Fecha')}{hora(i, 'pausa_inicio', 'Pausa de')}{hora(i, 'pausa_fim', 'até')}
          </div>
        </fieldset>
      ))}
      <p className="mensagem erro msg-form" role="alert">{msg}</p>
      <button type="submit" className="botao-largo" disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar horários'}</button>
    </form>
  );
}

// ABA AGENDA: um dia por vez, com "+ Marcar horário" e a agenda da semana pelo WhatsApp
import { useState } from 'react';
import { fmt, somarDias, dataNoFuso, servicosTexto, zapCom, ICONE_ZAP } from '../ferramentas.js';
import { usePainel, useCarregar, painelApi, hojeNoSalao, ErroDaAba } from './comum.jsx';
import { CartaoAgendamento, FormularioAgendamento } from './Agendamentos.jsx';

export default function AbaAgenda({ resto, params }) {
  const { cfg } = usePainel();
  const hoje = hojeNoSalao();
  const dia = /^\d{4}-\d{2}-\d{2}$/.test(params.get('dia') ?? '') ? params.get('dia') : hoje;
  // "novo" no endereço (ex.: vindo de "Agendar retorno") já abre o formulário preenchido
  const [novo, setNovo] = useState(() => (resto[0] === 'novo' ? {
    dia, cliente: params.get('cliente'), retorno_de: params.get('retorno_de'),
    servicos: (params.get('servicos') ?? '').split(',').filter(Boolean),
  } : null));
  const [versao, setVersao] = useState(0);
  const { dados, erro } = useCarregar(() => Promise.all([
    painelApi(`/agendamentos?de=${dia}&ate=${dia}`),
    painelApi(`/agendamentos?de=${hoje}&ate=${somarDias(hoje, 6)}&status=agendado`),
  ]), [dia, versao]);

  const irPara = (d) => { location.hash = `#/painel/agenda?dia=${d}`; };
  const recarregar = (d = dia) => (d === dia ? setVersao((v) => v + 1) : irPara(d));

  if (erro) return <ErroDaAba erro={erro} />;
  if (!dados) return <p className="carregando">Carregando…</p>;
  const [lista, semana] = dados;

  // Texto da agenda da semana para mandar para o próprio WhatsApp
  const porDia = {};
  semana.forEach((a) => { (porDia[dataNoFuso(a.inicio)] ??= []).push(a); });
  const textoSemana = `📅 Agenda da semana — ${cfg?.nome_salao ?? 'Lucy Cabeleireira'}\n\n` + (Object.keys(porDia).length
    ? Object.entries(porDia).map(([d, itens]) => `*${fmt.partesDoDia(d).longa}*\n` + itens.map((a) =>
      `• ${fmt.hora(a.inicio)}–${fmt.hora(a.fim)} · ${a.cliente?.nome} · ${servicosTexto(a)}`).join('\n')).join('\n\n')
    : 'Nenhum horário confirmado nos próximos 7 dias.');
  const linkSemana = cfg?.whatsapp_lucy ? zapCom(cfg.whatsapp_lucy, textoSemana) : null;

  return (
    <>
      <div className="navegar-dia">
        <button className="secundario pequeno" aria-label="Dia anterior" onClick={() => irPara(somarDias(dia, -1))}>◀</button>
        <input type="date" id="dia" value={dia} aria-label="Escolher dia" onChange={(e) => e.target.value && irPara(e.target.value)} />
        <button className="secundario pequeno" aria-label="Próximo dia" onClick={() => irPara(somarDias(dia, 1))}>▶</button>
        {dia !== hoje && <button className="secundario pequeno" onClick={() => irPara(hoje)}>Hoje</button>}
      </div>
      <div className="linha-titulo">
        <h2>{fmt.partesDoDia(dia).longa}</h2>
        <button className="pequeno" id="marcar" onClick={() => setNovo({ dia })}>+ Marcar horário</button>
      </div>
      <p className="suave" style={{ marginTop: 0 }}>
        {linkSemana ? (
          <><a href={linkSemana} target="_blank" rel="noopener">{ICONE_ZAP} Mandar a agenda da semana para o meu WhatsApp</a> ({semana.length} horário{semana.length === 1 ? '' : 's'})</>
        ) : <>Para receber a agenda da semana no seu WhatsApp, preencha o WhatsApp do salão na aba <a href="#/painel/salao">Salão</a>.</>}
      </p>
      <div id="form-novo">
        {novo && <FormularioAgendamento key={JSON.stringify(novo)} padroes={novo} fechar={() => setNovo(null)} depois={recarregar} />}
      </div>
      {lista.length
        ? lista.map((a) => <CartaoAgendamento key={a.id} a={a} depois={recarregar} />)
        : <p className="cartao suave">Nenhum horário neste dia.</p>}
    </>
  );
}

// ABA CLIENTES: lista com busca, nova cliente e a FICHA (dados, histórico de atendimentos e horários)
import { useState } from 'react';
import { fmt, MOTIVOS_REMY, MOTIVO_REMY_TXT } from '../ferramentas.js';
import { usePainel, useCarregar, painelApi, hojeNoSalao, linkZap, zapBonito, ErroDaAba } from './comum.jsx';
import { FormCampos } from './Formularios.jsx';
import { CartaoAgendamento } from './Agendamentos.jsx';

const CAMPOS_CLIENTE = [
  { nome: 'nome', rotulo: 'Nome', obrigatorio: true, max: 80 },
  { nome: 'whatsapp', rotulo: 'WhatsApp', tipo: 'tel', obrigatorio: true },
  { nome: 'email', rotulo: 'E-mail', tipo: 'email', max: 120 },
  { nome: 'data_nascimento', rotulo: 'Data de nascimento', tipo: 'data' },
  { nome: 'alergias', rotulo: 'Alergias', tipo: 'area', max: 500 },
  { nome: 'necessidades_especificas', rotulo: 'Necessidades específicas', tipo: 'area', max: 500, dica: 'Acessibilidade, mobilidade, sensibilidades, gestação…' },
  { nome: 'observacoes', rotulo: 'Anotações', tipo: 'area', max: 2000 },
  { nome: 'sem_remy', rotulo: 'Prefere o Remy longe', tipo: 'check' },
  { nome: 'motivo_sem_remy', rotulo: 'Motivo (Remy)', tipo: 'select', opcoes: [['', '—'], ...MOTIVOS_REMY] },
];
const CAMPOS_HISTORICO = [
  { nome: 'data', rotulo: 'Data', tipo: 'data', obrigatorio: true },
  { nome: 'servicos_realizados', rotulo: 'Serviços realizados', max: 300 },
  { nome: 'tintura_utilizada', rotulo: 'Tintura utilizada', max: 200, dica: 'Marca, cor, número, oxidante…' },
  { nome: 'tintura_quantidade', rotulo: 'Quantidade de tintura', max: 80, dica: 'Ex.: 1 tubo + 30 ml' },
  { nome: 'anotacoes', rotulo: 'Anotações', tipo: 'area', max: 2000 },
];

export default function AbaClientes({ resto }) {
  if (resto[0]) return <Ficha id={resto[0]} />;
  return <ListaClientes />;
}

function ListaClientes() {
  const { dados: todos, erro } = useCarregar(() => painelApi('/clientes'), []);
  const [busca, setBusca] = useState('');
  const [nova, setNova] = useState(false);
  if (erro) return <ErroDaAba erro={erro} />;
  if (!todos) return <p className="carregando">Carregando…</p>;
  const f = busca.toLowerCase(), n = busca.replace(/\D/g, '');
  const lista = todos.filter((c) => !f || c.nome.toLowerCase().includes(f) || (n.length >= 3 && c.whatsapp.includes(n)));
  return (
    <>
      <div className="linha-titulo"><h2>Clientes ({todos.length})</h2><button className="pequeno" id="nova" onClick={() => setNova(true)}>+ Nova cliente</button></div>
      {nova && (
        <FormCampos titulo="Nova cliente" campos={CAMPOS_CLIENTE} prefixo="cl" cancelar={() => setNova(false)}
          salvar={async (dados) => {
            const c = await painelApi('/clientes', { metodo: 'POST', corpo: dados });
            location.hash = `#/painel/clientes/${c.id}`;
          }} />
      )}
      <label htmlFor="busca" className="sr">Buscar cliente</label>
      <input id="busca" type="search" placeholder="Buscar por nome ou WhatsApp" autoComplete="off" value={busca} onChange={(e) => setBusca(e.target.value)} />
      <div id="lista-clientes" className="lista-simples">
        {lista.length ? lista.map((c) => (
          <a key={c.id} className="cartao item-link" href={`#/painel/clientes/${c.id}`}>
            <strong>{c.nome}</strong><span className="suave">{zapBonito(c.whatsapp)}</span>
          </a>
        )) : <p className="suave">{todos.length ? 'Ninguém encontrado.' : 'Nenhuma cliente cadastrada ainda.'}</p>}
      </div>
    </>
  );
}

function Ficha({ id }) {
  const { avisar, perguntar, sessaoVencida } = usePainel();
  const [versao, setVersao] = useState(0);
  const [editando, setEditando] = useState(false);
  const [hist, setHist] = useState(null);  // null, 'novo' ou a anotação sendo editada
  const { dados: cl, erro } = useCarregar(() => painelApi(`/clientes/${encodeURIComponent(id)}`), [id, versao]);
  const recarregar = () => setVersao((v) => v + 1);
  const tentar = async (fazer) => { try { await fazer(); } catch (e) { if (e.status === 401) return sessaoVencida(); avisar(e.message, 'erro'); } };

  if (erro) return <><a className="voltar" href="#/painel/clientes">← Voltar para clientes</a><ErroDaAba erro={erro} /></>;
  if (!cl) return <p className="carregando">Carregando…</p>;
  const linha = (rotulo, valor) => valor && <p><span className="suave">{rotulo}:</span> {valor}</p>;
  const formHist = (h) => (
    <FormCampos key={h?.id ?? 'novo'} titulo={h ? 'Editar atendimento' : 'Novo atendimento'} campos={CAMPOS_HISTORICO}
      dados={h ?? { data: hojeNoSalao() }} prefixo="hi" emCartao={!h} cancelar={() => setHist(null)}
      salvar={async (corpo) => {
        if (h) await painelApi(`/historico/${h.id}`, { metodo: 'PATCH', corpo });
        else await painelApi(`/clientes/${cl.id}/historico`, { metodo: 'POST', corpo });
        setHist(null); recarregar(); avisar(h ? 'Atendimento atualizado.' : 'Atendimento anotado.');
      }} />
  );

  return (
    <>
      <a className="voltar" href="#/painel/clientes">← Voltar para clientes</a>
      <div className="cartao" id="dados">
        {editando ? (
          <FormCampos titulo="Editar ficha" campos={CAMPOS_CLIENTE} dados={cl} prefixo="cl" emCartao={false} cancelar={() => setEditando(false)}
            salvar={async (dados) => {
              await painelApi(`/clientes/${cl.id}`, { metodo: 'PATCH', corpo: dados });
              setEditando(false); recarregar(); avisar('Ficha atualizada.');
            }} />
        ) : (
          <>
            <div className="linha-titulo"><h2>{cl.nome}</h2><button className="secundario pequeno" id="editar" onClick={() => setEditando(true)}>Editar</button></div>
            <p><a href={linkZap(cl.whatsapp)} target="_blank" rel="noopener">{zapBonito(cl.whatsapp)}</a>{cl.email ? ' · ' + cl.email : ''}</p>
            {cl.alergias && <p className="alerta-cliente">Alergias: {cl.alergias}</p>}
            {cl.necessidades_especificas && <p className="alerta-cliente">Necessidades: {cl.necessidades_especificas}</p>}
            {cl.sem_remy && <p className="alerta-cliente">Remy longe{cl.motivo_sem_remy ? ` (${MOTIVO_REMY_TXT[cl.motivo_sem_remy]})` : ''}</p>}
            {linha('Nascimento', cl.data_nascimento && fmt.partesDoDia(cl.data_nascimento).longa.replace(/^[^,]+, /, ''))}
            {cl.observacoes && <p style={{ whiteSpace: 'pre-line' }}><span className="suave">Anotações:</span> {cl.observacoes}</p>}
            <div className="acoes-item">
              <a className="botao pequeno" href={`#/painel/agenda/novo?cliente=${cl.id}`}>Marcar horário</a>
              <button className="perigo pequeno" id="excluir" onClick={async () => {
                const n = cl.agendamentos.length, h = cl.historico.length;
                if (!await perguntar(<>Excluir <strong>{cl.nome}</strong>?<br />Também serão apagados {n} horário{n === 1 ? '' : 's'} e {h} anotaç{h === 1 ? 'ão' : 'ões'} do histórico. Não dá para desfazer.</>,
                  { sim: 'Sim, excluir tudo' })) return;
                tentar(async () => { await painelApi(`/clientes/${cl.id}`, { metodo: 'DELETE' }); avisar('Cliente excluída.'); location.hash = '#/painel/clientes'; });
              }}>Excluir cliente</button>
            </div>
          </>
        )}
      </div>

      <div className="linha-titulo"><h2>Histórico de atendimentos</h2><button className="pequeno" id="novo-hist" onClick={() => setHist('novo')}>+ Adicionar</button></div>
      {hist === 'novo' && formHist(null)}
      {cl.historico.length ? cl.historico.map((h) => (
        <div className="cartao item" key={h.id}>
          {hist?.id === h.id ? formHist(h) : (
            <>
              <p className="quando">{fmt.partesDoDia(h.data).longa}</p>
              {linha('Serviços', h.servicos_realizados)}{linha('Tintura', h.tintura_utilizada)}{linha('Quantidade', h.tintura_quantidade)}
              {h.anotacoes && <p style={{ whiteSpace: 'pre-line' }}>{h.anotacoes}</p>}
              <div className="acoes-item">
                <button className="secundario pequeno" onClick={() => setHist(h)}>Editar</button>
                <button className="perigo pequeno" onClick={async () => {
                  if (!await perguntar(<>Excluir a anotação de <strong>{fmt.partesDoDia(h.data).longa}</strong>?</>)) return;
                  tentar(async () => { await painelApi(`/historico/${h.id}`, { metodo: 'DELETE' }); recarregar(); avisar('Anotação excluída.'); });
                }}>Excluir</button>
              </div>
            </>
          )}
        </div>
      )) : <p className="suave">Nenhum atendimento anotado ainda.</p>}

      <h2 style={{ marginTop: '1.5rem' }}>Horários</h2>
      {cl.agendamentos.length
        ? cl.agendamentos.map((a) => <CartaoAgendamento key={a.id} a={{ ...a, cliente: cl }} comData comAcoes={false} />)
        : <p className="suave">Nenhum horário.</p>}
    </>
  );
}

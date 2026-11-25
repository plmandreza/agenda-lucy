// ABA PEDIDOS: o que está esperando resposta + lembretes de amanhã
import { useState } from 'react';
import { somarDias, fmt, servicosTexto, ICONE_ZAP } from '../ferramentas.js';
import { usePainel, useCarregar, painelApi, hojeNoSalao, linkZapCliente, ErroDaAba } from './comum.jsx';
import { CartaoAgendamento } from './Agendamentos.jsx';

export default function AbaPedidos() {
  const { cfg } = usePainel();
  const [versao, setVersao] = useState(0);
  const hoje = hojeNoSalao(), amanha = somarDias(hoje, 1);
  const { dados, erro } = useCarregar(() => Promise.all([
    painelApi('/agendamentos?status=solicitado'),
    painelApi(`/agendamentos?de=${hoje}&ate=${hoje}`),
    painelApi(`/agendamentos?de=${amanha}&ate=${amanha}`),
  ]), [versao]);

  if (erro) return <ErroDaAba erro={erro} />;
  if (!dados) return <p className="carregando">Carregando…</p>;
  const [pedidos, deHoje, deAmanha] = dados;
  const lembrar = deAmanha.filter((a) => a.status === 'agendado');
  const confirmadosHoje = deHoje.filter((a) => a.status === 'agendado').length;
  const recarregar = () => setVersao((v) => v + 1);

  return (
    <>
      <a className="cartao destaque resumo-hoje" href="#/painel/agenda">
        <span>Hoje: <strong>{confirmadosHoje}</strong> atendimento{confirmadosHoje === 1 ? '' : 's'} confirmado{confirmadosHoje === 1 ? '' : 's'}</span>
        <span>Ver agenda →</span>
      </a>
      <h2>Pedidos esperando resposta {pedidos.length > 0 && `(${pedidos.length})`}</h2>
      <div id="lista-pedidos">
        {pedidos.length
          ? pedidos.map((a) => <CartaoAgendamento key={a.id} a={a} comData depois={recarregar} />)
          : <p className="cartao suave">Nenhum pedido esperando resposta. 🎉</p>}
      </div>

      <div className="linha-titulo" style={{ marginTop: '1.5rem' }}><h2>Lembretes de amanhã {lembrar.length > 0 && `(${lembrar.length})`}</h2></div>
      <p className="suave">Toque em "Lembrar" para abrir o WhatsApp com a mensagem pronta.</p>
      {lembrar.length ? lembrar.map((a) => {
        const zap = linkZapCliente(a, 'lembrete', {}, cfg);
        return (
          <div className="cartao item linha-lembrete" key={a.id}>
            <div><strong>{fmt.hora(a.inicio)}</strong> · {a.cliente?.nome}
              <span className="suave" style={{ display: 'block' }}>{servicosTexto(a)}</span></div>
            {zap && <a className="botao secundario pequeno" target="_blank" rel="noopener" href={zap}>{ICONE_ZAP} Lembrar</a>}
          </div>
        );
      }) : <p className="cartao suave">Nenhum horário confirmado para amanhã.</p>}
    </>
  );
}

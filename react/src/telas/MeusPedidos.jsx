// MEU HORÁRIO: os pedidos feitos neste aparelho (VISUALIZAR)
import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { fmt, meusPedidos } from '../ferramentas.js';
import { Carregando, BotaoVoltar } from '../componentes/Comuns.jsx';

export default function MeusPedidos({ voltar }) {
  const [tokens] = useState(meusPedidos.listar);
  const [pedidos, setPedidos] = useState(null);

  useEffect(() => {
    Promise.all(tokens.map((t) => api(`/api/publico/pedidos/${encodeURIComponent(t)}`)
      .catch((e) => { if (e.status === 404) meusPedidos.remover(t); return null; })))
      .then((r) => setPedidos(r.filter(Boolean).sort((a, b) => Date.parse(b.inicio) - Date.parse(a.inicio))));
  }, [tokens]);

  if (!tokens.length) {
    return (
      <>
        <BotaoVoltar voltar={voltar} />
        <div className="cartao">
          <h1>Meu horário</h1>
          <p>Nenhum pedido guardado neste aparelho.</p>
          <a className="botao botao-largo" href="#/agendar">Agendar horário</a>
        </div>
      </>
    );
  }
  if (!pedidos) return <Carregando />;
  return (
    <>
      <BotaoVoltar voltar={voltar} />
      <h1>Meu horário</h1>
      {pedidos.length ? pedidos.map((p) => (
        <a key={p.token} className="cartao" href={`#/pedido/${p.token}`} style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}>
          <span className={`selo ${p.status}`}>{p.status_texto}</span>
          <p className="quando">{fmt.dataLonga(p.inicio)} · {fmt.hora(p.inicio)}</p>
          <p className="suave" style={{ margin: 0 }}>{p.servicos.map((s) => s.nome).join(', ')}</p>
        </a>
      )) : <p>Nenhum pedido encontrado.</p>}
      <a className="botao secundario botao-largo" href="#/agendar">Fazer outro pedido</a>
    </>
  );
}

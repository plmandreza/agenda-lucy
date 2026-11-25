// O "esqueleto" do site: cabeçalho, a tela da vez e o rodapé.
// A tela é escolhida pelo que vem depois do "#" no endereço (igual à versão em HTML),
// assim os links pessoais e de WhatsApp funcionam nas duas versões.
import { useEffect, useRef, useState } from 'react';
import { meusPedidos } from './ferramentas.js';
import Inicio from './telas/Inicio.jsx';
import Agendar from './telas/Agendar.jsx';
import Pedido from './telas/Pedido.jsx';
import MeusPedidos from './telas/MeusPedidos.jsx';
import Painel from './telas/Painel.jsx';

// Lê o endereço: "#/pedido/abc?novo=1" → { rota: '/pedido/abc', params }
function lerEndereco() {
  const [rota, consulta] = (location.hash.replace(/^#/, '') || '/').split('?');
  return { rota, params: new URLSearchParams(consulta || ''), chave: location.hash };
}

export default function App() {
  const [endereco, setEndereco] = useState(lerEndereco);
  const navegouNoSite = useRef(false);
  const mainRef = useRef(null);

  // Quando o "#" muda, troca a tela e volta para o topo
  useEffect(() => {
    const mudou = () => { navegouNoSite.current = true; setEndereco(lerEndereco()); };
    window.addEventListener('hashchange', mudou);
    return () => window.removeEventListener('hashchange', mudou);
  }, []);
  useEffect(() => {
    window.scrollTo({ top: 0 });
    mainRef.current?.focus({ preventScroll: true });
  }, [endereco.chave]);

  // Botões "← Voltar": voltam para a tela anterior do próprio site;
  // se a pessoa chegou direto por um link, vão para um destino seguro.
  const voltar = (destino) => {
    if (navegouNoSite.current && history.length > 1) history.back();
    else location.hash = destino;
  };

  const { rota, params, chave } = endereco;
  const ehPainel = rota.startsWith('/painel');
  let tela;
  if (ehPainel) tela = <Painel />;
  else if (rota === '/agendar') tela = <Agendar key={chave} params={params} />;
  else if (rota.startsWith('/pedido/')) tela = <Pedido key={chave} token={rota.slice('/pedido/'.length)} params={params} voltar={voltar} />;
  else if (rota === '/meus-pedidos') tela = <MeusPedidos voltar={voltar} />;
  else tela = <Inicio />;

  return (
    <>
      <header className="topo">
        <a href="#/" className="marca">Lucy <span>Cabeleireira</span></a>
        <nav id="nav" aria-label="Atalhos">
          {!ehPainel && meusPedidos.listar().length > 0 && <a href="#/meus-pedidos">Meu horário</a>}
        </nav>
      </header>
      <main id="app" tabIndex={-1} aria-live="polite" ref={mainRef}>{tela}</main>
      <footer id="rodape">
        {ehPainel ? <a href="#/">Ver o site das clientes</a> : <a href="#/painel">Área da Lucy</a>}
        <p className="suave" style={{ fontSize: '.8rem', margin: '.5rem 0 0' }}>Versão em React</p>
      </footer>
    </>
  );
}

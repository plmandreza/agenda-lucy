// ÁREA DA LUCY — na versão React, chega na próxima etapa.
// Enquanto isso, o painel continua funcionando no site principal (versão em HTML).
const SITE_PRINCIPAL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

export default function Painel() {
  return (
    <div className="cartao">
      <h1>Área da Lucy</h1>
      <p>Nesta versão em React, a área da Lucy chega na próxima etapa.</p>
      <p className="suave">Por enquanto, o painel completo continua no site principal.</p>
      <a className="botao botao-largo" href={`${SITE_PRINCIPAL}/#/painel`}>Abrir o painel no site principal</a>
    </div>
  );
}

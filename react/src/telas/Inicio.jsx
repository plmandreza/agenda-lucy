// INÍCIO: serviços, Remy, catálogos, funcionamento e contato (VISUALIZAR)
import { useEffect, useState } from 'react';
import { api, carregarSalao } from '../api.js';
import { fmt, zapCom, ICONE_ZAP, resumoDoFuncionamento, semRemy, PIADAS_REMY, MOTIVOS_REMY } from '../ferramentas.js';
import { Carregando, TelaErro, BotaoCopiar } from '../componentes/Comuns.jsx';

export default function Inicio() {
  const [d, setD] = useState(null);
  const [erro, setErro] = useState(null);
  const [sistema, setSistema] = useState({ ok: null, texto: 'Verificando o sistema…' });

  const carregar = () => {
    setErro(null);
    carregarSalao(true).then(setD).catch((e) => setErro(e.message));
    // Verificação discreta (útil para conferir se servidor e banco estão no ar).
    api('/api/saude').then(() => setSistema({ ok: true, texto: 'Sistema funcionando' }))
      .catch((e) => setSistema({ ok: false, texto: e.message }));
  };
  useEffect(carregar, []);

  if (erro) return <TelaErro mensagem={erro} tentarDeNovo={carregar} />;
  if (!d) return <Carregando />;

  const marcas = (d.catalogos ?? []).map((c) => c.marca);
  return (
    <>
      <section className="cartao destaque">
        <h1>Que bom ter você aqui!</h1>
        <p>Escolha os serviços, veja os horários livres e faça o seu pedido. A Lucy confirma pra você.</p>
        <a className="botao botao-largo" href="#/agendar">Agendar horário</a>
        {marcas.length > 0 && (
          <a className="link-catalogos" href="#catalogos" onClick={(e) => {
            e.preventDefault();  // não troca o "#" do endereço (que escolhe a tela)
            document.getElementById('catalogos')?.scrollIntoView({ behavior: 'smooth' });
          }}>
            Ver {marcas.length > 1 ? 'os catálogos' : 'o catálogo'} {marcas.join(', ').replace(/, ([^,]*)$/, ' e $1')} ↓
          </a>
        )}
      </section>

      {d.promocoes.map((p) => (
        <div className="cartao destaque" key={p.id}>
          <p className="passos" style={{ margin: 0 }}>Promoção</p>
          <h2>{p.titulo}</h2>
          {p.descricao && <p>{p.descricao}</p>}
          {p.valida_ate && <p className="suave">Válida até {fmt.partesDoDia(p.valida_ate).longa}</p>}
        </div>
      ))}

      {d.remy && <CartaoRemy />}

      <section className="cartao" aria-labelledby="t-servicos">
        <h2 id="t-servicos">Serviços</h2>
        <p className="suave">A lavagem já está incluída no valor de todos os serviços.</p>
        <ul className="servicos">
          {d.servicos.map((s) => (
            <li key={s.id}>
              <div>
                <span className="nome">{s.nome}</span>
                {s.descricao && <span className="suave" style={{ display: 'block' }}>{s.descricao}</span>}
              </div>
              <span className="preco">{fmt.reais(s.preco)}</span>
            </li>
          ))}
        </ul>
      </section>

      {d.catalogos?.length > 0 && (
        <section className="cartao" id="catalogos" aria-labelledby="t-catalogos">
          <h2 id="t-catalogos">Catálogos</h2>
          <p className="suave">A Lucy também é consultora. Veja os catálogos e faça seu pedido com ela.</p>
          {d.catalogos.map((c) => (
            <div className="catalogo" key={c.marca}>
              <p className="quando" style={{ margin: 0 }}>{c.marca}</p>
              {c.codigo && (
                <p className="suave" style={{ margin: '.15rem 0 .5rem' }}>
                  Código da consultora: <strong className="codigo">{c.codigo}</strong>{' '}
                  <BotaoCopiar texto={c.codigo} className="secundario pequeno" aria-label={`Copiar código ${c.marca}`} />
                </p>
              )}
              <div className="acoes-item" style={{ marginTop: '.25rem' }}>
                {c.link && <a className="botao secundario pequeno" href={c.link} target="_blank" rel="noopener">Ver catálogo {c.marca}</a>}
                {d.salao.whatsapp && (
                  <a className="botao secundario pequeno" target="_blank" rel="noopener"
                    href={zapCom(d.salao.whatsapp, `Olá, Lucy! Vi o catálogo ${c.marca} e quero fazer um pedido.`)}>
                    {ICONE_ZAP} Pedir pelo WhatsApp
                  </a>
                )}
              </div>
            </div>
          ))}
        </section>
      )}

      <section className="cartao" aria-labelledby="t-contato">
        <h2 id="t-contato">Funcionamento e contato</h2>
        <p>{resumoDoFuncionamento(d.horarios).map((linha, i) => <span key={i}>{i > 0 && <br />}{linha}</span>)}</p>
        <p>{d.salao.endereco || <span className="suave">Endereço em breve.</span>}</p>
        {d.salao.whatsapp && (
          <p><a href={`https://wa.me/${d.salao.whatsapp}`} target="_blank" rel="noopener">Falar com a Lucy no WhatsApp</a></p>
        )}
      </section>
      <p className="sistema">
        {sistema.ok === true && <span className="ok" aria-hidden="true">✓ </span>}
        {sistema.ok === false && <span className="falha" aria-hidden="true">✗ </span>}
        {sistema.texto}
      </p>
    </>
  );
}

// Cartão do Remy (ou só um recado discreto, para quem pediu ele longe)
function CartaoRemy() {
  const [longe, setLonge] = useState(semRemy.ler());
  const [piada, setPiada] = useState(() => Math.floor(Math.random() * PIADAS_REMY.length));
  const [escolhendo, setEscolhendo] = useState(false);

  if (longe) {
    return (
      <section className="cartao" id="remy" aria-labelledby="t-remy">
        <h2 id="t-remy">Sobre o gato do salão</h2>
        <p>Combinado: quando você agendar um horário, a Lucy vai saber que o gato deve ficar longe durante o seu atendimento.</p>
        <button className="secundario pequeno" onClick={() => { semRemy.apagar(); setLonge(null); setEscolhendo(false); }}>Mudei de ideia</button>
      </section>
    );
  }
  return (
    <section className="cartao" id="remy" aria-labelledby="t-remy">
      <h2 id="t-remy">Conheça o Remy 🐾</h2>
      <p>O Remy é o gato do salão e se acha o secretário da Lucy.</p>
      <p className="piada-remy" aria-live="polite">{PIADAS_REMY[piada]}</p>
      <div className="acoes-item">
        <button className="secundario pequeno" onClick={() => setPiada((piada + 1) % PIADAS_REMY.length)}>Outra do Remy</button>
        <button className="secundario pequeno" aria-expanded={escolhendo} onClick={() => setEscolhendo(true)}>Prefiro que ele fique longe</button>
      </div>
      {escolhendo && (
        <div>
          <p className="suave" style={{ margin: '.75rem 0 .5rem' }}>Sem problema! Qual o motivo? <span className="opcional">(opcional)</span></p>
          <div className="acoes-item">
            {MOTIVOS_REMY.map(([v, t]) => (
              <button key={v} className="secundario pequeno" onClick={() => { semRemy.salvar(v); setLonge({ motivo: v }); }}>{t}</button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

// Formulários "genéricos" do painel: a gente descreve os campos numa lista
// (nome, rótulo, tipo…) e estes componentes desenham, leem e enviam.
// Também tem a tela de LISTA COM CRUD usada em Serviços, Promoções e Dias especiais.
import { Fragment, useEffect, useRef, useState } from 'react';
import { usePainel, useCarregar, painelApi, zapBonito, ErroDaAba } from './comum.jsx';

// Valor que vai aparecer no campo (o banco guarda de um jeito, a tela mostra de outro)
function paraTela(c, v) {
  v = v ?? c.padrao ?? '';
  if (c.tipo === 'check') return Boolean(v);
  if (c.tipo === 'hora') return String(v).slice(0, 5);
  if (c.tipo === 'tel' && v) return zapBonito(v);  // 5511900000000 → (11) 90000-0000
  if (c.tipo === 'dinheiro' && v !== '') return Number(v).toFixed(2).replace('.', ',');
  return String(v);
}
export const valoresIniciais = (campos, dados = {}) => Object.fromEntries(campos.map((c) => [c.nome, paraTela(c, dados[c.nome])]));
// Valor que vai para o servidor
export const lerValores = (campos, v) => Object.fromEntries(campos.map((c) => [c.nome,
  c.tipo === 'check' ? v[c.nome] : c.tipo === 'numero' ? (v[c.nome] === '' ? null : Number(v[c.nome])) : String(v[c.nome]).trim()]));

export function Campos({ campos, valores, mudar, prefixo = 'f' }) {
  // "grupo" no campo = um título antes dele (usado na aba Salão)
  return campos.map((c) => (
    <Fragment key={c.nome}>
      {c.grupo && <h2 style={{ marginTop: '1.25rem' }}>{c.grupo}</h2>}
      <Campo c={c} valores={valores} mudar={mudar} prefixo={prefixo} />
    </Fragment>
  ));
}

function Campo({ c, valores, mudar, prefixo }) {
  {
    const id = `${prefixo}-${c.nome}`;
    const dica = c.dica && <span className="dica">{c.dica}</span>;
    const props = { id, name: c.nome, value: valores[c.nome], onChange: (e) => mudar(c.nome, e.target.value) };
    if (c.tipo === 'check') {
      return (
        <label className="opcao" key={c.nome}>
          <input type="checkbox" id={id} name={c.nome} checked={valores[c.nome]} onChange={(e) => mudar(c.nome, e.target.checked)} />
          <span className="info">{c.rotulo}{dica}</span>
        </label>
      );
    }
    let campo;
    if (c.tipo === 'area') campo = <textarea {...props} maxLength={c.max ?? 500} />;
    else if (c.tipo === 'select') campo = <select {...props}>{c.opcoes.map(([ov, ot]) => <option key={ov} value={ov}>{ot}</option>)}</select>;
    else {
      const tipo = { numero: 'number', data: 'date', hora: 'time', tel: 'tel', email: 'email' }[c.tipo] ?? 'text';
      const extra = c.tipo === 'dinheiro' ? { inputMode: 'decimal', placeholder: '0,00' }
        : c.tipo === 'numero' ? { inputMode: 'numeric', min: c.min ?? 0, max: c.maxNum }
        : c.tipo === 'tel' ? { inputMode: 'tel', placeholder: '(00) 00000-0000' } : { maxLength: c.max ?? 200 };
      campo = <input type={tipo} {...extra} {...props} />;
    }
    return (
      <div key={c.nome}>
        <label htmlFor={id}>{c.rotulo}{!c.obrigatorio && <> <span className="opcional">(opcional)</span></>}{dica}</label>
        {campo}
      </div>
    );
  }
}

// Formulário completo: campos + mensagem de erro + Cancelar/Salvar.
// "salvar" recebe os dados prontos; se der erro, a mensagem aparece dentro do formulário.
export function FormCampos({ titulo, campos, dados, salvar, cancelar, prefixo, emCartao = true, textoBotao = 'Salvar', antes = null }) {
  const { sessaoVencida } = usePainel();
  const [valores, setValores] = useState(() => valoresIniciais(campos, dados));
  const [msg, setMsg] = useState('');
  const [salvando, setSalvando] = useState(false);
  const ref = useRef(null);
  useEffect(() => { if (cancelar) { ref.current?.scrollIntoView({ block: 'start' }); ref.current?.querySelector('input, textarea, select')?.focus({ preventScroll: true }); } }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  const enviar = async (ev) => {
    ev.preventDefault();
    setSalvando(true); setMsg('');
    try { await salvar(lerValores(campos, valores)); } catch (e) {
      if (e.status === 401) return sessaoVencida();
      setMsg(e.message);
    }
    setSalvando(false);
  };
  return (
    <form className={`${emCartao ? 'cartao ' : ''}form-cartao`} noValidate onSubmit={enviar} ref={ref}>
      {titulo && <h2>{titulo}</h2>}
      {antes}
      <Campos campos={campos} valores={valores} mudar={(n, v) => setValores((x) => ({ ...x, [n]: v }))} prefixo={prefixo} />
      <p className="mensagem erro msg-form" role="alert">{msg}</p>
      {cancelar ? (
        <div className="acoes">
          <button type="button" className="secundario" onClick={cancelar}>Cancelar</button>
          <button type="submit" disabled={salvando}>{salvando ? 'Salvando…' : textoBotao}</button>
        </div>
      ) : <button type="submit" className="botao-largo" disabled={salvando}>{salvando ? 'Salvando…' : textoBotao}</button>}
    </form>
  );
}

// Tela de lista com CRUD (criar, ver, editar, excluir) + botões extras por item
export function GerenciarLista({ op }) {
  const { avisar, perguntar, sessaoVencida } = usePainel();
  const [versao, setVersao] = useState(0);
  const [editando, setEditando] = useState(null);  // null = fechado, 'novo' ou o item
  const { dados: itens, erro } = useCarregar(() => painelApi(`/${op.rota}`), [op.rota, versao]);
  const recarregar = () => setVersao((v) => v + 1);
  const tentar = async (fazer) => {
    try { await fazer(); recarregar(); } catch (e) { if (e.status === 401) return sessaoVencida(); avisar(e.message, 'erro'); }
  };

  if (erro) return <ErroDaAba erro={erro} />;
  if (!itens) return <p className="carregando">Carregando…</p>;
  const form = (item) => (
    <FormCampos key={item?.id ?? 'novo'} titulo={item ? 'Editar' : op.novo} campos={op.campos} dados={item ?? {}} prefixo={op.rota}
      cancelar={() => setEditando(null)}
      salvar={async (dados) => {
        await painelApi(item ? `/${op.rota}/${item.id}` : `/${op.rota}`, { metodo: item ? 'PATCH' : 'POST', corpo: dados });
        avisar(item ? 'Alterações salvas.' : 'Cadastrado!');
        op.depoisDeSalvar?.();
        setEditando(null); recarregar();
      }} />
  );
  return (
    <div className="secao">
      <div className="linha-titulo"><h2>{op.titulo}</h2><button className="pequeno" onClick={() => setEditando('novo')}>+ {op.novo}</button></div>
      {op.intro}
      {editando === 'novo' && form(null)}
      {itens.length ? itens.map((it) => (
        editando?.id === it.id ? <div key={it.id}>{form(it)}</div> : (
          <div className="cartao item" key={it.id}>
            {op.resumo(it)}
            <div className="acoes-item">
              {op.extras?.(it, { tentar, recarregar })}
              <button className="secundario pequeno" onClick={() => setEditando(it)}>Editar</button>
              <button className="perigo pequeno" onClick={async () => {
                if (!await perguntar(<>Excluir <strong>{op.nomeDe(it)}</strong>? Não dá para desfazer.</>)) return;
                tentar(async () => { const r = await painelApi(`/${op.rota}/${it.id}`, { metodo: 'DELETE' }); avisar(r.mensagem || 'Excluído.'); op.depoisDeSalvar?.(); });
              }}>Excluir</button>
            </div>
          </div>
        )
      )) : <p className="suave">{op.vazio ?? 'Nada cadastrado ainda.'}</p>}
    </div>
  );
}

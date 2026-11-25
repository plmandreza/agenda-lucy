// Pedaços pequenos usados em várias telas.
import { useState } from 'react';
import { MOTIVOS_REMY, copiarTexto } from '../ferramentas.js';

export function Carregando({ texto = 'Carregando…' }) {
  return <p className="carregando">{texto}</p>;
}

export function TelaErro({ mensagem, tentarDeNovo }) {
  return (
    <div className="cartao">
      <p className="mensagem erro" role="alert">{mensagem}</p>
      {tentarDeNovo && <button className="botao-largo" onClick={tentarDeNovo}>Tentar de novo</button>}
      <a className="botao secundario botao-largo" href="#/">Voltar ao início</a>
    </div>
  );
}

export function BotaoVoltar({ voltar, destino = '#/' }) {
  return <button className="voltar" onClick={() => voltar(destino)}>← Voltar</button>;
}

// Botão que copia um texto e mostra "Copiado!" por um instante
export function BotaoCopiar({ texto, rotulo = 'Copiar', copiado = 'Copiado!', className = 'secundario', ...resto }) {
  const [estado, setEstado] = useState(rotulo);
  return (
    <button className={className} {...resto} onClick={async () => {
      setEstado(await copiarTexto(texto) ? copiado : 'Selecione e copie');
      setTimeout(() => setEstado(rotulo), 2000);
    }}>{estado}</button>
  );
}

// Campo "Remy longe" (usado no pedido e na correção dos detalhes)
export function CampoRemy({ valor, onChange, prefixo }) {
  const { marcado, motivo } = valor;
  return (
    <fieldset className="remy-campo">
      <legend>O Remy, o gato do salão</legend>
      <label className="opcao">
        <input type="checkbox" id={`${prefixo}-sem-remy`} checked={marcado}
          onChange={(e) => onChange({ marcado: e.target.checked, motivo })} />
        <span className="info">Prefiro que o Remy fique longe durante o meu atendimento</span>
      </label>
      {marcado && (
        <div>
          <label htmlFor={`${prefixo}-motivo`}>Pode contar o motivo? <span className="opcional">(ajuda a Lucy a se preparar)</span></label>
          <select id={`${prefixo}-motivo`} value={motivo} onChange={(e) => onChange({ marcado, motivo: e.target.value })}>
            {MOTIVOS_REMY.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
          </select>
          {motivo === 'alergia' && (
            <p className="suave" style={{ margin: '.5rem 0 0' }}>
              Mesmo com o Remy longe, pode haver pelinhos no salão. Se a alergia for forte, conte no recado.
            </p>
          )}
        </div>
      )}
    </fieldset>
  );
}

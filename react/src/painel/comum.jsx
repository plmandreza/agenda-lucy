// Peças do painel da Lucy usadas em várias abas.
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from '../api.js';
import { fmt, zapCom, enderecoSite, quandoTexto, servicosTexto, dataNoFuso } from '../ferramentas.js';

export const painelApi = (caminho, opcoes = {}) => api('/api/lucy' + caminho, { ...opcoes, autenticado: true });
export const hojeNoSalao = () => dataNoFuso(new Date());
export const instanteDe = (data, hora) => new Date(`${data}T${hora}:00-03:00`).toISOString();
export const linkZap = (numero) => `https://wa.me/${encodeURIComponent(numero)}`;
export const zapBonito = (n) => { const m = String(n ?? '').match(/^55(\d{2})(\d{4,5})(\d{4})$/); return m ? `(${m[1]}) ${m[2]}-${m[3]}` : n; };
export const primeiroNome = (nome) => String(nome ?? '').split(' ')[0];

export const STATUS = {
  solicitado: 'Aguardando você', agendado: 'Confirmado', recusado: 'Recusado',
  concluido: 'Concluído', cancelado: 'Cancelado', faltou: 'Faltou',
};

// "Contexto" do painel: o que todas as abas usam (avisos, perguntas, janelas e os dados do salão).
// Assim não precisamos passar essas coisas de componente em componente.
export const PainelContexto = createContext(null);
export const usePainel = () => useContext(PainelContexto);

// Carrega dados do servidor. "versao" muda → carrega de novo.
// Se a sessão venceu (401), o painel volta para o login.
export function useCarregar(buscar, deps) {
  const { sessaoVencida } = usePainel();
  const [estado, setEstado] = useState({ dados: null, erro: null });
  const buscarMemo = useCallback(buscar, deps);  // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    let valido = true;
    setEstado((e) => ({ dados: e.dados, erro: null }));
    buscarMemo().then((dados) => valido && setEstado({ dados, erro: null }))
      .catch((erro) => {
        if (!valido) return;
        if (erro.status === 401) sessaoVencida();
        else setEstado({ dados: null, erro });
      });
    return () => { valido = false; };
  }, [buscarMemo, sessaoVencida]);
  return estado;
}

// Mensagens prontas que a Lucy manda para as clientes pelo WhatsApp.
export function mensagemParaCliente(a, tipo, extra = {}, cfg = null) {
  const nome = primeiroNome(a.cliente?.nome);
  const link = `${enderecoSite()}#/pedido/${a.token}`;
  const marcar = `${enderecoSite()}#/agendar`;
  const endereco = cfg?.endereco ? `\nEndereço: ${cfg.endereco}` : '';
  return {
    agendado: () => `Oi, ${nome}! Aqui é a Lucy 💜\nSeu horário está confirmado: ${quandoTexto(a)} (${servicosTexto(a)}).${endereco}\nPara ver, remarcar ou cancelar: ${link}`,
    solicitado: () => `Oi, ${nome}! Aqui é a Lucy. Recebi seu pedido para ${quandoTexto(a)} (${servicosTexto(a)}). Já já te confirmo!`,
    recusado: () => `Oi, ${nome}! Aqui é a Lucy. Infelizmente não vou conseguir te atender ${quandoTexto(a)}. Pode escolher outro horário por aqui? ${marcar}`,
    cancelado: () => `Oi, ${nome}! Aqui é a Lucy. Seu horário de ${quandoTexto(a)} foi cancelado. Quando quiser, é só marcar de novo: ${marcar}`,
    concluido: () => `Oi, ${nome}! Obrigada pela visita 💜 Se puder, me conta como foi por aqui: ${link}`,
    retorno: () => `Oi, ${nome}! Aqui é a Lucy 💜 Já está chegando a hora de refazer ${servicosTexto(a).toLowerCase()}. Quer marcar um horário? ${marcar}`,
    pix: () => `Oi, ${nome}! Segue o Pix de ${fmt.reais(extra.valor ?? a.valor_total)} (${cfg?.nome_salao ?? 'Lucy Cabeleireira'}). É só copiar e colar no app do banco:\n${extra.copia}`,
    faltou: () => `Oi, ${nome}! Aqui é a Lucy. Senti sua falta no horário de ${quandoTexto(a)}. Está tudo bem? Se quiser, marcamos outro: ${marcar}`,
    lembrete: () => `Oi, ${nome}! Aqui é a Lucy 💜 Passando para lembrar do seu horário amanhã, às ${fmt.hora(a.inicio)} (${servicosTexto(a)}).${endereco}\nSe precisar remarcar: ${link}`,
    atraso: () => `Oi, ${nome}! Aqui é a Lucy. Vou me atrasar uns ${extra.minutos} minutinhos para o seu horário das ${fmt.hora(a.inicio)}. Me desculpe! 💜`,
    folga: () => `Oi, ${nome}! Aqui é a Lucy. Não vou poder atender no dia ${fmt.dataLonga(a.inicio)}${extra.motivo ? ` (${extra.motivo})` : ''}. Me desculpe! Vamos remarcar seu horário? ${link}`,
    especial: () => `Oi, ${nome}! Aqui é a Lucy. No dia ${fmt.dataLonga(a.inicio)} vou atender das ${extra.abre} às ${extra.fecha}${extra.motivo ? ` (${extra.motivo})` : ''}. Seu horário é às ${fmt.hora(a.inicio)}. Se precisar remarcar: ${link}`,
  }[tipo]?.();
}
export const linkZapCliente = (a, tipo, extra, cfg) => (a.cliente?.whatsapp ? zapCom(a.cliente.whatsapp, mensagemParaCliente(a, tipo, extra, cfg)) : null);

// Mensagem de erro dentro da área da aba
export const ErroDaAba = ({ erro }) => <p className="mensagem erro" role="alert">{erro.message}</p>;

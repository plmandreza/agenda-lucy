// Pequenas ferramentas usadas em várias telas (as mesmas da versão em HTML).

// Guardar e ler coisas no próprio aparelho (com cuidado, pois pode falhar).
export const guardado = {
  ler(chave, padrao) { try { return JSON.parse(localStorage.getItem(chave)) ?? padrao; } catch { return padrao; } },
  salvar(chave, valor) { try { localStorage.setItem(chave, JSON.stringify(valor)); } catch { /* sem espaço ou bloqueado */ } },
  apagar(chave) { try { localStorage.removeItem(chave); } catch { /* idem */ } },
};

// Os pedidos feitos neste aparelho (só os códigos dos links pessoais).
export const meusPedidos = {
  listar: () => guardado.ler('lucy.pedidos', []),
  adicionar(token) { guardado.salvar('lucy.pedidos', [token, ...this.listar().filter((t) => t !== token)].slice(0, 10)); },
  remover(token) { guardado.salvar('lucy.pedidos', this.listar().filter((t) => t !== token)); },
};

// Formatação no jeito brasileiro, sempre no horário de Brasília.
export const FUSO = 'America/Sao_Paulo';
export const fmt = {
  duracao: (min) => { const h = Math.floor(min / 60), m = min % 60; return h ? `${h}h${m ? String(m).padStart(2, '0') : ''}` : `${m} min`; },
  reais: (n) => Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
  dataLonga: (iso) => new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(iso)),
  hora: (iso) => new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, hour: '2-digit', minute: '2-digit' }).format(new Date(iso)),
  horaCurta: (hhmm) => { const [h, m] = hhmm.split(':'); return `${Number(h)}h${m !== '00' ? m : ''}`; },
  // Para os botões de dia: "qua", "4", "dez"
  partesDoDia(data) {
    const d = new Date(`${data}T12:00:00-03:00`);
    const f = (o) => new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, ...o }).format(d).replace('.', '');
    return { sem: f({ weekday: 'short' }), num: f({ day: 'numeric' }), mes: f({ month: 'short' }), longa: f({ weekday: 'long', day: 'numeric', month: 'long' }) };
  },
};
export const somarDias = (data, n) => { const d = new Date(`${data}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const diaDaSemana = (data) => new Date(`${data}T12:00:00-03:00`).getUTCDay();
export const dataNoFuso = (iso) => new Intl.DateTimeFormat('en-CA', { timeZone: FUSO }).format(new Date(iso));  // "AAAA-MM-DD"
export const NOMES_DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

// WhatsApp por "link pronto": abre o app com a mensagem escrita; a pessoa só toca em Enviar.
export const zapCom = (numero, texto) => `https://wa.me/${encodeURIComponent(numero)}?text=${encodeURIComponent(texto)}`;
export const enderecoSite = () => `${location.origin}${location.pathname}`;
export const quandoTexto = (a) => `${fmt.dataLonga(a.inicio)}, às ${fmt.hora(a.inicio)}`;
export const servicosTexto = (a) => a.servicos.map((x) => x.nome).join(' + ');
export const ICONE_ZAP = '💬';
export const FORMAS_TXT = { pix: 'Pix', cartao: 'cartão', dinheiro: 'dinheiro' };

// Copia um texto. Se o navegador não deixar, usa um jeito alternativo.
export async function copiarTexto(texto) {
  try {
    await Promise.race([navigator.clipboard.writeText(texto), new Promise((_, nao) => setTimeout(nao, 1500))]);
    return true;
  } catch {
    const t = document.createElement('textarea');
    t.value = texto; t.setAttribute('readonly', ''); t.style.position = 'fixed'; t.style.opacity = '0';
    document.body.appendChild(t); t.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { /* sem jeito de copiar */ }
    t.remove();
    return ok;
  }
}

// Horário de funcionamento em uma frase (ou uma linha por dia)
export function resumoDoFuncionamento(horarios) {
  const abertos = horarios.filter((h) => h.trabalha);
  if (!abertos.length) return ['Horários em breve.'];
  const faixa = (h) => `das ${fmt.horaCurta(h.abre.slice(0, 5))} às ${fmt.horaCurta(h.fecha.slice(0, 5))}`;
  const iguais = abertos.every((h) => h.abre === abertos[0].abre && h.fecha === abertos[0].fecha);
  if (abertos.length === 7 && iguais) return [`Todos os dias, ${faixa(abertos[0])}`];
  return horarios.map((h) => `${NOMES_DIAS[h.dia_semana]}: ${h.trabalha ? faixa(h) : 'fechado'}`);
}

// --- O REMY, o gato do salão (e "secretário" da Lucy) ---------------
// Quem tem medo, alergia ou não gosta de gatos pode pedir para ele ficar longe.
export const MOTIVOS_REMY = [['medo', 'Tenho medo'], ['alergia', 'Tenho alergia'], ['nao_gosto', 'Não gosto de gatos'], ['outro', 'Outro motivo']];
export const MOTIVO_REMY_TXT = { medo: 'medo', alergia: 'alergia', nao_gosto: 'não gosta', outro: 'outro motivo' };
export const PIADAS_REMY = [
  'O Remy é o secretário da Lucy: confere a agenda deitando em cima dela.',
  'Massagem nos pés felina grátis — o Remy garante que é terapêutica (e você não pediu).',
  'Carinho no gato está incluso. A mordidinha no final também. Sem custo adicional.',
  'O Remy cochila no lugar mais fresquinho do salão e chama isso de "trabalho remoto".',
  'Atendimento ao cliente: o Remy recebe você na porta e some quando você chama.',
  'Quando o secador liga, o Remy vai "conferir a recepção". Ele jura que não é medo do barulho.',
];
export const semRemy = {
  ler: () => guardado.ler('lucy.semRemy', null),       // null ou { motivo }
  salvar: (motivo) => guardado.salvar('lucy.semRemy', { motivo }),
  apagar: () => guardado.apagar('lucy.semRemy'),
};

// --- "Salvar na agenda do celular" (arquivo .ics e Google Agenda) ----
const dataIcs = (iso) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
export function arquivoAgenda(p, salao) {
  const linhaIcs = (t) => String(t ?? '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (m) => '\\' + m);
  const nome = salao?.salao?.nome || 'Lucy Cabeleireira';
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//agenda-lucy//PT-BR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT', `UID:${p.token}@agenda-lucy`, `DTSTAMP:${dataIcs(new Date().toISOString())}`,
    `DTSTART:${dataIcs(p.inicio)}`, `DTEND:${dataIcs(p.fim)}`,
    `SUMMARY:${linhaIcs(`${nome}: ${servicosTexto(p)}`)}`,
    salao?.salao?.endereco ? `LOCATION:${linhaIcs(salao.salao.endereco)}` : '',
    `DESCRIPTION:${linhaIcs(`Seu horário com a Lucy. Para ver, remarcar ou cancelar: ${enderecoSite()}#/pedido/${p.token}`)}`,
    'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Lembrete do salão', 'TRIGGER:-PT2H', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ].filter(Boolean).join('\r\n');
}
export const linkGoogleAgenda = (p, salao) => 'https://calendar.google.com/calendar/render?' + new URLSearchParams({
  action: 'TEMPLATE', text: `${salao?.salao?.nome || 'Lucy Cabeleireira'}: ${servicosTexto(p)}`,
  dates: `${dataIcs(p.inicio)}/${dataIcs(p.fim)}`, location: salao?.salao?.endereco ?? '',
  details: `Para ver, remarcar ou cancelar: ${enderecoSite()}#/pedido/${p.token}`,
});

// Baixa um arquivo gerado aqui mesmo (agenda .ics, planilha .csv)
export function baixarArquivo(conteudo, nome, tipo) {
  const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
  const a = Object.assign(document.createElement('a'), { href: url, download: nome });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

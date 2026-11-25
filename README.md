# Lucy Cabeleireira — agenda online do salão

Sistema de agendamento para o salão da Lucy: as clientes pedem horários pelo site e a Lucy confirma, organiza a agenda, recebe e acompanha tudo por um painel.

**No ar:** https://agenda-lucy.vercel.app · **Área da Lucy:** `/#/painel`

> Trabalho da disciplina de Front-end + Back-end (AV2). Todos os números de telefone, chaves Pix e clientes usados em testes são **fictícios**.

## Tecnologias

| Parte | Tecnologia |
|---|---|
| Front-end | HTML, CSS e JavaScript puro, em um arquivo (`public/index.html`), navegação por `#` |
| Back-end | Node.js + Express 5 (`server.js`) |
| Banco de dados | PostgreSQL no Supabase (acesso só pelo servidor, com RLS ligado e sem políticas públicas) |
| Login | Supabase Auth (só o e-mail definido em `ADMIN_EMAIL` entra no painel) |
| Hospedagem | Vercel (HTTPS) |
| Versão React | React 19 + Vite, na pasta `react/` (mesmas telas das clientes, mesmo servidor) |

## O que o sistema faz

**Para as clientes (sem login, por um link pessoal do pedido)**
- Ver serviços, preços, promoções, horário de funcionamento e catálogos (Avon, Natura, Hinode).
- Pedir horário em 4 passos; só aparecem horários livres. Remarcar e cancelar.
- Corrigir recado e necessidades específicas enquanto a Lucy não respondeu.
- Avisar a Lucy pelo WhatsApp com a mensagem pronta.
- Pagamento: escolher Pix, cartão ou dinheiro; Pix com QR code e "copia e cola".
- Salvar o horário na agenda do celular (arquivo `.ics` ou Google Agenda).
- Avaliar o atendimento (1 a 5 estrelas) e agendar o retorno.
- Remy, o gato do salão: brincadeiras na página — e a opção "prefiro que ele fique longe" (medo, alergia ou não gosta), que é respeitada no site e avisada à Lucy.

**Para a Lucy (painel com login)** — CRUD completo (criar, ver, editar, excluir)
- Pedidos: confirmar, recusar, cancelar, concluir, marcar falta; mensagens de WhatsApp prontas.
- Agenda por dia; aviso quando dois horários se cruzam, e a Lucy decide se confirma mesmo assim.
- Clientes com ficha (alergias, necessidades, tintura usada, histórico de atendimentos).
- Serviços, horários de funcionamento, folgas e dias especiais, promoções, dados do salão.
- Pagamentos (Pix com QR, cartão, dinheiro), lista de retornos, avaliações.
- Relatórios: recebido por forma de pagamento, a receber, atendimentos, serviços mais feitos, clientes que mais vieram, avaliações; planilha CSV e resumo pelo WhatsApp.

## Segurança
- HTTPS obrigatório, cabeçalhos de segurança, CORS só para o próprio site.
- Chave secreta do Supabase **só nas variáveis de ambiente** (nunca no código).
- Validação de todos os dados no servidor; links só com `http(s)://`.
- Limite de tentativas por IP (login, pedidos e alterações).
- Rotas públicas não mostram ids internos, a chave Pix nem dados de outras clientes.

## Como rodar

1. No Supabase (SQL Editor), rode na ordem: `banco/banco.sql`, `banco/permissoes.sql` e (opcional, dados iniciais da Lucy) `banco/ajustes-lucy.sql`.
   Quem já tinha o banco das etapas anteriores roda só `banco/etapa7.sql`.
2. Crie o usuário da Lucy em Authentication → Users.
3. Configure as variáveis de ambiente (veja `.env.example`): `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `ADMIN_EMAIL`.
4. Local: copie `.env.example` para `.env`, preencha, rode `npm install` e `node --env-file=.env server.js` (abre em `http://localhost:3000`). Na Vercel, cada push publica sozinho.

Versão em React: veja [react/README.md](react/README.md).

Ideias de melhoria: veja [PARA-O-FUTURO.md](PARA-O-FUTURO.md).

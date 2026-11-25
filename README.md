<div align="center">

<img src="imagens/banner.png" alt="Lucy Cabeleireira — agenda online do salão, com o Remy, o gato do salão" width="100%">

*as clientes pedem o horário, a Lucy confirma, e o Remy supervisiona* 🐾

[![Site](https://img.shields.io/badge/💖_site-no_ar-ff69b4?style=for-the-badge)](https://agenda-lucy.vercel.app)
[![React](https://img.shields.io/badge/🌸_versão-React-f4a6c6?style=for-the-badge)](https://agenda-lucy-react.vercel.app)

![Node](https://img.shields.io/badge/Node.js-Express_5-ffb6d9?style=flat-square&logo=nodedotjs&logoColor=white)
![React](https://img.shields.io/badge/React-19_+_Vite-ffb6d9?style=flat-square&logo=react&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-ffb6d9?style=flat-square&logo=supabase&logoColor=white)
![Vercel](https://img.shields.io/badge/Vercel-HTTPS-ffb6d9?style=flat-square&logo=vercel&logoColor=white)

</div>

---

## 💕 Sobre

Sistema de agendamento feito com carinho para o salão da Lucy (｡♥‿♥｡)

As clientes escolhem os serviços, veem os horários livres e fazem o pedido. A Lucy confirma, organiza a agenda, recebe o pagamento e acompanha tudo por um painel só dela.

| 🌷 | Endereço |
|---|---|
| **Site (HTML)** | https://agenda-lucy.vercel.app |
| **Site (React)** | https://agenda-lucy-react.vercel.app |
| **Área da Lucy** | `/#/painel` em qualquer um dos dois |

> 🎓 Trabalho da disciplina de Front-end + Back-end (AV2).
> 🔒 Todos os telefones, chaves Pix e clientes usados em testes são **fictícios**.

---

## 🛍️ Tecnologias

| Parte | Tecnologia |
|---|---|
| 💅 Front-end HTML | HTML, CSS e JavaScript puro, em um arquivo (`public/index.html`), navegação por `#` |
| 🌸 Front-end React | React 19 + Vite, na pasta `react/` — todas as telas, mesmo servidor ([detalhes](react/README.md)) |
| 🎀 Back-end | Node.js + Express 5 (`server.js`) |
| 💾 Banco de dados | PostgreSQL no Supabase (acesso só pelo servidor, RLS ligado e sem políticas públicas) |
| 🔑 Login | Supabase Auth (só o e-mail definido em `ADMIN_EMAIL` entra no painel) |
| ☁️ Hospedagem | Vercel (HTTPS) |

📁 **Um repositório só** (monorepo), cada parte na sua pastinha:

```
agenda-lucy/
├── server.js      🎀 back-end (API)
├── banco/         💾 scripts do banco (Supabase)
├── public/        💅 front-end em HTML
└── react/         🌸 front-end em React
```

---

## 💖 O que o sistema faz

### 👩 Para as clientes
*sem login: cada pedido tem um link pessoal*

- 💇‍♀️ Ver serviços, preços, promoções, horário de funcionamento e contato
- 🗓️ Agendar horário em 4 passos (só aparecem horários livres), remarcar e cancelar
- ✏️ Corrigir recado e necessidades enquanto a Lucy ainda não respondeu
- 💬 Avisar a Lucy pelo WhatsApp com a mensagem prontinha
- 💸 Pagar por Pix (QR code e "copia e cola"), cartão ou dinheiro
- 📱 Salvar o horário na agenda do celular (`.ics` ou Google Agenda)
- ⭐ Avaliar o atendimento (1 a 5 estrelas) e agendar o retorno
- 💄 Catálogos Avon, Natura e Hinode, com o código da consultora
- 🧼 A lavagem já está incluída no valor de todos os serviços

### 💁‍♀️ Para a Lucy
*painel com login — CRUD completo (criar, ver, editar e excluir)*

- 📋 **Pedidos:** confirmar, recusar, cancelar, concluir, marcar falta + lembretes de amanhã
- 🗓️ **Agenda:** um dia por vez, marcar horário e aviso quando dois horários se cruzam (ela decide se confirma mesmo assim)
- 👯 **Clientes:** ficha com alergias, necessidades, anotações e histórico (tintura usada e quantidade)
- ✂️ **Serviços, horários, folgas, feriados e promoções**
- 💸 **Pagamentos:** Pix com QR code, cartão e dinheiro
- 🔁 **Retornos:** quem está na hora de voltar
- 📊 **Relatórios:** quanto entrou, a receber, serviços mais feitos, clientes que mais vieram, planilha para o Excel e resumo pelo WhatsApp
- ⭐ **Avaliações**

---

## 🐱 O Remy

O Remy é o gato do salão e se acha o secretário da Lucy. Na página inicial ele aparece com umas piadinhas (tipo cochilar no lugar mais fresquinho do salão e chamar isso de "trabalho remoto").

Mas nem todo mundo é fã de gatinho, e tudo bem! 💕 A cliente pode tocar em **"prefiro que ele fique longe"** (medo, alergia ou não gosta). Aí o site para de mostrar as brincadeiras para ela, e a Lucy fica sabendo no painel. A Lucy também pode desligar o Remy do site quando quiser.

---

## 🔒 Segurança

- 🛡️ HTTPS obrigatório, cabeçalhos de segurança e CORS só para os sites do projeto
- 🔑 Chave secreta do Supabase **só nas variáveis de ambiente** (nunca no código)
- ✅ Todos os dados validados no servidor; links só com `http(s)://`
- 🚦 Limite de tentativas por IP (login, pedidos e alterações)
- 🙈 Rotas públicas não mostram ids internos, a chave Pix nem dados de outras clientes

---

## 🧁 Como rodar

1. 💾 No Supabase (SQL Editor), rode na ordem: `banco/banco.sql`, `banco/permissoes.sql` e, se quiser os dados iniciais da Lucy, `banco/ajustes-lucy.sql`.
   Quem já tinha o banco das etapas anteriores roda só `banco/etapa7.sql`.
2. 👤 Crie o usuário da Lucy em **Authentication → Users**.
3. 🔐 Configure as variáveis de ambiente (veja `.env.example`): `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `ADMIN_EMAIL` e, para a versão React, `ALLOWED_ORIGINS`.
4. 💻 No computador: copie `.env.example` para `.env`, preencha, rode `npm install` e `node --env-file=.env server.js` (abre em `http://localhost:3000`).
   ☁️ Na Vercel, cada push publica sozinho.

🌸 Versão em React: veja [react/README.md](react/README.md)
🔮 Ideias de melhoria: veja [PARA-O-FUTURO.md](PARA-O-FUTURO.md)

---

<div align="center">

feito com 💖, ☕ e supervisão felina 🐾

✿ ✿ ✿

</div>

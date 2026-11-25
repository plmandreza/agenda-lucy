# Lucy Cabeleireira — versão em React

A mesma página das clientes do site principal, feita em **React 19 + Vite**. Ela conversa com o **mesmo servidor** (`server.js`) e o **mesmo banco**: um pedido feito aqui aparece no painel da Lucy normalmente.

| | Versão HTML | Versão React |
|---|---|---|
| Onde fica | `public/index.html` | esta pasta (`react/`) |
| Como é feita | um arquivo, HTML + JS "na mão" | componentes React (`src/telas`, `src/componentes`) |
| Servidor | o próprio site | o site principal, pelo endereço em `VITE_API_URL` |

## Estrutura
```
react/
├── index.html            página base (o React desenha dentro de <div id="raiz">)
├── vite.config.js
└── src/
    ├── main.jsx          ponto de partida
    ├── App.jsx           cabeçalho, rodapé e a escolha da tela pelo "#" do endereço
    ├── api.js            conversa com o servidor
    ├── ferramentas.js    datas, dinheiro, WhatsApp, Remy, agenda do celular
    ├── qr.js             QR code do Pix (mesmo código da versão HTML)
    ├── estilo.css        mesmo visual da versão HTML
    ├── componentes/      pedaços reaproveitados (botão copiar, campo do Remy…)
    └── telas/            Início, Agendar, Pedido, Meu horário, Área da Lucy
```

## Publicar na Vercel (projeto separado)
1. Vercel → **Add New → Project** → importar o mesmo repositório.
2. **Root Directory:** `react` (o Vite é reconhecido sozinho).
3. Variável de ambiente `VITE_API_URL` = endereço do site principal (ex.: `https://agenda-lucy.vercel.app`).
4. No projeto principal, adicionar `ALLOWED_ORIGINS` = endereço deste projeto React e publicar de novo.

## Rodar no computador (opcional)
Precisa do Node.js 20.19 ou mais novo.
```
cd react
npm install
npm run dev
```

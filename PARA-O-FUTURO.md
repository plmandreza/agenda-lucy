# Para o futuro — sugestões de melhoria

O que ficou de fora desta versão, por custo, por complexidade ou por escolha da Lucy. Está em ordem de utilidade para o dia a dia do salão.

## 1. Avisos automáticos
- **E-mail automático.** Avisar a Lucy de pedidos novos, remarcados e cancelados; mandar a confirmação para a cliente e lembrete no dia anterior.
  - Já foi prototipado e testado (Gmail com "senha de app", biblioteca `nodemailer`, tarefa diária da Vercel protegida por `CRON_SECRET`). Saiu porque a Lucy usa mais o WhatsApp.
  - Para voltar: reativar o código e usar as colunas que já existem no banco (`email_lucy`, `aceita_lembrete_email`, `lembrete_enviado_em`). Numa versão profissional, usar domínio próprio e um serviço de envio (ex.: Resend).
- **API oficial do WhatsApp (Meta).** Hoje as mensagens saem por links prontos (`wa.me`) e alguém toca em Enviar. Com a API oficial, confirmação e lembretes iriam sozinhos. É paga por conversa e exige verificação da empresa.
- **Notificação no celular da Lucy** (o site instalado como aplicativo, PWA com notificações), para ela saber de um pedido novo sem abrir o painel.

## 2. Pagamento
- **Confirmação automática do Pix.** Hoje o QR code leva o dinheiro direto para a conta da Lucy, mas o sistema não sabe quando o Pix entra: a Lucy confere no banco e marca "pago". Com um intermediador (ex.: Mercado Pago), o banco avisa o sistema e o pagamento fica "pago" sozinho. Tem taxa por transação.
- **Sinal para reservar** horários longos (ex.: tintura), se as faltas aumentarem.

## 3. Agenda
- **Lista de espera:** quem não achou horário pede para ser avisada se alguém cancelar.
- **Bloquear um pedaço do dia** (ex.: "das 14h às 15h vou ao banco") sem fechar o dia todo.
- **Mais de uma profissional**, cada uma com a sua agenda, se o salão crescer.

## 4. Clientes
- **Mensagem de aniversário** pelo WhatsApp (a data de nascimento já fica na ficha).
- **Programa de fidelidade** (ex.: a cada 10 visitas, uma hidratação grátis).
- **Fotos de antes e depois** na ficha (o espaço de armazenamento `fotos` já foi criado no Supabase).
- **Privacidade (LGPD):** página de política de privacidade e botão para a cliente pedir a exclusão dos seus dados.

## 5. Infraestrutura
- **Versão em React** do front-end (planejada; precisa da variável `ALLOWED_ORIGINS` para o servidor aceitar o novo endereço).
- **Plano Pro da Vercel**, se o sistema passar a ter uso comercial (o plano Hobby é só para uso pessoal).
- **Supabase na região São Paulo**, para o site ficar um pouco mais rápido (a opção não apareceu na criação do projeto).
- **Testes automáticos no GitHub** (rodar os testes a cada envio de código) e **cópia de segurança** periódica do banco.
- **Domínio próprio** (ex.: `lucycabeleireira.com.br`).

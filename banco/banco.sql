-- =====================================================================
--  LUCY CABELEIREIRA — Estrutura do banco de dados (versão 2)
--
--  Como usar: no Supabase, abra "SQL Editor", cole TUDO e clique "Run".
--  Pode rodar de novo sem medo: nada é duplicado nem apagado.
--  Se você já rodou a versão 1, rode esta também: ela só acrescenta
--  o que mudou (seção 12, no final).
--
--  Novidades da versão 2 (a partir da conversa com a Lucy):
--   * A cliente PEDE o horário e a Lucy CONFIRMA ou RECUSA.
--   * A Lucy também marca horários pelo painel (quando a cliente liga).
--   * Antecedência mínima para cancelar, configurável.
--   * Quantidade de tintura (tubos/ml) na ficha.
--   * "De quantos em quantos dias" cada serviço costuma ser refeito,
--     para a lista de retornos que só a Lucy vê.
--
--  Cada "create table" abaixo é uma "planilha" do salão.
--  Linhas que começam com "--" são comentários (só explicação).
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. CONFIGURAÇÕES DO SALÃO  (uma linha só, editada pela Lucy no painel)
-- ---------------------------------------------------------------------
create table if not exists configuracoes (
  id                      smallint primary key default 1 check (id = 1),
  nome_salao              text not null default 'Lucy Cabeleireira',
  endereco                text,
  whatsapp_lucy           text,   -- só números, com 55 + DDD: 5511999998888
  email_lucy              text,
  chave_pix               text,
  nome_recebedor_pix      text,   -- até 25 letras, sem acento (exigência do Pix)
  cidade_pix              text,   -- até 15 letras, sem acento
  -- Quando oferecer "quer agendar o retorno?":
  --   'ao_finalizar'   = assim que a Lucy marca o serviço como concluído
  --   'apos_pagamento' = só quando o pagamento é registrado
  retorno_momento         text not null default 'ao_finalizar'
                          check (retorno_momento in ('ao_finalizar','apos_pagamento')),
  intervalo_agenda_min    int  not null default 30,  -- horários aparecem de 30 em 30 min
  antecedencia_min_horas  int  not null default 2,   -- não deixa marcar em cima da hora
  antecedencia_cancelamento_horas int not null default 0, -- 0 = pode cancelar a qualquer hora
  dias_a_frente           int  not null default 45,  -- até quantos dias no futuro dá para marcar
  codigo_avon             text, link_avon   text,
  codigo_natura           text, link_natura text,
  codigo_hinode           text, link_hinode text,
  atualizado_em           timestamptz not null default now()
);
insert into configuracoes (id) values (1) on conflict do nothing;


-- ---------------------------------------------------------------------
-- 2. SERVIÇOS  (a Lucy ajusta duração e preço no painel)
-- ---------------------------------------------------------------------
create table if not exists servicos (
  id           uuid primary key default gen_random_uuid(),
  nome         text not null unique,
  descricao    text,
  duracao_min  int  not null check (duracao_min > 0),
  preco        numeric(10,2) not null default 0 check (preco >= 0),
  ativo        boolean not null default true,
  ordem        int not null default 0,
  retorno_dias int check (retorno_dias > 0)  -- ex.: tintura a cada 30 dias (vazio = não lembrar)
);
-- Durações segundo a Lucy: "1h pelo menos, alguns até 3h".
-- Preços começam em 0 até a Lucy preencher no painel.
insert into servicos (nome, descricao, duracao_min, ordem) values
  ('Corte feminino',                  'Com lavagem grátis', 60,  1),
  ('Corte masculino',                 'Com lavagem grátis', 60,  2),
  ('Tintura',                         null,                 180, 3),
  ('Sobrancelha (design e tintura)',  null,                 60,  4),
  ('Escova simples',                  null,                 60,  5),
  ('Hidratação / tratamento capilar', null,                 60,  6)
on conflict (nome) do nothing;


-- ---------------------------------------------------------------------
-- 3. JANELA DE PEDIDOS  (um registro por dia da semana)
--    A Lucy ajusta o horário à necessidade da cliente, então isto NÃO é
--    um horário rígido: é a faixa em que a cliente pode PEDIR um horário.
--    A palavra final é sempre da Lucy, que confirma ou recusa.
--    0 = domingo, 1 = segunda ... 6 = sábado
-- ---------------------------------------------------------------------
create table if not exists horarios_funcionamento (
  dia_semana    smallint primary key check (dia_semana between 0 and 6),
  trabalha      boolean not null default false,
  abre          time,
  fecha         time,
  pausa_inicio  time,   -- almoço (opcional)
  pausa_fim     time,
  check (not trabalha or (abre is not null and fecha is not null and abre < fecha)),
  check ((pausa_inicio is null) = (pausa_fim is null)),
  check (pausa_inicio is null or pausa_inicio < pausa_fim)
);
-- Segundo a Lucy: "todo dia, manhã e tarde, mas só até 18h".
insert into horarios_funcionamento values
  (0, true, '08:00', '18:00', null, null),
  (1, true, '08:00', '18:00', null, null),
  (2, true, '08:00', '18:00', null, null),
  (3, true, '08:00', '18:00', null, null),
  (4, true, '08:00', '18:00', null, null),
  (5, true, '08:00', '18:00', null, null),
  (6, true, '08:00', '18:00', null, null)
on conflict do nothing;


-- ---------------------------------------------------------------------
-- 4. DIAS ESPECIAIS  (feriados, folgas, horário diferente num dia)
-- ---------------------------------------------------------------------
create table if not exists dias_especiais (
  id         uuid primary key default gen_random_uuid(),
  data       date not null unique,
  tipo       text not null check (tipo in ('fechado','horario_especial')),
  abre       time,
  fecha      time,
  motivo     text,   -- ex.: "Feriado de Natal", "Consulta médica"
  criado_em  timestamptz not null default now(),
  check (tipo = 'fechado' or (abre is not null and fecha is not null and abre < fecha))
);


-- ---------------------------------------------------------------------
-- 5. CLIENTES  (a ficha de cada cliente)
-- ---------------------------------------------------------------------
create table if not exists clientes (
  id                        uuid primary key default gen_random_uuid(),
  nome                      text not null,
  whatsapp                  text not null unique,  -- só números: 5511999998888
  email                     text,
  data_nascimento           date,
  alergias                  text,
  observacoes               text,   -- anotações livres da Lucy
  necessidades_especificas  text,   -- o que a cliente contar sobre acessibilidade e cuidados
  quer_remy                 boolean not null default true,
  aceita_lembrete_email     boolean not null default true,
  criado_em                 timestamptz not null default now()
);


-- ---------------------------------------------------------------------
-- 6. AGENDAMENTOS
-- ---------------------------------------------------------------------
create table if not exists agendamentos (
  id                   uuid primary key default gen_random_uuid(),
  cliente_id           uuid not null references clientes(id) on delete cascade,
  inicio               timestamptz not null,
  fim                  timestamptz not null,
  -- Caminho de um agendamento:
  --   solicitado -> (Lucy confirma) agendado -> concluido
  --   solicitado -> (Lucy recusa)   recusado
  --   agendado   -> cancelado  (pela cliente ou pela Lucy)  /  faltou
  status               text not null default 'solicitado',
  constraint agendamentos_status_check
    check (status in ('solicitado','agendado','recusado','concluido','cancelado','faltou')),
  origem               text not null default 'cliente'
                       check (origem in ('cliente','lucy')),  -- 'lucy' = marcado por ela no painel
  confirmado_em        timestamptz,
  -- "Chave secreta" do link pessoal da cliente (remarcar/cancelar/avaliar sem senha)
  token                uuid not null unique default gen_random_uuid(),
  valor_total          numeric(10,2) not null default 0,
  forma_pagamento      text check (forma_pagamento in ('pix','cartao','dinheiro')),
  pago                 boolean not null default false,
  pago_em              timestamptz,
  concluido_em         timestamptz,
  cancelado_por        text check (cancelado_por in ('cliente','lucy')),
  observacao_cliente   text,
  lembrete_enviado_em  timestamptz,
  retorno_de           uuid references agendamentos(id) on delete set null,
  criado_em            timestamptz not null default now(),
  check (fim > inicio),
  -- Trava de segurança: impede dois horários CONFIRMADOS ao mesmo tempo
  -- (a Lucy atende uma cliente por vez). Pedidos ainda não confirmados
  -- podem coincidir; a trava age na hora em que a Lucy confirma.
  constraint sem_horario_duplo
    exclude using gist (tstzrange(inicio, fim) with &&) where (status = 'agendado')
);
create index if not exists agendamentos_inicio_idx  on agendamentos (inicio);
create index if not exists agendamentos_cliente_idx on agendamentos (cliente_id);


-- Serviços escolhidos em cada agendamento.
-- Guardamos uma CÓPIA do nome/preço: se a Lucy mudar o preço depois,
-- o histórico antigo continua mostrando o valor que foi cobrado.
create table if not exists agendamento_servicos (
  id              uuid primary key default gen_random_uuid(),
  agendamento_id  uuid not null references agendamentos(id) on delete cascade,
  servico_id      uuid references servicos(id) on delete set null,
  nome            text not null,
  preco           numeric(10,2) not null default 0,
  duracao_min     int not null
);
create index if not exists agserv_agendamento_idx on agendamento_servicos (agendamento_id);


-- ---------------------------------------------------------------------
-- 7. HISTÓRICO DE ATENDIMENTOS  (o que foi feito em cada visita)
-- ---------------------------------------------------------------------
create table if not exists historico_atendimentos (
  id                   uuid primary key default gen_random_uuid(),
  cliente_id           uuid not null references clientes(id) on delete cascade,
  agendamento_id       uuid references agendamentos(id) on delete set null,
  data                 date not null,
  servicos_realizados  text,
  tintura_utilizada    text,   -- marca, cor, número, oxidante...
  tintura_quantidade   text,   -- ex.: "1 tubo + 30 ml"
  anotacoes            text,
  foto_antes           text,   -- caminho da foto guardada (opcional)
  foto_depois          text,
  criado_em            timestamptz not null default now()
);
create index if not exists historico_cliente_idx on historico_atendimentos (cliente_id);


-- ---------------------------------------------------------------------
-- 8. AVALIAÇÕES  (uma por atendimento)
-- ---------------------------------------------------------------------
create table if not exists avaliacoes (
  id              uuid primary key default gen_random_uuid(),
  agendamento_id  uuid not null unique references agendamentos(id) on delete cascade,
  nota            smallint not null check (nota between 1 and 5),
  comentario      text,
  criado_em       timestamptz not null default now()
);


-- ---------------------------------------------------------------------
-- 9. PROMOÇÕES  (a Lucy liga e desliga quando quiser)
-- ---------------------------------------------------------------------
create table if not exists promocoes (
  id          uuid primary key default gen_random_uuid(),
  titulo      text not null,
  descricao   text,
  ativa       boolean not null default false,
  valida_ate  date,
  criado_em   timestamptz not null default now()
);


-- ---------------------------------------------------------------------
-- 10. SEGURANÇA: "tranca" todas as tabelas.
--     Com a tranca ligada e nenhuma regra de acesso, ninguém de fora
--     lê nada. Só o server.js (com a chave secreta) consegue entrar.
-- ---------------------------------------------------------------------
alter table configuracoes          enable row level security;
alter table servicos               enable row level security;
alter table horarios_funcionamento enable row level security;
alter table dias_especiais         enable row level security;
alter table clientes               enable row level security;
alter table agendamentos           enable row level security;
alter table agendamento_servicos   enable row level security;
alter table historico_atendimentos enable row level security;
alter table avaliacoes             enable row level security;
alter table promocoes              enable row level security;


-- ---------------------------------------------------------------------
-- 11. PASTA PRIVADA PARA FOTOS DE ANTES/DEPOIS (opcional)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('fotos', 'fotos', false)
on conflict (id) do nothing;


-- ---------------------------------------------------------------------
-- 12. ATUALIZAÇÕES DA VERSÃO 2
--     Para quem já tinha rodado a versão 1. Em banco novo, não muda nada.
-- ---------------------------------------------------------------------
alter table configuracoes
  add column if not exists antecedencia_cancelamento_horas int not null default 0;

alter table servicos
  add column if not exists retorno_dias int check (retorno_dias > 0);

alter table historico_atendimentos
  add column if not exists tintura_quantidade text;

alter table agendamentos
  add column if not exists origem text not null default 'cliente'
    check (origem in ('cliente','lucy')),
  add column if not exists confirmado_em timestamptz;
alter table agendamentos drop constraint if exists agendamentos_status_check;
alter table agendamentos add constraint agendamentos_status_check
  check (status in ('solicitado','agendado','recusado','concluido','cancelado','faltou'));
alter table agendamentos alter column status set default 'solicitado';

create index if not exists agendamentos_status_idx on agendamentos (status);


-- ---------------------------------------------------------------------
-- 13. PERMISSÃO PARA O SERVIDOR (exigida pelo Supabase desde 30/05/2026)
--     Só o "service_role" (chave secreta do server.js) recebe acesso.
--     Visitantes (anon) e logins diretos (authenticated) ficam sem acesso.
-- ---------------------------------------------------------------------
grant usage on schema public to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
alter default privileges in schema public
  grant select, insert, update, delete on tables to service_role;
alter default privileges in schema public
  grant usage, select on sequences to service_role;


-- Pronto! Se apareceu "Success. No rows returned", deu tudo certo.

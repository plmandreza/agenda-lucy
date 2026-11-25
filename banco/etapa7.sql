-- =====================================================================
-- Lucy Cabeleireira — ETAPA 7 (Remy e horários ao mesmo tempo)
-- Rode UMA vez no Supabase: SQL Editor → New query → cole tudo → Run.
-- Pode rodar de novo sem problema (só cria o que ainda não existe).
-- =====================================================================

-- O Remy é o gato do salão. Quem tem medo, alergia ou não gosta de gatos
-- pode pedir para ele ficar longe — e a Lucy vê isso no painel.
alter table clientes
  add column if not exists sem_remy boolean not null default false,
  add column if not exists motivo_sem_remy text
    check (motivo_sem_remy in ('medo','alergia','nao_gosto','outro'));

alter table agendamentos
  add column if not exists sem_remy boolean not null default false;

-- A Lucy pode desligar tudo do Remy no site (ex.: se ele não estiver no salão).
alter table configuracoes
  add column if not exists remy_ligado boolean not null default true;

-- Horários ao mesmo tempo: em vez de bloquear, o sistema avisa e a Lucy decide.
alter table agendamentos drop constraint if exists sem_horario_duplo;

-- Pronto! Se apareceu "Success. No rows returned", deu tudo certo.

-- =====================================================================
--  LUCY CABELEIREIRA — Permissão para o servidor ler e gravar
--
--  Por quê: desde 30/05/2026, projetos novos do Supabase NÃO liberam
--  as tabelas automaticamente. Sem isto, o server.js recebe
--  "permission denied" (a porta existe, mas ele não tem a chave dela).
--
--  O que faz: dá acesso SOMENTE ao "service_role" (o papel usado pela
--  chave secreta do servidor). As clientes e visitantes (anon) e
--  usuários logados direto no Supabase (authenticated) continuam SEM
--  acesso nenhum — o servidor segue sendo a única porta de entrada.
--
--  Como usar: SQL Editor > colar tudo > "Run". Pode rodar de novo.
-- =====================================================================

grant usage on schema public to service_role;

grant select, insert, update, delete
  on all tables in schema public
  to service_role;

grant usage, select
  on all sequences in schema public
  to service_role;

-- Tabelas criadas no futuro (próximas etapas) também ficam liberadas
-- para o servidor, e só para ele.
alter default privileges in schema public
  grant select, insert, update, delete on tables to service_role;
alter default privileges in schema public
  grant usage, select on sequences to service_role;

-- Conferência: deve listar as 10 tabelas, cada uma com "true".
select tablename as tabela,
       has_table_privilege('service_role', 'public.' || tablename, 'select') as servidor_pode_ler
from pg_tables
where schemaname = 'public'
order by tablename;

-- =============================================================================
-- 0010_grants.sql — Privilégios de tabela para os papéis do Supabase
--
-- O Supabase já configura default privileges no schema public, mas deixar isso
-- explícito torna o schema autocontido: se você restaurar o banco em outro
-- projeto ou rodar estas migrations num Postgres puro, o acesso continua certo.
--
-- Estes são privilégios de TABELA. Quem realmente decide o que cada usuário
-- enxerga são as policies RLS da migration 0002 — sem elas, estes grants não
-- liberariam nada além do próprio escopo do usuário.
-- =============================================================================

grant usage on schema public to anon, authenticated, service_role;

-- Leitura e escrita de tabela ficam sob RLS.
grant select, insert, update, delete on all tables in schema public
  to authenticated, service_role;

grant usage, select on all sequences in schema public to authenticated, service_role;

-- Tabelas em que a escrita só deve acontecer pelas funções RPC.
revoke insert, update, delete on lotes_estoque, movimentacoes, log_auditoria
  from authenticated;

-- Movimentações e log são append-only até para a service_role (triggers já
-- bloqueiam update/delete, mas revogar deixa a intenção explícita).
revoke update, delete on movimentacoes, log_auditoria from service_role;

-- O usuário anônimo não acessa nada: só existe o fluxo de login.
revoke all on all tables in schema public from anon;

alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated, service_role;

alter default privileges in schema public
  grant usage, select on sequences to authenticated, service_role;

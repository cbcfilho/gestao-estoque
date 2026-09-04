-- =============================================================================
-- 0020_corrige_recursao_usuarios.sql — Corrige "infinite recursion detected
-- in policy for relation 'usuarios'"
--
-- `usuarios_update_proprio` (0002_seguranca_rls.sql) checa, no WITH CHECK,
-- que perfil_id e ativo não mudaram — comparando com uma subconsulta direta
-- em `usuarios`:
--
--   with check (
--     id = auth.uid()
--     and perfil_id = (select u.perfil_id from usuarios u where u.id = auth.uid())
--     and ativo     = (select u.ativo     from usuarios u where u.id = auth.uid())
--   )
--
-- Uma policy de `usuarios` que consulta `usuarios` de novo, direto (sem
-- passar por uma função SECURITY DEFINER, que é o que quebra o ciclo em
-- toda outra policy do projeto), obriga o planner a expandir a RLS de
-- `usuarios` enquanto ainda está expandindo a RLS de `usuarios` — Postgres
-- detecta esse ciclo e recusa a consulta, em qualquer UPDATE na tabela,
-- de qualquer usuário, não só de quem está editando o próprio registro.
-- É por isso que salvar a edição de QUALQUER usuário na tela de
-- Configurações → Usuários vinha falhando, não só ao mexer nas filiais.
--
-- A correção segue o padrão já usado por toda outra policy do projeto
-- (auth_tem_permissao, auth_pode_acessar_filial, ...): embrulhar a leitura
-- em uma função SECURITY DEFINER. A função roda como o dono (que ignora
-- RLS), então a mesma consulta que antes reabria a policy agora não passa
-- por ela — o ciclo desaparece sem mudar a regra de negócio (o próprio
-- usuário continua só podendo editar nome/telefone).
-- =============================================================================

create or replace function auth_meu_perfil_id()
returns uuid
language sql
stable
security definer
set search_path = public, auth
as $$
  select perfil_id from usuarios where id = auth.uid();
$$;

create or replace function auth_meu_status_ativo()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select ativo from usuarios where id = auth.uid();
$$;

-- Chamadas de dentro de uma policy avaliada como `authenticated` — sem
-- EXECUTE, toda tentativa de editar o próprio usuário vira "permission
-- denied" (mesmo motivo pelo qual auth_tem_permissao e companhia já
-- recebem esse grant nominal, na 0015).
revoke all on function auth_meu_perfil_id(), auth_meu_status_ativo() from public, anon;
grant execute on function auth_meu_perfil_id(), auth_meu_status_ativo() to authenticated;

drop policy if exists usuarios_update_proprio on usuarios;

create policy usuarios_update_proprio on usuarios for update to authenticated
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and perfil_id = auth_meu_perfil_id()
    and ativo = auth_meu_status_ativo()
  );

-- =============================================================================
-- 0015_revoga_execute_do_anon.sql — Tira do visitante o direito de chamar as
-- funções SECURITY DEFINER
--
-- O linter do Supabase acusa 34 funções `SECURITY DEFINER` chamáveis pelo papel
-- `anon` via /rest/v1/rpc/<nome>. Não é uma porta aberta: toda função de escrita
-- checa `auth_exige_permissao(...)` na primeira linha, e sem sessão o visitante
-- leva "Permissão negada". A checagem foi conferida antes desta migration.
--
-- Mesmo assim o grant não deveria existir. Uma função SECURITY DEFINER roda com
-- os privilégios do dono e ignora RLS: a checagem de permissão é a ÚNICA barreira.
-- Deixar o visitante bater na porta significa que qualquer função futura que
-- esqueça a checagem — ou a reordene para depois de um efeito colateral — vira
-- buraco aberto para a internet, sem nada atrás. Esta migration acrescenta a
-- segunda camada: quem não tem sessão não alcança a função nem para tentar.
--
-- Por que revogar de PUBLIC e não de `anon`
-- ----------------------------------------
-- O Postgres concede EXECUTE a PUBLIC por padrão em toda função nova, e as
-- migrations anteriores nunca tiraram. `anon` executa por causa desse grant, não
-- de um grant próprio. Revogar de `anon` isoladamente não muda nada — testado:
--
--   revoke execute ... from anon;    -> has_function_privilege('anon',...) = true
--   revoke execute ... from public;  -> has_function_privilege('anon',...) = false
--
-- Por isso o alvo é PUBLIC. `anon` entra junto só para o caso de alguém ter dado
-- um grant nominal em algum momento.
--
-- O que continua funcionando
-- --------------------------
-- 1. As RPCs que a tela chama (fn_registrar_saida, fn_criar_transferencia, ...)
--    receberam `grant execute ... to authenticated` explícito nas migrations
--    0005/0006/0008/0012/0013. Grant nominal e grant de PUBLIC são entradas
--    separadas na ACL: revogar um não mexe no outro.
-- 2. As funções auxiliares de autorização (auth_tem_permissao e companhia) são
--    chamadas de dentro das policies de RLS, e policy é avaliada com os
--    privilégios de QUEM CONSULTA — não do dono da tabela. Sem EXECUTE para
--    `authenticated`, toda consulta do app viraria "permission denied". Por isso
--    elas ganham o grant nominal abaixo. São 66 policies dependendo disso.
-- 3. Funções de gatilho não precisam de grant: o Postgres checa EXECUTE na
--    criação do gatilho, não a cada disparo.
-- 4. `service_role` (o cron) tem grant nominal em fn_gerar_tarefas_automaticas e
--    fn_criar_tarefa_sistema, e não passa por RLS.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Revogação em bloco
--
-- Em bloco, e não uma lista de assinaturas, de propósito: lista dá manutenção e
-- silenciosamente deixa de fora a função que alguém criar depois. O laço pega
-- toda SECURITY DEFINER do schema public, hoje e no dia em que a suíte rodar de
-- novo sobre um banco novo.
-- -----------------------------------------------------------------------------

do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as assinatura
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prosecdef
  loop
    execute format('revoke execute on function %s from public, anon', f.assinatura);
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- Devolve o que as policies de RLS precisam
--
-- Estas cinco aparecem dentro de `using`/`with check` das policies. Sem elas,
-- `authenticated` não consegue nem listar produtos.
-- -----------------------------------------------------------------------------

grant execute on function
  auth_tem_permissao(text),
  auth_pode_acessar_filial(uuid),
  auth_usuario_ativo(),
  auth_escopo_global(),
  auth_filiais_permitidas()
  to authenticated;

-- =============================================================================
-- 0011_ultimo_acesso.sql — Espelha o último login no perfil da aplicação
--
-- Antes, `usuarios.ultimo_acesso` só era escrito pela Server Action do
-- formulário de login. Quem entrava por link de convite ou de recuperação de
-- senha nunca passava por lá, e a tela de Usuários mostrava "nunca entrou"
-- mesmo para quem já estava usando o sistema.
--
-- Quem sabe de verdade quando alguém entrou é o Auth. Este gatilho copia esse
-- dado para a tabela da aplicação, cobrindo todos os caminhos de entrada —
-- senha, link, e qualquer outro que venha a existir — sem depender de a
-- aplicação lembrar de registrar.
-- =============================================================================

create or replace function fn_sincroniza_ultimo_acesso()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  update usuarios
     set ultimo_acesso = new.last_sign_in_at
   where id = new.id;

  return new;
end;
$$;

create trigger trg_auth_ultimo_acesso
  after update of last_sign_in_at on auth.users
  for each row
  when (new.last_sign_in_at is distinct from old.last_sign_in_at)
  execute function fn_sincroniza_ultimo_acesso();

-- Preenche o que já aconteceu antes deste gatilho existir.
update usuarios u
   set ultimo_acesso = a.last_sign_in_at
  from auth.users a
 where a.id = u.id
   and a.last_sign_in_at is not null
   and u.ultimo_acesso is distinct from a.last_sign_in_at;

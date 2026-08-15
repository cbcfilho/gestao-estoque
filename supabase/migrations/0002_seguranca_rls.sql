-- =============================================================================
-- 0002_seguranca_rls.sql — Funções de autorização e políticas RLS
--
-- Regra geral do sistema:
--   * Leitura é liberada conforme escopo do perfil (global x filiais vinculadas).
--   * Escrita de estoque NUNCA acontece direto na tabela: só através das funções
--     RPC (SECURITY DEFINER) definidas nas migrations 0005/0006. Por isso não
--     existem policies de INSERT/UPDATE/DELETE em lotes_estoque e movimentacoes.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Funções auxiliares de autorização
-- Todas SECURITY DEFINER para não recursar nas próprias policies.
-- -----------------------------------------------------------------------------

create or replace function auth_usuario_id()
returns uuid
language sql
stable
as $$
  select auth.uid();
$$;

create or replace function auth_usuario_ativo()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1 from usuarios u where u.id = auth.uid() and u.ativo
  );
$$;

create or replace function auth_escopo_global()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select coalesce(
    (select p.escopo = 'global'
       from usuarios u
       join perfis p on p.id = u.perfil_id
      where u.id = auth.uid() and u.ativo),
    false
  );
$$;

create or replace function auth_tem_permissao(p_chave text)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
      from usuarios u
      join perfil_permissoes pp on pp.perfil_id = u.perfil_id
     where u.id = auth.uid()
       and u.ativo
       and pp.permissao_chave = p_chave
  );
$$;

comment on function auth_tem_permissao(text) is
  'Verifica se o usuário autenticado possui a permissão informada, via perfil.';

create or replace function auth_filiais_permitidas()
returns setof uuid
language sql
stable
security definer
set search_path = public, auth
as $$
  select f.id
    from filiais f
   where auth_escopo_global()
  union
  select uf.filial_id
    from usuario_filiais uf
    join usuarios u on u.id = uf.usuario_id
   where uf.usuario_id = auth.uid() and u.ativo;
$$;

create or replace function auth_pode_acessar_filial(p_filial_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select p_filial_id is not null and (
    auth_escopo_global()
    or exists (
      select 1
        from usuario_filiais uf
        join usuarios u on u.id = uf.usuario_id
       where uf.usuario_id = auth.uid()
         and uf.filial_id = p_filial_id
         and u.ativo
    )
  );
$$;

-- Usada pelas RPCs: aborta a operação quando falta permissão.
create or replace function auth_exige_permissao(p_chave text)
returns void
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if not auth_tem_permissao(p_chave) then
    raise exception 'Permissão negada: % é necessária para esta operação.', p_chave
      using errcode = 'insufficient_privilege';
  end if;
end;
$$;

create or replace function auth_exige_filial(p_filial_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if not auth_pode_acessar_filial(p_filial_id) then
    raise exception 'Acesso negado à filial informada.'
      using errcode = 'insufficient_privilege';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Provisionamento automático do registro em usuarios ao criar o auth.user
-- -----------------------------------------------------------------------------

create or replace function fn_novo_usuario_auth()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_perfil_id uuid;
  v_nome      text;
begin
  -- Perfil vem do metadata do convite; cai para "operador" quando ausente.
  select id into v_perfil_id
    from perfis
   where chave = coalesce(new.raw_user_meta_data->>'perfil', 'operador');

  if v_perfil_id is null then
    select id into v_perfil_id from perfis where chave = 'operador';
  end if;

  v_nome := coalesce(new.raw_user_meta_data->>'nome', split_part(new.email, '@', 1));

  insert into usuarios (id, nome, email, perfil_id)
  values (new.id, v_nome, new.email, v_perfil_id)
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger trg_auth_user_criado
  after insert on auth.users
  for each row execute function fn_novo_usuario_auth();

-- -----------------------------------------------------------------------------
-- Habilita RLS em todas as tabelas de aplicação
-- -----------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'filiais','filial_locais','perfis','permissoes','perfil_permissoes',
    'usuarios','usuario_filiais','categorias','fornecedores','produtos',
    'produto_filiais','lotes_estoque','transferencias','transferencia_itens',
    'movimentacoes','inventarios','inventario_itens','tarefas',
    'tarefa_comentarios','tarefa_anexos','notificacoes','push_subscriptions',
    'registros_ponto','log_auditoria','configuracoes'
  ]
  loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- Filiais
-- -----------------------------------------------------------------------------

create policy filiais_select on filiais for select to authenticated
  using (auth_pode_acessar_filial(id));

create policy filiais_insert on filiais for insert to authenticated
  with check (auth_tem_permissao('filiais.gerenciar'));

create policy filiais_update on filiais for update to authenticated
  using (auth_tem_permissao('filiais.gerenciar'))
  with check (auth_tem_permissao('filiais.gerenciar'));

create policy filiais_delete on filiais for delete to authenticated
  using (auth_tem_permissao('filiais.gerenciar'));

create policy filial_locais_select on filial_locais for select to authenticated
  using (auth_pode_acessar_filial(filial_id));

create policy filial_locais_write on filial_locais for all to authenticated
  using (auth_tem_permissao('filiais.gerenciar'))
  with check (auth_tem_permissao('filiais.gerenciar'));

-- -----------------------------------------------------------------------------
-- Perfis e permissões
-- -----------------------------------------------------------------------------

create policy perfis_select on perfis for select to authenticated
  using (auth_usuario_ativo());

create policy perfis_write on perfis for all to authenticated
  using (auth_tem_permissao('perfis.gerenciar'))
  with check (auth_tem_permissao('perfis.gerenciar'));

create policy permissoes_select on permissoes for select to authenticated
  using (auth_usuario_ativo());

create policy perfil_permissoes_select on perfil_permissoes for select to authenticated
  using (auth_usuario_ativo());

create policy perfil_permissoes_write on perfil_permissoes for all to authenticated
  using (auth_tem_permissao('perfis.gerenciar'))
  with check (auth_tem_permissao('perfis.gerenciar'));

-- -----------------------------------------------------------------------------
-- Usuários
-- -----------------------------------------------------------------------------

create policy usuarios_select on usuarios for select to authenticated
  using (
    id = auth.uid()
    or (
      auth_tem_permissao('usuarios.visualizar')
      and (
        auth_escopo_global()
        or exists (
          select 1 from usuario_filiais uf
           where uf.usuario_id = usuarios.id
             and uf.filial_id in (select auth_filiais_permitidas())
        )
      )
    )
  );

-- O próprio usuário pode editar apenas nome/telefone; troca de perfil exige permissão.
create policy usuarios_update_proprio on usuarios for update to authenticated
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and perfil_id = (select u.perfil_id from usuarios u where u.id = auth.uid())
    and ativo = (select u.ativo from usuarios u where u.id = auth.uid())
  );

create policy usuarios_write on usuarios for all to authenticated
  using (auth_tem_permissao('usuarios.gerenciar'))
  with check (auth_tem_permissao('usuarios.gerenciar'));

create policy usuario_filiais_select on usuario_filiais for select to authenticated
  using (usuario_id = auth.uid() or auth_tem_permissao('usuarios.visualizar'));

create policy usuario_filiais_write on usuario_filiais for all to authenticated
  using (auth_tem_permissao('usuarios.gerenciar'))
  with check (auth_tem_permissao('usuarios.gerenciar'));

-- -----------------------------------------------------------------------------
-- Cadastros (categorias, fornecedores, produtos)
-- -----------------------------------------------------------------------------

create policy categorias_select on categorias for select to authenticated
  using (auth_usuario_ativo());

create policy categorias_write on categorias for all to authenticated
  using (auth_tem_permissao('produtos.gerenciar'))
  with check (auth_tem_permissao('produtos.gerenciar'));

create policy fornecedores_select on fornecedores for select to authenticated
  using (auth_usuario_ativo());

create policy fornecedores_write on fornecedores for all to authenticated
  using (auth_tem_permissao('produtos.gerenciar'))
  with check (auth_tem_permissao('produtos.gerenciar'));

create policy produtos_select on produtos for select to authenticated
  using (auth_usuario_ativo());

create policy produtos_write on produtos for all to authenticated
  using (auth_tem_permissao('produtos.gerenciar'))
  with check (auth_tem_permissao('produtos.gerenciar'));

create policy produto_filiais_select on produto_filiais for select to authenticated
  using (auth_usuario_ativo());

create policy produto_filiais_write on produto_filiais for all to authenticated
  using (auth_tem_permissao('produtos.gerenciar'))
  with check (auth_tem_permissao('produtos.gerenciar'));

-- -----------------------------------------------------------------------------
-- Estoque — leitura por filial; escrita exclusivamente via RPC
-- -----------------------------------------------------------------------------

create policy lotes_estoque_select on lotes_estoque for select to authenticated
  using (auth_pode_acessar_filial(filial_id));

create policy movimentacoes_select on movimentacoes for select to authenticated
  using (
    auth_pode_acessar_filial(filial_origem_id)
    or auth_pode_acessar_filial(filial_destino_id)
  );

-- -----------------------------------------------------------------------------
-- Transferências — leitura para origem e destino; escrita via RPC
-- -----------------------------------------------------------------------------

create policy transferencias_select on transferencias for select to authenticated
  using (
    auth_pode_acessar_filial(filial_origem_id)
    or auth_pode_acessar_filial(filial_destino_id)
  );

create policy transferencia_itens_select on transferencia_itens for select to authenticated
  using (
    exists (
      select 1 from transferencias t
       where t.id = transferencia_itens.transferencia_id
         and (
           auth_pode_acessar_filial(t.filial_origem_id)
           or auth_pode_acessar_filial(t.filial_destino_id)
         )
    )
  );

-- -----------------------------------------------------------------------------
-- Inventário
-- Contagem cega: itens só ficam legíveis na tabela após o fechamento da contagem,
-- ou para quem tem permissão de aprovar. Durante a contagem, o app usa a RPC
-- fn_inventario_itens_para_contagem(), que não retorna quantidade_sistema.
-- -----------------------------------------------------------------------------

create policy inventarios_select on inventarios for select to authenticated
  using (auth_pode_acessar_filial(filial_id));

create policy inventario_itens_select on inventario_itens for select to authenticated
  using (
    exists (
      select 1 from inventarios i
       where i.id = inventario_itens.inventario_id
         and auth_pode_acessar_filial(i.filial_id)
         and (
           i.status in ('aguardando_aprovacao', 'aprovado')
           or auth_tem_permissao('inventario.aprovar')
         )
    )
  );

-- -----------------------------------------------------------------------------
-- Kanban
-- -----------------------------------------------------------------------------

create policy tarefas_select on tarefas for select to authenticated
  using (
    responsavel_id = auth.uid()
    or criado_por = auth.uid()
    or (filial_id is null and auth_escopo_global())
    or auth_pode_acessar_filial(filial_id)
  );

create policy tarefas_insert on tarefas for insert to authenticated
  with check (
    auth_tem_permissao('tarefas.criar')
    and (filial_id is null or auth_pode_acessar_filial(filial_id))
  );

create policy tarefas_update on tarefas for update to authenticated
  using (
    responsavel_id = auth.uid()
    or (auth_tem_permissao('tarefas.gerenciar') and auth_pode_acessar_filial(filial_id))
    or (auth_tem_permissao('tarefas.gerenciar') and filial_id is null and auth_escopo_global())
  )
  with check (
    responsavel_id = auth.uid()
    or auth_tem_permissao('tarefas.gerenciar')
  );

create policy tarefas_delete on tarefas for delete to authenticated
  using (auth_tem_permissao('tarefas.gerenciar') and tipo = 'manual');

create policy tarefa_comentarios_select on tarefa_comentarios for select to authenticated
  using (
    exists (select 1 from tarefas t where t.id = tarefa_comentarios.tarefa_id)
  );

create policy tarefa_comentarios_insert on tarefa_comentarios for insert to authenticated
  with check (
    usuario_id = auth.uid()
    and exists (select 1 from tarefas t where t.id = tarefa_comentarios.tarefa_id)
  );

create policy tarefa_comentarios_delete on tarefa_comentarios for delete to authenticated
  using (usuario_id = auth.uid() or auth_tem_permissao('tarefas.gerenciar'));

create policy tarefa_anexos_select on tarefa_anexos for select to authenticated
  using (exists (select 1 from tarefas t where t.id = tarefa_anexos.tarefa_id));

create policy tarefa_anexos_insert on tarefa_anexos for insert to authenticated
  with check (
    usuario_id = auth.uid()
    and exists (select 1 from tarefas t where t.id = tarefa_anexos.tarefa_id)
  );

create policy tarefa_anexos_delete on tarefa_anexos for delete to authenticated
  using (usuario_id = auth.uid() or auth_tem_permissao('tarefas.gerenciar'));

-- -----------------------------------------------------------------------------
-- Notificações e push — sempre do próprio usuário
-- -----------------------------------------------------------------------------

create policy notificacoes_select on notificacoes for select to authenticated
  using (usuario_id = auth.uid());

create policy notificacoes_update on notificacoes for update to authenticated
  using (usuario_id = auth.uid())
  with check (usuario_id = auth.uid());

create policy notificacoes_delete on notificacoes for delete to authenticated
  using (usuario_id = auth.uid());

create policy push_subscriptions_all on push_subscriptions for all to authenticated
  using (usuario_id = auth.uid())
  with check (usuario_id = auth.uid());

-- -----------------------------------------------------------------------------
-- Ponto (LGPD): o colaborador vê o próprio registro; gestores veem a filial.
-- -----------------------------------------------------------------------------

create policy registros_ponto_select on registros_ponto for select to authenticated
  using (
    usuario_id = auth.uid()
    or (auth_tem_permissao('ponto.gerenciar') and auth_pode_acessar_filial(filial_id))
  );

create policy registros_ponto_insert on registros_ponto for insert to authenticated
  with check (
    (usuario_id = auth.uid() and auth_pode_acessar_filial(filial_id))
    or (auth_tem_permissao('ponto.gerenciar') and auth_pode_acessar_filial(filial_id))
  );

create policy registros_ponto_update on registros_ponto for update to authenticated
  using (auth_tem_permissao('ponto.gerenciar') and auth_pode_acessar_filial(filial_id))
  with check (auth_tem_permissao('ponto.gerenciar') and auth_pode_acessar_filial(filial_id));

create policy registros_ponto_delete on registros_ponto for delete to authenticated
  using (auth_tem_permissao('ponto.gerenciar') and auth_pode_acessar_filial(filial_id));

-- -----------------------------------------------------------------------------
-- Auditoria e configurações
-- -----------------------------------------------------------------------------

create policy log_auditoria_select on log_auditoria for select to authenticated
  using (auth_tem_permissao('auditoria.visualizar'));

create policy configuracoes_select on configuracoes for select to authenticated
  using (auth_usuario_ativo());

create policy configuracoes_write on configuracoes for all to authenticated
  using (auth_tem_permissao('configuracoes.gerenciar'))
  with check (auth_tem_permissao('configuracoes.gerenciar'));

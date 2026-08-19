-- =============================================================================
-- 0012_inventario_correcoes.sql — Corrigir contagem, excluir inventário
--
-- Três lacunas encontradas em uso real:
--
--   1. Não havia como desfazer uma contagem lançada por engano. Só dava para
--      sobrescrever com outro número — e um item contado errado que deveria
--      voltar a "não contado" ficava travado.
--   2. Não havia como excluir um inventário aberto por engano; só cancelar,
--      que o mantém na lista para sempre.
--   3. A aprovação tentava concluir a tarefa do Kanban procurando
--      origem_tipo = 'inventario', mas o cron cria como 'inventario_mensal'.
--      A cobrança mensal nunca era fechada e ficava atrasada indefinidamente.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Nova permissão: excluir é mais destrutivo que cancelar, então é separado.
-- -----------------------------------------------------------------------------

insert into permissoes (chave, modulo, descricao) values
  ('inventario.excluir', 'Inventário',
   'Excluir definitivamente um inventário não aprovado')
on conflict (chave) do update
  set modulo = excluded.modulo, descricao = excluded.descricao;

-- Por padrão só o administrador; o franqueado pode conceder a outros perfis
-- pela tela de Perfis e Permissões.
insert into perfil_permissoes (perfil_id, permissao_chave)
select p.id, 'inventario.excluir' from perfis p where p.chave = 'admin'
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- 2. Desfazer a contagem de um item
--
-- Itens com quantidade_sistema = 0 não existiam na abertura do inventário: são
-- produtos que apareceram durante a contagem (sobra pura). Desfazer a contagem
-- deles significa remover a linha, senão sobraria um item fantasma contado como
-- zero. Para os demais, a linha continua — ela representa saldo real do sistema
-- que ainda precisa ser conferido.
-- -----------------------------------------------------------------------------

create or replace function fn_desfazer_contagem(p_item_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  it  inventario_itens%rowtype;
  inv inventarios%rowtype;
begin
  perform auth_exige_permissao('inventario.contar');

  select * into it from inventario_itens where id = p_item_id;
  if not found then
    raise exception 'Item de inventário não encontrado.' using errcode = 'no_data_found';
  end if;

  select * into inv from inventarios where id = it.inventario_id;
  perform auth_exige_filial(inv.filial_id);

  if inv.status <> 'em_contagem' then
    raise exception 'A contagem só pode ser alterada enquanto o inventário está em contagem (atual: %).', inv.status
      using errcode = 'check_violation';
  end if;

  if it.quantidade_sistema = 0 then
    delete from inventario_itens where id = p_item_id;
    return jsonb_build_object('acao', 'removido');
  end if;

  update inventario_itens
     set quantidade_contada = null,
         contado_por        = null,
         contado_em         = null,
         observacao         = null
   where id = p_item_id;

  return jsonb_build_object('acao', 'contagem_desfeita');
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. Excluir um inventário
--
-- Inventário aprovado nunca pode ser excluído: ele gerou movimentações de
-- ajuste que precisam continuar rastreáveis. Erro em inventário aprovado se
-- corrige com um novo inventário, não apagando o histórico.
-- -----------------------------------------------------------------------------

create or replace function fn_excluir_inventario(p_inventario_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  inv    inventarios%rowtype;
  v_itens integer;
begin
  perform auth_exige_permissao('inventario.excluir');

  select * into inv from inventarios where id = p_inventario_id for update;
  if not found then
    raise exception 'Inventário não encontrado.' using errcode = 'no_data_found';
  end if;

  perform auth_exige_filial(inv.filial_id);

  if inv.status = 'aprovado' then
    raise exception
      'Um inventário aprovado não pode ser excluído: ele gerou ajustes de estoque que precisam continuar rastreáveis. Para corrigir, faça um novo inventário ou um ajuste manual.'
      using errcode = 'check_violation';
  end if;

  select count(*) into v_itens from inventario_itens where inventario_id = p_inventario_id;

  -- Registra antes de apagar: depois do delete não há mais o que consultar.
  insert into log_auditoria (usuario_id, acao, tabela, registro_id, dados_antes)
  values (
    auth.uid(), 'inventario.excluir', 'inventarios', p_inventario_id::text,
    jsonb_build_object(
      'codigo', inv.codigo, 'filial_id', inv.filial_id, 'tipo', inv.tipo,
      'status', inv.status, 'competencia', inv.competencia,
      'aberto_em', inv.aberto_em, 'itens', v_itens
    )
  );

  -- inventario_itens sai por cascade; movimentacoes ficam com inventario_id nulo
  -- (mas um inventário não aprovado não gerou movimentação nenhuma).
  delete from inventarios where id = p_inventario_id;

  return jsonb_build_object('codigo', inv.codigo, 'itens_removidos', v_itens);
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. Concluir a cobrança do Kanban quando o inventário é aprovado
--
-- Feito por gatilho, e não dentro de fn_aprovar_inventario, para não duplicar
-- aquela função inteira só por causa deste trecho. O gatilho também cobre
-- aprovações feitas por qualquer outro caminho.
-- -----------------------------------------------------------------------------

create or replace function fn_concluir_tarefas_do_inventario()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'aprovado' and old.status is distinct from 'aprovado' then
    update tarefas
       set status = 'concluido', concluido_em = now()
     where status <> 'concluido'
       and (
         -- tarefa criada apontando direto para este inventário
         (origem_tipo = 'inventario' and origem_id = new.id::text)
         -- cobrança mensal, cuja chave é filial + competência
         or (
           new.competencia is not null
           and origem_tipo = 'inventario_mensal'
           and origem_id = new.filial_id::text || ':' || to_char(new.competencia, 'YYYY-MM')
         )
       );
  end if;

  return new;
end;
$$;

create trigger trg_inventario_conclui_tarefas
  after update of status on inventarios
  for each row execute function fn_concluir_tarefas_do_inventario();

-- -----------------------------------------------------------------------------
-- Permissões de execução
-- -----------------------------------------------------------------------------

grant execute on function
  fn_desfazer_contagem(uuid),
  fn_excluir_inventario(uuid)
  to authenticated;

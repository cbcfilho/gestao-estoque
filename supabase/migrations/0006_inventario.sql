-- =============================================================================
-- 0006_inventario.sql — Ciclo de inventário com contagem cega
--
-- Fluxo: aberto → em_contagem → aguardando_aprovacao → aprovado
--
-- Contagem cega: `quantidade_sistema` é congelada na abertura e a RLS de
-- inventario_itens só libera a leitura da tabela depois do fechamento (ou para
-- quem tem inventario.aprovar). Durante a contagem o app usa
-- fn_inventario_itens_para_contagem(), que simplesmente não devolve a coluna.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Abertura do ciclo — congela a posição atual do estoque
-- -----------------------------------------------------------------------------

create or replace function fn_abrir_inventario(
  p_filial_id      uuid,
  p_tipo           tipo_inventario default 'geral',
  p_locais         tipo_local[]    default null,
  p_categorias_ids uuid[]          default null,
  p_competencia    date            default null,
  p_descricao      text            default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id          uuid;
  v_locais      tipo_local[];
  v_competencia date;
  v_itens       integer;
begin
  perform auth_exige_permissao('inventario.abrir');
  perform auth_exige_filial(p_filial_id);

  if exists (
    select 1 from inventarios
     where filial_id = p_filial_id
       and status in ('aberto', 'em_contagem', 'aguardando_aprovacao')
  ) then
    raise exception 'Já existe um inventário em andamento nesta filial. Conclua ou cancele antes de abrir outro.'
      using errcode = 'check_violation';
  end if;

  -- Locais padrão: todos os que a filial possui.
  v_locais := coalesce(
    p_locais,
    (select array_agg(local order by local) from filial_locais
      where filial_id = p_filial_id and ativo)
  );

  if v_locais is null or array_length(v_locais, 1) is null then
    raise exception 'Nenhum local disponível para inventariar nesta filial.'
      using errcode = 'check_violation';
  end if;

  -- Competência só é obrigatória (e única) no inventário geral mensal.
  v_competencia := case
    when p_tipo = 'geral' then date_trunc('month', coalesce(p_competencia, current_date))::date
    else null
  end;

  insert into inventarios (
    filial_id, tipo, locais, categorias_ids, competencia, descricao,
    responsavel_id, status
  )
  values (
    p_filial_id, p_tipo, v_locais, p_categorias_ids, v_competencia, p_descricao,
    auth.uid(), 'em_contagem'
  )
  returning id into v_id;

  -- Congela a posição: um item por lote com saldo dentro do escopo.
  insert into inventario_itens (
    inventario_id, produto_id, local, lote, data_validade,
    quantidade_sistema, custo_unitario
  )
  select
    v_id, le.produto_id, le.local, le.lote, le.data_validade,
    le.quantidade, le.custo_unitario
  from lotes_estoque le
  join produtos p on p.id = le.produto_id
  where le.filial_id = p_filial_id
    and le.local = any(v_locais)
    and le.quantidade > 0
    and p.ativo
    and (p_categorias_ids is null or p.categoria_id = any(p_categorias_ids));

  get diagnostics v_itens = row_count;

  insert into log_auditoria (usuario_id, acao, tabela, registro_id, dados_depois)
  values (
    auth.uid(), 'inventario.abrir', 'inventarios', v_id::text,
    jsonb_build_object('filial_id', p_filial_id, 'tipo', p_tipo,
                       'locais', v_locais, 'itens_congelados', v_itens)
  );

  return v_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Lista de contagem — nunca expõe a quantidade do sistema
-- -----------------------------------------------------------------------------

create or replace function fn_inventario_itens_para_contagem(
  p_inventario_id uuid,
  p_local         tipo_local default null,
  p_busca         text default null,
  p_apenas_pendentes boolean default false
)
returns table (
  item_id            uuid,
  produto_id         uuid,
  produto_nome       text,
  ean                text,
  unidade            unidade_medida,
  local              tipo_local,
  lote               text,
  data_validade      date,
  quantidade_contada numeric,
  contado_em         timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_filial uuid;
begin
  perform auth_exige_permissao('inventario.contar');

  select filial_id into v_filial from inventarios where id = p_inventario_id;
  if v_filial is null then
    raise exception 'Inventário não encontrado.' using errcode = 'no_data_found';
  end if;
  perform auth_exige_filial(v_filial);

  return query
    select
      ii.id, ii.produto_id, p.nome, p.ean, p.unidade,
      ii.local, ii.lote, ii.data_validade,
      ii.quantidade_contada, ii.contado_em
    from inventario_itens ii
    join produtos p on p.id = ii.produto_id
    where ii.inventario_id = p_inventario_id
      and (p_local is null or ii.local = p_local)
      and (not p_apenas_pendentes or ii.quantidade_contada is null)
      and (
        p_busca is null
        or p.ean = p_busca
        or unaccent(lower(p.nome)) like '%' || unaccent(lower(p_busca)) || '%'
      )
    order by p.nome, ii.local, ii.data_validade nulls last;
end;
$$;

-- -----------------------------------------------------------------------------
-- Lançamento da contagem
-- Aceita produto que não estava no sistema (sobra pura): cria o item com
-- quantidade_sistema = 0.
-- -----------------------------------------------------------------------------

create or replace function fn_lancar_contagem(
  p_inventario_id uuid,
  p_produto_id    uuid,
  p_local         tipo_local,
  p_quantidade    numeric,
  p_lote          text default null,
  p_data_validade date default null,
  p_observacao    text default null,
  p_somar         boolean default false  -- true acumula (leituras repetidas do mesmo item)
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  inv     inventarios%rowtype;
  v_item  uuid;
  v_lote  text := coalesce(nullif(trim(p_lote), ''), 'UNICO');
begin
  perform auth_exige_permissao('inventario.contar');

  select * into inv from inventarios where id = p_inventario_id;
  if not found then
    raise exception 'Inventário não encontrado.' using errcode = 'no_data_found';
  end if;
  perform auth_exige_filial(inv.filial_id);

  if inv.status <> 'em_contagem' then
    raise exception 'Este inventário não está em contagem (status atual: %).', inv.status
      using errcode = 'check_violation';
  end if;

  if p_quantidade < 0 then
    raise exception 'A quantidade contada não pode ser negativa.' using errcode = 'check_violation';
  end if;

  if not (p_local = any(inv.locais)) then
    raise exception 'O local % não faz parte do escopo deste inventário.', p_local
      using errcode = 'check_violation';
  end if;

  select id into v_item
    from inventario_itens
   where inventario_id = p_inventario_id
     and produto_id    = p_produto_id
     and local         = p_local
     and lote          = v_lote
     and coalesce(data_validade, '9999-12-31'::date)
         = coalesce(p_data_validade, '9999-12-31'::date);

  if v_item is null then
    -- Produto encontrado na prateleira sem saldo no sistema: entra como sobra.
    insert into inventario_itens (
      inventario_id, produto_id, local, lote, data_validade,
      quantidade_sistema, quantidade_contada, custo_unitario,
      contado_por, contado_em, observacao
    )
    values (
      p_inventario_id, p_produto_id, p_local, v_lote, p_data_validade,
      0, p_quantidade,
      coalesce((select valor_custo from produtos where id = p_produto_id), 0),
      auth.uid(), now(), p_observacao
    )
    returning id into v_item;
  else
    update inventario_itens
       set quantidade_contada = case
             when p_somar then coalesce(quantidade_contada, 0) + p_quantidade
             else p_quantidade
           end,
           contado_por = auth.uid(),
           contado_em  = now(),
           observacao  = coalesce(p_observacao, observacao)
     where id = v_item;
  end if;

  return v_item;
end;
$$;

-- Conveniência para a leitura por código de barras no celular.
create or replace function fn_lancar_contagem_por_ean(
  p_inventario_id uuid,
  p_ean           text,
  p_local         tipo_local,
  p_quantidade    numeric,
  p_lote          text default null,
  p_data_validade date default null,
  p_somar         boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_produto produtos%rowtype;
  v_item    uuid;
begin
  select * into v_produto from produtos where ean = p_ean and ativo;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'erro', 'produto_nao_encontrado',
      'mensagem', 'Nenhum produto ativo cadastrado com o código ' || p_ean || '.'
    );
  end if;

  v_item := fn_lancar_contagem(
    p_inventario_id, v_produto.id, p_local, p_quantidade,
    p_lote, p_data_validade, null, p_somar
  );

  return jsonb_build_object(
    'ok', true,
    'item_id', v_item,
    'produto_id', v_produto.id,
    'produto_nome', v_produto.nome,
    'unidade', v_produto.unidade,
    'quantidade_contada', (select quantidade_contada from inventario_itens where id = v_item)
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Fechamento da contagem → libera o relatório de divergências
-- -----------------------------------------------------------------------------

create or replace function fn_fechar_contagem(
  p_inventario_id uuid,
  p_zerar_nao_contados boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  inv         inventarios%rowtype;
  v_pendentes integer;
begin
  perform auth_exige_permissao('inventario.contar');

  select * into inv from inventarios where id = p_inventario_id for update;
  if not found then
    raise exception 'Inventário não encontrado.' using errcode = 'no_data_found';
  end if;
  perform auth_exige_filial(inv.filial_id);

  if inv.status <> 'em_contagem' then
    raise exception 'Este inventário não está em contagem (status atual: %).', inv.status
      using errcode = 'check_violation';
  end if;

  -- Itens não contados: ou viram zero (contagem completa) ou ficam de fora do ajuste.
  if p_zerar_nao_contados then
    update inventario_itens
       set quantidade_contada = 0, contado_por = auth.uid(), contado_em = now(),
           observacao = coalesce(observacao, 'Não localizado na contagem')
     where inventario_id = p_inventario_id and quantidade_contada is null;
  end if;

  select count(*) into v_pendentes
    from inventario_itens
   where inventario_id = p_inventario_id and quantidade_contada is null;

  update inventarios
     set status = 'aguardando_aprovacao', fechado_em = now()
   where id = p_inventario_id;

  return jsonb_build_object(
    'inventario_id', p_inventario_id,
    'itens_sem_contagem', v_pendentes
  );
end;
$$;

-- Reabre a contagem enquanto o inventário ainda não foi aprovado.
create or replace function fn_reabrir_contagem(p_inventario_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  inv inventarios%rowtype;
begin
  perform auth_exige_permissao('inventario.abrir');

  select * into inv from inventarios where id = p_inventario_id for update;
  if not found then
    raise exception 'Inventário não encontrado.' using errcode = 'no_data_found';
  end if;
  perform auth_exige_filial(inv.filial_id);

  if inv.status <> 'aguardando_aprovacao' then
    raise exception 'Só é possível reabrir um inventário aguardando aprovação (atual: %).', inv.status
      using errcode = 'check_violation';
  end if;

  update inventarios set status = 'em_contagem', fechado_em = null where id = p_inventario_id;
  return p_inventario_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Aprovação → aplica o ajuste no estoque
--
-- O ajuste aplicado é a DIVERGÊNCIA (contado − congelado), e não o valor
-- absoluto contado. Assim, movimentações lançadas entre a contagem e a
-- aprovação continuam valendo e não são sobrescritas.
-- -----------------------------------------------------------------------------

create or replace function fn_aprovar_inventario(
  p_inventario_id uuid,
  p_observacao    text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  inv           inventarios%rowtype;
  it            inventario_itens%rowtype;
  v_lote_id     uuid;
  v_saldo_lote  numeric;
  v_saldo_local numeric;
  v_qtd         numeric;
  v_ajustes     integer := 0;
  v_valor       numeric := 0;
  v_nao_aplicado jsonb  := '[]'::jsonb;
begin
  perform auth_exige_permissao('inventario.aprovar');

  select * into inv from inventarios where id = p_inventario_id for update;
  if not found then
    raise exception 'Inventário não encontrado.' using errcode = 'no_data_found';
  end if;
  perform auth_exige_filial(inv.filial_id);

  if inv.status <> 'aguardando_aprovacao' then
    raise exception 'Só é possível aprovar um inventário aguardando aprovação (atual: %).', inv.status
      using errcode = 'check_violation';
  end if;

  for it in
    select * from inventario_itens
     where inventario_id = p_inventario_id
       and quantidade_contada is not null
       and divergencia_quantidade <> 0
     order by produto_id
  loop
    if it.divergencia_quantidade > 0 then
      -- Sobra: credita a diferença no lote correspondente.
      perform fn_creditar_lote(
        it.produto_id, inv.filial_id, it.local, it.lote, it.data_validade,
        it.divergencia_quantidade, it.custo_unitario
      );

      insert into movimentacoes (
        tipo, motivo, produto_id, quantidade, custo_unitario, lote, data_validade,
        filial_destino_id, local_destino, usuario_id, inventario_id, observacao
      )
      values (
        'ajuste', 'ajuste_inventario', it.produto_id, it.divergencia_quantidade,
        it.custo_unitario, it.lote, it.data_validade,
        inv.filial_id, it.local, auth.uid(), inv.id,
        'Sobra apurada no inventário ' || inv.codigo
      );

      v_ajustes := v_ajustes + 1;
      v_valor   := v_valor + it.divergencia_valor;
    else
      -- Falta: debita a diferença, preferindo o lote contado.
      v_qtd := abs(it.divergencia_quantidade);

      select id, quantidade into v_lote_id, v_saldo_lote
        from lotes_estoque
       where produto_id = it.produto_id
         and filial_id  = inv.filial_id
         and local      = it.local
         and lote       = it.lote
         and coalesce(data_validade, '9999-12-31'::date)
             = coalesce(it.data_validade, '9999-12-31'::date);

      select coalesce(sum(quantidade), 0) into v_saldo_local
        from lotes_estoque
       where produto_id = it.produto_id
         and filial_id  = inv.filial_id
         and local      = it.local;

      -- O saldo pode ter mudado depois da contagem; nunca deixa negativo.
      v_qtd := least(v_qtd, v_saldo_local);

      if v_qtd <= 0 then
        v_nao_aplicado := v_nao_aplicado || jsonb_build_object(
          'item_id', it.id, 'produto_id', it.produto_id,
          'motivo', 'sem saldo disponível no local no momento da aprovação'
        );
        continue;
      end if;

      perform fn_debitar_fefo(
        it.produto_id, inv.filial_id, it.local, v_qtd,
        case when coalesce(v_saldo_lote, 0) >= v_qtd then v_lote_id else null end
      );

      insert into movimentacoes (
        tipo, motivo, produto_id, quantidade, custo_unitario, lote, data_validade,
        filial_origem_id, local_origem, usuario_id, inventario_id, observacao
      )
      values (
        'ajuste', 'ajuste_inventario', it.produto_id, v_qtd,
        it.custo_unitario, it.lote, it.data_validade,
        inv.filial_id, it.local, auth.uid(), inv.id,
        'Falta apurada no inventário ' || inv.codigo
      );

      v_ajustes := v_ajustes + 1;
      v_valor   := v_valor - (v_qtd * it.custo_unitario);
    end if;
  end loop;

  update inventarios
     set status = 'aprovado', aprovado_por = auth.uid(), aprovado_em = now(),
         observacao = coalesce(p_observacao, observacao)
   where id = p_inventario_id;

  -- Conclui a tarefa de cobrança do Kanban, se existir.
  update tarefas
     set status = 'concluido', concluido_em = now()
   where origem_tipo = 'inventario'
     and origem_id = p_inventario_id::text
     and status <> 'concluido';

  insert into log_auditoria (usuario_id, acao, tabela, registro_id, dados_depois)
  values (
    auth.uid(), 'inventario.aprovar', 'inventarios', p_inventario_id::text,
    jsonb_build_object('ajustes', v_ajustes, 'impacto_financeiro', round(v_valor, 2),
                       'nao_aplicados', v_nao_aplicado)
  );

  return jsonb_build_object(
    'inventario_id', p_inventario_id,
    'ajustes_aplicados', v_ajustes,
    'impacto_financeiro', round(v_valor, 2),
    'nao_aplicados', v_nao_aplicado
  );
end;
$$;

create or replace function fn_cancelar_inventario(
  p_inventario_id uuid,
  p_motivo        text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  inv inventarios%rowtype;
begin
  perform auth_exige_permissao('inventario.cancelar');

  select * into inv from inventarios where id = p_inventario_id for update;
  if not found then
    raise exception 'Inventário não encontrado.' using errcode = 'no_data_found';
  end if;
  perform auth_exige_filial(inv.filial_id);

  if inv.status = 'aprovado' then
    raise exception 'Um inventário já aprovado não pode ser cancelado.'
      using errcode = 'check_violation';
  end if;

  update inventarios
     set status = 'cancelado', fechado_em = now(),
         observacao = concat_ws(' | ', observacao, 'Cancelado: ' || p_motivo)
   where id = p_inventario_id;

  return p_inventario_id;
end;
$$;

grant execute on function
  fn_abrir_inventario(uuid, tipo_inventario, tipo_local[], uuid[], date, text),
  fn_inventario_itens_para_contagem(uuid, tipo_local, text, boolean),
  fn_lancar_contagem(uuid, uuid, tipo_local, numeric, text, date, text, boolean),
  fn_lancar_contagem_por_ean(uuid, text, tipo_local, numeric, text, date, boolean),
  fn_fechar_contagem(uuid, boolean),
  fn_reabrir_contagem(uuid),
  fn_aprovar_inventario(uuid, text),
  fn_cancelar_inventario(uuid, text)
  to authenticated;

-- =============================================================================
-- 0005_rotinas_estoque.sql — Entradas, saídas, ajustes e transferências
--
-- Toda alteração de saldo passa por estas funções. Elas são SECURITY DEFINER
-- (ignoram RLS) e por isso verificam permissão e filial explicitamente, logo
-- na primeira linha. Não existe policy de INSERT/UPDATE em lotes_estoque nem
-- em movimentacoes: o caminho é sempre por aqui.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Helper: localiza (ou cria) o lote de destino e aplica custo médio ponderado
-- -----------------------------------------------------------------------------

create or replace function fn_creditar_lote(
  p_produto_id     uuid,
  p_filial_id      uuid,
  p_local          tipo_local,
  p_lote           text,
  p_data_validade  date,
  p_quantidade     numeric,
  p_custo_unitario numeric
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lote_id       uuid;
  v_qtd_atual     numeric;
  v_custo_atual   numeric;
  v_novo_custo    numeric;
begin
  if p_quantidade <= 0 then
    raise exception 'A quantidade creditada deve ser maior que zero.'
      using errcode = 'check_violation';
  end if;

  select id, quantidade, custo_unitario
    into v_lote_id, v_qtd_atual, v_custo_atual
    from lotes_estoque
   where produto_id = p_produto_id
     and filial_id  = p_filial_id
     and local      = p_local
     and lote       = coalesce(p_lote, 'UNICO')
     and coalesce(data_validade, '9999-12-31'::date)
         = coalesce(p_data_validade, '9999-12-31'::date)
   for update;

  if v_lote_id is null then
    insert into lotes_estoque (
      produto_id, filial_id, local, lote, data_validade, quantidade, custo_unitario
    )
    values (
      p_produto_id, p_filial_id, p_local, coalesce(p_lote, 'UNICO'),
      p_data_validade, p_quantidade, coalesce(p_custo_unitario, 0)
    )
    returning id into v_lote_id;
  else
    -- Custo médio ponderado: mistura o custo do saldo existente com o da entrada.
    if (v_qtd_atual + p_quantidade) > 0 then
      v_novo_custo := (v_qtd_atual * v_custo_atual + p_quantidade * coalesce(p_custo_unitario, v_custo_atual))
                      / (v_qtd_atual + p_quantidade);
    else
      v_novo_custo := v_custo_atual;
    end if;

    update lotes_estoque
       set quantidade     = quantidade + p_quantidade,
           custo_unitario = round(v_novo_custo, 4)
     where id = v_lote_id;
  end if;

  return v_lote_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Helper: baixa quantidade seguindo FEFO (o lote que vence primeiro sai primeiro)
-- Retorna a lista de lotes consumidos, para gerar as movimentações.
-- -----------------------------------------------------------------------------

create or replace function fn_debitar_fefo(
  p_produto_id  uuid,
  p_filial_id   uuid,
  p_local       tipo_local,
  p_quantidade  numeric,
  p_lote_id     uuid default null  -- quando informado, baixa apenas desse lote
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_restante   numeric := p_quantidade;
  v_consumido  jsonb   := '[]'::jsonb;
  v_disponivel numeric;
  r            record;
  v_baixa      numeric;
begin
  if p_quantidade <= 0 then
    raise exception 'A quantidade a baixar deve ser maior que zero.'
      using errcode = 'check_violation';
  end if;

  select coalesce(sum(quantidade), 0) into v_disponivel
    from lotes_estoque
   where produto_id = p_produto_id
     and filial_id  = p_filial_id
     and local      = p_local
     and (p_lote_id is null or id = p_lote_id);

  if v_disponivel < p_quantidade then
    raise exception
      'Saldo insuficiente: disponível % e solicitado % (produto %, local %).',
      v_disponivel, p_quantidade, p_produto_id, p_local
      using errcode = 'check_violation';
  end if;

  for r in
    select id, lote, data_validade, quantidade, custo_unitario
      from lotes_estoque
     where produto_id = p_produto_id
       and filial_id  = p_filial_id
       and local      = p_local
       and quantidade > 0
       and (p_lote_id is null or id = p_lote_id)
     -- FEFO: vencimento mais próximo primeiro; sem validade fica por último.
     order by data_validade asc nulls last, criado_em asc
     for update
  loop
    exit when v_restante <= 0;

    v_baixa := least(r.quantidade, v_restante);

    update lotes_estoque
       set quantidade = quantidade - v_baixa
     where id = r.id;

    v_consumido := v_consumido || jsonb_build_object(
      'lote_id',        r.id,
      'lote',           r.lote,
      'data_validade',  r.data_validade,
      'quantidade',     v_baixa,
      'custo_unitario', r.custo_unitario
    );

    v_restante := v_restante - v_baixa;
  end loop;

  if v_restante > 0 then
    raise exception 'Não foi possível baixar a quantidade completa. Restaram % unidades.', v_restante
      using errcode = 'check_violation';
  end if;

  -- Limpa lotes zerados e já vencidos para não poluir as listagens.
  delete from lotes_estoque
   where produto_id = p_produto_id
     and filial_id  = p_filial_id
     and local      = p_local
     and quantidade = 0
     and data_validade is not null
     and data_validade < current_date;

  return v_consumido;
end;
$$;

-- -----------------------------------------------------------------------------
-- Entrada de estoque
-- -----------------------------------------------------------------------------

create or replace function fn_registrar_entrada(
  p_produto_id     uuid,
  p_filial_id      uuid,
  p_local          tipo_local,
  p_quantidade     numeric,
  p_custo_unitario numeric default null,
  p_lote           text    default null,
  p_data_validade  date    default null,
  p_motivo         motivo_movimentacao default 'compra_fornecedor',
  p_observacao     text    default null,
  p_anexo_url      text    default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mov_id  uuid;
  v_custo   numeric;
  v_produto produtos%rowtype;
begin
  perform auth_exige_permissao('estoque.entrada');
  perform auth_exige_filial(p_filial_id);

  select * into v_produto from produtos where id = p_produto_id and ativo;
  if not found then
    raise exception 'Produto não encontrado ou inativo.' using errcode = 'no_data_found';
  end if;

  if v_produto.controla_validade and p_data_validade is null then
    raise exception 'Este produto exige data de validade na entrada.'
      using errcode = 'check_violation';
  end if;

  v_custo := coalesce(nullif(p_custo_unitario, 0), v_produto.valor_custo);

  perform fn_creditar_lote(
    p_produto_id, p_filial_id, p_local,
    coalesce(nullif(trim(p_lote), ''), 'UNICO'),
    p_data_validade, p_quantidade, v_custo
  );

  insert into movimentacoes (
    tipo, motivo, produto_id, quantidade, custo_unitario, lote, data_validade,
    filial_destino_id, local_destino, usuario_id, observacao, anexo_url
  )
  values (
    'entrada', p_motivo, p_produto_id, p_quantidade, v_custo,
    coalesce(nullif(trim(p_lote), ''), 'UNICO'), p_data_validade,
    p_filial_id, p_local, auth.uid(), p_observacao, p_anexo_url
  )
  returning id into v_mov_id;

  return v_mov_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Saída de estoque (FEFO por padrão)
-- -----------------------------------------------------------------------------

create or replace function fn_registrar_saida(
  p_produto_id uuid,
  p_filial_id  uuid,
  p_local      tipo_local,
  p_quantidade numeric,
  p_motivo     motivo_movimentacao default 'venda',
  p_lote_id    uuid default null,
  p_observacao text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_consumido jsonb;
  item        jsonb;
  v_movs      jsonb := '[]'::jsonb;
  v_mov_id    uuid;
begin
  -- Consumo de insumos da cafeteria tem permissão própria.
  if p_local = 'cafeteria' and p_motivo = 'consumo_interno' then
    if not (auth_tem_permissao('cafeteria.consumo') or auth_tem_permissao('estoque.saida')) then
      raise exception 'Permissão negada: cafeteria.consumo é necessária para esta operação.'
        using errcode = 'insufficient_privilege';
    end if;
  else
    perform auth_exige_permissao('estoque.saida');
  end if;

  perform auth_exige_filial(p_filial_id);

  v_consumido := fn_debitar_fefo(p_produto_id, p_filial_id, p_local, p_quantidade, p_lote_id);

  for item in select * from jsonb_array_elements(v_consumido)
  loop
    insert into movimentacoes (
      tipo, motivo, produto_id, quantidade, custo_unitario, lote, data_validade,
      filial_origem_id, local_origem, usuario_id, observacao
    )
    values (
      'saida', p_motivo, p_produto_id,
      (item->>'quantidade')::numeric,
      (item->>'custo_unitario')::numeric,
      item->>'lote',
      nullif(item->>'data_validade', '')::date,
      p_filial_id, p_local, auth.uid(), p_observacao
    )
    returning id into v_mov_id;

    v_movs := v_movs || to_jsonb(v_mov_id);
  end loop;

  return jsonb_build_object('lotes', v_consumido, 'movimentacoes', v_movs);
end;
$$;

-- -----------------------------------------------------------------------------
-- Ajuste manual de saldo (positivo ou negativo)
-- -----------------------------------------------------------------------------

create or replace function fn_ajustar_estoque(
  p_produto_id    uuid,
  p_filial_id     uuid,
  p_local         tipo_local,
  p_quantidade    numeric,       -- positivo credita, negativo debita
  p_observacao    text,
  p_lote          text default null,
  p_data_validade date default null,
  p_lote_id       uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_custo numeric;
begin
  perform auth_exige_permissao('estoque.ajustar');
  perform auth_exige_filial(p_filial_id);

  if p_quantidade = 0 then
    raise exception 'Informe uma quantidade diferente de zero para o ajuste.'
      using errcode = 'check_violation';
  end if;

  if coalesce(trim(p_observacao), '') = '' then
    raise exception 'O ajuste manual exige uma justificativa.'
      using errcode = 'check_violation';
  end if;

  if p_quantidade > 0 then
    select valor_custo into v_custo from produtos where id = p_produto_id;

    perform fn_creditar_lote(
      p_produto_id, p_filial_id, p_local,
      coalesce(nullif(trim(p_lote), ''), 'UNICO'),
      p_data_validade, p_quantidade, v_custo
    );

    insert into movimentacoes (
      tipo, motivo, produto_id, quantidade, custo_unitario, lote, data_validade,
      filial_destino_id, local_destino, usuario_id, observacao
    )
    values (
      'ajuste', 'ajuste_positivo', p_produto_id, p_quantidade, coalesce(v_custo, 0),
      coalesce(nullif(trim(p_lote), ''), 'UNICO'), p_data_validade,
      p_filial_id, p_local, auth.uid(), p_observacao
    );

    return jsonb_build_object('ok', true, 'sentido', 'positivo');
  end if;

  return jsonb_build_object(
    'ok', true,
    'sentido', 'negativo',
    'detalhe', fn_registrar_saida(
      p_produto_id, p_filial_id, p_local, abs(p_quantidade),
      'ajuste_negativo', p_lote_id, p_observacao
    )
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Transferências
--
-- Fluxo: solicitada → em_transito → recebida.
-- O saldo sai da origem no ENVIO e só entra no destino no RECEBIMENTO — é o que
-- permite identificar perdas em trânsito (enviado > recebido).
-- -----------------------------------------------------------------------------

create or replace function fn_criar_transferencia(
  p_filial_origem_id  uuid,
  p_local_origem      tipo_local,
  p_filial_destino_id uuid,
  p_local_destino     tipo_local,
  p_itens             jsonb,   -- [{produto_id, quantidade, lote_id?}]
  p_observacao        text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id   uuid;
  item   jsonb;
  v_lote lotes_estoque%rowtype;
begin
  perform auth_exige_permissao('transferencias.solicitar');
  perform auth_exige_filial(p_filial_origem_id);

  if p_filial_origem_id = p_filial_destino_id and p_local_origem = p_local_destino then
    raise exception 'Origem e destino não podem ser o mesmo local da mesma filial.'
      using errcode = 'check_violation';
  end if;

  if jsonb_array_length(coalesce(p_itens, '[]'::jsonb)) = 0 then
    raise exception 'Informe ao menos um item na transferência.'
      using errcode = 'check_violation';
  end if;

  if not exists (
    select 1 from filial_locais
     where filial_id = p_filial_destino_id and local = p_local_destino and ativo
  ) then
    raise exception 'A filial de destino não possui o local informado.'
      using errcode = 'check_violation';
  end if;

  insert into transferencias (
    filial_origem_id, local_origem, filial_destino_id, local_destino,
    solicitado_por, observacao
  )
  values (
    p_filial_origem_id, p_local_origem, p_filial_destino_id, p_local_destino,
    auth.uid(), p_observacao
  )
  returning id into v_id;

  for item in select * from jsonb_array_elements(p_itens)
  loop
    if (item->>'lote_id') is not null then
      select * into v_lote from lotes_estoque where id = (item->>'lote_id')::uuid;

      insert into transferencia_itens (
        transferencia_id, produto_id, lote_origem_id, lote, data_validade,
        custo_unitario, quantidade_solicitada
      )
      values (
        v_id, (item->>'produto_id')::uuid, v_lote.id, v_lote.lote, v_lote.data_validade,
        v_lote.custo_unitario, (item->>'quantidade')::numeric
      );
    else
      insert into transferencia_itens (
        transferencia_id, produto_id, quantidade_solicitada, custo_unitario
      )
      values (
        v_id, (item->>'produto_id')::uuid, (item->>'quantidade')::numeric,
        coalesce((select valor_custo from produtos where id = (item->>'produto_id')::uuid), 0)
      );
    end if;
  end loop;

  return v_id;
end;
$$;

create or replace function fn_enviar_transferencia(
  p_transferencia_id uuid,
  p_itens_enviados   jsonb default null  -- [{item_id, quantidade}] para envio parcial
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  t          transferencias%rowtype;
  it         transferencia_itens%rowtype;
  v_qtd      numeric;
  v_consumo  jsonb;
  parte      jsonb;
  v_exige    boolean;
begin
  perform auth_exige_permissao('transferencias.enviar');

  select * into t from transferencias where id = p_transferencia_id for update;
  if not found then
    raise exception 'Transferência não encontrada.' using errcode = 'no_data_found';
  end if;

  perform auth_exige_filial(t.filial_origem_id);

  if t.status <> 'solicitada' then
    raise exception 'Só é possível enviar uma transferência com status "solicitada" (atual: %).', t.status
      using errcode = 'check_violation';
  end if;

  -- Aprovação hierárquica, quando ativada nas configurações.
  select case
           when t.filial_origem_id <> t.filial_destino_id
             then coalesce((valor->>'entre_filiais')::boolean, false)
             else coalesce((valor->>'entre_locais')::boolean, false)
         end
    into v_exige
    from configuracoes where chave = 'transferencia_exige_aprovacao';

  if coalesce(v_exige, false) and not auth_tem_permissao('transferencias.aprovar') then
    raise exception 'Esta transferência exige aprovação de um gestor antes do envio.'
      using errcode = 'insufficient_privilege';
  end if;

  for it in select * from transferencia_itens where transferencia_id = t.id
  loop
    v_qtd := it.quantidade_solicitada;

    if p_itens_enviados is not null then
      select (parte->>'quantidade')::numeric into v_qtd
        from jsonb_array_elements(p_itens_enviados) parte
       where (parte->>'item_id')::uuid = it.id;

      v_qtd := coalesce(v_qtd, 0);
    end if;

    if v_qtd <= 0 then
      update transferencia_itens set quantidade_enviada = 0 where id = it.id;
      continue;
    end if;

    v_consumo := fn_debitar_fefo(
      it.produto_id, t.filial_origem_id, t.local_origem, v_qtd, it.lote_origem_id
    );

    -- Guarda o lote/custo efetivamente consumido (primeiro lote da baixa).
    update transferencia_itens
       set quantidade_enviada = v_qtd,
           lote               = coalesce(v_consumo->0->>'lote', lote),
           data_validade      = coalesce(nullif(v_consumo->0->>'data_validade', '')::date, data_validade),
           custo_unitario     = coalesce((v_consumo->0->>'custo_unitario')::numeric, custo_unitario)
     where id = it.id;

    for parte in select * from jsonb_array_elements(v_consumo)
    loop
      insert into movimentacoes (
        tipo, motivo, produto_id, quantidade, custo_unitario, lote, data_validade,
        filial_origem_id, local_origem, filial_destino_id, local_destino,
        usuario_id, transferencia_id, observacao
      )
      values (
        'transferencia', 'envio_transferencia', it.produto_id,
        (parte->>'quantidade')::numeric, (parte->>'custo_unitario')::numeric,
        parte->>'lote', nullif(parte->>'data_validade', '')::date,
        t.filial_origem_id, t.local_origem, t.filial_destino_id, t.local_destino,
        auth.uid(), t.id, 'Envio da transferência ' || t.codigo
      );
    end loop;
  end loop;

  update transferencias
     set status = 'em_transito', enviado_por = auth.uid(), enviado_em = now()
   where id = t.id;

  return t.id;
end;
$$;

create or replace function fn_receber_transferencia(
  p_transferencia_id uuid,
  p_itens_recebidos  jsonb default null,  -- [{item_id, quantidade}] para recebimento parcial
  p_observacao       text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  t         transferencias%rowtype;
  it        transferencia_itens%rowtype;
  v_qtd     numeric;
  v_perda   numeric;
  v_perdas  jsonb := '[]'::jsonb;
begin
  perform auth_exige_permissao('transferencias.receber');

  select * into t from transferencias where id = p_transferencia_id for update;
  if not found then
    raise exception 'Transferência não encontrada.' using errcode = 'no_data_found';
  end if;

  perform auth_exige_filial(t.filial_destino_id);

  if t.status <> 'em_transito' then
    raise exception 'Só é possível receber uma transferência em trânsito (atual: %).', t.status
      using errcode = 'check_violation';
  end if;

  for it in select * from transferencia_itens where transferencia_id = t.id
  loop
    v_qtd := coalesce(it.quantidade_enviada, 0);

    if p_itens_recebidos is not null then
      select (parte->>'quantidade')::numeric into v_qtd
        from jsonb_array_elements(p_itens_recebidos) parte
       where (parte->>'item_id')::uuid = it.id;

      v_qtd := coalesce(v_qtd, 0);
    end if;

    if v_qtd > coalesce(it.quantidade_enviada, 0) then
      raise exception 'Não é possível receber mais do que foi enviado (item %).', it.id
        using errcode = 'check_violation';
    end if;

    if v_qtd > 0 then
      perform fn_creditar_lote(
        it.produto_id, t.filial_destino_id, t.local_destino,
        it.lote, it.data_validade, v_qtd, it.custo_unitario
      );

      insert into movimentacoes (
        tipo, motivo, produto_id, quantidade, custo_unitario, lote, data_validade,
        filial_origem_id, local_origem, filial_destino_id, local_destino,
        usuario_id, transferencia_id, observacao
      )
      values (
        'transferencia', 'recebimento_transferencia', it.produto_id, v_qtd,
        it.custo_unitario, it.lote, it.data_validade,
        t.filial_origem_id, t.local_origem, t.filial_destino_id, t.local_destino,
        auth.uid(), t.id, coalesce(p_observacao, 'Recebimento da transferência ' || t.codigo)
      );
    end if;

    -- Diferença entre enviado e recebido vira perda em trânsito, registrada
    -- explicitamente para não sumir do controle.
    v_perda := coalesce(it.quantidade_enviada, 0) - v_qtd;

    if v_perda > 0 then
      insert into movimentacoes (
        tipo, motivo, produto_id, quantidade, custo_unitario, lote, data_validade,
        filial_origem_id, local_origem, usuario_id, transferencia_id, observacao
      )
      values (
        'saida', 'perda', it.produto_id, v_perda, it.custo_unitario,
        it.lote, it.data_validade, t.filial_origem_id, t.local_origem,
        auth.uid(), t.id,
        'Perda em trânsito na transferência ' || t.codigo
      );

      v_perdas := v_perdas || jsonb_build_object(
        'item_id', it.id, 'produto_id', it.produto_id, 'quantidade', v_perda
      );
    end if;

    update transferencia_itens set quantidade_recebida = v_qtd where id = it.id;
  end loop;

  update transferencias
     set status = 'recebida', recebido_por = auth.uid(), recebido_em = now(),
         observacao = coalesce(p_observacao, observacao)
   where id = t.id;

  return jsonb_build_object('transferencia_id', t.id, 'perdas_em_transito', v_perdas);
end;
$$;

create or replace function fn_cancelar_transferencia(
  p_transferencia_id uuid,
  p_motivo           text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  t  transferencias%rowtype;
  it transferencia_itens%rowtype;
begin
  perform auth_exige_permissao('transferencias.cancelar');

  select * into t from transferencias where id = p_transferencia_id for update;
  if not found then
    raise exception 'Transferência não encontrada.' using errcode = 'no_data_found';
  end if;

  perform auth_exige_filial(t.filial_origem_id);

  if t.status = 'recebida' then
    raise exception 'Uma transferência já recebida não pode ser cancelada. Faça um ajuste de estoque.'
      using errcode = 'check_violation';
  end if;

  if t.status = 'cancelada' then
    return t.id;
  end if;

  -- Já estava em trânsito: devolve o saldo para a origem.
  if t.status = 'em_transito' then
    for it in
      select * from transferencia_itens
       where transferencia_id = t.id and coalesce(quantidade_enviada, 0) > 0
    loop
      perform fn_creditar_lote(
        it.produto_id, t.filial_origem_id, t.local_origem,
        it.lote, it.data_validade, it.quantidade_enviada, it.custo_unitario
      );

      insert into movimentacoes (
        tipo, motivo, produto_id, quantidade, custo_unitario, lote, data_validade,
        filial_destino_id, local_destino, usuario_id, transferencia_id, observacao
      )
      values (
        'transferencia', 'recebimento_transferencia', it.produto_id,
        it.quantidade_enviada, it.custo_unitario, it.lote, it.data_validade,
        t.filial_origem_id, t.local_origem, auth.uid(), t.id,
        'Estorno do cancelamento da transferência ' || t.codigo
      );
    end loop;
  end if;

  update transferencias
     set status = 'cancelada', cancelado_por = auth.uid(),
         cancelado_em = now(), motivo_cancelamento = p_motivo
   where id = t.id;

  return t.id;
end;
$$;

-- Atalho para transferência interna (mesma filial), enviando e recebendo de uma vez.
create or replace function fn_transferencia_direta(
  p_filial_id     uuid,
  p_local_origem  tipo_local,
  p_local_destino tipo_local,
  p_itens         jsonb,
  p_observacao    text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  v_id := fn_criar_transferencia(
    p_filial_id, p_local_origem, p_filial_id, p_local_destino, p_itens, p_observacao
  );
  perform fn_enviar_transferencia(v_id);
  perform fn_receber_transferencia(v_id, null, p_observacao);
  return v_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Importação da posição inicial de estoque (implantação)
-- -----------------------------------------------------------------------------

create or replace function fn_importar_posicao_inicial(
  p_filial_id uuid,
  p_itens     jsonb  -- [{produto_id, local, quantidade, custo_unitario?, lote?, data_validade?}]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  item      jsonb;
  v_total   integer := 0;
  v_erros   jsonb   := '[]'::jsonb;
begin
  perform auth_exige_permissao('produtos.importar');
  perform auth_exige_filial(p_filial_id);

  for item in select * from jsonb_array_elements(p_itens)
  loop
    begin
      perform fn_creditar_lote(
        (item->>'produto_id')::uuid,
        p_filial_id,
        (item->>'local')::tipo_local,
        coalesce(nullif(trim(item->>'lote'), ''), 'UNICO'),
        nullif(item->>'data_validade', '')::date,
        (item->>'quantidade')::numeric,
        coalesce((item->>'custo_unitario')::numeric,
                 (select valor_custo from produtos where id = (item->>'produto_id')::uuid), 0)
      );

      insert into movimentacoes (
        tipo, motivo, produto_id, quantidade, custo_unitario, lote, data_validade,
        filial_destino_id, local_destino, usuario_id, observacao
      )
      values (
        'entrada', 'ajuste_positivo', (item->>'produto_id')::uuid,
        (item->>'quantidade')::numeric,
        coalesce((item->>'custo_unitario')::numeric, 0),
        coalesce(nullif(trim(item->>'lote'), ''), 'UNICO'),
        nullif(item->>'data_validade', '')::date,
        p_filial_id, (item->>'local')::tipo_local, auth.uid(),
        'Importação da posição inicial de estoque'
      );

      v_total := v_total + 1;
    exception when others then
      v_erros := v_erros || jsonb_build_object('item', item, 'erro', sqlerrm);
    end;
  end loop;

  return jsonb_build_object('importados', v_total, 'erros', v_erros);
end;
$$;

-- -----------------------------------------------------------------------------
-- Permissões de execução
-- -----------------------------------------------------------------------------

revoke all on function
  fn_creditar_lote(uuid, uuid, tipo_local, text, date, numeric, numeric),
  fn_debitar_fefo(uuid, uuid, tipo_local, numeric, uuid)
  from public, anon, authenticated;

grant execute on function
  fn_registrar_entrada(uuid, uuid, tipo_local, numeric, numeric, text, date, motivo_movimentacao, text, text),
  fn_registrar_saida(uuid, uuid, tipo_local, numeric, motivo_movimentacao, uuid, text),
  fn_ajustar_estoque(uuid, uuid, tipo_local, numeric, text, text, date, uuid),
  fn_criar_transferencia(uuid, tipo_local, uuid, tipo_local, jsonb, text),
  fn_enviar_transferencia(uuid, jsonb),
  fn_receber_transferencia(uuid, jsonb, text),
  fn_cancelar_transferencia(uuid, text),
  fn_transferencia_direta(uuid, tipo_local, tipo_local, jsonb, text),
  fn_importar_posicao_inicial(uuid, jsonb)
  to authenticated;

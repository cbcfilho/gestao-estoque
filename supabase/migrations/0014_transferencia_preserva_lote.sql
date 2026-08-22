-- =============================================================================
-- 0014_transferencia_preserva_lote.sql — O lote que sai é o lote que entra
--
-- Até aqui, a transferência guardava um lote só por item: o PRIMEIRO lote que o
-- FEFO consumiu (`v_consumo->0`). Quando a quantidade pedida atravessava mais de
-- um lote, o destino recebia tudo sob o código, a validade e o custo daquele
-- primeiro lote. Na prática:
--
--   origem:  LOTE-A 10un (vence em 10 dias)  +  LOTE-B 10un (vence em 300 dias)
--   envio de 15un        -> baixa 10 de A e 5 de B
--   destino recebia:     -> LOTE-A 15un, tudo vencendo em 10 dias
--
-- As 5 unidades do LOTE-B perdiam o código, ganhavam uma validade que não é a
-- delas e um custo que não é o delas. Some a rastreabilidade e o FEFO do destino
-- passa a mentir — o oposto do que a regra de lote existe para garantir.
--
-- A correção guarda a composição inteira da baixa em `lotes_enviados` e credita
-- o destino lote a lote. Um item continua sendo uma linha só (a tela de
-- recebimento e o recebimento parcial por item_id seguem iguais); o que muda é
-- que o crédito no destino deixa de ser uma operação e passa a ser uma por lote.
--
-- No recebimento parcial, a quantidade recebida é distribuída em ordem FEFO e o
-- que sobra vira perda em trânsito — mesma regra de sempre, agora por lote.
--
-- De quebra, o envio parcial volta a funcionar. Em fn_enviar_transferencia,
-- `parte` era ao mesmo tempo variável plpgsql e alias da subconsulta que lê
-- p_itens_enviados; o Postgres recusa isso por ambiguidade. Como nenhum teste
-- enviava parcial, o erro só apareceria em produção, na primeira vez que
-- alguém enviasse menos do que foi pedido. As variáveis agora são `v_parte`.
-- =============================================================================

alter table transferencia_itens
  add column if not exists lotes_enviados jsonb;

comment on column transferencia_itens.lotes_enviados is
  'Composição da baixa na origem: [{lote_id, lote, data_validade, quantidade, custo_unitario}]. '
  'Nulo em transferências enviadas antes da migration 0014.';

-- -----------------------------------------------------------------------------
-- Envio: passa a registrar a composição completa da baixa
-- -----------------------------------------------------------------------------

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
  v_parte    jsonb;
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
      update transferencia_itens
         set quantidade_enviada = 0, lotes_enviados = '[]'::jsonb
       where id = it.id;
      continue;
    end if;

    v_consumo := fn_debitar_fefo(
      it.produto_id, t.filial_origem_id, t.local_origem, v_qtd, it.lote_origem_id
    );

    -- Guarda a composição inteira da baixa. As colunas lote/data_validade/custo
    -- continuam com o primeiro lote: são o resumo que a tela mostra quando o
    -- item saiu de um lote só, que é o caso normal.
    update transferencia_itens
       set quantidade_enviada = v_qtd,
           lotes_enviados     = v_consumo,
           lote               = coalesce(v_consumo->0->>'lote', lote),
           data_validade      = coalesce(nullif(v_consumo->0->>'data_validade', '')::date, data_validade),
           custo_unitario     = coalesce((v_consumo->0->>'custo_unitario')::numeric, custo_unitario)
     where id = it.id;

    for v_parte in select * from jsonb_array_elements(v_consumo)
    loop
      insert into movimentacoes (
        tipo, motivo, produto_id, quantidade, custo_unitario, lote, data_validade,
        filial_origem_id, local_origem, filial_destino_id, local_destino,
        usuario_id, transferencia_id, observacao
      )
      values (
        'transferencia', 'envio_transferencia', it.produto_id,
        (v_parte->>'quantidade')::numeric, (v_parte->>'custo_unitario')::numeric,
        v_parte->>'lote', nullif(v_parte->>'data_validade', '')::date,
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

-- -----------------------------------------------------------------------------
-- Helper: composição da baixa de um item, com reserva para itens antigos
--
-- Transferências enviadas antes desta migration não têm `lotes_enviados`. Para
-- elas, o melhor que existe é o resumo de uma linha só — o mesmo comportamento
-- de antes, sem quebrar quem está em trânsito no momento do deploy.
-- -----------------------------------------------------------------------------

create or replace function fn_lotes_do_item(p_item transferencia_itens)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select case
    when p_item.lotes_enviados is not null
         and jsonb_array_length(p_item.lotes_enviados) > 0
      then p_item.lotes_enviados
    else jsonb_build_array(jsonb_build_object(
      'lote_id',        p_item.lote_origem_id,
      'lote',           p_item.lote,
      'data_validade',  p_item.data_validade,
      'quantidade',     coalesce(p_item.quantidade_enviada, 0),
      'custo_unitario', p_item.custo_unitario
    ))
  end;
$$;

-- -----------------------------------------------------------------------------
-- Recebimento: credita o destino lote a lote
-- -----------------------------------------------------------------------------

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
  v_restante numeric;
  v_parcela  numeric;
  v_validade date;
  v_parte    jsonb;
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

    -- Distribui o recebido entre os lotes que saíram, na ordem em que saíram
    -- (FEFO). O que não foi recebido sobra nos últimos e vira perda em trânsito.
    v_restante := v_qtd;

    for v_parte in select * from jsonb_array_elements(fn_lotes_do_item(it))
    loop
      exit when v_restante <= 0;

      v_parcela := least((v_parte->>'quantidade')::numeric, v_restante);
      exit when v_parcela <= 0;

      v_validade := nullif(v_parte->>'data_validade', '')::date;

      perform fn_creditar_lote(
        it.produto_id, t.filial_destino_id, t.local_destino,
        v_parte->>'lote', v_validade, v_parcela,
        (v_parte->>'custo_unitario')::numeric
      );

      insert into movimentacoes (
        tipo, motivo, produto_id, quantidade, custo_unitario, lote, data_validade,
        filial_origem_id, local_origem, filial_destino_id, local_destino,
        usuario_id, transferencia_id, observacao
      )
      values (
        'transferencia', 'recebimento_transferencia', it.produto_id, v_parcela,
        (v_parte->>'custo_unitario')::numeric, v_parte->>'lote', v_validade,
        t.filial_origem_id, t.local_origem, t.filial_destino_id, t.local_destino,
        auth.uid(), t.id, coalesce(p_observacao, 'Recebimento da transferência ' || t.codigo)
      );

      v_restante := v_restante - v_parcela;
    end loop;

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

-- -----------------------------------------------------------------------------
-- Cancelamento: devolve para a origem cada lote que tinha saído dela
-- -----------------------------------------------------------------------------

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
  t       transferencias%rowtype;
  it      transferencia_itens%rowtype;
  v_parte jsonb;
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

  -- Já estava em trânsito: devolve o saldo para a origem, lote por lote, para
  -- que o estorno recomponha exatamente o que a baixa desfez.
  if t.status = 'em_transito' then
    for it in
      select * from transferencia_itens
       where transferencia_id = t.id and coalesce(quantidade_enviada, 0) > 0
    loop
      for v_parte in select * from jsonb_array_elements(fn_lotes_do_item(it))
      loop
        continue when (v_parte->>'quantidade')::numeric <= 0;

        perform fn_creditar_lote(
          it.produto_id, t.filial_origem_id, t.local_origem,
          v_parte->>'lote', nullif(v_parte->>'data_validade', '')::date,
          (v_parte->>'quantidade')::numeric, (v_parte->>'custo_unitario')::numeric
        );

        insert into movimentacoes (
          tipo, motivo, produto_id, quantidade, custo_unitario, lote, data_validade,
          filial_destino_id, local_destino, usuario_id, transferencia_id, observacao
        )
        values (
          'transferencia', 'recebimento_transferencia', it.produto_id,
          (v_parte->>'quantidade')::numeric, (v_parte->>'custo_unitario')::numeric,
          v_parte->>'lote', nullif(v_parte->>'data_validade', '')::date,
          t.filial_origem_id, t.local_origem, auth.uid(), t.id,
          'Estorno do cancelamento da transferência ' || t.codigo
        );
      end loop;
    end loop;
  end if;

  update transferencias
     set status = 'cancelada', cancelado_por = auth.uid(),
         cancelado_em = now(), motivo_cancelamento = p_motivo
   where id = t.id;

  return t.id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Grants
--
-- fn_lotes_do_item é auxiliar, como fn_creditar_lote e fn_debitar_fefo: só é
-- chamada de dentro das funções SECURITY DEFINER. Fora delas, ninguém executa.
-- As funções recriadas com "create or replace" mantêm os grants de 0005.
-- -----------------------------------------------------------------------------

revoke all on function fn_lotes_do_item(transferencia_itens)
  from public, anon, authenticated;

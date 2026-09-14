-- =============================================================================
-- 0024_recebimento_nfe.sql — Recebimento de produto via XML de NF-e
--
-- Nasceu como 0018 e foi renumerada antes de chegar a qualquer banco: as
-- migrations 0019 a 0023 subiram para produção enquanto esta esperava, e uma
-- 0018 aplicada depois da 0023 contradiria a ordem numérica que o projeto
-- segue. Renomear foi seguro justamente por ela nunca ter sido aplicada.
--
-- Hoje a entrada de estoque é sempre manual, item a item. Esta migration
-- adiciona um segundo caminho: importar o XML da NF-e do fornecedor, casar os
-- itens com o catálogo por EAN e levar o operador para uma conferência onde só
-- falta preencher o que o XML não traz (lote, validade, quantidade *de fato*
-- recebida). O estoque só é creditado depois da confirmação explícita.
--
-- Decisões de negócio (confirmadas com o usuário):
--   1. Divergência entre quantidade da nota e quantidade recebida é permitida,
--      nunca bloqueia — só a quantidade recebida entra no estoque.
--   2. Cadastro de produto novo inline não exige produtos.gerenciar: quem tem
--      estoque.receber_nfe cadastra o produto direto na conferência.
--   3. Fornecedor não encontrado por CNPJ é cadastrado automaticamente.
--   4. v1 aceita uma nota XML por vez, com um único local de destino.
--
-- Segue de perto o padrão de 0013_importacao_movimentos.sql: parsing no
-- cliente, staging em tabelas com RLS forçada, escrita só via função
-- SECURITY DEFINER, confirmação explícita antes de tocar em saldo.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Permissão própria
--
-- Autossuficiente por design (decisão 2): não depende de estoque.entrada nem
-- de produtos.gerenciar. `operador` entra porque já tem estoque.entrada hoje
-- (0003_permissoes_perfis.sql:105) — receber mercadoria é rotina de quem está
-- na loja/depósito. Ajustável depois sem tocar em código, em Configurações →
-- Perfis e Permissões.
-- -----------------------------------------------------------------------------

insert into permissoes (chave, modulo, descricao) values
  ('estoque.receber_nfe', 'Estoque',
   'Importar XML de NF-e, conferir os itens recebidos (inclusive cadastro de produto novo) e confirmar a entrada no estoque')
on conflict (chave) do update
  set modulo = excluded.modulo, descricao = excluded.descricao;

insert into perfil_permissoes (perfil_id, permissao_chave)
select p.id, 'estoque.receber_nfe' from perfis p where p.chave in ('admin', 'gerente', 'operador')
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- 2. Staging: cabeçalho e itens do recebimento
-- -----------------------------------------------------------------------------

create type status_recebimento_nfe as enum ('em_conferencia', 'concluido', 'cancelado');

create table recebimentos_nfe (
  id                   uuid primary key default gen_random_uuid(),
  filial_id            uuid not null references filiais(id) on delete restrict,
  local_destino        tipo_local not null,
  fornecedor_id        uuid references fornecedores(id) on delete set null,
  chave_acesso         char(44) not null,
  numero_nota          text,
  serie                text,
  data_emissao         timestamptz,
  emitente_cnpj        text,
  emitente_nome        text,
  valor_total_nota     numeric(14,2),
  -- XML bruto, guardado para auditoria — não é reprocessado depois.
  xml_conteudo         text,
  status               status_recebimento_nfe not null default 'em_conferencia',
  usuario_iniciou_id   uuid references usuarios(id) on delete set null,
  usuario_confirmou_id uuid references usuarios(id) on delete set null,
  iniciado_em          timestamptz not null default now(),
  confirmado_em        timestamptz,
  cancelado_em         timestamptz,
  observacao           text
);

-- Dedup pela chave oficial do documento, não hash de arquivo: reimportar uma
-- nota já concluída é bloqueado; uma nota ainda em conferência é retomada
-- (mesmo id, sem duplicar itens). Cancelar libera a chave para reimportar do zero.
create unique index recebimentos_nfe_chave_ativa_uk
  on recebimentos_nfe(chave_acesso) where status <> 'cancelado';

create index recebimentos_nfe_filial_idx on recebimentos_nfe(filial_id, status, iniciado_em desc);

create table recebimento_nfe_itens (
  id                        uuid primary key default gen_random_uuid(),
  recebimento_id            uuid not null references recebimentos_nfe(id) on delete cascade,
  numero_item               integer not null,
  codigo_produto_nota       text not null,
  ean_nota                  text,
  descricao_nota            text not null,
  unidade_nota              text,
  quantidade_nota           numeric(14,3) not null,
  valor_unitario_nota       numeric(14,4) not null default 0,
  valor_total_nota          numeric(14,2) not null default 0,
  lote_sugerido             text,
  data_fabricacao_sugerida  date,
  data_validade_sugerida    date,
  produto_id                uuid references produtos(id) on delete restrict,
  lote                      text,
  data_validade             date,
  quantidade_recebida       numeric(14,3),
  conferido                 boolean not null default false,
  observacao                text,
  movimentacao_id           uuid references movimentacoes(id) on delete set null,
  criado_em                 timestamptz not null default now(),
  -- Mesmo padrão de inventario_itens.divergencia_quantidade (0001_schema.sql):
  -- coluna gerada, para não recalcular a mesma conta em SQL e em TypeScript.
  divergencia_quantidade numeric(14,3)
    generated always as (coalesce(quantidade_recebida, 0) - quantidade_nota) stored
);

create unique index recebimento_nfe_itens_uk on recebimento_nfe_itens(recebimento_id, numero_item);
create index recebimento_nfe_itens_recebimento_idx on recebimento_nfe_itens(recebimento_id);

alter table recebimentos_nfe enable row level security;
alter table recebimentos_nfe force row level security;
alter table recebimento_nfe_itens enable row level security;
alter table recebimento_nfe_itens force row level security;

create policy recebimentos_nfe_select on recebimentos_nfe for select to authenticated
  using (auth_pode_acessar_filial(filial_id));

create policy recebimento_nfe_itens_select on recebimento_nfe_itens for select to authenticated
  using (exists (
    select 1 from recebimentos_nfe r
     where r.id = recebimento_nfe_itens.recebimento_id
       and auth_pode_acessar_filial(r.filial_id)
  ));

-- Escrita só pelas funções abaixo (SECURITY DEFINER), como no resto do estoque:
-- as regras de negócio (travar edição pós-conclusão, exigir todo item resolvido
-- antes de confirmar) não dá para expressar numa policy comum de UPDATE.
revoke insert, update, delete on recebimentos_nfe, recebimento_nfe_itens from authenticated;

-- -----------------------------------------------------------------------------
-- 3. fn_iniciar_recebimento_nfe — cria (ou retoma) o rascunho a partir do XML
--    já interpretado no cliente
-- -----------------------------------------------------------------------------

create or replace function fn_iniciar_recebimento_nfe(
  p_filial_id        uuid,
  p_local_destino    tipo_local,
  p_chave_acesso     char(44),
  p_numero_nota      text,
  p_serie            text,
  p_data_emissao     timestamptz,
  p_emitente_cnpj    text,
  p_emitente_nome    text,
  p_valor_total_nota numeric,
  p_xml_conteudo     text,
  p_itens            jsonb
)
-- {"id": uuid, "retomado": boolean} — "retomado" deixa a tela avisar antes de
-- navegar, em vez de retomar um rascunho em silêncio.
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recebimento_id   uuid;
  v_status           status_recebimento_nfe;
  v_fornecedor_id    uuid;
  v_cnpj_normalizado text;
  item               jsonb;
  v_numero_item      integer := 0;
  v_produto_id       uuid;
begin
  perform auth_exige_permissao('estoque.receber_nfe');
  perform auth_exige_filial(p_filial_id);

  select id, status into v_recebimento_id, v_status
    from recebimentos_nfe
   where chave_acesso = p_chave_acesso
     and status <> 'cancelado'
   order by iniciado_em desc
   limit 1;

  if found then
    if v_status = 'concluido' then
      raise exception 'Esta nota (chave %) já foi recebida e confirmada anteriormente.', p_chave_acesso
        using errcode = 'unique_violation';
    end if;
    -- em_conferencia: retoma o rascunho existente, sem duplicar itens.
    return jsonb_build_object('id', v_recebimento_id, 'retomado', true);
  end if;

  v_cnpj_normalizado := nullif(regexp_replace(coalesce(p_emitente_cnpj, ''), '\D', '', 'g'), '');

  if v_cnpj_normalizado is not null then
    select id into v_fornecedor_id from fornecedores
     where regexp_replace(coalesce(cnpj, ''), '\D', '', 'g') = v_cnpj_normalizado;

    if not found then
      insert into fornecedores (nome, cnpj)
      values (coalesce(nullif(trim(p_emitente_nome), ''), 'Fornecedor ' || v_cnpj_normalizado), v_cnpj_normalizado)
      returning id into v_fornecedor_id;
    end if;
  end if;

  insert into recebimentos_nfe (
    filial_id, local_destino, fornecedor_id, chave_acesso, numero_nota, serie,
    data_emissao, emitente_cnpj, emitente_nome, valor_total_nota, xml_conteudo,
    usuario_iniciou_id
  )
  values (
    p_filial_id, p_local_destino, v_fornecedor_id, p_chave_acesso, p_numero_nota, p_serie,
    p_data_emissao, coalesce(v_cnpj_normalizado, p_emitente_cnpj), p_emitente_nome,
    p_valor_total_nota, p_xml_conteudo, auth.uid()
  )
  returning id into v_recebimento_id;

  -- Casa por EAN (só produto ativo) e pré-preenche quantidade_recebida com a
  -- da nota: uma entrega 100% batida não exige digitar nada, só revisar e
  -- confirmar.
  for item in select * from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb))
  loop
    v_numero_item := v_numero_item + 1;

    v_produto_id := null;
    if coalesce(item->>'eanNota', '') <> '' then
      select id into v_produto_id from produtos where ean = item->>'eanNota' and ativo;
    end if;

    insert into recebimento_nfe_itens (
      recebimento_id, numero_item, codigo_produto_nota, ean_nota, descricao_nota,
      unidade_nota, quantidade_nota, valor_unitario_nota, valor_total_nota,
      lote_sugerido, data_fabricacao_sugerida, data_validade_sugerida,
      produto_id, quantidade_recebida
    )
    values (
      v_recebimento_id, v_numero_item,
      item->>'codigoProdutoNota', nullif(item->>'eanNota', ''), item->>'descricaoNota',
      item->>'unidadeNota', (item->>'quantidadeNota')::numeric,
      coalesce((item->>'valorUnitarioNota')::numeric, 0), coalesce((item->>'valorTotalNota')::numeric, 0),
      nullif(item->>'loteSugerido', ''), nullif(item->>'dataFabricacaoSugerida', '')::date,
      nullif(item->>'dataValidadeSugerida', '')::date,
      v_produto_id, (item->>'quantidadeNota')::numeric
    );
  end loop;

  if v_numero_item = 0 then
    raise exception 'A nota não tem nenhum item para receber.' using errcode = 'check_violation';
  end if;

  return jsonb_build_object('id', v_recebimento_id, 'retomado', false);
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. fn_atualizar_item_recebimento_nfe — preenche lote/validade/quantidade
--    (reescreve os campos passados, não é incremental)
-- -----------------------------------------------------------------------------

create or replace function fn_atualizar_item_recebimento_nfe(
  p_item_id             uuid,
  p_produto_id          uuid default null,
  p_lote                text default null,
  p_data_validade       date default null,
  p_quantidade_recebida numeric default null,
  p_observacao          text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recebimento recebimentos_nfe%rowtype;
begin
  perform auth_exige_permissao('estoque.receber_nfe');

  select r.* into v_recebimento
    from recebimentos_nfe r
    join recebimento_nfe_itens i on i.recebimento_id = r.id
   where i.id = p_item_id
   for update of r;

  if not found then
    raise exception 'Item de recebimento não encontrado.' using errcode = 'no_data_found';
  end if;

  perform auth_exige_filial(v_recebimento.filial_id);

  if v_recebimento.status <> 'em_conferencia' then
    raise exception 'Este recebimento não está mais em conferência.'
      using errcode = 'check_violation';
  end if;

  if p_quantidade_recebida is not null and p_quantidade_recebida < 0 then
    raise exception 'A quantidade recebida não pode ser negativa.' using errcode = 'check_violation';
  end if;

  update recebimento_nfe_itens
     set produto_id          = p_produto_id,
         lote                = nullif(trim(p_lote), ''),
         data_validade       = p_data_validade,
         quantidade_recebida = p_quantidade_recebida,
         observacao          = nullif(trim(p_observacao), ''),
         conferido           = true
   where id = p_item_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- 5. fn_cadastrar_produto_recebimento_nfe — cadastro inline do produto novo
--
-- Checa só estoque.receber_nfe, nunca produtos.gerenciar (decisão 2). Funciona
-- apesar de produtos_write exigir produtos.gerenciar porque a função roda
-- SECURITY DEFINER, como qualquer outra função de escrita do projeto.
-- -----------------------------------------------------------------------------

create or replace function fn_cadastrar_produto_recebimento_nfe(
  p_item_id           uuid,
  p_nome              text,
  p_ean               text default null,
  p_sku               text default null,
  p_categoria_id      uuid default null,
  p_fornecedor_id     uuid default null,
  p_unidade           unidade_medida default 'un',
  p_valor_custo       numeric default null,
  p_valor_venda       numeric default 0,
  p_estoque_minimo    numeric default 0,
  p_estoque_maximo    numeric default null,
  p_controla_validade boolean default true,
  p_insumo_cafeteria  boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recebimento recebimentos_nfe%rowtype;
  v_produto_id  uuid;
begin
  perform auth_exige_permissao('estoque.receber_nfe');

  select r.* into v_recebimento
    from recebimentos_nfe r
    join recebimento_nfe_itens i on i.recebimento_id = r.id
   where i.id = p_item_id
   for update of r;

  if not found then
    raise exception 'Item de recebimento não encontrado.' using errcode = 'no_data_found';
  end if;

  perform auth_exige_filial(v_recebimento.filial_id);

  if v_recebimento.status <> 'em_conferencia' then
    raise exception 'Este recebimento não está mais em conferência.'
      using errcode = 'check_violation';
  end if;

  if trim(coalesce(p_nome, '')) = '' then
    raise exception 'Informe o nome do produto.' using errcode = 'check_violation';
  end if;

  insert into produtos (
    nome, ean, sku, categoria_id, fornecedor_id, unidade, valor_custo, valor_venda,
    estoque_minimo, estoque_maximo, controla_validade, insumo_cafeteria
  )
  values (
    trim(p_nome), nullif(trim(p_ean), ''), nullif(trim(p_sku), ''), p_categoria_id,
    coalesce(p_fornecedor_id, v_recebimento.fornecedor_id), p_unidade,
    coalesce(p_valor_custo, 0), coalesce(p_valor_venda, 0),
    coalesce(p_estoque_minimo, 0), p_estoque_maximo, p_controla_validade, p_insumo_cafeteria
  )
  returning id into v_produto_id;

  insert into produto_filiais (produto_id, filial_id)
  values (v_produto_id, v_recebimento.filial_id)
  on conflict do nothing;

  update recebimento_nfe_itens
     set produto_id = v_produto_id
   where id = p_item_id;

  return v_produto_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- 6. fn_confirmar_recebimento_nfe — credita o estoque e fecha o recebimento
--
-- Não delega para fn_registrar_entrada (que exige estoque.entrada) — credita
-- direto via fn_creditar_lote e insere em movimentacoes, o mesmo carve-out que
-- fn_registrar_saida já faz para cafeteria.consumo. Isso preserva a
-- autossuficiência da permissão nova.
-- -----------------------------------------------------------------------------

create or replace function fn_confirmar_recebimento_nfe(p_recebimento_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recebimento       recebimentos_nfe%rowtype;
  item                recebimento_nfe_itens%rowtype;
  v_produto           produtos%rowtype;
  v_custo_cadastro    numeric;
  v_custo             numeric;
  v_observacao        text;
  v_mov_id            uuid;
  v_creditados        integer := 0;
begin
  perform auth_exige_permissao('estoque.receber_nfe');

  select * into v_recebimento from recebimentos_nfe where id = p_recebimento_id for update;

  if not found then
    raise exception 'Recebimento não encontrado.' using errcode = 'no_data_found';
  end if;

  perform auth_exige_filial(v_recebimento.filial_id);

  if v_recebimento.status <> 'em_conferencia' then
    raise exception 'Este recebimento não está mais em conferência.'
      using errcode = 'check_violation';
  end if;

  -- Valida tudo ANTES de creditar qualquer item: confirmar é tudo ou nada.
  for item in select * from recebimento_nfe_itens where recebimento_id = p_recebimento_id loop
    if item.produto_id is null then
      raise exception 'Item % (%) ainda não tem produto vinculado.', item.numero_item, item.descricao_nota
        using errcode = 'check_violation';
    end if;

    if not item.conferido then
      raise exception 'Item % (%) ainda não foi conferido.', item.numero_item, item.descricao_nota
        using errcode = 'check_violation';
    end if;

    select * into v_produto from produtos where id = item.produto_id;

    if v_produto.controla_validade and item.data_validade is null then
      raise exception 'Item % (%) exige data de validade.', item.numero_item, v_produto.nome
        using errcode = 'check_violation';
    end if;
  end loop;

  for item in select * from recebimento_nfe_itens where recebimento_id = p_recebimento_id order by numero_item loop
    if coalesce(item.quantidade_recebida, 0) <= 0 then
      continue;
    end if;

    select valor_custo into v_custo_cadastro from produtos where id = item.produto_id;
    v_custo := coalesce(nullif(item.valor_unitario_nota, 0), v_custo_cadastro);

    perform fn_creditar_lote(
      item.produto_id, v_recebimento.filial_id, v_recebimento.local_destino,
      coalesce(nullif(trim(item.lote), ''), 'UNICO'), item.data_validade,
      item.quantidade_recebida, v_custo
    );

    v_observacao := concat_ws(' · ',
      'NF-e ' || coalesce(v_recebimento.numero_nota, v_recebimento.chave_acesso),
      case when item.divergencia_quantidade <> 0
        then format('Nota: %s · Recebido: %s', item.quantidade_nota, item.quantidade_recebida)
        else null
      end,
      item.observacao
    );

    insert into movimentacoes (
      tipo, motivo, produto_id, quantidade, custo_unitario, lote, data_validade,
      filial_destino_id, local_destino, usuario_id, observacao
    )
    values (
      'entrada', 'compra_fornecedor', item.produto_id, item.quantidade_recebida, v_custo,
      coalesce(nullif(trim(item.lote), ''), 'UNICO'), item.data_validade,
      v_recebimento.filial_id, v_recebimento.local_destino, auth.uid(), v_observacao
    )
    returning id into v_mov_id;

    update recebimento_nfe_itens set movimentacao_id = v_mov_id where id = item.id;

    v_creditados := v_creditados + 1;
  end loop;

  update recebimentos_nfe
     set status = 'concluido',
         usuario_confirmou_id = auth.uid(),
         confirmado_em = now()
   where id = p_recebimento_id;

  return jsonb_build_object('recebimento_id', p_recebimento_id, 'itens_creditados', v_creditados);
end;
$$;

-- -----------------------------------------------------------------------------
-- 7. fn_cancelar_recebimento_nfe — só enquanto em conferência
--
-- Nunca desfaz um recebimento concluído: consistente com a imutabilidade de
-- movimentacoes no resto do projeto — erro pós-confirmação se corrige por
-- ajuste avulso (estoque.ajustar), como qualquer outro lançamento errado.
-- -----------------------------------------------------------------------------

create or replace function fn_cancelar_recebimento_nfe(p_recebimento_id uuid, p_motivo text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recebimento recebimentos_nfe%rowtype;
begin
  perform auth_exige_permissao('estoque.receber_nfe');

  select * into v_recebimento from recebimentos_nfe where id = p_recebimento_id for update;

  if not found then
    raise exception 'Recebimento não encontrado.' using errcode = 'no_data_found';
  end if;

  perform auth_exige_filial(v_recebimento.filial_id);

  if v_recebimento.status <> 'em_conferencia' then
    raise exception 'Só é possível cancelar um recebimento que ainda está em conferência.'
      using errcode = 'check_violation';
  end if;

  update recebimentos_nfe
     set status = 'cancelado',
         cancelado_em = now(),
         observacao = coalesce(nullif(trim(p_motivo), ''), observacao)
   where id = p_recebimento_id;
end;
$$;

-- Toda função nova nasce com EXECUTE para PUBLIC (e, no Supabase real, para
-- anon/authenticated/service_role via ALTER DEFAULT PRIVILEGES) — revoga
-- nominalmente antes de conceder só ao authenticated, como a 0017 já faz.
revoke execute on function
  fn_iniciar_recebimento_nfe(uuid, tipo_local, char(44), text, text, timestamptz, text, text, numeric, text, jsonb),
  fn_atualizar_item_recebimento_nfe(uuid, uuid, text, date, numeric, text),
  fn_cadastrar_produto_recebimento_nfe(uuid, text, text, text, uuid, uuid, unidade_medida, numeric, numeric, numeric, numeric, boolean, boolean),
  fn_confirmar_recebimento_nfe(uuid),
  fn_cancelar_recebimento_nfe(uuid, text)
  from public, anon;

grant execute on function
  fn_iniciar_recebimento_nfe(uuid, tipo_local, char(44), text, text, timestamptz, text, text, numeric, text, jsonb),
  fn_atualizar_item_recebimento_nfe(uuid, uuid, text, date, numeric, text),
  fn_cadastrar_produto_recebimento_nfe(uuid, text, text, text, uuid, uuid, unidade_medida, numeric, numeric, numeric, numeric, boolean, boolean),
  fn_confirmar_recebimento_nfe(uuid),
  fn_cancelar_recebimento_nfe(uuid, text)
  to authenticated;

-- =============================================================================
-- 0013_importacao_movimentos.sql — Importação diária de entradas e saídas
--
-- O sistema antigo da operação não expõe API nem banco. A movimentação sai de
-- lá em planilha e entra aqui todo dia, na mão. Isso cria dois riscos que esta
-- migration precisa endereçar:
--
--   1. Reimportar o mesmo arquivo dobraria o estoque, em silêncio. Há duas
--      travas: o hash do arquivo (bloqueia o arquivo inteiro) e uma referência
--      por linha (bloqueia a linha, mesmo vinda de outro arquivo).
--   2. A movimentação de ontem entraria com a data de hoje, distorcendo todo
--      relatório por período. Por isso as funções de entrada e saída passam a
--      aceitar a data do fato.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Permissão própria
--
-- Importar movimento é bem mais arriscado que importar catálogo: mexe em saldo.
-- Por isso não reaproveita `produtos.importar`.
-- -----------------------------------------------------------------------------

insert into permissoes (chave, modulo, descricao) values
  ('estoque.importar', 'Estoque',
   'Importar entradas e saídas em massa a partir de planilha')
on conflict (chave) do update
  set modulo = excluded.modulo, descricao = excluded.descricao;

insert into perfil_permissoes (perfil_id, permissao_chave)
select p.id, 'estoque.importar' from perfis p where p.chave in ('admin', 'gerente')
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- 2. Entrada e saída passam a aceitar a data do fato
--
-- Os parâmetros novos vão no fim e têm valor padrão, então as chamadas antigas
-- (todas nomeadas) continuam funcionando sem alteração.
-- -----------------------------------------------------------------------------

drop function if exists fn_registrar_entrada(
  uuid, uuid, tipo_local, numeric, numeric, text, date, motivo_movimentacao, text, text);

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
  p_anexo_url      text    default null,
  -- Quando nulo, usa o momento atual. A importação informa a data real do fato.
  p_data_hora      timestamptz default null
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
    filial_destino_id, local_destino, usuario_id, observacao, anexo_url, data_hora
  )
  values (
    'entrada', p_motivo, p_produto_id, p_quantidade, v_custo,
    coalesce(nullif(trim(p_lote), ''), 'UNICO'), p_data_validade,
    p_filial_id, p_local, auth.uid(), p_observacao, p_anexo_url,
    coalesce(p_data_hora, now())
  )
  returning id into v_mov_id;

  return v_mov_id;
end;
$$;

drop function if exists fn_registrar_saida(
  uuid, uuid, tipo_local, numeric, motivo_movimentacao, uuid, text);

create or replace function fn_registrar_saida(
  p_produto_id uuid,
  p_filial_id  uuid,
  p_local      tipo_local,
  p_quantidade numeric,
  p_motivo     motivo_movimentacao default 'venda',
  p_lote_id    uuid default null,
  p_observacao text default null,
  p_data_hora  timestamptz default null
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
      filial_origem_id, local_origem, usuario_id, observacao, data_hora
    )
    values (
      'saida', p_motivo, p_produto_id,
      (item->>'quantidade')::numeric,
      (item->>'custo_unitario')::numeric,
      item->>'lote',
      nullif(item->>'data_validade', '')::date,
      p_filial_id, p_local, auth.uid(), p_observacao,
      coalesce(p_data_hora, now())
    )
    returning id into v_mov_id;

    v_movs := v_movs || to_jsonb(v_mov_id);
  end loop;

  return jsonb_build_object('lotes', v_consumido, 'movimentacoes', v_movs);
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. Registro das importações
-- -----------------------------------------------------------------------------

create table importacoes_movimento (
  id              uuid primary key default gen_random_uuid(),
  filial_id       uuid not null references filiais(id) on delete restrict,
  arquivo_nome    text not null,
  -- Impressão digital do conteúdo: o mesmo arquivo nunca entra duas vezes.
  arquivo_hash    text not null,
  total_linhas    integer not null default 0,
  total_aplicadas integer not null default 0,
  total_ignoradas integer not null default 0,
  total_erros     integer not null default 0,
  usuario_id      uuid references usuarios(id) on delete set null,
  criado_em       timestamptz not null default now()
);

create unique index importacoes_movimento_hash_uk on importacoes_movimento(arquivo_hash);
create index importacoes_movimento_filial_idx on importacoes_movimento(filial_id, criado_em desc);

comment on table importacoes_movimento is
  'Cada carga de movimentação vinda do sistema legado. O hash impede reimportar o mesmo arquivo.';

-- Uma linha por movimento importado, para bloquear duplicata mesmo quando a
-- pessoa corrige o arquivo e reenvia: as linhas que já entraram são puladas.
create table movimentos_importados (
  id            bigserial primary key,
  importacao_id uuid not null references importacoes_movimento(id) on delete cascade,
  referencia    text not null,
  produto_id    uuid not null references produtos(id) on delete restrict,
  tipo          tipo_movimentacao not null,
  quantidade    numeric(14,3) not null,
  criado_em     timestamptz not null default now()
);

create unique index movimentos_importados_referencia_uk on movimentos_importados(referencia);
create index movimentos_importados_importacao_idx on movimentos_importados(importacao_id);

comment on column movimentos_importados.referencia is
  'Chave da linha no sistema de origem (filial|data|documento|produto|local|tipo). Unica em todo o sistema.';

alter table importacoes_movimento enable row level security;
alter table importacoes_movimento force row level security;
alter table movimentos_importados enable row level security;
alter table movimentos_importados force row level security;

create policy importacoes_movimento_select on importacoes_movimento for select to authenticated
  using (auth_pode_acessar_filial(filial_id));

create policy movimentos_importados_select on movimentos_importados for select to authenticated
  using (
    exists (
      select 1 from importacoes_movimento i
       where i.id = movimentos_importados.importacao_id
         and auth_pode_acessar_filial(i.filial_id)
    )
  );

-- Escrita só pela função de importação (SECURITY DEFINER), como no resto do estoque.
revoke insert, update, delete on importacoes_movimento, movimentos_importados from authenticated;

-- -----------------------------------------------------------------------------
-- 4. A importação em si
--
-- Cada linha é processada de forma independente: uma linha com problema não
-- derruba as outras. O relatório de retorno diz exatamente o que entrou, o que
-- foi pulado por já existir e o que falhou, para corrigir e reenviar só o resto.
-- -----------------------------------------------------------------------------

create or replace function fn_importar_movimentos(
  p_filial_id uuid,
  p_arquivo   text,
  p_hash      text,
  p_itens     jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_importacao uuid;
  item         jsonb;
  v_produto    produtos%rowtype;
  v_ref        text;
  v_tipo       tipo_movimentacao;
  v_qtd        numeric;
  v_data       timestamptz;
  v_aplicadas  integer := 0;
  v_ignoradas  integer := 0;
  v_erros      jsonb   := '[]'::jsonb;
  v_linha      integer := 0;
  v_existente  timestamptz;
begin
  perform auth_exige_permissao('estoque.importar');
  perform auth_exige_filial(p_filial_id);

  select criado_em into v_existente
    from importacoes_movimento where arquivo_hash = p_hash;

  if found then
    raise exception
      'Este arquivo ja foi importado em %. Reimportar dobraria o estoque.',
      to_char(v_existente, 'DD/MM/YYYY HH24:MI')
      using errcode = 'unique_violation';
  end if;

  insert into importacoes_movimento (
    filial_id, arquivo_nome, arquivo_hash, total_linhas, usuario_id
  )
  values (
    p_filial_id, p_arquivo, p_hash,
    jsonb_array_length(coalesce(p_itens, '[]'::jsonb)), auth.uid()
  )
  returning id into v_importacao;

  for item in select * from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb))
  loop
    v_linha := v_linha + 1;

    begin
      -- Produto: por código de barras quando houver, senão pelo nome exato.
      if coalesce(item->>'ean', '') <> '' then
        select * into v_produto from produtos
         where ean = trim(item->>'ean') and ativo;
      else
        select * into v_produto from produtos
         where lower(nome) = lower(trim(coalesce(item->>'nome', ''))) and ativo;
      end if;

      if not found then
        v_erros := v_erros || jsonb_build_object(
          'linha', v_linha,
          'item', coalesce(item->>'ean', item->>'nome', ''),
          'erro', 'Produto nao encontrado no catalogo.'
        );
        continue;
      end if;

      v_tipo := (item->>'tipo')::tipo_movimentacao;
      v_qtd  := (item->>'quantidade')::numeric;
      v_data := coalesce(nullif(item->>'data', '')::timestamptz, now());

      if v_qtd is null or v_qtd <= 0 then
        v_erros := v_erros || jsonb_build_object(
          'linha', v_linha, 'item', v_produto.nome,
          'erro', 'Quantidade precisa ser maior que zero.'
        );
        continue;
      end if;

      -- Chave de deduplicação da linha.
      v_ref := concat_ws('|',
        p_filial_id::text,
        to_char(v_data, 'YYYY-MM-DD'),
        coalesce(nullif(trim(item->>'documento'), ''), 'sem-doc'),
        v_produto.id::text,
        item->>'local',
        v_tipo::text
      );

      if exists (select 1 from movimentos_importados where referencia = v_ref) then
        v_ignoradas := v_ignoradas + 1;
        continue;
      end if;

      if v_tipo = 'entrada' then
        perform fn_registrar_entrada(
          p_produto_id     => v_produto.id,
          p_filial_id      => p_filial_id,
          p_local          => (item->>'local')::tipo_local,
          p_quantidade     => v_qtd,
          p_custo_unitario => nullif(item->>'custo_unitario', '')::numeric,
          p_lote           => nullif(item->>'lote', ''),
          p_data_validade  => nullif(item->>'data_validade', '')::date,
          p_motivo         => coalesce(nullif(item->>'motivo', ''), 'compra_fornecedor')::motivo_movimentacao,
          p_observacao     => concat_ws(' · ',
                                'Importacao ' || p_arquivo,
                                nullif(trim(item->>'documento'), ''),
                                nullif(trim(item->>'observacao'), '')),
          p_data_hora      => v_data
        );
      else
        perform fn_registrar_saida(
          p_produto_id => v_produto.id,
          p_filial_id  => p_filial_id,
          p_local      => (item->>'local')::tipo_local,
          p_quantidade => v_qtd,
          p_motivo     => coalesce(nullif(item->>'motivo', ''), 'venda')::motivo_movimentacao,
          p_observacao => concat_ws(' · ',
                            'Importacao ' || p_arquivo,
                            nullif(trim(item->>'documento'), ''),
                            nullif(trim(item->>'observacao'), '')),
          p_data_hora  => v_data
        );
      end if;

      insert into movimentos_importados (
        importacao_id, referencia, produto_id, tipo, quantidade
      )
      values (v_importacao, v_ref, v_produto.id, v_tipo, v_qtd);

      v_aplicadas := v_aplicadas + 1;

    exception when others then
      v_erros := v_erros || jsonb_build_object(
        'linha', v_linha,
        'item', coalesce(v_produto.nome, item->>'ean', item->>'nome', ''),
        'erro', sqlerrm
      );
    end;
  end loop;

  update importacoes_movimento
     set total_aplicadas = v_aplicadas,
         total_ignoradas = v_ignoradas,
         total_erros     = jsonb_array_length(v_erros)
   where id = v_importacao;

  return jsonb_build_object(
    'importacao_id', v_importacao,
    'aplicadas', v_aplicadas,
    'ignoradas', v_ignoradas,
    'erros', v_erros
  );
end;
$$;

grant execute on function
  fn_registrar_entrada(uuid, uuid, tipo_local, numeric, numeric, text, date, motivo_movimentacao, text, text, timestamptz),
  fn_registrar_saida(uuid, uuid, tipo_local, numeric, motivo_movimentacao, uuid, text, timestamptz),
  fn_importar_movimentos(uuid, text, text, jsonb)
  to authenticated;

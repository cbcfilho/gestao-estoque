-- =============================================================================
-- 0021_corrige_dedup_importacao_lote.sql — Chave de deduplicação da
-- importação de movimentação passa a considerar lote e data de validade
--
-- A chave por linha (v_ref) não incluía lote nem data_validade:
--
--   filial | data | documento | produto | local | tipo
--
-- Duas entradas do MESMO produto, no mesmo dia, sem "documento" preenchido
-- (ou com o mesmo documento), mas de LOTES DIFERENTES — cenário comum
-- quando o fornecedor entrega mais de um lote na mesma nota/dia — caíam na
-- mesma chave. A segunda linha era silenciosamente tratada como "já
-- importada" e pulada, mesmo vindo de uma planilha nova, avulsa.
--
-- Corrige incluindo lote e data_validade na chave: agora só é duplicata de
-- verdade quando TODOS os campos batem, inclusive lote e validade.
-- =============================================================================

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

      -- Chave de deduplicação da linha. Lote e validade entram na chave:
      -- duas entregas do mesmo produto, no mesmo dia e sem documento
      -- distinto, mas de lotes diferentes, são linhas DIFERENTES, não
      -- duplicata uma da outra.
      v_ref := concat_ws('|',
        p_filial_id::text,
        to_char(v_data, 'YYYY-MM-DD'),
        coalesce(nullif(trim(item->>'documento'), ''), 'sem-doc'),
        v_produto.id::text,
        item->>'local',
        v_tipo::text,
        coalesce(nullif(trim(item->>'lote'), ''), 'sem-lote'),
        coalesce(nullif(item->>'data_validade', ''), 'sem-validade')
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

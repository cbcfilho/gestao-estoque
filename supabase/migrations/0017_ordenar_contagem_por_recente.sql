-- =============================================================================
-- 0017_ordenar_contagem_por_recente.sql — Contagem passa a listar por
-- lançamento mais recente, com escolha de ordenação
--
-- A lista de contagem sempre voltou em `order by p.nome`, então quem estava
-- no meio de uma contagem grande — 70, 100 itens — não conseguia achar os
-- últimos lançamentos: eles apareciam espalhados pela ordem alfabética, junto
-- com tudo que ainda não tinha sido contado. Conferir ou corrigir a última
-- leitura exigia rolar a lista inteira procurando.
--
-- Esta migration não troca uma ordem fixa por outra: dá pra tela três opções
-- e o padrão passa a ser "mais recente primeiro" — os itens sem contagem não
-- somem, só afundam para o fim, porque `contado_em` é nulo neles. Isso é o
-- comportamento certo: quem quer ver só o que falta já tem o filtro "Só os
-- que faltam" para isso; a ordenação por recente serve pra revisar o que
-- acabou de contar.
-- =============================================================================

drop function if exists fn_inventario_itens_para_contagem(uuid, tipo_local, text, boolean);

create or replace function fn_inventario_itens_para_contagem(
  p_inventario_id    uuid,
  p_local            tipo_local default null,
  p_busca            text default null,
  p_apenas_pendentes boolean default false,
  -- 'recente' (padrão): quem acabou de ser contado primeiro, não contados no
  --   fim. 'nome': ordem alfabética, o comportamento de antes desta migration.
  -- 'codigo': por EAN, para quem confere com a etiqueta do produto em mãos.
  -- Qualquer outro valor (incluindo null) cai no mesmo lugar que 'nome'.
  p_ordenar_por      text default 'recente'
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
    -- Cada CASE só produz valor real para a ordenação escolhida; nas outras
    -- linhas ele dá null e portanto empata, deixando o próximo critério
    -- decidir. É o jeito de trocar a ordenação sem SQL dinâmico: a direção
    -- (asc/desc) fica fixa por coluna, mas só uma delas importa por vez.
    order by
      (case when p_ordenar_por = 'recente' then ii.contado_em end) desc nulls last,
      (case when p_ordenar_por = 'codigo'  then p.ean          end) asc  nulls last,
      p.nome, ii.local, ii.data_validade nulls last;
end;
$$;

-- drop + create troca o OID da função, e o Supabase concede EXECUTE a
-- anon/authenticated/service_role de novo por padrão em toda função nova via
-- ALTER DEFAULT PRIVILEGES (não é o PUBLIC clássico do Postgres, que a 0015
-- já cobria — checado direto no pg_proc.proacl). Revoga do anon nominalmente
-- antes de conceder ao authenticated, senão o buraco que a 0015 fechou volta
-- sozinho para qualquer função recriada depois dela.
revoke execute on function
  fn_inventario_itens_para_contagem(uuid, tipo_local, text, boolean, text)
  from public, anon;

grant execute on function
  fn_inventario_itens_para_contagem(uuid, tipo_local, text, boolean, text)
  to authenticated;

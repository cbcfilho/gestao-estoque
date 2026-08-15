-- =============================================================================
-- 0007_dashboard.sql — KPIs, curva ABC, giro e comparativos
--
-- Estas funções são SECURITY INVOKER de propósito: elas leem as views, que por
-- sua vez respeitam a RLS. Assim o gerente enxerga só a filial dele e o
-- franqueado enxerga tudo, sem nenhuma checagem adicional aqui.
-- =============================================================================

create or replace function fn_dashboard_resumo(p_filial_ids uuid[] default null)
returns table (
  valor_estoque          numeric,
  valor_venda_potencial  numeric,
  skus_ativos            bigint,
  itens_abaixo_minimo    bigint,
  valor_reposicao        numeric,
  lotes_vencendo_7       bigint,
  lotes_vencendo_15      bigint,
  lotes_vencendo_30      bigint,
  valor_vencendo_30      numeric,
  valor_vencido          numeric,
  movimentacoes_30d      bigint,
  tarefas_abertas        bigint,
  tarefas_atrasadas      bigint,
  inventarios_pendentes  bigint
)
language sql
stable
as $$
  with escopo as (
    select f.id
      from filiais f
     where f.ativo
       and (p_filial_ids is null or f.id = any(p_filial_ids))
  ),
  estoque as (
    select
      coalesce(sum(v.valor_custo_total), 0) as valor_estoque,
      coalesce(sum(v.valor_venda_total), 0) as valor_venda,
      coalesce(sum(v.skus_com_saldo), 0)    as skus
    from vw_valor_estoque_filial v
    where v.filial_id in (select id from escopo)
  ),
  minimo as (
    select
      count(*)                                       as itens,
      coalesce(sum(valor_reposicao_estimado), 0)     as valor
    from vw_produtos_abaixo_minimo
    where filial_id in (select id from escopo)
  ),
  vencimento as (
    select
      count(*) filter (where dias_para_vencer between 0 and 7)  as v7,
      count(*) filter (where dias_para_vencer between 0 and 15) as v15,
      count(*) filter (where dias_para_vencer between 0 and 30) as v30,
      coalesce(sum(valor_em_risco) filter (where dias_para_vencer between 0 and 30), 0) as valor30,
      coalesce(sum(valor_em_risco) filter (where dias_para_vencer < 0), 0)              as valor_vencido
    from vw_produtos_vencendo
    where filial_id in (select id from escopo)
  ),
  movs as (
    select count(*) as total
      from movimentacoes m
     where m.data_hora >= now() - interval '30 days'
       and (m.filial_origem_id in (select id from escopo)
            or m.filial_destino_id in (select id from escopo))
  ),
  tar as (
    select
      count(*) filter (where status in ('a_fazer', 'em_andamento', 'atrasado')) as abertas,
      count(*) filter (where atrasada)                                          as atrasadas
    from vw_tarefas
    where filial_id is null or filial_id in (select id from escopo)
  ),
  inv as (
    select count(*) as pendentes
      from inventarios
     where status in ('aberto', 'em_contagem', 'aguardando_aprovacao')
       and filial_id in (select id from escopo)
  )
  select
    round(estoque.valor_estoque, 2),
    round(estoque.valor_venda, 2),
    estoque.skus,
    minimo.itens,
    round(minimo.valor, 2),
    vencimento.v7,
    vencimento.v15,
    vencimento.v30,
    round(vencimento.valor30, 2),
    round(vencimento.valor_vencido, 2),
    movs.total,
    tar.abertas,
    tar.atrasadas,
    inv.pendentes
  from estoque, minimo, vencimento, movs, tar, inv;
$$;

-- -----------------------------------------------------------------------------
-- Curva ABC — participação de cada produto no valor de saída do período
-- -----------------------------------------------------------------------------

create or replace function fn_curva_abc(
  p_de         date default (current_date - 90),
  p_ate        date default current_date,
  p_filial_ids uuid[] default null
)
returns table (
  produto_id             uuid,
  produto_nome           text,
  ean                    text,
  valor_saida            numeric,
  quantidade_saida       numeric,
  participacao           numeric,
  participacao_acumulada numeric,
  classe                 text
)
language sql
stable
as $$
  with saidas as (
    select
      m.produto_id,
      sum(m.quantidade * m.custo_unitario) as valor,
      sum(m.quantidade)                    as qtd
    from movimentacoes m
    where m.tipo = 'saida'
      -- só consumo real: perdas e ajustes distorceriam a curva
      and m.motivo in ('venda', 'consumo_interno', 'degustacao', 'brinde')
      and m.data_hora >= p_de
      and m.data_hora < (p_ate + 1)
      and (p_filial_ids is null or m.filial_origem_id = any(p_filial_ids))
      and m.filial_origem_id in (select id from filiais)
    group by m.produto_id
    having sum(m.quantidade * m.custo_unitario) > 0
  ),
  total as (select nullif(sum(valor), 0) as geral from saidas),
  ranqueado as (
    select
      s.produto_id,
      p.nome,
      p.ean,
      s.valor,
      s.qtd,
      round(100.0 * s.valor / t.geral, 4) as participacao,
      round(100.0 * sum(s.valor) over (order by s.valor desc, s.produto_id)
            / t.geral, 4) as acumulada
    from saidas s
    join produtos p on p.id = s.produto_id
    cross join total t
  )
  select
    produto_id,
    nome,
    ean,
    round(valor, 2),
    qtd,
    participacao,
    acumulada,
    case
      when acumulada <= 80  then 'A'
      when acumulada <= 95  then 'B'
      else 'C'
    end
  from ranqueado
  order by valor desc;
$$;

comment on function fn_curva_abc(date, date, uuid[]) is
  'Classificação ABC pelo valor de saída: A até 80% acumulados, B até 95%, C o restante.';

-- -----------------------------------------------------------------------------
-- Giro de estoque e cobertura em dias
-- -----------------------------------------------------------------------------

create or replace function fn_giro_estoque(
  p_de         date default (current_date - 90),
  p_ate        date default current_date,
  p_filial_ids uuid[] default null
)
returns table (
  produto_id        uuid,
  produto_nome      text,
  ean               text,
  quantidade_saida  numeric,
  estoque_medio     numeric,
  giro              numeric,
  dias_de_cobertura numeric
)
language sql
stable
as $$
  with dias as (select greatest((p_ate - p_de), 1) as n),
  saidas as (
    select m.produto_id, sum(m.quantidade) as qtd
      from movimentacoes m
     where m.tipo = 'saida'
       and m.motivo in ('venda', 'consumo_interno', 'degustacao', 'brinde')
       and m.data_hora >= p_de
       and m.data_hora < (p_ate + 1)
       and (p_filial_ids is null or m.filial_origem_id = any(p_filial_ids))
       and m.filial_origem_id in (select id from filiais)
     group by m.produto_id
  ),
  saldo as (
    select le.produto_id, sum(le.quantidade) as qtd
      from lotes_estoque le
     where (p_filial_ids is null or le.filial_id = any(p_filial_ids))
     group by le.produto_id
  )
  select
    p.id,
    p.nome,
    p.ean,
    coalesce(s.qtd, 0),
    coalesce(sl.qtd, 0),
    case when coalesce(sl.qtd, 0) > 0
         then round(coalesce(s.qtd, 0) / sl.qtd, 3) end,
    case when coalesce(s.qtd, 0) > 0
         then round(coalesce(sl.qtd, 0) / (s.qtd / (select n from dias)), 1) end
  from produtos p
  left join saidas s  on s.produto_id  = p.id
  left join saldo  sl on sl.produto_id = p.id
  where p.ativo
    and (coalesce(s.qtd, 0) > 0 or coalesce(sl.qtd, 0) > 0)
  order by coalesce(s.qtd, 0) desc;
$$;

comment on function fn_giro_estoque(date, date, uuid[]) is
  'Estoque médio é aproximado pelo saldo atual — o sistema ainda não guarda fotos históricas do saldo.';

-- -----------------------------------------------------------------------------
-- Evolução mês a mês de entradas e saídas
-- -----------------------------------------------------------------------------

create or replace function fn_evolucao_mensal(
  p_meses      integer default 12,
  p_filial_ids uuid[]  default null
)
returns table (
  mes            date,
  entradas_valor numeric,
  saidas_valor   numeric,
  entradas_qtd   numeric,
  saidas_qtd     numeric
)
language sql
stable
as $$
  with meses as (
    select generate_series(
      date_trunc('month', current_date) - ((p_meses - 1) || ' months')::interval,
      date_trunc('month', current_date),
      '1 month'
    )::date as mes
  ),
  movs as (
    select
      date_trunc('month', m.data_hora)::date as mes,
      sum(m.quantidade * m.custo_unitario) filter (where m.tipo = 'entrada') as ent_valor,
      sum(m.quantidade * m.custo_unitario) filter (where m.tipo = 'saida')   as sai_valor,
      sum(m.quantidade) filter (where m.tipo = 'entrada')                    as ent_qtd,
      sum(m.quantidade) filter (where m.tipo = 'saida')                      as sai_qtd
    from movimentacoes m
    where m.data_hora >= date_trunc('month', current_date) - ((p_meses - 1) || ' months')::interval
      and (
        p_filial_ids is null
        or m.filial_origem_id = any(p_filial_ids)
        or m.filial_destino_id = any(p_filial_ids)
      )
      and (m.filial_origem_id in (select id from filiais)
           or m.filial_destino_id in (select id from filiais))
    group by 1
  )
  select
    meses.mes,
    round(coalesce(movs.ent_valor, 0), 2),
    round(coalesce(movs.sai_valor, 0), 2),
    coalesce(movs.ent_qtd, 0),
    coalesce(movs.sai_qtd, 0)
  from meses
  left join movs on movs.mes = meses.mes
  order by meses.mes;
$$;

-- -----------------------------------------------------------------------------
-- Ranking de acuracidade de inventário por filial
-- -----------------------------------------------------------------------------

create or replace function fn_ranking_acuracidade(p_meses integer default 6)
returns table (
  filial_id               uuid,
  filial_nome             text,
  inventarios             bigint,
  acuracidade_media       numeric,
  divergencia_valor_total numeric,
  ultimo_inventario       timestamptz
)
language sql
stable
as $$
  select
    r.filial_id,
    r.filial_nome,
    count(*),
    round(avg(r.acuracidade_percentual), 2),
    round(sum(abs(r.divergencia_liquida)), 2),
    max(r.aprovado_em)
  from vw_inventario_resumo r
  where r.status = 'aprovado'
    and r.aprovado_em >= now() - (p_meses || ' months')::interval
  group by r.filial_id, r.filial_nome
  order by avg(r.acuracidade_percentual) desc nulls last;
$$;

-- -----------------------------------------------------------------------------
-- Consumo da cafeteria (visão específica da filial com cafeteria)
-- -----------------------------------------------------------------------------

create or replace function fn_consumo_cafeteria(
  p_filial_id uuid,
  p_de        date default (current_date - 30),
  p_ate       date default current_date
)
returns table (
  produto_id   uuid,
  produto_nome text,
  unidade      unidade_medida,
  quantidade   numeric,
  valor        numeric
)
language sql
stable
as $$
  select
    m.produto_id,
    p.nome,
    p.unidade,
    sum(m.quantidade),
    round(sum(m.quantidade * m.custo_unitario), 2)
  from movimentacoes m
  join produtos p on p.id = m.produto_id
  where m.tipo = 'saida'
    and m.local_origem = 'cafeteria'
    and m.filial_origem_id = p_filial_id
    and m.data_hora >= p_de
    and m.data_hora < (p_ate + 1)
  group by m.produto_id, p.nome, p.unidade
  order by sum(m.quantidade * m.custo_unitario) desc;
$$;

grant execute on function
  fn_dashboard_resumo(uuid[]),
  fn_curva_abc(date, date, uuid[]),
  fn_giro_estoque(date, date, uuid[]),
  fn_evolucao_mensal(integer, uuid[]),
  fn_ranking_acuracidade(integer),
  fn_consumo_cafeteria(uuid, date, date)
  to authenticated;

-- =============================================================================
-- 0004_views.sql — Views de consulta e apoio ao dashboard
--
-- Todas as views usam security_invoker = true para que as políticas RLS das
-- tabelas base continuem valendo (o usuário só enxerga as filiais dele).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Saldo detalhado por lote
-- -----------------------------------------------------------------------------

create view vw_saldo_lote with (security_invoker = true) as
select
  le.id                as lote_id,
  le.produto_id,
  p.nome               as produto_nome,
  p.ean,
  p.unidade,
  p.categoria_id,
  c.nome               as categoria_nome,
  le.filial_id,
  f.nome               as filial_nome,
  le.local,
  le.lote,
  le.data_validade,
  case
    when le.data_validade is null then null
    else (le.data_validade - current_date)
  end                  as dias_para_vencer,
  le.quantidade,
  le.custo_unitario,
  round(le.quantidade * le.custo_unitario, 2) as valor_custo_total,
  round(le.quantidade * p.valor_venda, 2)     as valor_venda_total,
  le.atualizado_em
from lotes_estoque le
join produtos p on p.id = le.produto_id
join filiais  f on f.id = le.filial_id
left join categorias c on c.id = p.categoria_id;

-- -----------------------------------------------------------------------------
-- Saldo agregado por produto / filial / local
-- -----------------------------------------------------------------------------

create view vw_saldo_produto_local with (security_invoker = true) as
select
  le.produto_id,
  le.filial_id,
  le.local,
  sum(le.quantidade)                                  as quantidade,
  round(sum(le.quantidade * le.custo_unitario), 2)    as valor_custo,
  min(le.data_validade) filter (where le.quantidade > 0) as proxima_validade
from lotes_estoque le
group by le.produto_id, le.filial_id, le.local;

create view vw_saldo_produto_filial with (security_invoker = true) as
select
  le.produto_id,
  le.filial_id,
  sum(le.quantidade)                                  as quantidade,
  sum(le.quantidade) filter (where le.local = 'deposito')   as qtd_deposito,
  sum(le.quantidade) filter (where le.local = 'prateleira') as qtd_prateleira,
  sum(le.quantidade) filter (where le.local = 'cafeteria')  as qtd_cafeteria,
  round(sum(le.quantidade * le.custo_unitario), 2)    as valor_custo,
  min(le.data_validade) filter (where le.quantidade > 0) as proxima_validade
from lotes_estoque le
group by le.produto_id, le.filial_id;

create view vw_saldo_produto_consolidado with (security_invoker = true) as
select
  p.id                 as produto_id,
  p.nome               as produto_nome,
  p.ean,
  p.unidade,
  p.categoria_id,
  p.valor_custo        as custo_cadastro,
  p.valor_venda,
  p.estoque_minimo,
  p.estoque_maximo,
  coalesce(sum(le.quantidade), 0)                              as quantidade_total,
  round(coalesce(sum(le.quantidade * le.custo_unitario), 0), 2) as valor_custo_total,
  round(coalesce(sum(le.quantidade), 0) * p.valor_venda, 2)     as valor_venda_total,
  count(distinct le.filial_id) filter (where le.quantidade > 0) as filiais_com_saldo
from produtos p
left join lotes_estoque le on le.produto_id = p.id
where p.ativo
group by p.id;

-- -----------------------------------------------------------------------------
-- Alertas: estoque abaixo do mínimo (respeita o limite específico da filial)
-- -----------------------------------------------------------------------------

create view vw_produtos_abaixo_minimo with (security_invoker = true) as
select
  p.id            as produto_id,
  p.nome          as produto_nome,
  p.ean,
  p.unidade,
  f.id            as filial_id,
  f.nome          as filial_nome,
  coalesce(pf.estoque_minimo, p.estoque_minimo)       as estoque_minimo,
  coalesce(pf.estoque_maximo, p.estoque_maximo)       as estoque_maximo,
  coalesce(s.quantidade, 0)                           as quantidade,
  coalesce(pf.estoque_minimo, p.estoque_minimo) - coalesce(s.quantidade, 0) as faltante,
  round((coalesce(pf.estoque_minimo, p.estoque_minimo) - coalesce(s.quantidade, 0))
        * p.valor_custo, 2)                           as valor_reposicao_estimado
from produtos p
join produto_filiais pf on pf.produto_id = p.id and pf.ativo
join filiais f on f.id = pf.filial_id and f.ativo
left join vw_saldo_produto_filial s on s.produto_id = p.id and s.filial_id = f.id
where p.ativo
  and coalesce(pf.estoque_minimo, p.estoque_minimo) > 0
  and coalesce(s.quantidade, 0) < coalesce(pf.estoque_minimo, p.estoque_minimo);

-- -----------------------------------------------------------------------------
-- Alertas: produtos vencendo (e vencidos)
-- -----------------------------------------------------------------------------

create view vw_produtos_vencendo with (security_invoker = true) as
select
  le.id            as lote_id,
  le.produto_id,
  p.nome           as produto_nome,
  p.ean,
  p.unidade,
  le.filial_id,
  f.nome           as filial_nome,
  le.local,
  le.lote,
  le.data_validade,
  (le.data_validade - current_date)                   as dias_para_vencer,
  le.quantidade,
  round(le.quantidade * le.custo_unitario, 2)         as valor_em_risco,
  case
    when le.data_validade < current_date            then 'vencido'
    when le.data_validade <= current_date + 7       then 'critico'
    when le.data_validade <= current_date + 15      then 'atencao'
    when le.data_validade <= current_date + 30      then 'proximo'
    else 'ok'
  end                                                 as faixa
from lotes_estoque le
join produtos p on p.id = le.produto_id
join filiais  f on f.id = le.filial_id
where le.quantidade > 0
  and le.data_validade is not null
  and le.data_validade <= current_date + 30;

-- -----------------------------------------------------------------------------
-- Valor de estoque por filial e por local (KPI do dashboard)
-- -----------------------------------------------------------------------------

create view vw_valor_estoque_filial with (security_invoker = true) as
select
  f.id                                                          as filial_id,
  f.nome                                                        as filial_nome,
  f.possui_cafeteria,
  round(coalesce(sum(le.quantidade * le.custo_unitario), 0), 2) as valor_custo_total,
  round(coalesce(sum(le.quantidade * p.valor_venda), 0), 2)     as valor_venda_total,
  round(coalesce(sum(le.quantidade * le.custo_unitario)
        filter (where le.local = 'deposito'), 0), 2)            as valor_deposito,
  round(coalesce(sum(le.quantidade * le.custo_unitario)
        filter (where le.local = 'prateleira'), 0), 2)          as valor_prateleira,
  round(coalesce(sum(le.quantidade * le.custo_unitario)
        filter (where le.local = 'cafeteria'), 0), 2)           as valor_cafeteria,
  count(distinct le.produto_id) filter (where le.quantidade > 0) as skus_com_saldo
from filiais f
left join lotes_estoque le on le.filial_id = f.id
left join produtos p on p.id = le.produto_id
where f.ativo
group by f.id;

-- -----------------------------------------------------------------------------
-- Inventário: divergências e acuracidade
-- -----------------------------------------------------------------------------

create view vw_inventario_divergencias with (security_invoker = true) as
select
  ii.id                as item_id,
  ii.inventario_id,
  i.codigo             as inventario_codigo,
  i.filial_id,
  f.nome               as filial_nome,
  i.status             as inventario_status,
  ii.produto_id,
  p.nome               as produto_nome,
  p.ean,
  p.unidade,
  ii.local,
  ii.lote,
  ii.data_validade,
  ii.quantidade_sistema,
  ii.quantidade_contada,
  ii.divergencia_quantidade,
  ii.divergencia_valor,
  case
    when ii.quantidade_contada is null              then 'nao_contado'
    when ii.divergencia_quantidade = 0              then 'ok'
    when ii.divergencia_quantidade > 0              then 'sobra'
    else 'falta'
  end                  as situacao
from inventario_itens ii
join inventarios i on i.id = ii.inventario_id
join filiais f on f.id = i.filial_id
join produtos p on p.id = ii.produto_id;

create view vw_inventario_resumo with (security_invoker = true) as
select
  i.id                 as inventario_id,
  i.codigo,
  i.filial_id,
  f.nome               as filial_nome,
  i.tipo,
  i.status,
  i.competencia,
  i.aberto_em,
  i.fechado_em,
  i.aprovado_em,
  count(ii.id)                                                as itens_total,
  count(ii.id) filter (where ii.quantidade_contada is not null) as itens_contados,
  count(ii.id) filter (where ii.quantidade_contada is not null
                         and ii.divergencia_quantidade <> 0)   as itens_divergentes,
  round(coalesce(sum(ii.divergencia_valor)
        filter (where ii.divergencia_valor < 0), 0), 2)        as valor_falta,
  round(coalesce(sum(ii.divergencia_valor)
        filter (where ii.divergencia_valor > 0), 0), 2)        as valor_sobra,
  round(coalesce(sum(ii.divergencia_valor), 0), 2)             as divergencia_liquida,
  -- acuracidade = itens sem divergência sobre itens contados
  case
    when count(ii.id) filter (where ii.quantidade_contada is not null) = 0 then null
    else round(
      100.0 * count(ii.id) filter (where ii.quantidade_contada is not null
                                     and ii.divergencia_quantidade = 0)
      / count(ii.id) filter (where ii.quantidade_contada is not null), 2)
  end                                                          as acuracidade_percentual
from inventarios i
join filiais f on f.id = i.filial_id
left join inventario_itens ii on ii.inventario_id = i.id
group by i.id, f.nome;

-- -----------------------------------------------------------------------------
-- Movimentações enriquecidas (usada no histórico e nos relatórios)
-- -----------------------------------------------------------------------------

create view vw_movimentacoes with (security_invoker = true) as
select
  m.id,
  m.data_hora,
  m.tipo,
  m.motivo,
  m.produto_id,
  p.nome               as produto_nome,
  p.ean,
  p.unidade,
  p.categoria_id,
  m.quantidade,
  m.custo_unitario,
  round(m.quantidade * m.custo_unitario, 2) as valor_total,
  m.lote,
  m.data_validade,
  m.filial_origem_id,
  fo.nome              as filial_origem_nome,
  m.local_origem,
  m.filial_destino_id,
  fd.nome              as filial_destino_nome,
  m.local_destino,
  m.usuario_id,
  u.nome               as usuario_nome,
  m.transferencia_id,
  m.inventario_id,
  m.anexo_url,
  m.observacao
from movimentacoes m
join produtos p on p.id = m.produto_id
left join filiais fo on fo.id = m.filial_origem_id
left join filiais fd on fd.id = m.filial_destino_id
left join usuarios u on u.id = m.usuario_id;

-- -----------------------------------------------------------------------------
-- Kanban: tarefas enriquecidas com atraso calculado
-- -----------------------------------------------------------------------------

create view vw_tarefas with (security_invoker = true) as
select
  t.*,
  f.nome  as filial_nome,
  ur.nome as responsavel_nome,
  uc.nome as criado_por_nome,
  (t.prazo is not null
     and t.prazo < current_date
     and t.status not in ('concluido', 'cancelado')) as atrasada,
  case when t.prazo is null then null else (t.prazo - current_date) end as dias_para_prazo,
  (select count(*) from tarefa_comentarios tc where tc.tarefa_id = t.id) as total_comentarios,
  (select count(*) from tarefa_anexos ta where ta.tarefa_id = t.id)      as total_anexos
from tarefas t
left join filiais  f  on f.id  = t.filial_id
left join usuarios ur on ur.id = t.responsavel_id
left join usuarios uc on uc.id = t.criado_por;

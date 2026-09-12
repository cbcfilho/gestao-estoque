-- =============================================================================
-- 0023_relatorio_movimentacoes.sql — Colunas que faltavam para o relatório
--
-- O relatório de movimentações (Relatórios → Movimentações) precisa de quatro
-- coisas que a view ainda não devolvia:
--
--   sku                   — o catálogo tem, a view não expunha
--   valor_venda_unitario  — preço de venda do produto
--   valor_venda_total     — quantidade × preço de venda
--   importacao_arquivo    — de qual planilha a linha veio, quando veio de uma
--
-- Atenção ao valor de venda: é o preço de HOJE, não o da data do lançamento.
-- O sistema não guarda histórico de preço, e a tela rotula a coluna como
-- "preço atual" justamente para não induzir a erro em conferência de margem.
--
-- Sobre importacao_arquivo: fn_importar_movimentos (0013/0021) grava a
-- observação como 'Importacao <arquivo> · <documento> · <observacao>'. Não há
-- vínculo formal entre movimentacoes e importacoes_movimento, e criar um agora
-- não alcançaria as importações já feitas — preencher o passado exigiria UPDATE
-- numa tabela imutável. Ler a observação cobre todo o histórico.
--
-- split_part devolve string vazia quando o prefixo não existe, e o nullif
-- transforma isso em nulo. É o que impede a observação de um estorno
-- ('Estorno do lançamento …') ou de uma correção ('Correção do lançamento …')
-- de ser confundida com importação — há teste para exatamente isso.
--
-- create or replace view só aceita coluna acrescentada no fim: as quatro novas
-- entram depois das três que a 0022 pôs lá.
-- =============================================================================

create or replace view vw_movimentacoes with (security_invoker = true) as
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
  m.observacao,
  (c.id is not null)                        as estornada,
  (c.movimentacao_nova_id is not null)      as corrigida,
  coalesce(ce.movimentacao_id, cn.movimentacao_id) as correcao_de,
  p.sku,
  p.valor_venda                             as valor_venda_unitario,
  round(m.quantidade * p.valor_venda, 2)    as valor_venda_total,
  nullif(split_part(split_part(m.observacao, ' · ', 1), 'Importacao ', 2), '')
                                            as importacao_arquivo
from movimentacoes m
join produtos p on p.id = m.produto_id
left join filiais fo on fo.id = m.filial_origem_id
left join filiais fd on fd.id = m.filial_destino_id
left join usuarios u on u.id = m.usuario_id
left join movimentacoes_correcoes c  on c.movimentacao_id = m.id
left join movimentacoes_correcoes ce on ce.movimentacao_estorno_id = m.id
left join movimentacoes_correcoes cn on cn.movimentacao_nova_id = m.id;

-- -----------------------------------------------------------------------------
-- O relatório em si
--
-- Página, contagem e totais saem de uma chamada só, do mesmo filtro. Se os
-- filtros vivessem na tela, existiriam em dois lugares (a listagem e a
-- exportação) e um dia divergiriam — o clássico "o Excel não bate com o que
-- está na tela". Aqui há um caminho só, e ele tem teste.
--
-- Os totais são do CONJUNTO FILTRADO INTEIRO, não da página: um total que muda
-- ao virar a página não serve para conferência.
--
-- Repare que NÃO é security definer. A função lê vw_movimentacoes, que é
-- security_invoker, então a RLS por filial continua valendo para quem chama —
-- é o que faz o operador de uma filial não enxergar a outra pelo relatório.
--
-- A busca entra como parâmetro num ilike, e não concatenada em string de
-- filtro: não há como o texto digitado virar sintaxe de consulta.
-- -----------------------------------------------------------------------------

create or replace function fn_relatorio_movimentacoes(
  p_de           date,
  p_ate          date,
  p_tipo         text    default null,
  p_filial_id    uuid    default null,
  p_local        text    default null,
  p_busca        text    default null,
  p_origem       text    default 'todas',   -- todas | importadas | manuais
  p_sem_estornos boolean default false,
  p_limite       integer default 50,
  p_offset       integer default 0
)
returns jsonb
language sql
stable
set search_path = public
as $$
  with base as (
    select v.*
      from vw_movimentacoes v
     where v.data_hora >= p_de::timestamptz
       and v.data_hora <  (p_ate + 1)::timestamptz
       and (nullif(p_tipo, '') is null or v.tipo::text = p_tipo)
       and (p_filial_id is null
            or v.filial_origem_id = p_filial_id
            or v.filial_destino_id = p_filial_id)
       and (nullif(p_local, '') is null
            or v.local_origem::text = p_local
            or v.local_destino::text = p_local)
       and (nullif(p_busca, '') is null
            or v.produto_nome ilike '%' || p_busca || '%'
            or coalesce(v.ean, '') ilike '%' || p_busca || '%'
            or coalesce(v.sku, '') ilike '%' || p_busca || '%')
       and (coalesce(p_origem, 'todas') = 'todas'
            or (p_origem = 'importadas' and v.importacao_arquivo is not null)
            or (p_origem = 'manuais'    and v.importacao_arquivo is null))
       -- "Sem estornos" tira os dois lados do par: a linha errada e o estorno
       -- dela. O relançamento correto fica, que é o líquido que se quer ver.
       and (not coalesce(p_sem_estornos, false)
            or (not v.estornada and v.motivo::text <> 'estorno'))
  )
  select jsonb_build_object(
    'total', (select count(*) from base),
    'totais', (
      select jsonb_build_object(
        'quantidade', coalesce(sum(quantidade), 0),
        'custo',      coalesce(sum(valor_total), 0),
        'venda',      coalesce(sum(valor_venda_total), 0)
      ) from base
    ),
    'linhas', coalesce((
      select jsonb_agg(to_jsonb(pagina))
        from (
          select * from base
           order by data_hora desc, id
           limit greatest(coalesce(p_limite, 50), 0)
          offset greatest(coalesce(p_offset, 0), 0)
        ) pagina
    ), '[]'::jsonb)
  );
$$;

comment on function fn_relatorio_movimentacoes(date, date, text, uuid, text, text, text, boolean, integer, integer) is
  'Relatório de movimentações: página, contagem e totais do conjunto filtrado. Security invoker — a RLS por filial continua valendo.';

-- Toda função nova nasce com EXECUTE para PUBLIC (mesmo cuidado da 0017, 0019,
-- 0020 e 0022).
revoke all on function fn_relatorio_movimentacoes(date, date, text, uuid, text, text, text, boolean, integer, integer)
  from public, anon;
grant execute on function fn_relatorio_movimentacoes(date, date, text, uuid, text, text, text, boolean, integer, integer)
  to authenticated;

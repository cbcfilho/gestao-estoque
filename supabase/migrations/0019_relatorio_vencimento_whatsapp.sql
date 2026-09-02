-- =============================================================================
-- 0019_relatorio_vencimento_whatsapp.sql — Resumo semanal de vencimento
--
-- Uma função só, consultada pelo cron semanal (rota
-- /api/cron/relatorio-vencimento-whatsapp) para montar a mensagem de WhatsApp
-- com a posição de vencidos e vencendo, consolidada em todas as filiais.
--
-- Faixas EXCLUSIVAS de propósito (cada lote conta uma vez só, na mais
-- urgente) — diferente dos filtros de Estoque/Saldos, que são cumulativos
-- (0..N dias). Numa mensagem curta de WhatsApp, faixas que se sobrepõem
-- confundem mais do que ajudam.
--
-- Mesmo padrão de fn_gerar_tarefas_automaticas (0008): SECURITY DEFINER,
-- liberada só para service_role — não existe sessão de usuário rodando o
-- cron, e a única chamadora é a rota que usa a service role key.
-- =============================================================================

create or replace function fn_relatorio_vencimento_semanal()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'gerado_em', now(),
    'vencidos', jsonb_build_object(
      'lotes', count(*) filter (where dias_para_vencer < 0),
      'valor', coalesce(sum(valor_custo_total) filter (where dias_para_vencer < 0), 0)
    ),
    'dias_7', jsonb_build_object(
      'lotes', count(*) filter (where dias_para_vencer between 0 and 7),
      'valor', coalesce(sum(valor_custo_total) filter (where dias_para_vencer between 0 and 7), 0)
    ),
    'dias_30', jsonb_build_object(
      'lotes', count(*) filter (where dias_para_vencer between 8 and 30),
      'valor', coalesce(sum(valor_custo_total) filter (where dias_para_vencer between 8 and 30), 0)
    ),
    'dias_60', jsonb_build_object(
      'lotes', count(*) filter (where dias_para_vencer between 31 and 60),
      'valor', coalesce(sum(valor_custo_total) filter (where dias_para_vencer between 31 and 60), 0)
    )
  )
  from vw_saldo_lote
  where data_validade is not null
    and quantidade > 0;
$$;

comment on function fn_relatorio_vencimento_semanal() is
  'Resumo de vencimento (faixas exclusivas) consolidado em todas as filiais, para o relatório semanal de WhatsApp. Só service_role.';

-- Toda função nova nasce com EXECUTE para PUBLIC — revoga nominalmente antes
-- de conceder só ao service_role, senão o buraco que a 0015 fechou volta
-- sozinho (mesmo cuidado já documentado na 0017 e na 0018).
revoke all on function fn_relatorio_vencimento_semanal() from public, anon, authenticated;
grant execute on function fn_relatorio_vencimento_semanal() to service_role;

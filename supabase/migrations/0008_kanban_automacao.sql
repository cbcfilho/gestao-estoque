-- =============================================================================
-- 0008_kanban_automacao.sql — Tarefas automáticas e notificações
--
-- fn_gerar_tarefas_automaticas() é idempotente: pode rodar várias vezes por dia
-- sem duplicar nada, porque cada tarefa automática carrega (origem_tipo, origem_id).
-- Chamada pelo cron em /api/cron/tarefas-automaticas.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Responsável padrão de uma filial: o gerente; na falta dele, um administrador.
-- -----------------------------------------------------------------------------

create or replace function fn_responsavel_padrao_filial(p_filial_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select u.id
    from usuarios u
    join perfis p on p.id = u.perfil_id
    left join usuario_filiais uf on uf.usuario_id = u.id and uf.filial_id = p_filial_id
   where u.ativo
     and (uf.filial_id is not null or p.escopo = 'global')
   order by
     case p.chave when 'gerente' then 0 when 'admin' then 1 else 2 end,
     u.criado_em
   limit 1;
$$;

-- -----------------------------------------------------------------------------
-- Criação idempotente de tarefa automática
-- -----------------------------------------------------------------------------

create or replace function fn_criar_tarefa_sistema(
  p_titulo      text,
  p_descricao   text,
  p_categoria   categoria_tarefa,
  p_filial_id   uuid,
  p_prazo       date,
  p_prioridade  prioridade_tarefa,
  p_origem_tipo text,
  p_origem_id   text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  select id into v_id
    from tarefas
   where origem_tipo = p_origem_tipo and origem_id = p_origem_id;

  if v_id is not null then
    -- Já existe: reabre se tinha sido concluída e o problema voltou.
    update tarefas
       set status = case when status = 'concluido' then 'a_fazer' else status end,
           concluido_em = case when status = 'concluido' then null else concluido_em end,
           prazo = coalesce(p_prazo, prazo),
           descricao = p_descricao
     where id = v_id;
    return v_id;
  end if;

  insert into tarefas (
    titulo, descricao, tipo, categoria, filial_id, responsavel_id,
    status, prioridade, prazo, origem_tipo, origem_id
  )
  values (
    p_titulo, p_descricao, 'sistema', p_categoria, p_filial_id,
    fn_responsavel_padrao_filial(p_filial_id),
    'a_fazer', p_prioridade, p_prazo, p_origem_tipo, p_origem_id
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Notificação automática ao criar/atribuir uma tarefa
-- -----------------------------------------------------------------------------

create or replace function fn_notificar_tarefa()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.responsavel_id is null then
    return new;
  end if;

  -- Só notifica quando é tarefa nova ou quando o responsável mudou.
  if tg_op = 'UPDATE' and old.responsavel_id is not distinct from new.responsavel_id then
    return new;
  end if;

  -- Não notifica o usuário sobre uma tarefa que ele mesmo criou para si.
  if tg_op = 'INSERT' and new.criado_por = new.responsavel_id then
    return new;
  end if;

  insert into notificacoes (usuario_id, titulo, mensagem, link, tarefa_id)
  values (
    new.responsavel_id,
    case when tg_op = 'INSERT' then 'Nova tarefa atribuída' else 'Tarefa reatribuída a você' end,
    new.titulo || coalesce(' — prazo ' || to_char(new.prazo, 'DD/MM/YYYY'), ''),
    '/atividades?tarefa=' || new.id::text,
    new.id
  );

  return new;
end;
$$;

create trigger trg_tarefas_notificar
  after insert or update of responsavel_id on tarefas
  for each row execute function fn_notificar_tarefa();

-- Avisa quando a tarefa entra em atraso.
create or replace function fn_notificar_atraso()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'atrasado' and old.status <> 'atrasado' and new.responsavel_id is not null then
    insert into notificacoes (usuario_id, titulo, mensagem, link, tarefa_id)
    values (
      new.responsavel_id,
      'Tarefa atrasada',
      new.titulo || coalesce(' — venceu em ' || to_char(new.prazo, 'DD/MM/YYYY'), ''),
      '/atividades?tarefa=' || new.id::text,
      new.id
    );
  end if;
  return new;
end;
$$;

create trigger trg_tarefas_notificar_atraso
  after update of status on tarefas
  for each row execute function fn_notificar_atraso();

-- Marca a conclusão automaticamente ao mover o card para "concluído".
create or replace function fn_tarefa_concluida()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'concluido' and old.status <> 'concluido' then
    new.concluido_em := now();
  elsif new.status <> 'concluido' then
    new.concluido_em := null;
  end if;
  return new;
end;
$$;

create trigger trg_tarefas_concluida
  before update of status on tarefas
  for each row execute function fn_tarefa_concluida();

-- -----------------------------------------------------------------------------
-- Geração das tarefas automáticas
-- -----------------------------------------------------------------------------

create or replace function fn_gerar_tarefas_automaticas()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  cfg_inv    jsonb;
  cfg_venc   jsonb;
  cfg_ponto  jsonb;
  v_compet   date := date_trunc('month', current_date)::date;
  v_prazo    date;
  r          record;
  n_inv      integer := 0;
  n_min      integer := 0;
  n_venc     integer := 0;
  n_ponto    integer := 0;
  n_atraso   integer := 0;
  n_fechadas integer := 0;
begin
  select valor into cfg_inv   from configuracoes where chave = 'inventario_agendamento';
  select valor into cfg_venc  from configuracoes where chave = 'alertas_vencimento';
  select valor into cfg_ponto from configuracoes where chave = 'ponto_modo';

  -- 1) Cobrança do inventário geral mensal ------------------------------------
  if coalesce((cfg_inv->>'ativo')::boolean, true)
     and extract(day from current_date) >= coalesce((cfg_inv->>'dia_abertura')::int, 1)
  then
    v_prazo := v_compet + (coalesce((cfg_inv->>'dias_para_concluir')::int, 5) || ' days')::interval;

    for r in select id, nome from filiais where ativo
    loop
      -- Já aprovado neste mês? Então não cobra.
      if not exists (
        select 1 from inventarios
         where filial_id = r.id and competencia = v_compet
           and status = 'aprovado'
      ) then
        perform fn_criar_tarefa_sistema(
          'Inventário mensal — ' || r.nome,
          'Abrir, contar e aprovar o inventário geral da competência '
            || to_char(v_compet, 'MM/YYYY') || '.',
          'inventario', r.id, v_prazo::date, 'alta',
          'inventario_mensal', r.id::text || ':' || to_char(v_compet, 'YYYY-MM')
        );
        n_inv := n_inv + 1;
      end if;
    end loop;
  end if;

  -- 2) Reposição de produtos abaixo do mínimo ---------------------------------
  for r in
    select pf.filial_id, pf.produto_id, f.nome as filial_nome, p.nome as produto_nome,
           p.unidade,
           coalesce(pf.estoque_minimo, p.estoque_minimo) as minimo,
           coalesce(s.quantidade, 0) as saldo
      from produto_filiais pf
      join produtos p on p.id = pf.produto_id and p.ativo
      join filiais  f on f.id = pf.filial_id and f.ativo
      left join (
        select produto_id, filial_id, sum(quantidade) as quantidade
          from lotes_estoque group by produto_id, filial_id
      ) s on s.produto_id = pf.produto_id and s.filial_id = pf.filial_id
     where pf.ativo
       and coalesce(pf.estoque_minimo, p.estoque_minimo) > 0
       and coalesce(s.quantidade, 0) < coalesce(pf.estoque_minimo, p.estoque_minimo)
  loop
    perform fn_criar_tarefa_sistema(
      'Repor ' || r.produto_nome || ' — ' || r.filial_nome,
      'Saldo atual: ' || trim(to_char(r.saldo, 'FM999999990.999')) || ' ' || r.unidade ||
      ' / mínimo: ' || trim(to_char(r.minimo, 'FM999999990.999')) || ' ' || r.unidade || '.',
      'estoque_minimo', r.filial_id, (current_date + 3), 'media',
      'estoque_minimo', r.filial_id::text || ':' || r.produto_id::text
    );
    n_min := n_min + 1;
  end loop;

  -- Fecha as tarefas de reposição já resolvidas.
  update tarefas t
     set status = 'concluido', concluido_em = now()
   where t.origem_tipo = 'estoque_minimo'
     and t.status <> 'concluido'
     and not exists (
       select 1
         from produto_filiais pf
         join produtos p on p.id = pf.produto_id
         left join (
           select produto_id, filial_id, sum(quantidade) as quantidade
             from lotes_estoque group by produto_id, filial_id
         ) s on s.produto_id = pf.produto_id and s.filial_id = pf.filial_id
        where pf.filial_id::text || ':' || pf.produto_id::text = t.origem_id
          and coalesce(s.quantidade, 0) < coalesce(pf.estoque_minimo, p.estoque_minimo)
     );
  get diagnostics n_fechadas = row_count;

  -- 3) Produtos próximos do vencimento ----------------------------------------
  for r in
    select le.id as lote_id, le.filial_id, f.nome as filial_nome, p.nome as produto_nome,
           le.lote, le.data_validade, le.quantidade, le.local,
           (le.data_validade - current_date) as dias,
           round(le.quantidade * le.custo_unitario, 2) as valor
      from lotes_estoque le
      join produtos p on p.id = le.produto_id
      join filiais  f on f.id = le.filial_id and f.ativo
     where le.quantidade > 0
       and le.data_validade is not null
       and le.data_validade <= current_date + coalesce((cfg_venc->>'gerar_tarefa_em')::int, 15)
  loop
    perform fn_criar_tarefa_sistema(
      case when r.dias < 0
           then 'VENCIDO: ' || r.produto_nome || ' — ' || r.filial_nome
           else 'Vence em ' || r.dias || ' dia(s): ' || r.produto_nome || ' — ' || r.filial_nome
      end,
      'Lote ' || r.lote || ' (' || r.local || '), validade ' ||
      to_char(r.data_validade, 'DD/MM/YYYY') || ', ' ||
      trim(to_char(r.quantidade, 'FM999999990.999')) || ' un — R$ ' ||
      trim(to_char(r.valor, 'FM999999990.00')) || ' em risco.',
      'vencimento', r.filial_id, r.data_validade,
      case when r.dias <= 7 then 'urgente' else 'alta' end,
      'vencimento', r.lote_id::text
    );
    n_venc := n_venc + 1;
  end loop;

  -- Fecha alertas de vencimento cujo lote já foi zerado ou removido.
  update tarefas t
     set status = 'concluido', concluido_em = now()
   where t.origem_tipo = 'vencimento'
     and t.status <> 'concluido'
     and not exists (
       select 1 from lotes_estoque le
        where le.id::text = t.origem_id and le.quantidade > 0
     );

  -- 4) Fechamento de ponto -----------------------------------------------------
  if cfg_ponto #>> '{}' = 'lembrete' and extract(day from current_date) >= 25 then
    for r in select id, nome from filiais where ativo
    loop
      perform fn_criar_tarefa_sistema(
        'Fechamento de ponto — ' || r.nome,
        'Conferir e fechar o controle de ponto dos colaboradores da competência '
          || to_char(v_compet, 'MM/YYYY') || '.',
        'ponto', r.id, (v_compet + interval '1 month' - interval '1 day')::date, 'media',
        'ponto_mensal', r.id::text || ':' || to_char(v_compet, 'YYYY-MM')
      );
      n_ponto := n_ponto + 1;
    end loop;
  end if;

  -- 5) Move para "atrasado" o que passou do prazo -------------------------------
  update tarefas
     set status = 'atrasado'
   where prazo is not null
     and prazo < current_date
     and status in ('a_fazer', 'em_andamento');
  get diagnostics n_atraso = row_count;

  return jsonb_build_object(
    'executado_em', now(),
    'inventario', n_inv,
    'estoque_minimo', n_min,
    'reposicoes_concluidas', n_fechadas,
    'vencimento', n_venc,
    'ponto', n_ponto,
    'marcadas_atrasadas', n_atraso
  );
end;
$$;

-- A rotina roda pelo cron com a service role; nenhum usuário final a executa.
revoke all on function fn_gerar_tarefas_automaticas() from public, anon, authenticated;
grant execute on function fn_gerar_tarefas_automaticas() to service_role;

grant execute on function fn_criar_tarefa_sistema(text, text, categoria_tarefa, uuid, date, prioridade_tarefa, text, text)
  to service_role;

-- -----------------------------------------------------------------------------
-- Marcar notificações como lidas
-- -----------------------------------------------------------------------------

create or replace function fn_marcar_notificacoes_lidas(p_ids uuid[] default null)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  n integer;
begin
  update notificacoes
     set lida = true, lida_em = now()
   where usuario_id = auth.uid()
     and not lida
     and (p_ids is null or id = any(p_ids));
  get diagnostics n = row_count;
  return n;
end;
$$;

grant execute on function fn_marcar_notificacoes_lidas(uuid[]) to authenticated;

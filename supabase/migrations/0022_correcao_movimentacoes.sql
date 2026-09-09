-- =============================================================================
-- 0022_correcao_movimentacoes.sql — Corrigir e estornar lançamentos
--
-- Quem lança errado (filial trocada, quantidade digitada torto, lote ou
-- validade equivocados) não tinha como consertar pela tela: movimentacoes é
-- imutável por gatilho (0001) e a única saída era lançar ajuste compensatório
-- a mão nas duas pontas.
--
-- Aqui a correção vira operação de primeira classe, mas SEM quebrar a
-- imutabilidade: corrigir = lançar o estorno do registro errado e, quando não
-- for exclusão, lançar o registro certo. A linha original nunca é tocada — o
-- vínculo entre as três mora em movimentacoes_correcoes.
--
-- Fora do alcance de propósito: transferência (tem fn_cancelar_transferencia)
-- e ajuste de inventário (pertence a um ciclo aprovado; desfazer um item solto
-- corromperia o fechamento).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Permissão nova
--
-- Corrigir é mais destrutivo que ajustar: refaz saldo já registrado e move
-- valor entre filiais. Por isso não reaproveita estoque.ajustar. Por padrão só
-- o administrador; o franqueado pode conceder a outros perfis pela tela de
-- Perfis e Permissões.
-- -----------------------------------------------------------------------------

insert into permissoes (chave, modulo, descricao) values
  ('estoque.corrigir', 'Estoque',
   'Corrigir ou estornar lançamentos de entrada, saída e ajuste')
on conflict (chave) do update
  set modulo = excluded.modulo, descricao = excluded.descricao;

insert into perfil_permissoes (perfil_id, permissao_chave)
select p.id, 'estoque.corrigir' from perfis p where p.chave = 'admin'
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- 2. Motivo novo
--
-- Precisa vir antes das funções. O corpo de uma função plpgsql só é analisado
-- na primeira execução, então citar 'estorno' nas funções criadas logo abaixo
-- não esbarra na restrição de usar o valor na mesma transação que o criou.
-- -----------------------------------------------------------------------------

alter type motivo_movimentacao add value if not exists 'estorno';

-- -----------------------------------------------------------------------------
-- 3. Vínculo original → estorno → relançamento
--
-- Marcar a linha original com uma flag seria UPDATE, que o gatilho bloqueia.
-- O estado mora aqui fora.
-- -----------------------------------------------------------------------------

create table movimentacoes_correcoes (
  id                      uuid primary key default gen_random_uuid(),
  movimentacao_id         uuid not null references movimentacoes(id) on delete restrict,
  movimentacao_estorno_id uuid not null references movimentacoes(id) on delete restrict,
  movimentacao_nova_id    uuid references movimentacoes(id) on delete restrict,
  operacao                text not null check (operacao in ('correcao', 'exclusao')),
  justificativa           text not null,
  usuario_id              uuid references usuarios(id) on delete set null,
  criado_em               timestamptz not null default now()
);

-- Trava contra estorno duplo: dois cliques simultâneos não estornam a mesma
-- linha duas vezes.
create unique index movimentacoes_correcoes_original_uk
  on movimentacoes_correcoes(movimentacao_id);

create index movimentacoes_correcoes_estorno_idx
  on movimentacoes_correcoes(movimentacao_estorno_id);
create index movimentacoes_correcoes_nova_idx
  on movimentacoes_correcoes(movimentacao_nova_id);

comment on table movimentacoes_correcoes is
  'Liga o lançamento errado ao seu estorno e ao relançamento correto. movimentacao_nova_id nulo = exclusão (só estorno).';

alter table movimentacoes_correcoes enable row level security;
alter table movimentacoes_correcoes force row level security;

create policy movimentacoes_correcoes_select on movimentacoes_correcoes for select to authenticated
  using (
    exists (
      select 1 from movimentacoes m
       where m.id = movimentacoes_correcoes.movimentacao_id
         and (
           auth_pode_acessar_filial(m.filial_origem_id)
           or auth_pode_acessar_filial(m.filial_destino_id)
         )
    )
  );

-- Escrita só pelas funções SECURITY DEFINER, como no resto do estoque.
revoke insert, update, delete on movimentacoes_correcoes from authenticated;

-- O registro da correção é tão imutável quanto a movimentação que ele explica.
create trigger trg_movimentacoes_correcoes_imutavel
  before update or delete on movimentacoes_correcoes
  for each row execute function fn_bloqueia_alteracao();

-- -----------------------------------------------------------------------------
-- 4. Helper: o estorno em si
--
-- Concentra a única parte de fato delicada — a direção. Devolve o id da
-- movimentação de estorno criada.
-- -----------------------------------------------------------------------------

create or replace function fn_estornar_movimentacao_interno(p_mov movimentacoes)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estorno_id uuid;
  v_lote_id    uuid;
  v_saldo      numeric;
begin
  if p_mov.filial_destino_id is not null then
    -- A movimentação creditou estoque: o estorno debita, travado no lote exato
    -- que foi creditado (nada de varrer FEFO e tirar de outro lote).
    select id, quantidade into v_lote_id, v_saldo
      from lotes_estoque
     where produto_id = p_mov.produto_id
       and filial_id  = p_mov.filial_destino_id
       and local      = p_mov.local_destino
       and lote       = coalesce(p_mov.lote, 'UNICO')
       and coalesce(data_validade, '9999-12-31'::date)
           = coalesce(p_mov.data_validade, '9999-12-31'::date);

    if v_lote_id is null then
      raise exception
        'Não dá para estornar: o lote % deste lançamento não existe mais no estoque.',
        coalesce(p_mov.lote, 'UNICO')
        using errcode = 'check_violation';
    end if;

    if v_saldo < p_mov.quantidade then
      raise exception
        'Não dá para estornar: o lote % tem só % em saldo e o lançamento foi de %. Parte já saiu do estoque.',
        coalesce(p_mov.lote, 'UNICO'), v_saldo, p_mov.quantidade
        using errcode = 'check_violation';
    end if;

    perform fn_debitar_fefo(
      p_mov.produto_id, p_mov.filial_destino_id, p_mov.local_destino,
      p_mov.quantidade, v_lote_id
    );

    insert into movimentacoes (
      tipo, motivo, produto_id, quantidade, custo_unitario, lote, data_validade,
      filial_origem_id, local_origem, usuario_id, observacao
    )
    values (
      'saida', 'estorno', p_mov.produto_id, p_mov.quantidade, p_mov.custo_unitario,
      p_mov.lote, p_mov.data_validade,
      p_mov.filial_destino_id, p_mov.local_destino, auth.uid(),
      'Estorno do lançamento ' || p_mov.id || ' de ' || to_char(p_mov.data_hora, 'DD/MM/YYYY HH24:MI')
    )
    returning id into v_estorno_id;

  else
    -- A movimentação debitou estoque: o estorno devolve ao lote de origem, com
    -- o custo que saiu (não o custo atual do produto).
    perform fn_creditar_lote(
      p_mov.produto_id, p_mov.filial_origem_id, p_mov.local_origem,
      coalesce(p_mov.lote, 'UNICO'), p_mov.data_validade,
      p_mov.quantidade, p_mov.custo_unitario
    );

    insert into movimentacoes (
      tipo, motivo, produto_id, quantidade, custo_unitario, lote, data_validade,
      filial_destino_id, local_destino, usuario_id, observacao
    )
    values (
      'entrada', 'estorno', p_mov.produto_id, p_mov.quantidade, p_mov.custo_unitario,
      p_mov.lote, p_mov.data_validade,
      p_mov.filial_origem_id, p_mov.local_origem, auth.uid(),
      'Estorno do lançamento ' || p_mov.id || ' de ' || to_char(p_mov.data_hora, 'DD/MM/YYYY HH24:MI')
    )
    returning id into v_estorno_id;
  end if;

  return v_estorno_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- 5. Helper: validação comum das duas operações
--
-- Devolve a movimentação travada para update, já conferida.
-- -----------------------------------------------------------------------------

create or replace function fn_valida_movimentacao_corrigivel(p_movimentacao_id uuid)
returns movimentacoes
language plpgsql
security definer
set search_path = public
as $$
declare
  m movimentacoes%rowtype;
begin
  perform auth_exige_permissao('estoque.corrigir');

  select * into m from movimentacoes where id = p_movimentacao_id;
  if not found then
    raise exception 'Lançamento não encontrado.' using errcode = 'no_data_found';
  end if;

  if m.transferencia_id is not null then
    raise exception
      'Lançamento de transferência não se corrige por aqui: cancele a transferência.'
      using errcode = 'check_violation';
  end if;

  if m.inventario_id is not null then
    raise exception
      'Lançamento de ajuste de inventário não se corrige por aqui: ele pertence a um inventário já aprovado.'
      using errcode = 'check_violation';
  end if;

  -- Rede de segurança: só lançamento de uma ponta só. Movimentação com origem
  -- E destino é transferência, e o estorno não saberia qual lado desfazer.
  if m.tipo not in ('entrada', 'saida', 'ajuste')
     or (m.filial_origem_id is not null and m.filial_destino_id is not null) then
    raise exception 'Este tipo de lançamento não pode ser corrigido por aqui.'
      using errcode = 'check_violation';
  end if;

  if m.motivo = 'estorno' then
    raise exception 'Este lançamento já é um estorno.' using errcode = 'check_violation';
  end if;

  if exists (select 1 from movimentacoes_correcoes where movimentacao_id = m.id) then
    raise exception 'Este lançamento já foi corrigido ou estornado.'
      using errcode = 'unique_violation';
  end if;

  perform auth_exige_filial(coalesce(m.filial_destino_id, m.filial_origem_id));

  return m;
end;
$$;

-- -----------------------------------------------------------------------------
-- 6. Estornar (o "excluir" da tela)
-- -----------------------------------------------------------------------------

create or replace function fn_estornar_movimentacao(
  p_movimentacao_id uuid,
  p_justificativa   text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  m            movimentacoes%rowtype;
  v_estorno_id uuid;
begin
  if coalesce(trim(p_justificativa), '') = '' then
    raise exception 'Informe o motivo do estorno.' using errcode = 'check_violation';
  end if;

  m := fn_valida_movimentacao_corrigivel(p_movimentacao_id);

  v_estorno_id := fn_estornar_movimentacao_interno(m);

  insert into movimentacoes_correcoes (
    movimentacao_id, movimentacao_estorno_id, operacao, justificativa, usuario_id
  )
  values (m.id, v_estorno_id, 'exclusao', trim(p_justificativa), auth.uid());

  insert into log_auditoria (usuario_id, acao, tabela, registro_id, dados_antes)
  values (auth.uid(), 'estorno_movimentacao', 'movimentacoes', m.id::text, to_jsonb(m));

  return jsonb_build_object(
    'movimentacao_id', m.id,
    'estorno_id', v_estorno_id
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- 7. Corrigir (estorno + relançamento com os dados certos)
--
-- Relança com os primitivos (fn_creditar_lote / fn_debitar_fefo) em vez de
-- fn_registrar_entrada / fn_registrar_saida: preserva o motivo original — é o
-- mesmo fato de negócio, só com os dados certos — e debita o lote escolhido em
-- vez de varrer FEFO. Mesma escolha que fn_ajustar_estoque já faz (0005).
-- -----------------------------------------------------------------------------

create or replace function fn_corrigir_movimentacao(
  p_movimentacao_id uuid,
  p_filial_id       uuid,
  p_local           tipo_local,
  p_quantidade      numeric,
  p_lote            text,
  p_data_validade   date,
  p_justificativa   text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  m            movimentacoes%rowtype;
  v_produto    produtos%rowtype;
  v_estorno_id uuid;
  v_nova_id    uuid;
  v_lote       text := coalesce(nullif(trim(p_lote), ''), 'UNICO');
  v_lote_id    uuid;
  v_saldo      numeric;
begin
  if coalesce(trim(p_justificativa), '') = '' then
    raise exception 'Informe o motivo da correção.' using errcode = 'check_violation';
  end if;

  if p_quantidade is null or p_quantidade <= 0 then
    raise exception 'A quantidade corrigida deve ser maior que zero.'
      using errcode = 'check_violation';
  end if;

  m := fn_valida_movimentacao_corrigivel(p_movimentacao_id);

  -- Filial de destino da correção também precisa estar no alcance de quem
  -- corrige, senão dava para empurrar saldo para uma filial que não é sua.
  perform auth_exige_filial(p_filial_id);

  select * into v_produto from produtos where id = m.produto_id;

  v_estorno_id := fn_estornar_movimentacao_interno(m);

  if m.filial_destino_id is not null then
    -- Original creditou: o relançamento credita com os valores novos.
    if v_produto.controla_validade and p_data_validade is null then
      raise exception 'Este produto exige data de validade.'
        using errcode = 'check_violation';
    end if;

    perform fn_creditar_lote(
      m.produto_id, p_filial_id, p_local, v_lote, p_data_validade,
      p_quantidade, m.custo_unitario
    );

    insert into movimentacoes (
      tipo, motivo, produto_id, quantidade, custo_unitario, lote, data_validade,
      filial_destino_id, local_destino, usuario_id, observacao
    )
    values (
      m.tipo, m.motivo, m.produto_id, p_quantidade, m.custo_unitario,
      v_lote, p_data_validade, p_filial_id, p_local, auth.uid(),
      'Correção do lançamento ' || m.id || ' · ' || trim(p_justificativa)
    )
    returning id into v_nova_id;

  else
    -- Original debitou: o relançamento debita do lote escolhido.
    select id, quantidade into v_lote_id, v_saldo
      from lotes_estoque
     where produto_id = m.produto_id
       and filial_id  = p_filial_id
       and local      = p_local
       and lote       = v_lote
       and coalesce(data_validade, '9999-12-31'::date)
           = coalesce(p_data_validade, '9999-12-31'::date);

    if v_lote_id is null then
      raise exception
        'Não existe o lote % em % para lançar a saída corrigida.', v_lote, p_local
        using errcode = 'check_violation';
    end if;

    if v_saldo < p_quantidade then
      raise exception
        'Saldo insuficiente no lote %: disponível % e a correção pede %.',
        v_lote, v_saldo, p_quantidade
        using errcode = 'check_violation';
    end if;

    perform fn_debitar_fefo(m.produto_id, p_filial_id, p_local, p_quantidade, v_lote_id);

    insert into movimentacoes (
      tipo, motivo, produto_id, quantidade, custo_unitario, lote, data_validade,
      filial_origem_id, local_origem, usuario_id, observacao
    )
    values (
      m.tipo, m.motivo, m.produto_id, p_quantidade, m.custo_unitario,
      v_lote, p_data_validade, p_filial_id, p_local, auth.uid(),
      'Correção do lançamento ' || m.id || ' · ' || trim(p_justificativa)
    )
    returning id into v_nova_id;
  end if;

  insert into movimentacoes_correcoes (
    movimentacao_id, movimentacao_estorno_id, movimentacao_nova_id,
    operacao, justificativa, usuario_id
  )
  values (m.id, v_estorno_id, v_nova_id, 'correcao', trim(p_justificativa), auth.uid());

  insert into log_auditoria (usuario_id, acao, tabela, registro_id, dados_antes, dados_depois)
  values (
    auth.uid(), 'correcao_movimentacao', 'movimentacoes', m.id::text, to_jsonb(m),
    jsonb_build_object(
      'filial_id', p_filial_id, 'local', p_local, 'quantidade', p_quantidade,
      'lote', v_lote, 'data_validade', p_data_validade,
      'estorno_id', v_estorno_id, 'nova_id', v_nova_id
    )
  );

  return jsonb_build_object(
    'movimentacao_id', m.id,
    'estorno_id', v_estorno_id,
    'nova_id', v_nova_id
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- 8. Grants
--
-- Toda função nova nasce com EXECUTE para PUBLIC — revoga nominalmente antes de
-- conceder (mesmo cuidado já documentado na 0017, 0019 e 0020). Os dois helpers
-- não são chamados de fora: ficam sem grant para authenticated.
-- -----------------------------------------------------------------------------

revoke all on function fn_estornar_movimentacao_interno(movimentacoes) from public, anon, authenticated;
revoke all on function fn_valida_movimentacao_corrigivel(uuid) from public, anon, authenticated;

revoke all on function fn_estornar_movimentacao(uuid, text) from public, anon;
revoke all on function fn_corrigir_movimentacao(uuid, uuid, tipo_local, numeric, text, date, text) from public, anon;

grant execute on function fn_estornar_movimentacao(uuid, text) to authenticated;
grant execute on function fn_corrigir_movimentacao(uuid, uuid, tipo_local, numeric, text, date, text) to authenticated;

-- -----------------------------------------------------------------------------
-- 9. A listagem precisa saber o que foi estornado
--
-- create or replace view só permite acrescentar coluna no fim — as três novas
-- entram depois de observacao, sem mexer na ordem do que já existia.
-- -----------------------------------------------------------------------------

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
  coalesce(ce.movimentacao_id, cn.movimentacao_id) as correcao_de
from movimentacoes m
join produtos p on p.id = m.produto_id
left join filiais fo on fo.id = m.filial_origem_id
left join filiais fd on fd.id = m.filial_destino_id
left join usuarios u on u.id = m.usuario_id
left join movimentacoes_correcoes c  on c.movimentacao_id = m.id
left join movimentacoes_correcoes ce on ce.movimentacao_estorno_id = m.id
left join movimentacoes_correcoes cn on cn.movimentacao_nova_id = m.id;

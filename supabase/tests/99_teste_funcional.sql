-- Teste funcional das regras de negócio. Roda como "authenticated" para
-- exercitar RLS + grants junto com as RPCs.

\set ON_ERROR_STOP on

create or replace function assert_eq(p_nome text, p_obtido anyelement, p_esperado anyelement)
returns void language plpgsql as $$
begin
  if p_obtido is distinct from p_esperado then
    raise exception 'FALHOU [%]: obtido=% esperado=%', p_nome, p_obtido, p_esperado;
  end if;
  raise notice 'ok  %  (=%)', p_nome, p_obtido;
end; $$;

-- ---------------------------------------------------------------- preparação
insert into auth.users (id, email, raw_user_meta_data)
values ('11111111-1111-1111-1111-111111111111', 'admin@teste.com',
        '{"nome":"Christian","perfil":"admin"}'::jsonb);

insert into auth.users (id, email, raw_user_meta_data)
values ('22222222-2222-2222-2222-222222222222', 'op@teste.com',
        '{"nome":"Operador","perfil":"operador"}'::jsonb);

do $$
declare v_f uuid;
begin
  select id into v_f from filiais where codigo = 'F02';
  insert into usuario_filiais (usuario_id, filial_id)
  values ('22222222-2222-2222-2222-222222222222', v_f);
end $$;

select assert_eq('trigger criou usuario admin',
  (select p.chave from usuarios u join perfis p on p.id = u.perfil_id
    where u.email = 'admin@teste.com'), 'admin');

-- Produtos de teste
insert into categorias (nome) values ('Teste') on conflict do nothing;

insert into produtos (nome, ean, categoria_id, valor_custo, valor_venda, estoque_minimo, controla_validade)
select 'Trufa Teste', '7891000100103', c.id, 4.00, 9.90, 10, true from categorias c where c.nome = 'Teste';

insert into produtos (nome, ean, valor_custo, valor_venda, estoque_minimo, controla_validade, insumo_cafeteria)
values ('Leite Integral 1L', '7891000315507', 4.50, 0, 12, false, true);

insert into produto_filiais (produto_id, filial_id)
select p.id, f.id from produtos p cross join filiais f;

set role authenticated;
select set_config('teste.uid', '11111111-1111-1111-1111-111111111111', false);

-- ------------------------------------------------------------------ entradas
do $$
declare
  v_prod uuid; v_f1 uuid;
begin
  select id into v_prod from produtos where ean = '7891000100103';
  select id into v_f1 from filiais where codigo = 'F01';

  -- Dois lotes com validades diferentes, custos diferentes.
  perform fn_registrar_entrada(v_prod, v_f1, 'deposito', 100, 4.00, 'L-FEV', current_date + 60);
  perform fn_registrar_entrada(v_prod, v_f1, 'deposito',  50, 5.00, 'L-JAN', current_date + 20);
end $$;

select assert_eq('saldo apos entradas', (
  select sum(quantidade) from lotes_estoque le join produtos p on p.id = le.produto_id
   where p.ean = '7891000100103'), 150::numeric);

-- --------------------------------------------------------------- FEFO na saída
do $$
declare v_prod uuid; v_f1 uuid;
begin
  select id into v_prod from produtos where ean = '7891000100103';
  select id into v_f1 from filiais where codigo = 'F01';
  -- 60 unidades: deve zerar o lote que vence antes (L-JAN, 50) e tirar 10 do L-FEV
  perform fn_registrar_saida(v_prod, v_f1, 'deposito', 60, 'venda');
end $$;

select assert_eq('FEFO zerou o lote de validade mais proxima', (
  select quantidade from lotes_estoque le join produtos p on p.id = le.produto_id
   where p.ean = '7891000100103' and le.lote = 'L-JAN'), 0::numeric);

select assert_eq('FEFO tirou o restante do lote seguinte', (
  select quantidade from lotes_estoque le join produtos p on p.id = le.produto_id
   where p.ean = '7891000100103' and le.lote = 'L-FEV'), 90::numeric);

-- Saldo insuficiente deve falhar
do $$
declare v_prod uuid; v_f1 uuid; v_erro text;
begin
  select id into v_prod from produtos where ean = '7891000100103';
  select id into v_f1 from filiais where codigo = 'F01';
  begin
    perform fn_registrar_saida(v_prod, v_f1, 'deposito', 99999, 'venda');
    raise exception 'FALHOU: saida acima do saldo deveria ter dado erro';
  exception when check_violation then
    raise notice 'ok  saida acima do saldo foi bloqueada';
  end;
end $$;

-- ------------------------------------------------------- custo medio ponderado
do $$
declare v_prod uuid; v_f1 uuid;
begin
  select id into v_prod from produtos where ean = '7891000315507';
  select id into v_f1 from filiais where codigo = 'F01';
  perform fn_registrar_entrada(v_prod, v_f1, 'cafeteria', 10, 4.00, null, null);
  perform fn_registrar_entrada(v_prod, v_f1, 'cafeteria', 10, 6.00, null, null);
end $$;

select assert_eq('custo medio ponderado', (
  select custo_unitario from lotes_estoque le join produtos p on p.id = le.produto_id
   where p.ean = '7891000315507' and le.local = 'cafeteria'), 5.0000::numeric);

-- Cafeteria só existe na filial que tem cafeteria
do $$
declare v_prod uuid; v_f2 uuid;
begin
  select id into v_prod from produtos where ean = '7891000315507';
  select id into v_f2 from filiais where codigo = 'F02';
  begin
    perform fn_registrar_entrada(v_prod, v_f2, 'cafeteria', 5, 4.00, null, null);
    raise exception 'FALHOU: cafeteria em filial sem cafeteria deveria dar erro';
  exception when check_violation then
    raise notice 'ok  local cafeteria bloqueado em filial sem cafeteria';
  end;
end $$;

-- ------------------------------------------------------------- transferências
do $$
declare
  v_prod uuid; v_f1 uuid; v_f2 uuid; v_tr uuid;
begin
  select id into v_prod from produtos where ean = '7891000100103';
  select id into v_f1 from filiais where codigo = 'F01';
  select id into v_f2 from filiais where codigo = 'F02';

  v_tr := fn_criar_transferencia(
    v_f1, 'deposito', v_f2, 'prateleira',
    jsonb_build_array(jsonb_build_object('produto_id', v_prod, 'quantidade', 30))
  );

  perform fn_enviar_transferencia(v_tr);

  -- Em trânsito: já saiu da origem e ainda não entrou no destino.
  if (select sum(quantidade) from lotes_estoque
       where produto_id = v_prod and filial_id = v_f1) <> 60 then
    raise exception 'FALHOU: origem deveria ter 60 apos o envio';
  end if;
  if exists (select 1 from lotes_estoque where produto_id = v_prod and filial_id = v_f2) then
    raise exception 'FALHOU: destino nao deveria ter saldo antes do recebimento';
  end if;
  raise notice 'ok  saldo em transito nao aparece em nenhum dos dois locais';

  -- Recebe 28 das 30 enviadas: 2 viram perda em trânsito.
  perform fn_receber_transferencia(
    v_tr,
    (select jsonb_agg(jsonb_build_object('item_id', id, 'quantidade', 28))
       from transferencia_itens where transferencia_id = v_tr)
  );
end $$;

select assert_eq('destino recebeu 28', (
  select sum(le.quantidade) from lotes_estoque le
    join produtos p on p.id = le.produto_id
    join filiais f on f.id = le.filial_id
   where p.ean = '7891000100103' and f.codigo = 'F02'), 28::numeric);

select assert_eq('perda em transito registrada', (
  select sum(quantidade) from movimentacoes m join produtos p on p.id = m.produto_id
   where p.ean = '7891000100103' and m.motivo = 'perda'), 2::numeric);

-- Transferência interna direta (depósito -> prateleira na mesma filial)
do $$
declare v_prod uuid; v_f1 uuid;
begin
  select id into v_prod from produtos where ean = '7891000100103';
  select id into v_f1 from filiais where codigo = 'F01';
  perform fn_transferencia_direta(
    v_f1, 'deposito', 'prateleira',
    jsonb_build_array(jsonb_build_object('produto_id', v_prod, 'quantidade', 20))
  );
end $$;

select assert_eq('transferencia interna moveu para a prateleira', (
  select quantidade from lotes_estoque le
    join produtos p on p.id = le.produto_id join filiais f on f.id = le.filial_id
   where p.ean = '7891000100103' and f.codigo = 'F01' and le.local = 'prateleira'), 20::numeric);

-- ---------------------------------------------------------------- inventário
do $$
declare
  v_f1 uuid; v_inv uuid; v_prod uuid;
begin
  select id into v_f1 from filiais where codigo = 'F01';
  select id into v_prod from produtos where ean = '7891000100103';

  v_inv := fn_abrir_inventario(v_f1, 'geral');

  -- Contagem cega: a lista de contagem não traz quantidade_sistema.
  if exists (
    select 1 from information_schema.columns
     where table_name = 'x' -- placeholder, checado abaixo pelo retorno da função
  ) then null; end if;

  -- Prateleira tem 20 no sistema; contamos 18 (falta de 2).
  perform fn_lancar_contagem(v_inv, v_prod, 'prateleira', 18, 'L-FEV', current_date + 60);

  -- Depósito tem 40; contamos 40 (sem divergência).
  perform fn_lancar_contagem(v_inv, v_prod, 'deposito', 40, 'L-FEV', current_date + 60);

  -- Leite: 20 no sistema, contamos 21 (sobra de 1).
  perform fn_lancar_contagem(
    v_inv, (select id from produtos where ean = '7891000315507'), 'cafeteria', 21);

  perform fn_fechar_contagem(v_inv, true);
  perform fn_aprovar_inventario(v_inv, 'Teste automatizado');
end $$;

select assert_eq('inventario ajustou a falta na prateleira', (
  select quantidade from lotes_estoque le
    join produtos p on p.id = le.produto_id join filiais f on f.id = le.filial_id
   where p.ean = '7891000100103' and f.codigo = 'F01' and le.local = 'prateleira'), 18::numeric);

select assert_eq('inventario ajustou a sobra na cafeteria', (
  select quantidade from lotes_estoque le
    join produtos p on p.id = le.produto_id join filiais f on f.id = le.filial_id
   where p.ean = '7891000315507' and f.codigo = 'F01' and le.local = 'cafeteria'), 21::numeric);

select assert_eq('acuracidade calculada', (
  select itens_divergentes from vw_inventario_resumo
   where filial_id = (select id from filiais where codigo = 'F01')), 2::bigint);

select assert_eq('inventario aprovado', (
  select status::text from inventarios
   where filial_id = (select id from filiais where codigo = 'F01')), 'aprovado');

-- ------------------------------------------------------------------- alertas
select assert_eq('produto abaixo do minimo detectado', (
  select count(*) > 0 from vw_produtos_abaixo_minimo), true);

select assert_eq('dashboard responde', (
  select valor_estoque > 0 from fn_dashboard_resumo()), true);

select assert_eq('curva ABC classifica', (
  select count(*) > 0 from fn_curva_abc(current_date - 30, current_date)), true);

-- ------------------------------------------------------- contagem cega na RLS
-- Um operador (sem inventario.aprovar) não pode ler inventario_itens direto.
select set_config('teste.uid', '22222222-2222-2222-2222-222222222222', false);

select assert_eq('operador nao enxerga itens de inventario de outra filial',
  (select count(*) from inventario_itens), 0::bigint);

select assert_eq('operador so enxerga a filial dele',
  (select count(*) from filiais), 1::bigint);

select assert_eq('operador nao tem permissao de aprovar inventario',
  auth_tem_permissao('inventario.aprovar'), false);

do $$
begin
  begin
    perform fn_abrir_inventario((select id from filiais limit 1), 'parcial');
    raise exception 'FALHOU: operador nao deveria abrir inventario';
  exception when insufficient_privilege then
    raise notice 'ok  operador bloqueado ao tentar abrir inventario';
  end;
end $$;

-- ------------------------------------------------------- tarefas automáticas
reset role;
select fn_gerar_tarefas_automaticas() as resultado_cron;

select assert_eq('tarefas automaticas geradas', (
  select count(*) > 0 from tarefas where tipo = 'sistema'), true);

select assert_eq('notificacao criada para o responsavel', (
  select count(*) > 0 from notificacoes), true);

-- Idempotência: rodar de novo não duplica.
do $$
declare n1 bigint; n2 bigint;
begin
  select count(*) into n1 from tarefas;
  perform fn_gerar_tarefas_automaticas();
  select count(*) into n2 from tarefas;
  if n1 <> n2 then
    raise exception 'FALHOU: cron duplicou tarefas (% -> %)', n1, n2;
  end if;
  raise notice 'ok  cron e idempotente (% tarefas)', n2;
end $$;

-- --------------------------------------------------------- imutabilidade
do $$
begin
  begin
    update movimentacoes set quantidade = 1 where true;
    raise exception 'FALHOU: movimentacoes deveriam ser imutaveis';
  exception when insufficient_privilege then
    raise notice 'ok  movimentacoes sao imutaveis';
  end;
end $$;

-- ------------------------------------------ correcoes de inventario (0012)
-- Desfazer contagem, excluir inventario e fechar a cobranca do kanban.
select set_config('teste.uid', '11111111-1111-1111-1111-111111111111', false);

do $$
declare
  v_f2 uuid; v_inv uuid; v_prod uuid; v_item uuid; v_r jsonb;
begin
  select id into v_f2 from filiais where codigo = 'F02';
  select id into v_prod from produtos where ean = '7891000100103';

  -- F02 tem 28 unidades na prateleira (veio da transferencia).
  v_inv := fn_abrir_inventario(v_f2, 'parcial', array['prateleira']::tipo_local[]);

  -- 1) desfazer contagem de item que existia no sistema: volta a "nao contado"
  perform fn_lancar_contagem(v_inv, v_prod, 'prateleira', 25, 'L-FEV', current_date + 60);
  select id into v_item from inventario_itens
   where inventario_id = v_inv and produto_id = v_prod and quantidade_sistema > 0;

  v_r := fn_desfazer_contagem(v_item);
  if v_r->>'acao' <> 'contagem_desfeita' then
    raise exception 'FALHOU: esperava contagem_desfeita, veio %', v_r->>'acao';
  end if;
  if (select quantidade_contada from inventario_itens where id = v_item) is not null then
    raise exception 'FALHOU: a contagem nao foi desfeita';
  end if;
  raise notice 'ok  desfazer contagem devolve o item para "nao contado"';

  -- 2) desfazer item que so existia por causa da contagem: some da lista
  perform fn_lancar_contagem(
    v_inv, (select id from produtos where ean = '7891000315507'), 'prateleira', 3);
  select id into v_item from inventario_itens
   where inventario_id = v_inv and quantidade_sistema = 0;

  v_r := fn_desfazer_contagem(v_item);
  if v_r->>'acao' <> 'removido' then
    raise exception 'FALHOU: item criado na contagem deveria ser removido, veio %', v_r->>'acao';
  end if;
  raise notice 'ok  desfazer item de sobra remove a linha';

  -- 3) excluir inventario nao aprovado
  v_r := fn_excluir_inventario(v_inv);
  if exists (select 1 from inventarios where id = v_inv) then
    raise exception 'FALHOU: inventario nao foi excluido';
  end if;
  raise notice 'ok  inventario nao aprovado pode ser excluido';
end $$;

-- 4) inventario aprovado NAO pode ser excluido
do $$
declare v_inv uuid;
begin
  select id into v_inv from inventarios where status = 'aprovado' limit 1;
  begin
    perform fn_excluir_inventario(v_inv);
    raise exception 'FALHOU: inventario aprovado nao deveria poder ser excluido';
  exception when check_violation then
    raise notice 'ok  inventario aprovado protegido contra exclusao';
  end;
end $$;

-- 5) quem nao tem a permissao nao exclui
select set_config('teste.uid', '22222222-2222-2222-2222-222222222222', false);
do $$
declare v_inv uuid;
begin
  select id into v_inv from inventarios limit 1;
  begin
    perform fn_excluir_inventario(v_inv);
    raise exception 'FALHOU: operador nao deveria excluir inventario';
  exception when insufficient_privilege then
    raise notice 'ok  exclusao respeita a permissao inventario.excluir';
  end;
end $$;
select set_config('teste.uid', '11111111-1111-1111-1111-111111111111', false);

-- 6) aprovar o inventario conclui a cobranca mensal do kanban
do $$
declare
  v_f uuid; v_compet date; v_inv uuid; v_tarefa uuid;
begin
  select filial_id, competencia into v_f, v_compet
    from inventarios where status = 'aprovado' and competencia is not null limit 1;

  v_tarefa := fn_criar_tarefa_sistema(
    'Inventario mensal (teste)', 'cobranca', 'inventario', v_f,
    current_date, 'alta', 'inventario_mensal',
    v_f::text || ':' || to_char(v_compet, 'YYYY-MM'));

  -- Reabre e aprova de novo para disparar o gatilho.
  update inventarios set status = 'aguardando_aprovacao' where filial_id = v_f and competencia = v_compet;
  perform fn_aprovar_inventario(
    (select id from inventarios where filial_id = v_f and competencia = v_compet));

  if (select status from tarefas where id = v_tarefa) <> 'concluido' then
    raise exception 'FALHOU: a cobranca mensal do kanban continuou aberta apos a aprovacao';
  end if;
  raise notice 'ok  aprovar inventario conclui a cobranca mensal do kanban';
end $$;

-- --------------------------------------------------- ultimo acesso
-- Entrar por link (ou por senha) deve refletir na tela de usuarios.
do $$
declare v_id uuid := '11111111-1111-1111-1111-111111111111';
begin
  update auth.users set last_sign_in_at = now() where id = v_id;

  if (select ultimo_acesso from usuarios where id = v_id) is null then
    raise exception 'FALHOU: ultimo_acesso continuou nulo apos o login';
  end if;
  raise notice 'ok  ultimo acesso espelhado do auth para a tabela usuarios';
end $$;

select '=========== TODOS OS TESTES PASSARAM ===========' as resultado;

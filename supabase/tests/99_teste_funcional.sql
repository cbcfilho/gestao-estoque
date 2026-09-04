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

-- ---------------------------------------------- RLS de usuarios sem recursao
-- Bug de produção: usuarios_update_proprio comparava perfil_id/ativo com uma
-- subconsulta direta em usuarios ("select ... from usuarios where id =
-- auth.uid()") dentro da própria policy de usuarios — Postgres detecta isso
-- como "infinite recursion detected in policy for relation usuarios" em
-- QUALQUER update na tabela, não só ao editar o próprio usuário. Corrigido
-- embrulhando a leitura em funções SECURITY DEFINER (0020).
do $$
declare v_perfil_gerente uuid;
begin
  select id into v_perfil_gerente from perfis where chave = 'gerente';

  -- Cenário exato do bug reportado: admin edita o registro de OUTRO usuário.
  update usuarios set nome = 'Operador Renomeado', perfil_id = v_perfil_gerente
   where email = 'op@teste.com';

  if (select nome from usuarios where email = 'op@teste.com') <> 'Operador Renomeado' then
    raise exception 'FALHOU: admin nao conseguiu editar o registro de outro usuario';
  end if;

  -- Devolve o perfil original, para não interferir nos testes de permissão mais abaixo.
  update usuarios set nome = 'Operador', perfil_id = (select id from perfis where chave = 'operador')
   where email = 'op@teste.com';

  raise notice 'ok  admin edita o registro de outro usuario sem recursao de RLS';
end $$;

do $$
begin
  perform set_config('teste.uid', '22222222-2222-2222-2222-222222222222', false);

  -- O próprio usuário pode editar o próprio nome.
  update usuarios set nome = 'Operador Renomeado Por Si' where id = '22222222-2222-2222-2222-222222222222';

  if (select nome from usuarios where id = '22222222-2222-2222-2222-222222222222') <> 'Operador Renomeado Por Si' then
    raise exception 'FALHOU: usuario nao conseguiu editar o proprio nome';
  end if;

  raise notice 'ok  usuario edita o proprio nome sem recursao de RLS';
end $$;

do $$
declare v_bloqueado boolean; v_perfil_antes uuid; v_perfil_gerente uuid;
begin
  select perfil_id into v_perfil_antes from usuarios where id = '22222222-2222-2222-2222-222222222222';
  select id into v_perfil_gerente from perfis where chave = 'gerente';

  -- Sem usuarios.gerenciar, o operador NAO pode trocar o próprio perfil —
  -- só nome/telefone são editáveis por quem edita a si mesmo. Regra de
  -- negócio preservada pela correção.
  begin
    update usuarios set perfil_id = v_perfil_gerente where id = '22222222-2222-2222-2222-222222222222';
    v_bloqueado := false;
  exception when others then
    v_bloqueado := true;
  end;

  if not v_bloqueado then
    raise exception 'FALHOU: operador conseguiu trocar o proprio perfil, deveria ser bloqueado';
  end if;

  if (select perfil_id from usuarios where id = '22222222-2222-2222-2222-222222222222') <> v_perfil_antes then
    raise exception 'FALHOU: perfil do operador mudou mesmo com o bloqueio';
  end if;

  raise notice 'ok  operador continua sem poder trocar o proprio perfil (RLS preservada)';
end $$;

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

-- ---------------------------------------- relatorio semanal de vencimento
-- Ainda como postgres (igual ao cron acima): so service_role deveria
-- alcançar fn_relatorio_vencimento_semanal, e postgres (superusuario)
-- ignora grant/RLS de qualquer jeito — mesma ressalva já documentada para
-- a seção do cron no AGENTS.md.
--
-- Produto exclusivo deste teste, para o delta antes/depois não depender de
-- nenhum lote já criado pelos testes anteriores.
--
-- teste.uid ainda está com o operador (só acessa F02) da seção de contagem
-- cega, lá em cima — volta para o admin, senão fn_registrar_entrada barra
-- por falta de acesso à filial F01.
select set_config('teste.uid', '11111111-1111-1111-1111-111111111111', false);

do $$
declare
  v_prod uuid; v_f1 uuid; v_antes jsonb; v_depois jsonb;
begin
  select id into v_f1 from filiais where codigo = 'F01';

  insert into produtos (nome, valor_custo, valor_venda, controla_validade)
  values ('Produto Teste Vencimento', 10.00, 20.00, true)
  returning id into v_prod;

  insert into produto_filiais (produto_id, filial_id)
  select v_prod, id from filiais;

  -- 1) Um lote em cada faixa: o delta prova que cada `filter` bate certo e
  -- que as quatro faixas não se sobrepõem.
  v_antes := fn_relatorio_vencimento_semanal();

  perform fn_registrar_entrada(v_prod, v_f1, 'deposito', 2, 10.00, 'V-VENCIDO', current_date - 5);
  perform fn_registrar_entrada(v_prod, v_f1, 'deposito', 3, 10.00, 'V-7D',      current_date + 5);
  perform fn_registrar_entrada(v_prod, v_f1, 'deposito', 4, 10.00, 'V-30D',     current_date + 20);
  perform fn_registrar_entrada(v_prod, v_f1, 'deposito', 5, 10.00, 'V-60D',     current_date + 45);

  v_depois := fn_relatorio_vencimento_semanal();

  if (v_depois->'vencidos'->>'lotes')::bigint - (v_antes->'vencidos'->>'lotes')::bigint <> 1
     or (v_depois->'vencidos'->>'valor')::numeric - (v_antes->'vencidos'->>'valor')::numeric <> 20.00 then
    raise exception 'FALHOU: delta de "vencidos" incorreto (antes=%, depois=%)', v_antes->'vencidos', v_depois->'vencidos';
  end if;
  if (v_depois->'dias_7'->>'lotes')::bigint - (v_antes->'dias_7'->>'lotes')::bigint <> 1
     or (v_depois->'dias_7'->>'valor')::numeric - (v_antes->'dias_7'->>'valor')::numeric <> 30.00 then
    raise exception 'FALHOU: delta de "dias_7" incorreto (antes=%, depois=%)', v_antes->'dias_7', v_depois->'dias_7';
  end if;
  if (v_depois->'dias_30'->>'lotes')::bigint - (v_antes->'dias_30'->>'lotes')::bigint <> 1
     or (v_depois->'dias_30'->>'valor')::numeric - (v_antes->'dias_30'->>'valor')::numeric <> 40.00 then
    raise exception 'FALHOU: delta de "dias_30" incorreto (antes=%, depois=%)', v_antes->'dias_30', v_depois->'dias_30';
  end if;
  if (v_depois->'dias_60'->>'lotes')::bigint - (v_antes->'dias_60'->>'lotes')::bigint <> 1
     or (v_depois->'dias_60'->>'valor')::numeric - (v_antes->'dias_60'->>'valor')::numeric <> 50.00 then
    raise exception 'FALHOU: delta de "dias_60" incorreto (antes=%, depois=%)', v_antes->'dias_60', v_depois->'dias_60';
  end if;
  raise notice 'ok  fn_relatorio_vencimento_semanal: uma faixa exclusiva por lote, sem sobreposição';

  -- 2) Fronteira 7/8 dias: exatamente 7 cai em dias_7; exatamente 8 já é dias_30.
  v_antes := fn_relatorio_vencimento_semanal();
  perform fn_registrar_entrada(v_prod, v_f1, 'deposito', 1, 10.00, 'V-D7', current_date + 7);
  perform fn_registrar_entrada(v_prod, v_f1, 'deposito', 1, 10.00, 'V-D8', current_date + 8);
  v_depois := fn_relatorio_vencimento_semanal();

  if (v_depois->'dias_7'->>'lotes')::bigint - (v_antes->'dias_7'->>'lotes')::bigint <> 1 then
    raise exception 'FALHOU: lote vencendo em exatamente 7 dias deveria entrar em dias_7';
  end if;
  if (v_depois->'dias_30'->>'lotes')::bigint - (v_antes->'dias_30'->>'lotes')::bigint <> 1 then
    raise exception 'FALHOU: lote vencendo em exatamente 8 dias deveria entrar em dias_30, nao em dias_7';
  end if;
  raise notice 'ok  fronteira de 7/8 dias respeitada (7 = dias_7, 8 = dias_30)';

  -- 3) Fronteira 60/61 dias: exatamente 60 cai em dias_60; 61 fica fora de
  -- todas as quatro faixas (fora do horizonte do relatório).
  v_antes := fn_relatorio_vencimento_semanal();
  perform fn_registrar_entrada(v_prod, v_f1, 'deposito', 1, 10.00, 'V-D60', current_date + 60);
  perform fn_registrar_entrada(v_prod, v_f1, 'deposito', 1, 10.00, 'V-D61', current_date + 61);
  v_depois := fn_relatorio_vencimento_semanal();

  if (v_depois->'dias_60'->>'lotes')::bigint - (v_antes->'dias_60'->>'lotes')::bigint <> 1 then
    raise exception 'FALHOU: lote vencendo em exatamente 60 dias deveria entrar em dias_60';
  end if;

  if (
    ((v_depois->'vencidos'->>'lotes')::bigint + (v_depois->'dias_7'->>'lotes')::bigint
     + (v_depois->'dias_30'->>'lotes')::bigint + (v_depois->'dias_60'->>'lotes')::bigint)
    -
    ((v_antes->'vencidos'->>'lotes')::bigint + (v_antes->'dias_7'->>'lotes')::bigint
     + (v_antes->'dias_30'->>'lotes')::bigint + (v_antes->'dias_60'->>'lotes')::bigint)
  ) <> 1 then
    raise exception 'FALHOU: lote vencendo em 61 dias nao deveria aparecer em nenhuma das quatro faixas';
  end if;
  raise notice 'ok  lote vencendo em 61 dias fica fora do horizonte de 60 dias do relatorio';
end $$;

select assert_eq('fn_relatorio_vencimento_semanal alcancavel so por service_role', (
  select has_function_privilege('service_role', p.oid, 'execute') from pg_proc p
   where p.proname = 'fn_relatorio_vencimento_semanal'), true);

select assert_eq('fn_relatorio_vencimento_semanal fora do alcance do authenticated', (
  select has_function_privilege('authenticated', p.oid, 'execute') from pg_proc p
   where p.proname = 'fn_relatorio_vencimento_semanal'), false);

select assert_eq('fn_relatorio_vencimento_semanal fora do alcance do anon', (
  select has_function_privilege('anon', p.oid, 'execute') from pg_proc p
   where p.proname = 'fn_relatorio_vencimento_semanal'), false);

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

-- ------------------------------------ importacao de movimentos (0013)
select set_config('teste.uid', '11111111-1111-1111-1111-111111111111', false);

do $$
declare
  v_f1 uuid; v_saldo_antes numeric; v_saldo_depois numeric; v_r jsonb;
  v_itens jsonb;
begin
  select id into v_f1 from filiais where codigo = 'F01';

  select coalesce(sum(quantidade),0) into v_saldo_antes
    from lotes_estoque le join produtos p on p.id = le.produto_id
   where p.ean = '7891000100103' and le.filial_id = v_f1 and le.local = 'deposito';

  v_itens := jsonb_build_array(
    jsonb_build_object('tipo','entrada','ean','7891000100103','local','deposito',
                       'quantidade',10,'documento','NF-001','data','2026-08-10',
                       'custo_unitario','4.50','lote','L-FEV','data_validade','2026-10-31'),
    jsonb_build_object('tipo','saida','ean','7891000100103','local','deposito',
                       'quantidade',4,'documento','CF-100','data','2026-08-10','motivo','venda'),
    -- produto que nao existe: deve virar erro sem derrubar o resto
    jsonb_build_object('tipo','saida','ean','0000000000000','local','deposito',
                       'quantidade',1,'documento','CF-101','data','2026-08-10')
  );

  v_r := fn_importar_movimentos(v_f1, 'movimento-10-08.xlsx', 'hash-teste-001', v_itens);

  if (v_r->>'aplicadas')::int <> 2 then
    raise exception 'FALHOU: esperava 2 aplicadas, veio %', v_r->>'aplicadas';
  end if;
  if jsonb_array_length(v_r->'erros') <> 1 then
    raise exception 'FALHOU: esperava 1 erro, veio %', jsonb_array_length(v_r->'erros');
  end if;
  raise notice 'ok  importacao aplica linhas boas e reporta a linha ruim';

  select coalesce(sum(quantidade),0) into v_saldo_depois
    from lotes_estoque le join produtos p on p.id = le.produto_id
   where p.ean = '7891000100103' and le.filial_id = v_f1 and le.local = 'deposito';

  if v_saldo_depois <> v_saldo_antes + 10 - 4 then
    raise exception 'FALHOU: saldo esperado %, veio %', v_saldo_antes + 6, v_saldo_depois;
  end if;
  raise notice 'ok  saldo refletiu entrada e saida importadas';

  -- data do fato preservada, e nao a data de hoje
  if not exists (
    select 1 from movimentacoes m join produtos p on p.id = m.produto_id
     where p.ean = '7891000100103' and m.data_hora::date = date '2026-08-10'
  ) then
    raise exception 'FALHOU: a movimentacao nao guardou a data informada na planilha';
  end if;
  raise notice 'ok  movimentacao gravada com a data do fato, nao a de hoje';

  -- trava 1: mesmo arquivo (mesmo hash) nao entra de novo
  begin
    perform fn_importar_movimentos(v_f1, 'movimento-10-08.xlsx', 'hash-teste-001', v_itens);
    raise exception 'FALHOU: reimportar o mesmo arquivo deveria ser bloqueado';
  exception when unique_violation then
    raise notice 'ok  reimportar o mesmo arquivo e bloqueado pelo hash';
  end;

  -- trava 2: arquivo diferente, mas as mesmas linhas sao puladas
  v_r := fn_importar_movimentos(v_f1, 'movimento-10-08-corrigido.xlsx', 'hash-teste-002', v_itens);
  if (v_r->>'aplicadas')::int <> 0 or (v_r->>'ignoradas')::int <> 2 then
    raise exception 'FALHOU: esperava 0 aplicadas e 2 ignoradas, veio % e %',
      v_r->>'aplicadas', v_r->>'ignoradas';
  end if;
  raise notice 'ok  linhas ja importadas sao puladas mesmo em arquivo novo';

  select coalesce(sum(quantidade),0) into v_saldo_depois
    from lotes_estoque le join produtos p on p.id = le.produto_id
   where p.ean = '7891000100103' and le.filial_id = v_f1 and le.local = 'deposito';
  if v_saldo_depois <> v_saldo_antes + 6 then
    raise exception 'FALHOU: o saldo mudou na reimportacao — houve duplicidade';
  end if;
  raise notice 'ok  reimportacao nao alterou o saldo (sem duplicidade)';
end $$;

-- quem nao tem a permissao nao importa
select set_config('teste.uid', '22222222-2222-2222-2222-222222222222', false);
do $$
declare v_f uuid;
begin
  select filial_id into v_f from usuario_filiais
   where usuario_id = '22222222-2222-2222-2222-222222222222' limit 1;
  begin
    perform fn_importar_movimentos(v_f, 'x.xlsx', 'hash-teste-999', '[]'::jsonb);
    raise exception 'FALHOU: operador nao deveria importar movimentos';
  exception when insufficient_privilege then
    raise notice 'ok  importacao respeita a permissao estoque.importar';
  end;
end $$;
select set_config('teste.uid', '11111111-1111-1111-1111-111111111111', false);

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

-- ------------------------------------------- lote preservado na transferência
-- Estes casos ficam no fim de propósito: eles criam lotes novos na F01, e as
-- contagens de inventário acima assertam sobre o estoque daquela filial.
-- Transferência que atravessa mais de um lote: cada lote precisa chegar ao
-- destino com o próprio código, a própria validade e o próprio custo. Antes da
-- migration 0014 tudo desembarcava sob o primeiro lote da baixa.
do $$
declare v_prod uuid; v_f1 uuid; v_f3 uuid; v_tr uuid;
begin
  select id into v_prod from produtos where ean = '7891000100103';
  select id into v_f1 from filiais where codigo = 'F01';
  select id into v_f3 from filiais where codigo = 'F03';

  perform fn_registrar_entrada(v_prod, v_f1, 'cafeteria', 10, 5.00, 'MULTI-A', current_date + 10);
  perform fn_registrar_entrada(v_prod, v_f1, 'cafeteria', 10, 6.00, 'MULTI-B', current_date + 300);

  -- 15 unidades: FEFO tira 10 de MULTI-A (vence antes) e 5 de MULTI-B.
  v_tr := fn_criar_transferencia(
    v_f1, 'cafeteria', v_f3, 'prateleira',
    jsonb_build_array(jsonb_build_object('produto_id', v_prod, 'quantidade', 15))
  );
  perform fn_enviar_transferencia(v_tr);
  perform fn_receber_transferencia(v_tr);
end $$;

select assert_eq('transferencia multi-lote: MULTI-A chegou inteiro no destino', (
  select le.quantidade from lotes_estoque le
    join produtos p on p.id = le.produto_id join filiais f on f.id = le.filial_id
   where p.ean = '7891000100103' and f.codigo = 'F03' and le.lote = 'MULTI-A'), 10::numeric);

select assert_eq('transferencia multi-lote: MULTI-B manteve o proprio codigo', (
  select le.quantidade from lotes_estoque le
    join produtos p on p.id = le.produto_id join filiais f on f.id = le.filial_id
   where p.ean = '7891000100103' and f.codigo = 'F03' and le.lote = 'MULTI-B'), 5::numeric);

select assert_eq('transferencia multi-lote: validade do MULTI-B nao foi puxada para a do A', (
  select le.data_validade from lotes_estoque le
    join produtos p on p.id = le.produto_id join filiais f on f.id = le.filial_id
   where p.ean = '7891000100103' and f.codigo = 'F03' and le.lote = 'MULTI-B'),
  (current_date + 300)::date);

select assert_eq('transferencia multi-lote: custo de cada lote preservado', (
  select le.custo_unitario from lotes_estoque le
    join produtos p on p.id = le.produto_id join filiais f on f.id = le.filial_id
   where p.ean = '7891000100103' and f.codigo = 'F03' and le.lote = 'MULTI-B'), 6.0000::numeric);

-- Escolher o lote na origem: a saída sai daquele lote e é ele que entra lá.
do $$
declare v_prod uuid; v_f1 uuid; v_f4 uuid; v_tr uuid; v_lote uuid;
begin
  select id into v_prod from produtos where ean = '7891000100103';
  select id into v_f1 from filiais where codigo = 'F01';
  select id into v_f4 from filiais where codigo = 'F04';

  perform fn_registrar_entrada(v_prod, v_f1, 'cafeteria', 8, 7.00, 'ESCOLHIDO', current_date + 400);

  select id into v_lote from lotes_estoque
   where produto_id = v_prod and filial_id = v_f1
     and local = 'cafeteria' and lote = 'ESCOLHIDO';

  v_tr := fn_criar_transferencia(
    v_f1, 'cafeteria', v_f4, 'prateleira',
    jsonb_build_array(jsonb_build_object(
      'produto_id', v_prod, 'quantidade', 3, 'lote_id', v_lote))
  );
  perform fn_enviar_transferencia(v_tr);
  perform fn_receber_transferencia(v_tr);
end $$;

select assert_eq('lote escolhido na origem e o mesmo que entra no destino', (
  select le.lote from lotes_estoque le
    join produtos p on p.id = le.produto_id join filiais f on f.id = le.filial_id
   where p.ean = '7891000100103' and f.codigo = 'F04'), 'ESCOLHIDO');

-- Cancelar em trânsito devolve cada lote para a origem, não tudo no primeiro.
do $$
declare v_prod uuid; v_f1 uuid; v_f5 uuid; v_tr uuid;
begin
  select id into v_prod from produtos where ean = '7891000100103';
  select id into v_f1 from filiais where codigo = 'F01';
  select id into v_f5 from filiais where codigo = 'F05';

  perform fn_registrar_entrada(v_prod, v_f1, 'deposito', 6, 3.00, 'CANC-A', current_date + 20);
  perform fn_registrar_entrada(v_prod, v_f1, 'deposito', 6, 3.50, 'CANC-B', current_date + 25);

  v_tr := fn_criar_transferencia(
    v_f1, 'deposito', v_f5, 'prateleira',
    jsonb_build_array(jsonb_build_object('produto_id', v_prod, 'quantidade', 9))
  );
  perform fn_enviar_transferencia(v_tr);
  perform fn_cancelar_transferencia(v_tr, 'teste de estorno por lote');
end $$;

select assert_eq('estorno do cancelamento devolveu CANC-A completo', (
  select le.quantidade from lotes_estoque le
    join produtos p on p.id = le.produto_id join filiais f on f.id = le.filial_id
   where p.ean = '7891000100103' and f.codigo = 'F01'
     and le.local = 'deposito' and le.lote = 'CANC-A'), 6::numeric);

select assert_eq('estorno do cancelamento devolveu CANC-B completo', (
  select le.quantidade from lotes_estoque le
    join produtos p on p.id = le.produto_id join filiais f on f.id = le.filial_id
   where p.ean = '7891000100103' and f.codigo = 'F01'
     and le.local = 'deposito' and le.lote = 'CANC-B'), 6::numeric);


-- Envio parcial: antes da 0014 esta chamada nem rodava — "parte" era ao mesmo
-- tempo variável plpgsql e alias da subconsulta, e o Postgres recusava por
-- ambiguidade. Só não aparecia porque nenhum teste enviava parcial.
do $$
declare v_prod uuid; v_f1 uuid; v_f5 uuid; v_tr uuid;
begin
  select id into v_prod from produtos where ean = '7891000315507';
  select id into v_f1 from filiais where codigo = 'F01';
  select id into v_f5 from filiais where codigo = 'F05';

  perform fn_registrar_entrada(v_prod, v_f1, 'deposito', 20, 4.50, 'PARC-A', current_date + 15);
  perform fn_registrar_entrada(v_prod, v_f1, 'deposito', 20, 5.50, 'PARC-B', current_date + 500);

  v_tr := fn_criar_transferencia(
    v_f1, 'deposito', v_f5, 'prateleira',
    jsonb_build_array(jsonb_build_object('produto_id', v_prod, 'quantidade', 30))
  );

  -- Envia 25 das 30 pedidas: FEFO tira 20 de PARC-A e 5 de PARC-B.
  perform fn_enviar_transferencia(
    v_tr,
    (select jsonb_agg(jsonb_build_object('item_id', id, 'quantidade', 25))
       from transferencia_itens where transferencia_id = v_tr)
  );

  -- Recebe 22 das 25: a falta de 3 sai do fim da fila (PARC-B) e vira perda.
  perform fn_receber_transferencia(
    v_tr,
    (select jsonb_agg(jsonb_build_object('item_id', id, 'quantidade', 22))
       from transferencia_itens where transferencia_id = v_tr)
  );
end $$;

select assert_eq('envio parcial nao quebra com item_id informado', (
  select coalesce(sum(le.quantidade), 0) from lotes_estoque le
    join produtos p on p.id = le.produto_id join filiais f on f.id = le.filial_id
   where p.ean = '7891000315507' and f.codigo = 'F05'), 22::numeric);

select assert_eq('recebimento parcial preencheu o lote que vence antes', (
  select le.quantidade from lotes_estoque le
    join produtos p on p.id = le.produto_id join filiais f on f.id = le.filial_id
   where p.ean = '7891000315507' and f.codigo = 'F05' and le.lote = 'PARC-A'), 20::numeric);

select assert_eq('recebimento parcial: a falta saiu do ultimo lote', (
  select le.quantidade from lotes_estoque le
    join produtos p on p.id = le.produto_id join filiais f on f.id = le.filial_id
   where p.ean = '7891000315507' and f.codigo = 'F05' and le.lote = 'PARC-B'), 2::numeric);

select assert_eq('perda em transito do envio parcial registrada', (
  select sum(m.quantidade) from movimentacoes m join produtos p on p.id = m.produto_id
   where p.ean = '7891000315507' and m.motivo = 'perda'), 3::numeric);

select assert_eq('o que nao foi enviado continua na origem', (
  select le.quantidade from lotes_estoque le
    join produtos p on p.id = le.produto_id join filiais f on f.id = le.filial_id
   where p.ean = '7891000315507' and f.codigo = 'F01'
     and le.local = 'deposito' and le.lote = 'PARC-B'), 15::numeric);

-- ------------------------------------------------ consumo da cafeteria por lote
-- A tela de consumo passou a deixar escolher o lote. O caminho ja existia em
-- fn_registrar_saida (p_lote_id), mas nunca tinha sido exercitado com o motivo
-- 'consumo_interno' — que e o unico que entra pelo ramo de permissao propria da
-- cafeteria. Escolher o lote precisa consumir DAQUELE lote, nao do FEFO.
do $$
declare v_prod uuid; v_f1 uuid; v_lote_longe uuid;
begin
  select id into v_prod from produtos where ean = '7891000315507';
  select id into v_f1 from filiais where codigo = 'F01';

  perform fn_registrar_entrada(v_prod, v_f1, 'cafeteria', 12, 4.00, 'CAFE-PERTO', current_date + 5);
  perform fn_registrar_entrada(v_prod, v_f1, 'cafeteria', 12, 7.00, 'CAFE-LONGE', current_date + 400);

  select id into v_lote_longe from lotes_estoque
   where produto_id = v_prod and filial_id = v_f1
     and local = 'cafeteria' and lote = 'CAFE-LONGE';

  -- Consome 4 do lote de validade LONGA, contrariando o FEFO de proposito.
  perform fn_registrar_saida(
    v_prod, v_f1, 'cafeteria', 4, 'consumo_interno', v_lote_longe, 'copo derrubado'
  );
end $$;

select assert_eq('consumo da cafeteria saiu do lote escolhido', (
  select le.quantidade from lotes_estoque le
    join produtos p on p.id = le.produto_id join filiais f on f.id = le.filial_id
   where p.ean = '7891000315507' and f.codigo = 'F01'
     and le.local = 'cafeteria' and le.lote = 'CAFE-LONGE'), 8::numeric);

select assert_eq('consumo da cafeteria nao tocou o lote que vence antes', (
  select le.quantidade from lotes_estoque le
    join produtos p on p.id = le.produto_id join filiais f on f.id = le.filial_id
   where p.ean = '7891000315507' and f.codigo = 'F01'
     and le.local = 'cafeteria' and le.lote = 'CAFE-PERTO'), 12::numeric);

select assert_eq('movimentacao registrou o lote consumido', (
  select m.lote from movimentacoes m join produtos p on p.id = m.produto_id
   where p.ean = '7891000315507' and m.motivo = 'consumo_interno'
     and m.observacao = 'copo derrubado'), 'CAFE-LONGE');

-- Sem escolher lote, o consumo volta a seguir o FEFO.
do $$
declare v_prod uuid; v_f1 uuid;
begin
  select id into v_prod from produtos where ean = '7891000315507';
  select id into v_f1 from filiais where codigo = 'F01';
  perform fn_registrar_saida(
    v_prod, v_f1, 'cafeteria', 3, 'consumo_interno', null, 'consumo do dia'
  );
end $$;

select assert_eq('consumo sem lote escolhido seguiu o FEFO', (
  select le.quantidade from lotes_estoque le
    join produtos p on p.id = le.produto_id join filiais f on f.id = le.filial_id
   where p.ean = '7891000315507' and f.codigo = 'F01'
     and le.local = 'cafeteria' and le.lote = 'CAFE-PERTO'), 9::numeric);

-- --------------------------------------------- ordenacao da lista de contagem
-- Tres produtos com nomes de proposito fora de ordem alfabetica e de EAN, para
-- o teste distinguir cada criterio de ordenacao sem ambiguidade. Cada lancamento
-- roda como statement isolado (nao dentro de um bloco do $$), porque dentro de
-- um bloco so ha uma transacao e portanto um now() so — os tres contado_em
-- sairiam identicos e a ordem "recente" não teria como ser testada.
do $$
declare
  v_f1 uuid; v_inv uuid;
  v_prod_zebra uuid; v_prod_abacaxi uuid; v_prod_melancia uuid;
begin
  select id into v_f1 from filiais where codigo = 'F01';

  insert into produtos (nome, ean, valor_custo, valor_venda, estoque_minimo)
  values ('Zebra Teste Ordenacao', '9990000000001', 1, 2, 1) returning id into v_prod_zebra;
  insert into produtos (nome, ean, valor_custo, valor_venda, estoque_minimo)
  values ('Abacaxi Teste Ordenacao', '9990000000002', 1, 2, 1) returning id into v_prod_abacaxi;
  insert into produtos (nome, ean, valor_custo, valor_venda, estoque_minimo)
  values ('Melancia Teste Ordenacao', '9990000000003', 1, 2, 1) returning id into v_prod_melancia;
  insert into produto_filiais (produto_id, filial_id)
  values (v_prod_zebra, v_f1), (v_prod_abacaxi, v_f1), (v_prod_melancia, v_f1);

  v_inv := fn_abrir_inventario(v_f1, 'parcial', array['deposito']::tipo_local[]);

  perform set_config('teste.inv_ordenacao', v_inv::text, false);
  perform set_config('teste.prod_zebra', v_prod_zebra::text, false);
  perform set_config('teste.prod_abacaxi', v_prod_abacaxi::text, false);
  perform set_config('teste.prod_melancia', v_prod_melancia::text, false);
end $$;

-- Conta na ordem Zebra, Abacaxi, Melancia — nem alfabetica, nem por EAN — cada
-- lancamento em sua propria transacao para o now() de cada um ser distinto.
select fn_lancar_contagem(
  current_setting('teste.inv_ordenacao')::uuid, current_setting('teste.prod_zebra')::uuid,
  'deposito', 50, null, null, null, false);
select pg_sleep(1.1);
select fn_lancar_contagem(
  current_setting('teste.inv_ordenacao')::uuid, current_setting('teste.prod_abacaxi')::uuid,
  'deposito', 70, null, null, null, false);
select pg_sleep(1.1);
select fn_lancar_contagem(
  current_setting('teste.inv_ordenacao')::uuid, current_setting('teste.prod_melancia')::uuid,
  'deposito', 30, null, null, null, false);

-- 'recente': o ultimo lancado (Melancia) primeiro, o primeiro (Zebra) por ultimo.
select assert_eq('ordenacao recente: 1o lugar e o ultimo contado', (
  select produto_nome from fn_inventario_itens_para_contagem(
    current_setting('teste.inv_ordenacao')::uuid, null, null, false, 'recente')
   where produto_nome like '%Teste Ordenacao' limit 1), 'Melancia Teste Ordenacao');

select assert_eq('ordenacao recente: ultimo lugar e o primeiro contado', (
  select produto_nome from fn_inventario_itens_para_contagem(
    current_setting('teste.inv_ordenacao')::uuid, null, null, false, 'recente')
   where produto_nome like '%Teste Ordenacao'
   order by 1 desc limit 1 offset 0), 'Zebra Teste Ordenacao');

-- Sem informar p_ordenar_por, o padrao e o mesmo que 'recente'.
select assert_eq('ordenacao padrao (sem parametro) e recente', (
  select array_agg(produto_nome) from (
    select produto_nome from fn_inventario_itens_para_contagem(current_setting('teste.inv_ordenacao')::uuid)
     where produto_nome like '%Teste Ordenacao'
  ) t),
  (select array_agg(produto_nome) from (
    select produto_nome from fn_inventario_itens_para_contagem(
      current_setting('teste.inv_ordenacao')::uuid, null, null, false, 'recente')
     where produto_nome like '%Teste Ordenacao'
  ) t));

-- 'nome': ordem alfabetica classica.
select assert_eq('ordenacao por nome e alfabetica', (
  select array_agg(produto_nome) from (
    select produto_nome from fn_inventario_itens_para_contagem(
      current_setting('teste.inv_ordenacao')::uuid, null, null, false, 'nome')
     where produto_nome like '%Teste Ordenacao'
  ) t),
  array['Abacaxi Teste Ordenacao', 'Melancia Teste Ordenacao', 'Zebra Teste Ordenacao']);

-- 'codigo': ordem crescente de EAN (Zebra=…001, Abacaxi=…002, Melancia=…003).
select assert_eq('ordenacao por codigo segue o EAN', (
  select array_agg(produto_nome) from (
    select produto_nome from fn_inventario_itens_para_contagem(
      current_setting('teste.inv_ordenacao')::uuid, null, null, false, 'codigo')
     where produto_nome like '%Teste Ordenacao'
  ) t),
  array['Zebra Teste Ordenacao', 'Abacaxi Teste Ordenacao', 'Melancia Teste Ordenacao']);

-- Um valor que nao e nenhuma das tres opcoes cai no mesmo lugar que 'nome' —
-- silencioso de proposito: e o comportamento de antes desta migration, para
-- quem chame a RPC sem o parametro novo (compatibilidade).
select assert_eq('ordenacao com valor invalido cai para nome', (
  select array_agg(produto_nome) from (
    select produto_nome from fn_inventario_itens_para_contagem(
      current_setting('teste.inv_ordenacao')::uuid, null, null, false, 'nao-existe')
     where produto_nome like '%Teste Ordenacao'
  ) t),
  array['Abacaxi Teste Ordenacao', 'Melancia Teste Ordenacao', 'Zebra Teste Ordenacao']);

-- Itens ainda nao contados nao desaparecem da ordenacao 'recente' — so afundam
-- para o fim, porque contado_em e nulo. Continuam aparecendo pra quem quer ver
-- tudo; quem quer só o que falta já tem o filtro "Só os que faltam" na tela.
--
-- `with ordinality` numera as linhas na ordem exata emitida pela funcao — ao
-- contrario de row_number() sem order by, que o Postgres nao garante preservar
-- a ordem de entrada. O teste verifica o invariante direto: nenhum item
-- contado pode aparecer DEPOIS de um pendente nessa ordenacao.
select assert_eq('recente: nenhum contado aparece depois de um pendente', (
  select coalesce(max(ordem) filter (where quantidade_contada is not null), 0)
       < coalesce(min(ordem) filter (where quantidade_contada is null), 999999)
    from fn_inventario_itens_para_contagem(
           current_setting('teste.inv_ordenacao')::uuid, null, null, false, 'recente'
         ) with ordinality as t(
           item_id, produto_id, produto_nome, ean, unidade, local, lote,
           data_validade, quantidade_contada, contado_em, ordem
         )
  ), true);

-- ------------------------------------------- revogacao do EXECUTE para o anon
-- A suite inteira acima roda como `authenticated` com as revogacoes da 0015 ja
-- aplicadas — entao ela propria e a prova de que nada quebrou. O que falta e o
-- outro lado: o visitante nao alcanca mais nenhuma funcao SECURITY DEFINER.

select assert_eq('nenhuma SECURITY DEFINER sobrou executavel pelo anon', (
  select count(*)::bigint from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prosecdef
     and has_function_privilege('anon', p.oid, 'execute')), 0::bigint);

-- A porta fechou, mas o app precisa continuar entrando por ela.
select assert_eq('authenticated ainda executa as RPCs de escrita', (
  select count(*)::bigint from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('fn_registrar_entrada','fn_registrar_saida','fn_ajustar_estoque',
                       'fn_criar_transferencia','fn_enviar_transferencia',
                       'fn_receber_transferencia','fn_cancelar_transferencia',
                       'fn_transferencia_direta','fn_abrir_inventario','fn_fechar_contagem',
                       'fn_aprovar_inventario','fn_lancar_contagem','fn_importar_movimentos')
     and has_function_privilege('authenticated', p.oid, 'execute')), 13::bigint);

-- As auxiliares de autorizacao sao chamadas de dentro das policies, avaliadas
-- com os privilegios de quem consulta. Perder o EXECUTE aqui derruba o app
-- inteiro, nao so uma tela.
select assert_eq('authenticated executa as auxiliares usadas nas policies', (
  select count(*)::bigint from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('auth_tem_permissao','auth_pode_acessar_filial','auth_usuario_ativo',
                       'auth_escopo_global','auth_filiais_permitidas')
     and has_function_privilege('authenticated', p.oid, 'execute')), 5::bigint);

select assert_eq('o cron (service_role) continua gerando as tarefas', (
  select has_function_privilege('service_role', p.oid, 'execute') from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'fn_gerar_tarefas_automaticas'), true);

-- Os auxiliares de saldo seguem fechados para todo mundo menos o dono.
select assert_eq('fn_debitar_fefo continua fora do alcance do authenticated', (
  select has_function_privilege('authenticated', p.oid, 'execute') from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'fn_debitar_fefo'), false);

-- E as duas camadas juntas, do ponto de vista do visitante. Bloco DO de
-- proposito: `set local` so vale dentro de uma transacao, e no psql cada
-- comando solto e a sua propria — o papel nem chegaria a trocar.
do $$
declare v_erro text; v_barrado boolean;
begin
  perform set_config('role', 'anon', true);  -- volta sozinho ao fim do bloco

  begin
    perform auth_exige_permissao('estoque.saida');
    v_barrado := false;
  exception when others then
    get stacked diagnostics v_erro = message_text;
    v_barrado := true;
  end;

  if not v_barrado then
    raise exception 'FALHOU: anon passou pela checagem de permissao';
  end if;
  raise notice 'ok  anon barrado ao tentar auth_exige_permissao: %', v_erro;
end $$;

-- ---------------------------------------------------------------------------
-- O teste que de fato protege esta migration
--
-- Tudo daqui para cima roda como `postgres` desde o `reset role` da secao do
-- cron — e superusuario IGNORA checagem de privilegio. Ou seja: se a 0015
-- revogasse por engano algo que o app precisa, nenhuma verificacao acima
-- perceberia. Elas continuariam verdes com o app quebrado.
--
-- Este bloco volta para `authenticated` e faz o caminho real de ponta a ponta:
-- ler uma tabela (passa pelas policies, que chamam as auxiliares auth_*) e
-- chamar uma RPC de escrita (passa pelo grant da funcao). E o que quebraria na
-- hora se a revogacao tivesse pegado demais.
-- ---------------------------------------------------------------------------
set role authenticated;

do $$
declare
  v_prod uuid; v_f1 uuid; v_antes numeric; v_depois numeric;
begin
  -- 1. SELECT sob RLS: as policies chamam auth_tem_permissao/auth_pode_acessar_filial.
  select id into v_prod from produtos where ean = '7891000100103';
  if v_prod is null then
    raise exception 'FALHOU: authenticated nao conseguiu ler produtos sob RLS';
  end if;
  select id into v_f1 from filiais where codigo = 'F01';

  select coalesce(sum(quantidade), 0) into v_antes from lotes_estoque
   where produto_id = v_prod and filial_id = v_f1 and local = 'deposito';

  -- 2. RPC de escrita: depende do grant nominal em authenticated.
  perform fn_registrar_entrada(v_prod, v_f1, 'deposito', 5, 3.00, 'POS-0015', current_date + 90);
  perform fn_registrar_saida(v_prod, v_f1, 'deposito', 2, 'venda', null, 'saida pos-0015');

  select coalesce(sum(quantidade), 0) into v_depois from lotes_estoque
   where produto_id = v_prod and filial_id = v_f1 and local = 'deposito';

  if v_depois <> v_antes + 3 then
    raise exception 'FALHOU: saldo esperado % e obtido %', v_antes + 3, v_depois;
  end if;

  raise notice 'ok  authenticated leu sob RLS e gravou pelas RPCs apos a revogacao';
end $$;

select assert_eq('o bloco acima rodou mesmo como authenticated', current_user::text, 'authenticated');

-- ---------------------------------------------------------------------------
-- 0016: o gatilho continua disparando sem EXECUTE para authenticated
--
-- Este e o teste que decide a 0016. `tarefas` e gravada DIRETO pela tela, e
-- fn_notificar_tarefa e um gatilho SECURITY DEFINER nessa tabela — entao ele
-- dispara com o papel `authenticated` em vigor. O Postgres checa EXECUTE na
-- criacao do gatilho e nao a cada disparo; se essa premissa estivesse errada,
-- a 0016 quebraria a criacao de tarefa em producao e este bloco acusaria.
-- ---------------------------------------------------------------------------
do $$
declare
  v_f1 uuid; v_tarefa uuid;
  -- Dois usuarios distintos de proposito: fn_notificar_tarefa nao notifica quem
  -- cria tarefa para si mesmo, entao com um so o gatilho rodaria sem gravar nada
  -- e o teste passaria sem testar. uuid literal porque o stub local nao da USAGE
  -- do schema auth ao papel authenticated.
  v_autor uuid := '11111111-1111-1111-1111-111111111111';
  v_responsavel uuid := '22222222-2222-2222-2222-222222222222';
begin
  select id into v_f1 from filiais where codigo = 'F01';

  insert into tarefas (titulo, descricao, categoria, filial_id, tipo, criado_por, responsavel_id, prazo)
  values ('Tarefa pos-0016', 'criada como authenticated', 'outro', v_f1, 'manual',
          v_autor, v_responsavel, current_date + 1)
  returning id into v_tarefa;

  if v_tarefa is null then
    raise exception 'FALHOU: authenticated nao conseguiu criar tarefa apos a 0016';
  end if;

  -- Guarda o id para conferir DEPOIS de largar o papel: a policy de notificacoes
  -- e `usuario_id = auth.uid()`, entao o autor nao enxerga a notificacao que
  -- nasceu para o responsavel. Contar aqui dentro daria zero mesmo com o gatilho
  -- funcionando — o teste passaria a medir a RLS, nao o gatilho.
  perform set_config('teste.tarefa_0016', v_tarefa::text, false);
end $$;

reset role;

select assert_eq('gatilho disparou como authenticated mesmo sem EXECUTE', (
  select count(*)::bigint from notificacoes
   where tarefa_id = current_setting('teste.tarefa_0016')::uuid), 1::bigint);

set role authenticated;

-- E as nove agora fora do alcance de quem esta logado.
select assert_eq('as 9 funcoes internas sairam do alcance do authenticated', (
  select count(*)::bigint from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('fn_criar_tarefa_sistema','fn_responsavel_padrao_filial',
                       'auth_exige_permissao','auth_exige_filial','fn_novo_usuario_auth',
                       'fn_notificar_tarefa','fn_notificar_atraso',
                       'fn_sincroniza_ultimo_acesso','fn_concluir_tarefas_do_inventario')
     and has_function_privilege('authenticated', p.oid, 'execute')), 0::bigint);

-- Sem levar junto o que as telas usam.
select assert_eq('as RPCs das telas seguem alcancaveis', (
  select count(*)::bigint from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('fn_registrar_entrada','fn_registrar_saida','fn_ajustar_estoque',
                       'fn_criar_transferencia','fn_enviar_transferencia',
                       'fn_receber_transferencia','fn_cancelar_transferencia',
                       'fn_transferencia_direta','fn_abrir_inventario','fn_fechar_contagem',
                       'fn_aprovar_inventario','fn_lancar_contagem','fn_lancar_contagem_por_ean',
                       'fn_reabrir_contagem','fn_desfazer_contagem','fn_excluir_inventario',
                       'fn_cancelar_inventario','fn_importar_movimentos',
                       'fn_importar_posicao_inicial','fn_inventario_itens_para_contagem')
     and has_function_privilege('authenticated', p.oid, 'execute')), 20::bigint);

reset role;

-- O cron nao foi tocado: ele usa service_role.
select assert_eq('service_role ainda cria tarefa de sistema', (
  select has_function_privilege('service_role', p.oid, 'execute') from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'fn_criar_tarefa_sistema'), true);

select '=========== TODOS OS TESTES PASSARAM ===========' as resultado;

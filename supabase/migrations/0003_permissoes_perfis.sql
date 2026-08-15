-- =============================================================================
-- 0003_permissoes_perfis.sql — Catálogo de permissões, perfis padrão e configurações
-- =============================================================================

insert into permissoes (chave, modulo, descricao) values
  ('filiais.gerenciar',        'Filiais',      'Criar, editar e desativar filiais e seus locais'),
  ('perfis.gerenciar',         'Acessos',      'Criar perfis e ajustar permissões'),
  ('usuarios.visualizar',      'Acessos',      'Listar usuários'),
  ('usuarios.gerenciar',       'Acessos',      'Convidar, editar, vincular filiais e desativar usuários'),

  ('produtos.gerenciar',       'Produtos',     'Criar e editar produtos, categorias e fornecedores'),
  ('produtos.importar',        'Produtos',     'Importar produtos e posição inicial de estoque via planilha'),

  ('estoque.visualizar',       'Estoque',      'Consultar saldos por filial, local e lote'),
  ('estoque.entrada',          'Estoque',      'Lançar entradas de estoque'),
  ('estoque.saida',            'Estoque',      'Lançar saídas de estoque'),
  ('estoque.ajustar',          'Estoque',      'Lançar ajustes manuais de saldo'),

  ('transferencias.solicitar', 'Transferências', 'Solicitar transferência entre filiais ou locais'),
  ('transferencias.enviar',    'Transferências', 'Confirmar envio e colocar a transferência em trânsito'),
  ('transferencias.receber',   'Transferências', 'Confirmar recebimento e efetivar a entrada no destino'),
  ('transferencias.aprovar',   'Transferências', 'Aprovar transferências quando a aprovação hierárquica estiver ativa'),
  ('transferencias.cancelar',  'Transferências', 'Cancelar transferências'),

  ('inventario.abrir',         'Inventário',   'Abrir e configurar ciclos de inventário'),
  ('inventario.contar',        'Inventário',   'Lançar contagens no inventário'),
  ('inventario.aprovar',       'Inventário',   'Ver divergências, aprovar e aplicar o ajuste de estoque'),
  ('inventario.cancelar',      'Inventário',   'Cancelar um ciclo de inventário'),

  ('dashboard.filial',         'Dashboard',    'Ver o dashboard da própria filial'),
  ('dashboard.consolidado',    'Dashboard',    'Ver o dashboard consolidado de todas as filiais'),
  ('relatorios.exportar',      'Relatórios',   'Exportar relatórios em Excel e PDF'),

  ('tarefas.criar',            'Atividades',   'Criar tarefas no Kanban'),
  ('tarefas.gerenciar',        'Atividades',   'Editar, reatribuir e excluir tarefas'),

  ('ponto.registrar',          'Ponto',        'Registrar o próprio ponto'),
  ('ponto.gerenciar',          'Ponto',        'Consultar e ajustar o ponto dos colaboradores da filial'),

  ('cafeteria.consumo',        'Cafeteria',    'Registrar consumo de insumos da cafeteria'),

  ('auditoria.visualizar',     'Auditoria',    'Consultar o log de auditoria do sistema'),
  ('configuracoes.gerenciar',  'Sistema',      'Alterar configurações gerais do sistema')
on conflict (chave) do update
  set modulo = excluded.modulo, descricao = excluded.descricao;

-- -----------------------------------------------------------------------------
-- Perfis padrão
-- -----------------------------------------------------------------------------

insert into perfis (chave, nome, descricao, escopo, somente_leitura, sistema) values
  ('admin',     'Administrador / Franqueado',
   'Acesso total a todas as filiais, cadastros, permissões e configurações.',
   'global', false, true),
  ('gerente',   'Gerente de Filial',
   'Gestão completa da própria filial: cadastros, movimentações, inventário, kanban e ponto.',
   'filial', false, true),
  ('operador',  'Operador de Estoque/Loja',
   'Lançamentos do dia a dia e participação na contagem de inventário na própria filial.',
   'filial', false, true),
  ('cafeteria', 'Cafeteria / Barista',
   'Consumo de insumos da cafeteria e solicitação de transferência do depósito.',
   'filial', false, true),
  ('auditor',   'Auditor / Visualizador',
   'Somente leitura de relatórios, dashboard e histórico de todas as filiais.',
   'global', true, true)
on conflict (chave) do update
  set nome = excluded.nome, descricao = excluded.descricao, escopo = excluded.escopo;

-- -----------------------------------------------------------------------------
-- Vínculo perfil → permissões
-- Estes são apenas os padrões iniciais: o franqueado pode ajustar pela tela de
-- Perfis e Permissões sem qualquer alteração de código.
-- -----------------------------------------------------------------------------

-- Administrador: tudo
insert into perfil_permissoes (perfil_id, permissao_chave)
select p.id, pm.chave from perfis p cross join permissoes pm where p.chave = 'admin'
on conflict do nothing;

-- Gerente de Filial
insert into perfil_permissoes (perfil_id, permissao_chave)
select p.id, c.chave
  from perfis p
  cross join (values
    ('usuarios.visualizar'),
    ('produtos.gerenciar'), ('produtos.importar'),
    ('estoque.visualizar'), ('estoque.entrada'), ('estoque.saida'), ('estoque.ajustar'),
    ('transferencias.solicitar'), ('transferencias.enviar'), ('transferencias.receber'),
    ('transferencias.aprovar'), ('transferencias.cancelar'),
    ('inventario.abrir'), ('inventario.contar'), ('inventario.aprovar'), ('inventario.cancelar'),
    ('dashboard.filial'), ('relatorios.exportar'),
    ('tarefas.criar'), ('tarefas.gerenciar'),
    ('ponto.registrar'), ('ponto.gerenciar'),
    ('cafeteria.consumo')
  ) as c(chave)
 where p.chave = 'gerente'
on conflict do nothing;

-- Operador de Estoque/Loja
insert into perfil_permissoes (perfil_id, permissao_chave)
select p.id, c.chave
  from perfis p
  cross join (values
    ('estoque.visualizar'), ('estoque.entrada'), ('estoque.saida'),
    ('transferencias.solicitar'), ('transferencias.enviar'), ('transferencias.receber'),
    ('inventario.contar'),
    ('dashboard.filial'),
    ('tarefas.criar'),
    ('ponto.registrar')
  ) as c(chave)
 where p.chave = 'operador'
on conflict do nothing;

-- Cafeteria / Barista
insert into perfil_permissoes (perfil_id, permissao_chave)
select p.id, c.chave
  from perfis p
  cross join (values
    ('estoque.visualizar'), ('estoque.saida'),
    ('cafeteria.consumo'),
    ('transferencias.solicitar'), ('transferencias.receber'),
    ('inventario.contar'),
    ('tarefas.criar'),
    ('ponto.registrar')
  ) as c(chave)
 where p.chave = 'cafeteria'
on conflict do nothing;

-- Auditor / Visualizador (somente leitura)
insert into perfil_permissoes (perfil_id, permissao_chave)
select p.id, c.chave
  from perfis p
  cross join (values
    ('estoque.visualizar'),
    ('usuarios.visualizar'),
    ('dashboard.filial'), ('dashboard.consolidado'),
    ('relatorios.exportar'),
    ('auditoria.visualizar')
  ) as c(chave)
 where p.chave = 'auditor'
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- Configurações do sistema
-- Cobrem os "pontos em aberto" do documento sem exigir alteração de código.
-- -----------------------------------------------------------------------------

insert into configuracoes (chave, valor, descricao) values
  ('identidade',
   '{"nome_sistema":"Estoque Cacau","subtitulo":"Gestão Multi-Filial","cor_primaria":"#5B2C20","cor_secundaria":"#C9A227","logo_url":null}'::jsonb,
   'Nome e identidade visual exibidos no sistema.'),

  ('transferencia_exige_aprovacao',
   '{"entre_filiais": false, "entre_locais": false}'::jsonb,
   'Quando verdadeiro, a transferência precisa de aprovação (permissão transferencias.aprovar) antes de sair do estoque de origem.'),

  ('ponto_modo',
   '"lembrete"'::jsonb,
   'lembrete = apenas tarefas de cobrança no Kanban; registro = relógio de ponto dentro do sistema.'),

  ('inventario_agendamento',
   '{"ativo": true, "dia_abertura": 1, "dias_para_concluir": 5}'::jsonb,
   'Geração automática do inventário geral mensal e da tarefa de cobrança por filial.'),

  ('alertas_vencimento',
   '{"faixas_dias": [7, 15, 30], "gerar_tarefa_em": 15}'::jsonb,
   'Faixas usadas nos alertas de vencimento e limite que dispara tarefa automática no Kanban.'),

  ('custo_metodo',
   '"medio_ponderado"'::jsonb,
   'Método de custeio do estoque usado nas valorizações.')
on conflict (chave) do nothing;

-- =============================================================================
-- seed.sql — Dados iniciais da operação
--
-- Rode DEPOIS das migrations 0001..0009.
-- Ajuste nomes, códigos e endereços das filiais para os reais antes de rodar.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Filiais — 5 lojas, sendo a matriz com cafeteria integrada.
-- O trigger trg_filiais_locais cria automaticamente depósito, prateleira e,
-- onde possui_cafeteria = true, o estoque da cafeteria.
-- -----------------------------------------------------------------------------

insert into filiais (codigo, nome, cidade, uf, possui_cafeteria) values
  ('F01', 'Matriz',   null, null, true),
  ('F02', 'Filial 2', null, null, false),
  ('F03', 'Filial 3', null, null, false),
  ('F04', 'Filial 4', null, null, false),
  ('F05', 'Filial 5', null, null, false)
on conflict (codigo) do nothing;

-- -----------------------------------------------------------------------------
-- Categorias iniciais do mix de chocolates finos + cafeteria
-- -----------------------------------------------------------------------------

insert into categorias (nome, descricao) values
  ('Bombons',            'Bombons avulsos e caixas'),
  ('Trufas',             'Trufas tradicionais e especiais'),
  ('Barras e Tabletes',  'Barras de chocolate e tabletes'),
  ('Cestas e Presentes', 'Cestas, kits e embalagens presenteáveis'),
  ('Sazonais — Páscoa',  'Ovos de páscoa e itens da linha sazonal'),
  ('Sazonais — Natal',   'Panetones e itens da linha de fim de ano'),
  ('Bebidas',            'Bebidas prontas e achocolatados'),
  ('Insumos Cafeteria',  'Leite, café, xaropes e demais insumos de preparo'),
  ('Descartáveis',       'Copos, tampas, guardanapos e embalagens da cafeteria')
on conflict (nome) do nothing;

-- -----------------------------------------------------------------------------
-- Como criar o primeiro usuário administrador
-- -----------------------------------------------------------------------------
--
-- 1. No painel do Supabase: Authentication > Users > "Add user".
--    Marque "Auto Confirm User" e defina uma senha.
--
-- 2. O trigger trg_auth_user_criado já cria a linha em `usuarios`, mas com o
--    perfil "operador". Promova para administrador rodando o SQL abaixo,
--    trocando o e-mail:
--
--      update usuarios
--         set perfil_id = (select id from perfis where chave = 'admin'),
--             nome = 'Christian'
--       where email = 'seu-email@exemplo.com';
--
-- 3. O perfil "admin" tem escopo global, então já enxerga as 5 filiais sem
--    precisar de vínculo em usuario_filiais.
--
-- Os demais usuários podem ser convidados pela própria tela de Usuários do
-- sistema, que já grava perfil e filiais vinculadas.
-- =============================================================================

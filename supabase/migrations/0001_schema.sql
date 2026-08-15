-- =============================================================================
-- 0001_schema.sql — Estrutura base do Sistema de Gestão de Estoque Multi-Filial
-- Franquia Cacau Show — 5 filiais, 1 com cafeteria integrada
-- =============================================================================

create extension if not exists "pgcrypto";
create extension if not exists "unaccent";

-- -----------------------------------------------------------------------------
-- Tipos enumerados
-- -----------------------------------------------------------------------------

create type tipo_local as enum ('deposito', 'prateleira', 'cafeteria');

create type escopo_perfil as enum ('global', 'filial');

create type unidade_medida as enum ('un', 'cx', 'pct', 'kg', 'g', 'l', 'ml');

create type tipo_movimentacao as enum ('entrada', 'saida', 'transferencia', 'ajuste');

create type motivo_movimentacao as enum (
  -- entradas
  'compra_fornecedor',
  'recebimento_transferencia',
  'ajuste_positivo',
  'devolucao_cliente',
  -- saídas
  'venda',
  'perda',
  'quebra',
  'vencimento',
  'consumo_interno',
  'degustacao',
  'brinde',
  'ajuste_negativo',
  'envio_transferencia',
  -- ambos
  'ajuste_inventario'
);

create type status_transferencia as enum ('solicitada', 'em_transito', 'recebida', 'cancelada');

create type tipo_inventario as enum ('geral', 'parcial');

create type status_inventario as enum (
  'aberto',
  'em_contagem',
  'aguardando_aprovacao',
  'aprovado',
  'cancelado'
);

create type tipo_tarefa as enum ('sistema', 'manual');

create type categoria_tarefa as enum (
  'inventario',
  'ponto',
  'estoque_minimo',
  'vencimento',
  'reposicao',
  'transferencia',
  'outro'
);

create type status_tarefa as enum ('a_fazer', 'em_andamento', 'atrasado', 'concluido', 'cancelado');

create type prioridade_tarefa as enum ('baixa', 'media', 'alta', 'urgente');

create type tipo_registro_ponto as enum ('entrada', 'saida_intervalo', 'volta_intervalo', 'saida');

-- -----------------------------------------------------------------------------
-- Filiais
-- -----------------------------------------------------------------------------

create table filiais (
  id                uuid primary key default gen_random_uuid(),
  codigo            text not null unique,
  nome              text not null,
  endereco          text,
  cidade            text,
  uf                char(2),
  telefone          text,
  possui_cafeteria  boolean not null default false,
  ativo             boolean not null default true,
  criado_em         timestamptz not null default now(),
  atualizado_em     timestamptz not null default now()
);

comment on table filiais is 'Lojas físicas da franquia. possui_cafeteria habilita o local "cafeteria".';

-- Locais válidos em cada filial (deposito e prateleira sempre; cafeteria só onde houver)
create table filial_locais (
  filial_id  uuid not null references filiais(id) on delete cascade,
  local      tipo_local not null,
  ativo      boolean not null default true,
  primary key (filial_id, local)
);

-- -----------------------------------------------------------------------------
-- Perfis e permissões (RBAC configurável, sem alteração de código)
-- -----------------------------------------------------------------------------

create table perfis (
  id            uuid primary key default gen_random_uuid(),
  chave         text not null unique,
  nome          text not null,
  descricao     text,
  escopo        escopo_perfil not null default 'filial',
  somente_leitura boolean not null default false,
  sistema       boolean not null default false, -- perfis de sistema não podem ser excluídos
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

comment on column perfis.escopo is 'global = enxerga todas as filiais; filial = restrito às filiais vinculadas ao usuário.';
comment on column perfis.sistema is 'Perfis marcados como sistema não podem ser excluídos, apenas ter permissões ajustadas.';

create table permissoes (
  chave      text primary key,
  modulo     text not null,
  descricao  text not null
);

comment on table permissoes is 'Catálogo de permissões granulares. Novas permissões são inseridas por migration.';

create table perfil_permissoes (
  perfil_id       uuid not null references perfis(id) on delete cascade,
  permissao_chave text not null references permissoes(chave) on delete cascade,
  primary key (perfil_id, permissao_chave)
);

-- -----------------------------------------------------------------------------
-- Usuários
-- -----------------------------------------------------------------------------

create table usuarios (
  id             uuid primary key references auth.users(id) on delete cascade,
  nome           text not null,
  email          text not null unique,
  telefone       text,
  perfil_id      uuid not null references perfis(id) on delete restrict,
  filial_padrao_id uuid references filiais(id) on delete set null,
  ativo          boolean not null default true,
  ultimo_acesso  timestamptz,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);

comment on table usuarios is 'Perfil de aplicação do usuário; a credencial em si vive em auth.users.';

create table usuario_filiais (
  usuario_id uuid not null references usuarios(id) on delete cascade,
  filial_id  uuid not null references filiais(id) on delete cascade,
  primary key (usuario_id, filial_id)
);

comment on table usuario_filiais is 'Filiais que o usuário pode acessar. Ignorado para perfis de escopo global.';

-- -----------------------------------------------------------------------------
-- Cadastros auxiliares
-- -----------------------------------------------------------------------------

create table categorias (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null unique,
  descricao     text,
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now()
);

create table fornecedores (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null,
  cnpj          text,
  contato       text,
  email         text,
  telefone      text,
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create unique index fornecedores_cnpj_uk on fornecedores(cnpj) where cnpj is not null;

-- -----------------------------------------------------------------------------
-- Produtos
-- -----------------------------------------------------------------------------

create table produtos (
  id                uuid primary key default gen_random_uuid(),
  nome              text not null,
  ean               text,
  sku               text,
  categoria_id      uuid references categorias(id) on delete set null,
  fornecedor_id     uuid references fornecedores(id) on delete set null,
  unidade           unidade_medida not null default 'un',
  valor_custo       numeric(12,4) not null default 0 check (valor_custo >= 0),
  valor_venda       numeric(12,4) not null default 0 check (valor_venda >= 0),
  estoque_minimo    numeric(14,3) not null default 0 check (estoque_minimo >= 0),
  estoque_maximo    numeric(14,3) check (estoque_maximo is null or estoque_maximo >= estoque_minimo),
  controla_validade boolean not null default true,
  insumo_cafeteria  boolean not null default false,
  foto_url          text,
  ativo             boolean not null default true,
  criado_em         timestamptz not null default now(),
  atualizado_em     timestamptz not null default now()
);

comment on column produtos.controla_validade is 'Quando falso, o produto usa um lote único sem data de validade.';
comment on column produtos.insumo_cafeteria is 'Marca insumos de consumo da cafeteria (leite, café, copos).';

create unique index produtos_ean_uk on produtos(ean) where ean is not null;
create unique index produtos_sku_uk on produtos(sku) where sku is not null;
create index produtos_categoria_idx on produtos(categoria_id);
create index produtos_nome_idx on produtos using gin (to_tsvector('portuguese', nome));

-- Filiais em que o produto é comercializado, com limites opcionais por filial
create table produto_filiais (
  produto_id     uuid not null references produtos(id) on delete cascade,
  filial_id      uuid not null references filiais(id) on delete cascade,
  estoque_minimo numeric(14,3) check (estoque_minimo is null or estoque_minimo >= 0),
  estoque_maximo numeric(14,3) check (estoque_maximo is null or estoque_maximo >= 0),
  ativo          boolean not null default true,
  primary key (produto_id, filial_id)
);

comment on table produto_filiais is 'Limites por filial sobrescrevem os limites globais do produto quando preenchidos.';

-- -----------------------------------------------------------------------------
-- Estoque por lote (saldo)
-- -----------------------------------------------------------------------------

create table lotes_estoque (
  id             uuid primary key default gen_random_uuid(),
  produto_id     uuid not null references produtos(id) on delete restrict,
  filial_id      uuid not null references filiais(id) on delete restrict,
  local          tipo_local not null,
  lote           text not null default 'UNICO',
  data_validade  date,
  quantidade     numeric(14,3) not null default 0 check (quantidade >= 0),
  custo_unitario numeric(12,4) not null default 0,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);

comment on table lotes_estoque is 'Saldo de estoque por produto/filial/local/lote. Base do controle FEFO.';

-- Uma linha por combinação; data_validade nula tratada como valor único via coalesce
create unique index lotes_estoque_uk
  on lotes_estoque (produto_id, filial_id, local, lote, coalesce(data_validade, '9999-12-31'::date));

create index lotes_estoque_filial_local_idx on lotes_estoque(filial_id, local);
create index lotes_estoque_produto_idx on lotes_estoque(produto_id);
create index lotes_estoque_validade_idx on lotes_estoque(data_validade)
  where data_validade is not null and quantidade > 0;

-- -----------------------------------------------------------------------------
-- Transferências (entre filiais e entre locais da mesma filial)
-- -----------------------------------------------------------------------------

create sequence transferencias_codigo_seq;

create table transferencias (
  id                 uuid primary key default gen_random_uuid(),
  codigo             text not null unique default 'TR-' || lpad(nextval('transferencias_codigo_seq')::text, 6, '0'),
  filial_origem_id   uuid not null references filiais(id) on delete restrict,
  local_origem       tipo_local not null,
  filial_destino_id  uuid not null references filiais(id) on delete restrict,
  local_destino      tipo_local not null,
  status             status_transferencia not null default 'solicitada',
  solicitado_por     uuid references usuarios(id) on delete set null,
  solicitado_em      timestamptz not null default now(),
  enviado_por        uuid references usuarios(id) on delete set null,
  enviado_em         timestamptz,
  recebido_por       uuid references usuarios(id) on delete set null,
  recebido_em        timestamptz,
  cancelado_por      uuid references usuarios(id) on delete set null,
  cancelado_em       timestamptz,
  motivo_cancelamento text,
  observacao         text,
  criado_em          timestamptz not null default now(),
  atualizado_em      timestamptz not null default now(),
  constraint transferencia_origem_destino_distintos
    check (filial_origem_id <> filial_destino_id or local_origem <> local_destino)
);

create index transferencias_origem_idx on transferencias(filial_origem_id, status);
create index transferencias_destino_idx on transferencias(filial_destino_id, status);

create table transferencia_itens (
  id                    uuid primary key default gen_random_uuid(),
  transferencia_id      uuid not null references transferencias(id) on delete cascade,
  produto_id            uuid not null references produtos(id) on delete restrict,
  lote_origem_id        uuid references lotes_estoque(id) on delete set null,
  lote                  text not null default 'UNICO',
  data_validade         date,
  custo_unitario        numeric(12,4) not null default 0,
  quantidade_solicitada numeric(14,3) not null check (quantidade_solicitada > 0),
  quantidade_enviada    numeric(14,3) check (quantidade_enviada >= 0),
  quantidade_recebida   numeric(14,3) check (quantidade_recebida >= 0)
);

create index transferencia_itens_transf_idx on transferencia_itens(transferencia_id);

-- -----------------------------------------------------------------------------
-- Movimentações (trilha de auditoria de estoque)
-- -----------------------------------------------------------------------------

create table movimentacoes (
  id                 uuid primary key default gen_random_uuid(),
  tipo               tipo_movimentacao not null,
  motivo             motivo_movimentacao not null,
  produto_id         uuid not null references produtos(id) on delete restrict,
  quantidade         numeric(14,3) not null check (quantidade > 0),
  custo_unitario     numeric(12,4) not null default 0,
  lote               text,
  data_validade      date,
  filial_origem_id   uuid references filiais(id) on delete set null,
  local_origem       tipo_local,
  filial_destino_id  uuid references filiais(id) on delete set null,
  local_destino      tipo_local,
  usuario_id         uuid references usuarios(id) on delete set null,
  transferencia_id   uuid references transferencias(id) on delete set null,
  inventario_id      uuid,
  anexo_url          text,
  observacao         text,
  data_hora          timestamptz not null default now()
);

comment on table movimentacoes is 'Registro imutável de toda alteração de saldo. Nunca deve ser editado ou apagado.';

create index movimentacoes_produto_idx on movimentacoes(produto_id, data_hora desc);
create index movimentacoes_origem_idx on movimentacoes(filial_origem_id, data_hora desc);
create index movimentacoes_destino_idx on movimentacoes(filial_destino_id, data_hora desc);
create index movimentacoes_data_idx on movimentacoes(data_hora desc);

-- -----------------------------------------------------------------------------
-- Inventário
-- -----------------------------------------------------------------------------

create sequence inventarios_codigo_seq;

create table inventarios (
  id             uuid primary key default gen_random_uuid(),
  codigo         text not null unique default 'INV-' || lpad(nextval('inventarios_codigo_seq')::text, 6, '0'),
  filial_id      uuid not null references filiais(id) on delete restrict,
  tipo           tipo_inventario not null default 'geral',
  descricao      text,
  locais         tipo_local[] not null default array['deposito','prateleira']::tipo_local[],
  categorias_ids uuid[],
  competencia    date, -- mês de referência para o inventário mensal
  status         status_inventario not null default 'aberto',
  responsavel_id uuid references usuarios(id) on delete set null,
  aberto_em      timestamptz not null default now(),
  fechado_em     timestamptz,
  aprovado_por   uuid references usuarios(id) on delete set null,
  aprovado_em    timestamptz,
  observacao     text,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);

comment on column inventarios.categorias_ids is 'Restringe o inventário parcial a categorias específicas. Nulo = todas.';
comment on column inventarios.competencia is 'Mês de referência (dia 1) usado para garantir um inventário geral por mês/filial.';

-- Um único inventário geral por filial/competência
create unique index inventarios_geral_competencia_uk
  on inventarios(filial_id, competencia)
  where tipo = 'geral' and status <> 'cancelado';

create index inventarios_filial_idx on inventarios(filial_id, status);

alter table movimentacoes
  add constraint movimentacoes_inventario_fk
  foreign key (inventario_id) references inventarios(id) on delete set null;

create table inventario_itens (
  id                 uuid primary key default gen_random_uuid(),
  inventario_id      uuid not null references inventarios(id) on delete cascade,
  produto_id         uuid not null references produtos(id) on delete restrict,
  local              tipo_local not null,
  lote               text not null default 'UNICO',
  data_validade      date,
  quantidade_sistema numeric(14,3) not null default 0,
  quantidade_contada numeric(14,3) check (quantidade_contada >= 0),
  custo_unitario     numeric(12,4) not null default 0,
  contado_por        uuid references usuarios(id) on delete set null,
  contado_em         timestamptz,
  observacao         text,
  divergencia_quantidade numeric(14,3)
    generated always as (coalesce(quantidade_contada, 0) - quantidade_sistema) stored,
  divergencia_valor numeric(16,4)
    generated always as ((coalesce(quantidade_contada, 0) - quantidade_sistema) * custo_unitario) stored
);

comment on column inventario_itens.quantidade_sistema is
  'Congelado na abertura do inventário. Nunca exposto ao contador antes do fechamento (contagem cega).';

create unique index inventario_itens_uk
  on inventario_itens (inventario_id, produto_id, local, lote, coalesce(data_validade, '9999-12-31'::date));

create index inventario_itens_inventario_idx on inventario_itens(inventario_id);

-- -----------------------------------------------------------------------------
-- Kanban de atividades
-- -----------------------------------------------------------------------------

create table tarefas (
  id             uuid primary key default gen_random_uuid(),
  titulo         text not null,
  descricao      text,
  tipo           tipo_tarefa not null default 'manual',
  categoria      categoria_tarefa not null default 'outro',
  filial_id      uuid references filiais(id) on delete cascade,
  responsavel_id uuid references usuarios(id) on delete set null,
  criado_por     uuid references usuarios(id) on delete set null,
  status         status_tarefa not null default 'a_fazer',
  prioridade     prioridade_tarefa not null default 'media',
  prazo          date,
  concluido_em   timestamptz,
  ordem          integer not null default 0,
  -- vínculo opcional com a entidade que originou a tarefa (evita duplicar tarefas automáticas)
  origem_tipo    text,
  origem_id      text,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);

comment on column tarefas.origem_tipo is 'Ex.: inventario, produto_minimo, produto_vencimento, ponto. Usado para deduplicar tarefas automáticas.';

create unique index tarefas_origem_uk on tarefas(origem_tipo, origem_id)
  where origem_tipo is not null and origem_id is not null;

create index tarefas_filial_status_idx on tarefas(filial_id, status);
create index tarefas_responsavel_idx on tarefas(responsavel_id, status);
create index tarefas_prazo_idx on tarefas(prazo) where status not in ('concluido', 'cancelado');

create table tarefa_comentarios (
  id         uuid primary key default gen_random_uuid(),
  tarefa_id  uuid not null references tarefas(id) on delete cascade,
  usuario_id uuid references usuarios(id) on delete set null,
  texto      text not null,
  criado_em  timestamptz not null default now()
);

create index tarefa_comentarios_tarefa_idx on tarefa_comentarios(tarefa_id, criado_em);

create table tarefa_anexos (
  id         uuid primary key default gen_random_uuid(),
  tarefa_id  uuid not null references tarefas(id) on delete cascade,
  usuario_id uuid references usuarios(id) on delete set null,
  nome       text not null,
  url        text not null,
  tamanho    bigint,
  criado_em  timestamptz not null default now()
);

create index tarefa_anexos_tarefa_idx on tarefa_anexos(tarefa_id);

-- -----------------------------------------------------------------------------
-- Notificações
-- -----------------------------------------------------------------------------

create table notificacoes (
  id         uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references usuarios(id) on delete cascade,
  titulo     text not null,
  mensagem   text,
  link       text,
  tarefa_id  uuid references tarefas(id) on delete cascade,
  lida       boolean not null default false,
  lida_em    timestamptz,
  criado_em  timestamptz not null default now()
);

create index notificacoes_usuario_idx on notificacoes(usuario_id, lida, criado_em desc);

-- Inscrições de web push (Fase 5)
create table push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references usuarios(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  criado_em  timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Controle de ponto (dados pessoais — acesso restrito, LGPD)
-- -----------------------------------------------------------------------------

create table registros_ponto (
  id          uuid primary key default gen_random_uuid(),
  usuario_id  uuid not null references usuarios(id) on delete cascade,
  filial_id   uuid not null references filiais(id) on delete restrict,
  tipo        tipo_registro_ponto not null,
  data_hora   timestamptz not null default now(),
  registrado_por uuid references usuarios(id) on delete set null,
  observacao  text,
  criado_em   timestamptz not null default now()
);

comment on table registros_ponto is
  'Dado pessoal de colaborador (LGPD). Acesso restrito a gestores da filial e administradores.';

create index registros_ponto_usuario_idx on registros_ponto(usuario_id, data_hora desc);
create index registros_ponto_filial_idx on registros_ponto(filial_id, data_hora desc);

-- -----------------------------------------------------------------------------
-- Auditoria e configurações
-- -----------------------------------------------------------------------------

create table log_auditoria (
  id           bigserial primary key,
  usuario_id   uuid references usuarios(id) on delete set null,
  acao         text not null,
  tabela       text not null,
  registro_id  text,
  dados_antes  jsonb,
  dados_depois jsonb,
  criado_em    timestamptz not null default now()
);

create index log_auditoria_tabela_idx on log_auditoria(tabela, criado_em desc);
create index log_auditoria_usuario_idx on log_auditoria(usuario_id, criado_em desc);

create table configuracoes (
  chave         text primary key,
  valor         jsonb not null,
  descricao     text,
  atualizado_em timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Trigger genérico de atualizado_em
-- -----------------------------------------------------------------------------

create or replace function fn_set_atualizado_em()
returns trigger
language plpgsql
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'filiais', 'perfis', 'usuarios', 'fornecedores', 'produtos',
    'lotes_estoque', 'transferencias', 'inventarios', 'tarefas'
  ]
  loop
    execute format(
      'create trigger trg_%1$s_atualizado_em before update on %1$s
         for each row execute function fn_set_atualizado_em()', t);
  end loop;
end;
$$;

-- Mantém filial_locais coerente com possui_cafeteria
create or replace function fn_sincroniza_filial_locais()
returns trigger
language plpgsql
as $$
begin
  insert into filial_locais (filial_id, local)
  values (new.id, 'deposito'), (new.id, 'prateleira')
  on conflict do nothing;

  if new.possui_cafeteria then
    insert into filial_locais (filial_id, local) values (new.id, 'cafeteria')
    on conflict do nothing;
  else
    delete from filial_locais
     where filial_id = new.id
       and local = 'cafeteria'
       and not exists (
         select 1 from lotes_estoque
          where filial_id = new.id and local = 'cafeteria' and quantidade > 0
       );
  end if;

  return new;
end;
$$;

create trigger trg_filiais_locais
  after insert or update of possui_cafeteria on filiais
  for each row execute function fn_sincroniza_filial_locais();

-- Impede lançar estoque em um local que a filial não possui
create or replace function fn_valida_local_filial()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1 from filial_locais
     where filial_id = new.filial_id and local = new.local and ativo
  ) then
    raise exception 'A filial % não possui o local %', new.filial_id, new.local
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger trg_lotes_estoque_valida_local
  before insert or update of filial_id, local on lotes_estoque
  for each row execute function fn_valida_local_filial();

-- Movimentações são imutáveis
create or replace function fn_bloqueia_alteracao()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Registros de % não podem ser alterados ou removidos.', tg_table_name
    using errcode = 'insufficient_privilege';
end;
$$;

create trigger trg_movimentacoes_imutavel
  before update or delete on movimentacoes
  for each row execute function fn_bloqueia_alteracao();

create trigger trg_log_auditoria_imutavel
  before update or delete on log_auditoria
  for each row execute function fn_bloqueia_alteracao();

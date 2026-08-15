-- Stubs mínimos do ambiente Supabase para validar as migrations num Postgres puro.
-- NÃO faz parte do projeto — existe só para conferir sintaxe e lógica.

-- Roles são objetos do cluster, não do banco: só cria se ainda não existirem.
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated', 'service_role'] loop
    if not exists (select 1 from pg_roles where rolname = r) then
      execute format('create role %I nologin', r);
    end if;
  end loop;
end $$;

create schema auth;
create schema storage;

create table auth.users (
  id                 uuid primary key default gen_random_uuid(),
  email              text,
  raw_user_meta_data jsonb default '{}'::jsonb
);

-- No Supabase, auth.uid() lê o claim "sub" do JWT. Aqui devolve uma GUC
-- que o teste pode setar com set_config('teste.uid', ...).
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('teste.uid', true), '')::uuid;
$$;

create table storage.buckets (
  id                 text primary key,
  name               text not null,
  public             boolean default false,
  file_size_limit    bigint,
  allowed_mime_types text[]
);

create table storage.objects (
  id        uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name      text,
  owner     uuid
);

alter table storage.objects enable row level security;

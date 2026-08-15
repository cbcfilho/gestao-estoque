-- =============================================================================
-- 0009_storage.sql — Buckets de arquivos e suas políticas
--
-- Convenção de caminho: <filial_id>/<resto-do-caminho>. É o que permite
-- amarrar o arquivo à filial e reaproveitar auth_pode_acessar_filial().
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('notas-fiscais', 'notas-fiscais', false, 10485760,
   array['image/jpeg','image/png','image/webp','image/heic','application/pdf']),
  ('produtos', 'produtos', true, 5242880,
   array['image/jpeg','image/png','image/webp']),
  ('anexos-tarefas', 'anexos-tarefas', false, 10485760,
   array['image/jpeg','image/png','image/webp','image/heic','application/pdf',
         'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','text/csv'])
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- Notas fiscais — privadas, restritas à filial dona do arquivo
-- -----------------------------------------------------------------------------

create policy "notas fiscais: leitura por filial"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'notas-fiscais'
    and auth_pode_acessar_filial(nullif(split_part(name, '/', 1), '')::uuid)
  );

create policy "notas fiscais: upload por quem lança entrada"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'notas-fiscais'
    and auth_tem_permissao('estoque.entrada')
    and auth_pode_acessar_filial(nullif(split_part(name, '/', 1), '')::uuid)
  );

create policy "notas fiscais: exclusão pelo dono do upload"
  on storage.objects for delete to authenticated
  using (bucket_id = 'notas-fiscais' and owner = auth.uid());

-- -----------------------------------------------------------------------------
-- Fotos de produto — bucket público (só imagem de catálogo), escrita controlada
-- -----------------------------------------------------------------------------

create policy "fotos de produto: escrita com permissão de cadastro"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'produtos' and auth_tem_permissao('produtos.gerenciar'));

create policy "fotos de produto: atualização com permissão de cadastro"
  on storage.objects for update to authenticated
  using (bucket_id = 'produtos' and auth_tem_permissao('produtos.gerenciar'))
  with check (bucket_id = 'produtos' and auth_tem_permissao('produtos.gerenciar'));

create policy "fotos de produto: exclusão com permissão de cadastro"
  on storage.objects for delete to authenticated
  using (bucket_id = 'produtos' and auth_tem_permissao('produtos.gerenciar'));

-- -----------------------------------------------------------------------------
-- Anexos de tarefas — privados, restritos à filial da tarefa
-- -----------------------------------------------------------------------------

create policy "anexos de tarefa: leitura por filial"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'anexos-tarefas'
    and (
      auth_escopo_global()
      or auth_pode_acessar_filial(nullif(split_part(name, '/', 1), '')::uuid)
    )
  );

create policy "anexos de tarefa: upload por usuário ativo"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'anexos-tarefas'
    and auth_usuario_ativo()
    and (
      auth_escopo_global()
      or auth_pode_acessar_filial(nullif(split_part(name, '/', 1), '')::uuid)
    )
  );

create policy "anexos de tarefa: exclusão pelo dono do upload"
  on storage.objects for delete to authenticated
  using (bucket_id = 'anexos-tarefas' and owner = auth.uid());

import type { Metadata } from "next";

import { GestaoUsuarios } from "./gestao";
import { CabecalhoPagina } from "@/components/ui/estados";
import { exigirPermissao } from "@/lib/auth";
import { PERMISSOES } from "@/lib/permissoes";
import { supabaseServidor } from "@/lib/supabase/server";
import type { Filial, Perfil, Usuario } from "@/types/database";

export const metadata: Metadata = { title: "Usuários" };

export interface UsuarioListagem extends Usuario {
  perfil: Pick<Perfil, "id" | "nome" | "chave" | "escopo">;
  filiais: string[];
}

export default async function PaginaUsuarios() {
  const sessao = await exigirPermissao(PERMISSOES.usuariosGerenciar);
  const supabase = await supabaseServidor();

  const [{ data: usuariosData }, { data: perfisData }, { data: filiaisData }, { data: vinculos }] =
    await Promise.all([
      supabase
        .from("usuarios")
        .select("*, perfil:perfis(id, nome, chave, escopo)")
        .order("nome"),
      supabase.from("perfis").select("*").order("nome"),
      supabase.from("filiais").select("*").eq("ativo", true).order("nome"),
      supabase.from("usuario_filiais").select("usuario_id, filial_id"),
    ]);

  const porUsuario = new Map<string, string[]>();
  for (const v of vinculos ?? []) {
    const lista = porUsuario.get(v.usuario_id as string) ?? [];
    lista.push(v.filial_id as string);
    porUsuario.set(v.usuario_id as string, lista);
  }

  const usuarios = ((usuariosData ?? []) as (Usuario & {
    perfil: Pick<Perfil, "id" | "nome" | "chave" | "escopo">;
  })[]).map((u) => ({ ...u, filiais: porUsuario.get(u.id) ?? [] }));

  return (
    <div className="flex flex-col gap-5">
      <CabecalhoPagina
        titulo="Usuários"
        descricao="Convide colaboradores, defina o perfil de acesso e as filiais que cada um enxerga."
      />

      <GestaoUsuarios
        usuarios={usuarios}
        perfis={(perfisData ?? []) as Perfil[]}
        filiais={(filiaisData ?? []) as Filial[]}
        usuarioAtualId={sessao.id}
        escopoGlobal={sessao.perfil.escopo === "global"}
      />
    </div>
  );
}

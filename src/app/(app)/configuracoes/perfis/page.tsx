import type { Metadata } from "next";

import { GestaoPerfis } from "./gestao";
import { Alerta, CabecalhoPagina } from "@/components/ui/estados";
import { exigirPermissao } from "@/lib/auth";
import { PERMISSOES } from "@/lib/permissoes";
import { supabaseServidor } from "@/lib/supabase/server";
import type { Perfil, Permissao } from "@/types/database";

export const metadata: Metadata = { title: "Perfis e permissões" };

export default async function PaginaPerfis() {
  const sessao = await exigirPermissao(PERMISSOES.perfisGerenciar);
  const supabase = await supabaseServidor();

  const [{ data: perfis }, { data: permissoes }, { data: vinculos }, { data: contagem }] =
    await Promise.all([
      supabase.from("perfis").select("*").order("escopo").order("nome"),
      supabase.from("permissoes").select("*").order("modulo").order("chave"),
      supabase.from("perfil_permissoes").select("perfil_id, permissao_chave"),
      supabase.from("usuarios").select("perfil_id"),
    ]);

  const porPerfil = new Map<string, string[]>();
  for (const v of vinculos ?? []) {
    const lista = porPerfil.get(v.perfil_id as string) ?? [];
    lista.push(v.permissao_chave as string);
    porPerfil.set(v.perfil_id as string, lista);
  }

  const usuariosPorPerfil = new Map<string, number>();
  for (const u of contagem ?? []) {
    const id = u.perfil_id as string;
    usuariosPorPerfil.set(id, (usuariosPorPerfil.get(id) ?? 0) + 1);
  }

  return (
    <div className="flex flex-col gap-5">
      <CabecalhoPagina
        titulo="Perfis e permissões"
        descricao="Monte o acesso de cada função da sua operação. Nada aqui exige alteração de código."
      />

      <Alerta tom="info" titulo="Como funciona">
        O perfil de <strong>escopo global</strong> enxerga todas as filiais; o de{" "}
        <strong>escopo filial</strong> só enxerga aquelas às quais o usuário está vinculado. As
        permissões abaixo definem o que ele pode fazer dentro desse escopo. Você só consegue
        conceder permissões que o seu próprio perfil já tem.
      </Alerta>

      <GestaoPerfis
        perfis={(perfis ?? []) as Perfil[]}
        permissoes={(permissoes ?? []) as Permissao[]}
        permissoesPorPerfil={Object.fromEntries(porPerfil)}
        usuariosPorPerfil={Object.fromEntries(usuariosPorPerfil)}
        minhasPermissoes={sessao.permissoes}
      />
    </div>
  );
}

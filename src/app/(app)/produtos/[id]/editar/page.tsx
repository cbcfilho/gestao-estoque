import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { FormularioProduto } from "@/components/produtos/formulario-produto";
import { CabecalhoPagina } from "@/components/ui/estados";
import { exigirPermissao } from "@/lib/auth";
import { PERMISSOES } from "@/lib/permissoes";
import { supabaseServidor } from "@/lib/supabase/server";
import type { Categoria, Filial, Fornecedor, Produto } from "@/types/database";

export const metadata: Metadata = { title: "Editar produto" };

export default async function PaginaEditarProduto({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await exigirPermissao(PERMISSOES.produtosGerenciar);

  const supabase = await supabaseServidor();

  const [{ data: produto }, { data: vinculos }, { data: categorias }, { data: fornecedores }, { data: filiais }] =
    await Promise.all([
      supabase.from("produtos").select("*").eq("id", id).maybeSingle(),
      supabase.from("produto_filiais").select("filial_id").eq("produto_id", id),
      supabase.from("categorias").select("id, nome").eq("ativo", true).order("nome"),
      supabase.from("fornecedores").select("id, nome").eq("ativo", true).order("nome"),
      supabase.from("filiais").select("*").eq("ativo", true).order("nome"),
    ]);

  if (!produto) notFound();

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <CabecalhoPagina titulo="Editar produto" descricao={(produto as Produto).nome} />

      <FormularioProduto
        produto={produto as Produto}
        filiaisVinculadas={(vinculos ?? []).map((v) => v.filial_id as string)}
        categorias={(categorias ?? []) as Pick<Categoria, "id" | "nome">[]}
        fornecedores={(fornecedores ?? []) as Pick<Fornecedor, "id" | "nome">[]}
        filiais={(filiais ?? []) as Filial[]}
      />
    </div>
  );
}

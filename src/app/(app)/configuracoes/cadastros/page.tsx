import type { Metadata } from "next";

import { GestaoCadastros } from "./gestao";
import { CabecalhoPagina } from "@/components/ui/estados";
import { exigirPermissao } from "@/lib/auth";
import { PERMISSOES } from "@/lib/permissoes";
import { supabaseServidor } from "@/lib/supabase/server";
import type { Categoria, Fornecedor } from "@/types/database";

export const metadata: Metadata = { title: "Categorias e fornecedores" };

export default async function PaginaCadastros() {
  await exigirPermissao(PERMISSOES.produtosGerenciar);
  const supabase = await supabaseServidor();

  const [{ data: categorias }, { data: fornecedores }, { data: contagem }] = await Promise.all([
    supabase.from("categorias").select("*").order("nome"),
    supabase.from("fornecedores").select("*").order("nome"),
    supabase.from("produtos").select("categoria_id, fornecedor_id"),
  ]);

  const porCategoria = new Map<string, number>();
  const porFornecedor = new Map<string, number>();

  for (const p of contagem ?? []) {
    if (p.categoria_id) {
      porCategoria.set(p.categoria_id as string, (porCategoria.get(p.categoria_id as string) ?? 0) + 1);
    }
    if (p.fornecedor_id) {
      porFornecedor.set(
        p.fornecedor_id as string,
        (porFornecedor.get(p.fornecedor_id as string) ?? 0) + 1,
      );
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <CabecalhoPagina
        titulo="Categorias e fornecedores"
        descricao="Organizam o catálogo e alimentam os filtros de inventário e relatórios."
      />

      <GestaoCadastros
        categorias={(categorias ?? []) as Categoria[]}
        fornecedores={(fornecedores ?? []) as Fornecedor[]}
        produtosPorCategoria={Object.fromEntries(porCategoria)}
        produtosPorFornecedor={Object.fromEntries(porFornecedor)}
      />
    </div>
  );
}

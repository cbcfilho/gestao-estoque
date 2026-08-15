import type { Metadata } from "next";

import { FormularioProduto } from "@/components/produtos/formulario-produto";
import { CabecalhoPagina } from "@/components/ui/estados";
import { exigirPermissao } from "@/lib/auth";
import { PERMISSOES } from "@/lib/permissoes";
import { supabaseServidor } from "@/lib/supabase/server";
import type { Categoria, Filial, Fornecedor } from "@/types/database";

export const metadata: Metadata = { title: "Novo produto" };

export default async function PaginaNovoProduto() {
  await exigirPermissao(PERMISSOES.produtosGerenciar);
  const supabase = await supabaseServidor();

  const [{ data: categorias }, { data: fornecedores }, { data: filiais }] = await Promise.all([
    supabase.from("categorias").select("id, nome").eq("ativo", true).order("nome"),
    supabase.from("fornecedores").select("id, nome").eq("ativo", true).order("nome"),
    supabase.from("filiais").select("*").eq("ativo", true).order("nome"),
  ]);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <CabecalhoPagina
        titulo="Novo produto"
        descricao="O produto entra no catálogo de toda a rede; escolha abaixo em quais filiais ele é vendido."
      />

      <FormularioProduto
        categorias={(categorias ?? []) as Pick<Categoria, "id" | "nome">[]}
        fornecedores={(fornecedores ?? []) as Pick<Fornecedor, "id" | "nome">[]}
        filiais={(filiais ?? []) as Filial[]}
      />
    </div>
  );
}

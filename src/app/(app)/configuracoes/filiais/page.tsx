import type { Metadata } from "next";

import { GestaoFiliais } from "./gestao";
import { CabecalhoPagina } from "@/components/ui/estados";
import { exigirPermissao } from "@/lib/auth";
import { obterFiliaisComLocais } from "@/lib/filiais";
import { PERMISSOES } from "@/lib/permissoes";

export const metadata: Metadata = { title: "Filiais" };

export default async function PaginaFiliais() {
  await exigirPermissao(PERMISSOES.filiaisGerenciar);
  const filiais = await obterFiliaisComLocais();

  return (
    <div className="flex flex-col gap-5">
      <CabecalhoPagina
        titulo="Filiais"
        descricao="Cada filial tem depósito e prateleira. O estoque da cafeteria aparece só onde ela existe."
      />
      <GestaoFiliais filiais={filiais} />
    </div>
  );
}

import type { Metadata } from "next";

import { Importador } from "./importador";
import { CabecalhoPagina } from "@/components/ui/estados";
import { exigirPermissao } from "@/lib/auth";
import { obterFiliaisComLocais } from "@/lib/filiais";
import { obterFilialAtiva } from "@/lib/filial";
import { PERMISSOES } from "@/lib/permissoes";

export const metadata: Metadata = { title: "Importar planilha" };

export default async function PaginaImportar() {
  const sessao = await exigirPermissao(PERMISSOES.produtosImportar);
  const [filiais, filialAtiva] = await Promise.all([
    obterFiliaisComLocais(),
    obterFilialAtiva(sessao),
  ]);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <CabecalhoPagina
        titulo="Importar por planilha"
        descricao="O caminho rápido para sair da planilha e entrar no sistema: primeiro o catálogo, depois a posição inicial de estoque."
      />

      <Importador filiais={filiais} filialInicialId={filialAtiva?.id ?? filiais[0]?.id ?? ""} />
    </div>
  );
}

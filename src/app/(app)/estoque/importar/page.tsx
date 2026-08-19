import type { Metadata } from "next";

import { ImportadorMovimentos } from "./importador";
import { CabecalhoPagina, EstadoVazio } from "@/components/ui/estados";
import { exigirPermissao } from "@/lib/auth";
import { obterFiliaisComLocais } from "@/lib/filiais";
import { obterFilialAtiva } from "@/lib/filial";
import { PERMISSOES } from "@/lib/permissoes";

export const metadata: Metadata = { title: "Importar movimentação" };

export default async function PaginaImportarMovimentos() {
  const sessao = await exigirPermissao(PERMISSOES.estoqueImportar);
  const [filiais, filialAtiva] = await Promise.all([
    obterFiliaisComLocais(),
    obterFilialAtiva(sessao),
  ]);

  if (filiais.length === 0) {
    return <EstadoVazio titulo="Nenhuma filial disponível" />;
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <CabecalhoPagina
        titulo="Importar movimentação"
        descricao="Entradas e saídas do dia, vindas da planilha exportada do sistema atual."
      />

      <ImportadorMovimentos
        filiais={filiais}
        filialInicialId={filialAtiva?.id ?? filiais[0].id}
      />
    </div>
  );
}

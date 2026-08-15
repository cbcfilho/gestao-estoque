import type { Metadata } from "next";

import { FormularioSaida } from "./formulario";
import { CabecalhoPagina, EstadoVazio } from "@/components/ui/estados";
import { exigirPermissao } from "@/lib/auth";
import { obterFiliaisComLocais } from "@/lib/filiais";
import { obterFilialAtiva } from "@/lib/filial";
import { PERMISSOES } from "@/lib/permissoes";
import type { MotivoMovimentacao } from "@/types/database";

export const metadata: Metadata = { title: "Saída de estoque" };

export default async function PaginaSaida({
  searchParams,
}: {
  searchParams: Promise<{ motivo?: string }>;
}) {
  const sessao = await exigirPermissao(PERMISSOES.estoqueSaida);
  const [{ motivo }, filiais, filialAtiva] = await Promise.all([
    searchParams,
    obterFiliaisComLocais(),
    obterFilialAtiva(sessao),
  ]);

  if (filiais.length === 0) {
    return (
      <EstadoVazio
        titulo="Nenhuma filial disponível"
        descricao="Seu usuário ainda não está vinculado a nenhuma filial ativa."
      />
    );
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <CabecalhoPagina
        titulo="Saída de estoque"
        descricao="Venda, perda, quebra, vencimento ou consumo. Por padrão sai primeiro o lote que vence antes (FEFO)."
      />

      <FormularioSaida
        filiais={filiais}
        filialInicialId={filialAtiva?.id ?? filiais[0].id}
        motivoInicial={(motivo as MotivoMovimentacao) ?? "venda"}
      />
    </div>
  );
}

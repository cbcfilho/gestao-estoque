"use client";

import { useEffect, useState } from "react";

import { listarLotesDisponiveis } from "@/actions/estoque";

export interface LoteDisponivel {
  id: string;
  lote: string;
  data_validade: string | null;
  quantidade: number;
}

/**
 * Lotes com saldo de um produto num local.
 *
 * O resultado guarda a chave (produto+filial+local) a que pertence. Assim,
 * ao trocar de produto, a lista some na hora porque a chave deixa de bater —
 * sem precisar de um efeito extra só para "limpar" o estado anterior.
 */
export function useLotesDisponiveis(
  produtoId: string | null | undefined,
  filialId: string,
  local: string,
): { lotes: LoteDisponivel[]; carregando: boolean; saldo: number } {
  const chave = produtoId ? `${produtoId}|${filialId}|${local}` : "";
  const [resultado, setResultado] = useState<{ chave: string; itens: LoteDisponivel[] }>({
    chave: "",
    itens: [],
  });

  useEffect(() => {
    if (!produtoId) return;

    let cancelado = false;

    void listarLotesDisponiveis(produtoId, filialId, local).then((r) => {
      if (cancelado) return;
      setResultado({ chave, itens: r.ok ? r.dados : [] });
    });

    return () => {
      cancelado = true;
    };
  }, [chave, produtoId, filialId, local]);

  const atual = resultado.chave === chave ? resultado.itens : [];

  return {
    lotes: atual,
    carregando: Boolean(chave) && resultado.chave !== chave,
    saldo: atual.reduce((total, lote) => total + Number(lote.quantidade), 0),
  };
}

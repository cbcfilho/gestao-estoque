"use client";

import { Check, ChevronDown, Store } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { definirFilialAtiva } from "@/actions/filial";
import { Modal } from "@/components/ui/modal";
import { mensagemErro } from "@/lib/utils";
import type { Filial } from "@/types/database";

export function SeletorFilial({
  filiais,
  filialAtivaId,
  todas,
  podeVerTodas,
}: {
  filiais: Filial[];
  filialAtivaId: string | null;
  todas: boolean;
  podeVerTodas: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [pendente, iniciar] = useTransition();

  const rotulo = todas
    ? "Todas as filiais"
    : (filiais.find((f) => f.id === filialAtivaId)?.nome ?? "Selecione a filial");

  function escolher(valor: string) {
    iniciar(async () => {
      try {
        await definirFilialAtiva(valor);
        setAberto(false);
      } catch (erro) {
        toast.error(mensagemErro(erro));
      }
    });
  }

  // Com uma filial só e sem visão consolidada, não há o que escolher.
  if (filiais.length <= 1 && !podeVerTodas) {
    return (
      <span className="flex items-center gap-1.5 text-sm font-medium">
        <Store className="size-4 texto-suave" />
        <span className="max-w-32 truncate sm:max-w-none">{rotulo}</span>
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        disabled={pendente}
        className="flex items-center gap-1.5 rounded-lg border border-[var(--borda)] px-2.5 py-1.5 text-sm font-medium transition-colors hover:bg-areia-100 disabled:opacity-60 dark:hover:bg-areia-800"
      >
        <Store className="size-4 shrink-0 texto-suave" />
        <span className="max-w-28 truncate sm:max-w-40">{rotulo}</span>
        <ChevronDown className="size-4 shrink-0 texto-suave" />
      </button>

      <Modal
        aberto={aberto}
        aoFechar={() => setAberto(false)}
        titulo="Filial em uso"
        descricao="Define o contexto das telas de estoque, inventário e atividades."
        tamanho="sm"
      >
        <ul className="flex flex-col gap-1">
          {podeVerTodas && (
            <li>
              <button
                type="button"
                onClick={() => escolher("todas")}
                className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-3 text-left font-medium hover:bg-areia-100 dark:hover:bg-areia-800"
              >
                <span>
                  Todas as filiais
                  <span className="block text-sm font-normal texto-suave">
                    Visão consolidada da rede
                  </span>
                </span>
                {todas && <Check className="size-4 shrink-0 text-cacau-700 dark:text-cacau-300" />}
              </button>
            </li>
          )}

          {filiais.map((filial) => (
            <li key={filial.id}>
              <button
                type="button"
                onClick={() => escolher(filial.id)}
                className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-3 text-left font-medium hover:bg-areia-100 dark:hover:bg-areia-800"
              >
                <span>
                  {filial.nome}
                  <span className="block text-sm font-normal texto-suave">
                    {filial.codigo}
                    {filial.possui_cafeteria && " · com cafeteria"}
                  </span>
                </span>
                {!todas && filial.id === filialAtivaId && (
                  <Check className="size-4 shrink-0 text-cacau-700 dark:text-cacau-300" />
                )}
              </button>
            </li>
          ))}
        </ul>
      </Modal>
    </>
  );
}

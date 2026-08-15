"use client";

import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

import { cn } from "@/lib/utils";

export function Modal({
  aberto,
  aoFechar,
  titulo,
  descricao,
  children,
  rodape,
  tamanho = "md",
}: {
  aberto: boolean;
  aoFechar: () => void;
  titulo: ReactNode;
  descricao?: ReactNode;
  children: ReactNode;
  rodape?: ReactNode;
  tamanho?: "sm" | "md" | "lg" | "xl";
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    if (aberto && !dialog.open) dialog.showModal();
    if (!aberto && dialog.open) dialog.close();
  }, [aberto]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    // Esc dispara "cancel" — deixamos o estado do React ser a fonte da verdade.
    const aoCancelar = (e: Event) => {
      e.preventDefault();
      aoFechar();
    };
    dialog.addEventListener("cancel", aoCancelar);
    return () => dialog.removeEventListener("cancel", aoCancelar);
  }, [aoFechar]);

  const larguras = {
    sm: "max-w-md",
    md: "max-w-xl",
    lg: "max-w-3xl",
    xl: "max-w-5xl",
  };

  return (
    <dialog
      ref={ref}
      onClick={(e) => {
        // Clique no backdrop (fora do conteúdo) fecha.
        if (e.target === ref.current) aoFechar();
      }}
      className={cn(
        "w-[calc(100%-1.5rem)] rounded-xl border border-[var(--borda)] bg-[var(--superficie)] p-0",
        "text-[var(--texto)] shadow-xl backdrop:bg-black/40 backdrop:backdrop-blur-[1px]",
        "m-auto max-h-[calc(100dvh-2rem)]",
        larguras[tamanho],
      )}
    >
      <div className="flex max-h-[calc(100dvh-2rem)] flex-col">
        <header className="flex items-start justify-between gap-3 border-b border-[var(--borda)] px-4 py-3">
          <div className="min-w-0">
            <h2 className="font-semibold">{titulo}</h2>
            {descricao && <p className="mt-0.5 text-sm texto-suave">{descricao}</p>}
          </div>
          <button
            type="button"
            onClick={aoFechar}
            aria-label="Fechar"
            className="-mr-1 grid size-8 shrink-0 place-items-center rounded-lg hover:bg-areia-200 dark:hover:bg-areia-700"
          >
            <X className="size-4" />
          </button>
        </header>

        <div className="scroll-discreto flex-1 overflow-y-auto p-4">{children}</div>

        {rodape && (
          <footer className="flex flex-wrap justify-end gap-2 border-t border-[var(--borda)] px-4 py-3">
            {rodape}
          </footer>
        )}
      </div>
    </dialog>
  );
}

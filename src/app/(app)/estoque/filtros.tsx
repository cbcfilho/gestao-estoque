"use client";

import { Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { BotaoLerCodigo } from "@/components/scanner/leitor-codigo-barras";
import { LABEL_LOCAL } from "@/lib/formato";
import { cn } from "@/lib/utils";
import type { TipoLocal } from "@/types/database";

const FILTROS = [
  { valor: "todos", rotulo: "Todos" },
  { valor: "abaixo_minimo", rotulo: "Abaixo do mínimo" },
  { valor: "vencendo", rotulo: "Vencendo em 30 dias" },
  { valor: "vencendo_60", rotulo: "Vencendo em 60 dias" },
  { valor: "vencendo_90", rotulo: "Vencendo em 90 dias" },
  { valor: "vencido", rotulo: "Vencidos" },
] as const;

export function FiltrosEstoque({
  busca,
  local,
  filtro,
  locais,
}: {
  busca: string;
  local: TipoLocal | "";
  filtro: string;
  locais: TipoLocal[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, iniciar] = useTransition();

  const [texto, setTexto] = useState(busca);

  function aplicar(campo: string, valor: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (valor) params.set(campo, valor);
    else params.delete(campo);

    iniciar(() => router.replace(`${pathname}?${params.toString()}`, { scroll: false }));
  }

  // Busca com atraso, para não navegar a cada tecla digitada.
  useEffect(() => {
    if (texto === busca) return;
    const timer = setTimeout(() => aplicar("busca", texto.trim()), 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texto]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 texto-suave" />
          <input
            type="search"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Buscar por nome ou código de barras"
            className="w-full rounded-lg border border-areia-300 bg-[var(--superficie)] py-2.5 pr-9 pl-9 focus:border-cacau-600 focus:outline-2 focus:outline-cacau-600/30 dark:border-areia-700"
          />
          {texto && (
            <button
              type="button"
              onClick={() => setTexto("")}
              aria-label="Limpar busca"
              className="absolute top-1/2 right-2 grid size-7 -translate-y-1/2 place-items-center rounded-md texto-suave hover:bg-areia-200 dark:hover:bg-areia-700"
            >
              <X className="size-4" />
            </button>
          )}
        </div>

        <BotaoLerCodigo aoLer={(codigo) => setTexto(codigo)} rotulo="" />
      </div>

      <div className="scroll-discreto -mx-3 flex gap-2 overflow-x-auto px-3 sm:mx-0 sm:px-0">
        {FILTROS.map((f) => (
          <button
            key={f.valor}
            type="button"
            onClick={() => aplicar("filtro", f.valor === "todos" ? "" : f.valor)}
            aria-pressed={filtro === f.valor}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
              filtro === f.valor
                ? "border-cacau-700 bg-cacau-700 text-white"
                : "border-[var(--borda)] hover:bg-areia-100 dark:hover:bg-areia-800",
            )}
          >
            {f.rotulo}
          </button>
        ))}

        {locais.length > 1 && (
          <>
            <span className="mx-1 w-px shrink-0 bg-[var(--borda)]" aria-hidden />
            <button
              type="button"
              onClick={() => aplicar("local", "")}
              aria-pressed={!local}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                !local
                  ? "border-areia-500 bg-areia-200 dark:bg-areia-700"
                  : "border-[var(--borda)] hover:bg-areia-100 dark:hover:bg-areia-800",
              )}
            >
              Todos os locais
            </button>
            {locais.map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => aplicar("local", l)}
                aria-pressed={local === l}
                className={cn(
                  "shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                  local === l
                    ? "border-areia-500 bg-areia-200 dark:bg-areia-700"
                    : "border-[var(--borda)] hover:bg-areia-100 dark:hover:bg-areia-800",
                )}
              >
                {LABEL_LOCAL[l]}
              </button>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

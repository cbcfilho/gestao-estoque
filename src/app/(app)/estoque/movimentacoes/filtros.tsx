"use client";

import { Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { Campo } from "@/components/ui/campo";
import { LABEL_TIPO_MOV } from "@/lib/formato";
import { cn } from "@/lib/utils";
import type { TipoMovimentacao } from "@/types/database";

const TIPOS: (TipoMovimentacao | "")[] = ["", "entrada", "saida", "transferencia", "ajuste"];

export function FiltrosMovimentacoes({
  tipo,
  busca,
  de,
  ate,
}: {
  tipo: string;
  busca: string;
  de: string;
  ate: string;
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
    params.delete("pagina"); // qualquer filtro novo volta para a primeira página

    iniciar(() => router.replace(`${pathname}?${params.toString()}`, { scroll: false }));
  }

  useEffect(() => {
    if (texto === busca) return;
    const timer = setTimeout(() => aplicar("busca", texto.trim()), 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texto]);

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 texto-suave" />
        <input
          type="search"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Buscar por produto ou código de barras"
          className="w-full rounded-lg border border-areia-300 bg-[var(--superficie)] py-2.5 pr-3 pl-9 focus:border-cacau-600 focus:outline-2 focus:outline-cacau-600/30 dark:border-areia-700"
        />
      </div>

      <div className="scroll-discreto -mx-3 flex gap-2 overflow-x-auto px-3 sm:mx-0 sm:px-0">
        {TIPOS.map((t) => (
          <button
            key={t || "todos"}
            type="button"
            onClick={() => aplicar("tipo", t)}
            aria-pressed={tipo === t}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
              tipo === t
                ? "border-cacau-700 bg-cacau-700 text-white"
                : "border-[var(--borda)] hover:bg-areia-100 dark:hover:bg-areia-800",
            )}
          >
            {t ? LABEL_TIPO_MOV[t] : "Todos"}
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Campo
          id="de"
          type="date"
          rotulo="De"
          value={de}
          onChange={(e) => aplicar("de", e.target.value)}
        />
        <Campo
          id="ate"
          type="date"
          rotulo="Até"
          value={ate}
          onChange={(e) => aplicar("ate", e.target.value)}
        />
      </div>
    </div>
  );
}

"use client";

import { Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { BotaoLerCodigo } from "@/components/scanner/leitor-codigo-barras";
import { cn } from "@/lib/utils";

/** Busca ligada à query string, com atraso e leitura opcional de código de barras. */
export function BarraBusca({
  valor,
  campo = "busca",
  placeholder = "Buscar",
  comLeitor = false,
  filtros,
}: {
  valor: string;
  campo?: string;
  placeholder?: string;
  comLeitor?: boolean;
  filtros?: { valor: string; rotulo: string; ativo: boolean; campo: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, iniciar] = useTransition();
  const [texto, setTexto] = useState(valor);

  function aplicar(nome: string, novo: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (novo) params.set(nome, novo);
    else params.delete(nome);
    params.delete("pagina");

    iniciar(() => router.replace(`${pathname}?${params.toString()}`, { scroll: false }));
  }

  useEffect(() => {
    if (texto === valor) return;
    const timer = setTimeout(() => aplicar(campo, texto.trim()), 350);
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
            placeholder={placeholder}
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

        {comLeitor && <BotaoLerCodigo aoLer={setTexto} rotulo="" />}
      </div>

      {filtros && filtros.length > 0 && (
        <div className="scroll-discreto -mx-3 flex gap-2 overflow-x-auto px-3 sm:mx-0 sm:px-0">
          {filtros.map((f) => (
            <button
              key={`${f.campo}-${f.valor}`}
              type="button"
              onClick={() => aplicar(f.campo, f.valor)}
              aria-pressed={f.ativo}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                f.ativo
                  ? "border-cacau-700 bg-cacau-700 text-white"
                  : "border-[var(--borda)] hover:bg-areia-100 dark:hover:bg-areia-800",
              )}
            >
              {f.rotulo}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

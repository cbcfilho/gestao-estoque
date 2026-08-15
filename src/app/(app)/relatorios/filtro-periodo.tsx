"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

import { Campo } from "@/components/ui/campo";
import { cn } from "@/lib/utils";

const ATALHOS = [
  { rotulo: "30 dias", dias: 30 },
  { rotulo: "90 dias", dias: 90 },
  { rotulo: "6 meses", dias: 180 },
  { rotulo: "12 meses", dias: 365 },
];

function iso(data: Date) {
  return data.toISOString().slice(0, 10);
}

export function FiltroPeriodo({ de, ate }: { de: string; ate: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, iniciar] = useTransition();

  function aplicar(novoDe: string, novoAte: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("de", novoDe);
    params.set("ate", novoAte);
    iniciar(() => router.replace(`${pathname}?${params.toString()}`, { scroll: false }));
  }

  const diasAtuais = Math.round(
    (new Date(ate).getTime() - new Date(de).getTime()) / 86_400_000,
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="scroll-discreto -mx-3 flex gap-2 overflow-x-auto px-3 sm:mx-0 sm:px-0">
        {ATALHOS.map((atalho) => {
          const ativo = Math.abs(diasAtuais - atalho.dias) <= 1;
          return (
            <button
              key={atalho.dias}
              type="button"
              aria-pressed={ativo}
              onClick={() => {
                const fim = new Date();
                const inicio = new Date();
                inicio.setDate(inicio.getDate() - atalho.dias);
                aplicar(iso(inicio), iso(fim));
              }}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                ativo
                  ? "border-cacau-700 bg-cacau-700 text-white"
                  : "border-[var(--borda)] hover:bg-areia-100 dark:hover:bg-areia-800",
              )}
            >
              {atalho.rotulo}
            </button>
          );
        })}
      </div>

      <div className="grid gap-3 sm:max-w-md sm:grid-cols-2">
        <Campo
          id="de"
          type="date"
          rotulo="De"
          value={de}
          max={ate}
          onChange={(e) => aplicar(e.target.value, ate)}
        />
        <Campo
          id="ate"
          type="date"
          rotulo="Até"
          value={ate}
          min={de}
          onChange={(e) => aplicar(de, e.target.value)}
        />
      </div>
    </div>
  );
}

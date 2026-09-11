"use client";

import { Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { Campo, Checkbox, Selecao } from "@/components/ui/campo";
import { LABEL_LOCAL, LABEL_TIPO_MOV } from "@/lib/formato";
import {
  type FiltrosRelatorio,
  LABEL_ORIGEM,
  ORIGENS,
} from "@/lib/relatorio-movimentacoes";
import { cn } from "@/lib/utils";
import type { Filial, TipoLocal, TipoMovimentacao } from "@/types/database";

const TIPOS: (TipoMovimentacao | "")[] = ["", "entrada", "saida", "transferencia", "ajuste"];
const LOCAIS: TipoLocal[] = ["deposito", "prateleira", "cafeteria"];

export function FiltrosRelatorioMovimentacoes({
  filtros,
  filiais,
}: {
  filtros: FiltrosRelatorio;
  filiais: Filial[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, iniciar] = useTransition();
  const [texto, setTexto] = useState(filtros.busca);

  function aplicar(campo: string, valor: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (valor) params.set(campo, valor);
    else params.delete(campo);
    params.delete("pagina"); // filtro novo volta para a primeira página

    iniciar(() => router.replace(`${pathname}?${params.toString()}`, { scroll: false }));
  }

  useEffect(() => {
    if (texto === filtros.busca) return;
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
          placeholder="Buscar por produto, código de barras ou SKU"
          className="w-full rounded-lg border border-areia-300 bg-[var(--superficie)] py-2.5 pr-3 pl-9 focus:border-cacau-600 focus:outline-2 focus:outline-cacau-600/30 dark:border-areia-700"
        />
      </div>

      <div className="scroll-discreto -mx-3 flex gap-2 overflow-x-auto px-3 sm:mx-0 sm:px-0">
        {TIPOS.map((t) => (
          <button
            key={t || "todos"}
            type="button"
            onClick={() => aplicar("tipo", t)}
            aria-pressed={filtros.tipo === t}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
              filtros.tipo === t
                ? "border-cacau-700 bg-cacau-700 text-white"
                : "border-[var(--borda)] hover:bg-areia-100 dark:hover:bg-areia-800",
            )}
          >
            {t ? LABEL_TIPO_MOV[t] : "Todos os tipos"}
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Campo
          id="de"
          type="date"
          rotulo="De"
          value={filtros.de}
          onChange={(e) => aplicar("de", e.target.value)}
        />
        <Campo
          id="ate"
          type="date"
          rotulo="Até"
          value={filtros.ate}
          onChange={(e) => aplicar("ate", e.target.value)}
        />

        <Selecao
          id="filial"
          rotulo="Filial"
          value={filtros.filial}
          onChange={(e) => aplicar("filial", e.target.value)}
        >
          <option value="">Todas que posso ver</option>
          {filiais.map((f) => (
            <option key={f.id} value={f.id}>
              {f.nome}
            </option>
          ))}
        </Selecao>

        <Selecao
          id="local"
          rotulo="Local"
          value={filtros.local}
          onChange={(e) => aplicar("local", e.target.value)}
        >
          <option value="">Todos os locais</option>
          {LOCAIS.map((l) => (
            <option key={l} value={l}>
              {LABEL_LOCAL[l]}
            </option>
          ))}
        </Selecao>

        <Selecao
          id="origem"
          rotulo="Origem"
          value={filtros.origem}
          onChange={(e) => aplicar("origem", e.target.value)}
          ajuda="Importadas são as que vieram de planilha."
        >
          {ORIGENS.map((o) => (
            <option key={o} value={o}>
              {LABEL_ORIGEM[o]}
            </option>
          ))}
        </Selecao>

        <div className="flex items-end pb-2">
          <Checkbox
            id="sem-estornos"
            rotulo="Ocultar estornos"
            ajuda="Tira a linha estornada e o estorno dela."
            checked={filtros.semEstornos}
            onChange={(e) => aplicar("semEstornos", e.target.checked ? "1" : "")}
          />
        </div>
      </div>
    </div>
  );
}

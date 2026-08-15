"use client";

import { Table2, BarChart3 } from "lucide-react";
import { useState, type ReactNode } from "react";

import { Tabela, TabelaContainer, Td, Th, Tr } from "@/components/ui/tabela";
import { cn } from "@/lib/utils";

/**
 * Casca comum dos gráficos: legenda, alternância gráfico/tabela e estado vazio.
 *
 * A visão em tabela não é um extra — é o canal alternativo de leitura exigido
 * quando a cor sozinha não basta (daltonismo, impressão, leitor de tela).
 */
export function MolduraGrafico({
  legenda,
  colunas,
  linhas,
  vazio,
  children,
}: {
  legenda?: { rotulo: string; cor: string }[];
  colunas: string[];
  linhas: (string | number)[][];
  vazio?: ReactNode;
  children: ReactNode;
}) {
  const [modo, setModo] = useState<"grafico" | "tabela">("grafico");

  if (linhas.length === 0) {
    return (
      <div className="grid h-56 place-items-center text-center text-sm texto-suave">
        {vazio ?? "Ainda não há movimentação suficiente para montar este gráfico."}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {legenda && legenda.length > 1 ? (
          <ul className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {legenda.map((item) => (
              <li key={item.rotulo} className="flex items-center gap-1.5 text-sm texto-suave">
                <span
                  className="size-2.5 rounded-[2px]"
                  style={{ backgroundColor: item.cor }}
                  aria-hidden
                />
                {item.rotulo}
              </li>
            ))}
          </ul>
        ) : (
          <span />
        )}

        <div className="flex rounded-lg border border-[var(--borda)] p-0.5" role="group">
          <button
            type="button"
            onClick={() => setModo("grafico")}
            aria-pressed={modo === "grafico"}
            className={cn(
              "flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors",
              modo === "grafico" ? "bg-areia-200 dark:bg-areia-700" : "texto-suave",
            )}
          >
            <BarChart3 className="size-3.5" />
            Gráfico
          </button>
          <button
            type="button"
            onClick={() => setModo("tabela")}
            aria-pressed={modo === "tabela"}
            className={cn(
              "flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors",
              modo === "tabela" ? "bg-areia-200 dark:bg-areia-700" : "texto-suave",
            )}
          >
            <Table2 className="size-3.5" />
            Tabela
          </button>
        </div>
      </div>

      {modo === "grafico" ? (
        children
      ) : (
        <TabelaContainer>
          <Tabela>
            <thead>
              <tr>
                {colunas.map((coluna, i) => (
                  <Th key={coluna} alinhar={i === 0 ? "esquerda" : "direita"}>
                    {coluna}
                  </Th>
                ))}
              </tr>
            </thead>
            <tbody>
              {linhas.map((linha, i) => (
                <Tr key={i}>
                  {linha.map((celula, j) => (
                    <Td key={j} alinhar={j === 0 ? "esquerda" : "direita"}>
                      {celula}
                    </Td>
                  ))}
                </Tr>
              ))}
            </tbody>
          </Tabela>
        </TabelaContainer>
      )}
    </div>
  );
}

/** Tooltip padrão — texto sempre em tinta neutra, com o quadradinho da cor ao lado. */
export function DicaGrafico({
  titulo,
  itens,
}: {
  titulo: string;
  itens: { rotulo: string; valor: string; cor?: string }[];
}) {
  return (
    <div className="rounded-lg border border-[var(--borda)] bg-[var(--superficie)] px-3 py-2 text-sm shadow-lg">
      <p className="font-medium">{titulo}</p>
      <ul className="mt-1 flex flex-col gap-0.5">
        {itens.map((item) => (
          <li key={item.rotulo} className="flex items-center gap-2">
            {item.cor && (
              <span
                className="size-2.5 shrink-0 rounded-[2px]"
                style={{ backgroundColor: item.cor }}
                aria-hidden
              />
            )}
            <span className="texto-suave">{item.rotulo}</span>
            <span className="ml-auto font-medium tabular">{item.valor}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

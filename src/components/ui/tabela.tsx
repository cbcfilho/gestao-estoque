import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Envolve a tabela num container com rolagem horizontal própria — em telas
 * de celular a página nunca rola de lado, só a tabela.
 */
export function TabelaContainer({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      {...props}
      className={cn("scroll-discreto -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0", className)}
    />
  );
}

export function Tabela({ className, ...props }: ComponentProps<"table">) {
  return (
    <table
      {...props}
      className={cn("w-full min-w-max border-collapse text-sm sm:min-w-full", className)}
    />
  );
}

export function Th({
  className,
  alinhar = "esquerda",
  ...props
}: ComponentProps<"th"> & { alinhar?: "esquerda" | "direita" | "centro" }) {
  return (
    <th
      {...props}
      className={cn(
        "border-b border-[var(--borda)] px-3 py-2.5 text-xs font-semibold tracking-wide uppercase texto-suave",
        alinhar === "direita" && "text-right",
        alinhar === "centro" && "text-center",
        alinhar === "esquerda" && "text-left",
        className,
      )}
    />
  );
}

export function Td({
  className,
  alinhar = "esquerda",
  ...props
}: ComponentProps<"td"> & { alinhar?: "esquerda" | "direita" | "centro" }) {
  return (
    <td
      {...props}
      className={cn(
        "border-b border-[var(--borda)] px-3 py-2.5 align-middle",
        alinhar === "direita" && "text-right tabular",
        alinhar === "centro" && "text-center",
        className,
      )}
    />
  );
}

export function Tr({ className, ...props }: ComponentProps<"tr">) {
  return (
    <tr
      {...props}
      className={cn("transition-colors hover:bg-areia-50 dark:hover:bg-areia-800/50", className)}
    />
  );
}

/**
 * Lista em cartões — usada no lugar da tabela em telas estreitas.
 * Mantém a mesma informação sem obrigar o operador a rolar de lado no celular.
 */
export function ListaCartoes({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex flex-col gap-2", className)}>{children}</div>;
}

export function ItemCartao({
  titulo,
  subtitulo,
  direita,
  linhas,
  acoes,
  onClick,
}: {
  titulo: ReactNode;
  subtitulo?: ReactNode;
  direita?: ReactNode;
  linhas?: { rotulo: string; valor: ReactNode }[];
  acoes?: ReactNode;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={cn("superficie p-3", onClick && "cursor-pointer active:bg-areia-100")}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium">{titulo}</p>
          {subtitulo && <p className="mt-0.5 truncate text-sm texto-suave">{subtitulo}</p>}
        </div>
        {direita && <div className="shrink-0 text-right">{direita}</div>}
      </div>

      {linhas && linhas.length > 0 && (
        <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
          {linhas.map((l) => (
            <div key={l.rotulo} className="flex justify-between gap-2">
              <dt className="texto-suave">{l.rotulo}</dt>
              <dd className="tabular font-medium">{l.valor}</dd>
            </div>
          ))}
        </dl>
      )}

      {acoes && <div className="mt-3 flex flex-wrap gap-2">{acoes}</div>}
    </div>
  );
}

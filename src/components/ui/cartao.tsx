import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/utils";

export function Cartao({ className, ...props }: ComponentProps<"div">) {
  return <div {...props} className={cn("superficie", className)} />;
}

export function CartaoCabecalho({
  titulo,
  descricao,
  acao,
  className,
}: {
  titulo: ReactNode;
  descricao?: ReactNode;
  acao?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-start justify-between gap-3 border-b border-[var(--borda)] px-4 py-3",
        className,
      )}
    >
      <div className="min-w-0">
        <h2 className="font-semibold text-[var(--texto)]">{titulo}</h2>
        {descricao && <p className="mt-0.5 text-sm texto-suave">{descricao}</p>}
      </div>
      {acao && <div className="shrink-0">{acao}</div>}
    </div>
  );
}

export function CartaoConteudo({ className, ...props }: ComponentProps<"div">) {
  return <div {...props} className={cn("p-4", className)} />;
}

/** Cartão de indicador do dashboard. */
export function CartaoKpi({
  rotulo,
  valor,
  detalhe,
  icone,
  tom = "neutro",
  href,
}: {
  rotulo: string;
  valor: ReactNode;
  detalhe?: ReactNode;
  icone?: ReactNode;
  tom?: "neutro" | "alerta" | "critico" | "positivo";
  href?: string;
}) {
  const tons = {
    neutro: "text-[var(--texto)]",
    alerta: "text-amber-700 dark:text-amber-400",
    critico: "text-red-700 dark:text-red-400",
    positivo: "text-emerald-700 dark:text-emerald-400",
  };

  const Wrapper = href ? "a" : "div";

  return (
    <Wrapper
      {...(href ? { href } : {})}
      className={cn(
        "superficie flex items-start gap-3 p-4",
        href && "transition-colors hover:bg-areia-50 dark:hover:bg-areia-800",
      )}
    >
      {icone && (
        <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg bg-cacau-50 text-cacau-700 dark:bg-cacau-900/40 dark:text-cacau-200">
          {icone}
        </span>
      )}
      <div className="min-w-0">
        <p className="text-sm texto-suave">{rotulo}</p>
        <p className={cn("mt-0.5 truncate text-2xl font-semibold tabular", tons[tom])}>{valor}</p>
        {detalhe && <p className="mt-0.5 text-sm texto-suave">{detalhe}</p>}
      </div>
    </Wrapper>
  );
}

import { Inbox, TriangleAlert, Info, CircleCheck } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function EstadoVazio({
  titulo,
  descricao,
  icone,
  acao,
  className,
}: {
  titulo: string;
  descricao?: ReactNode;
  icone?: ReactNode;
  acao?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center gap-3 px-4 py-12 text-center", className)}>
      <span className="grid size-12 place-items-center rounded-full bg-areia-200 texto-suave dark:bg-areia-800">
        {icone ?? <Inbox className="size-6" />}
      </span>
      <div>
        <p className="font-medium">{titulo}</p>
        {descricao && <p className="mt-1 max-w-md text-sm texto-suave">{descricao}</p>}
      </div>
      {acao}
    </div>
  );
}

const TONS_ALERTA = {
  info: {
    caixa: "bg-sky-50 border-sky-200 text-sky-900 dark:bg-sky-950/40 dark:border-sky-900 dark:text-sky-100",
    icone: <Info className="size-4 shrink-0" />,
  },
  alerta: {
    caixa:
      "bg-amber-50 border-amber-200 text-amber-900 dark:bg-amber-950/40 dark:border-amber-900 dark:text-amber-100",
    icone: <TriangleAlert className="size-4 shrink-0" />,
  },
  erro: {
    caixa: "bg-red-50 border-red-200 text-red-900 dark:bg-red-950/40 dark:border-red-900 dark:text-red-100",
    icone: <TriangleAlert className="size-4 shrink-0" />,
  },
  sucesso: {
    caixa:
      "bg-emerald-50 border-emerald-200 text-emerald-900 dark:bg-emerald-950/40 dark:border-emerald-900 dark:text-emerald-100",
    icone: <CircleCheck className="size-4 shrink-0" />,
  },
} as const;

export function Alerta({
  tom = "info",
  titulo,
  children,
  className,
}: {
  tom?: keyof typeof TONS_ALERTA;
  titulo?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const t = TONS_ALERTA[tom];
  return (
    <div className={cn("flex gap-2.5 rounded-lg border px-3 py-2.5 text-sm", t.caixa, className)}>
      <span className="mt-0.5">{t.icone}</span>
      <div className="min-w-0">
        {titulo && <p className="font-medium">{titulo}</p>}
        {children && <div className={cn(titulo && "mt-0.5")}>{children}</div>}
      </div>
    </div>
  );
}

export function Esqueleto({ className }: { className?: string }) {
  return (
    <div
      className={cn("animate-pulse rounded-lg bg-areia-200 dark:bg-areia-800", className)}
      aria-hidden
    />
  );
}

export function EsqueletoLista({ linhas = 5 }: { linhas?: number }) {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: linhas }).map((_, i) => (
        <Esqueleto key={i} className="h-16" />
      ))}
    </div>
  );
}

export function CabecalhoPagina({
  titulo,
  descricao,
  acao,
}: {
  titulo: string;
  descricao?: ReactNode;
  acao?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold sm:text-2xl">{titulo}</h1>
        {descricao && <p className="mt-1 text-sm texto-suave">{descricao}</p>}
      </div>
      {acao && <div className="shrink-0">{acao}</div>}
    </div>
  );
}

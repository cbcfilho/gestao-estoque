import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type TomBadge =
  | "neutro"
  | "cacau"
  | "dourado"
  | "sucesso"
  | "alerta"
  | "critico"
  | "info";

const TONS: Record<TomBadge, string> = {
  neutro: "bg-areia-200 text-areia-800 dark:bg-areia-700 dark:text-areia-100",
  cacau: "bg-cacau-100 text-cacau-800 dark:bg-cacau-900/50 dark:text-cacau-200",
  dourado: "bg-dourado-100 text-dourado-800 dark:bg-dourado-900/40 dark:text-dourado-200",
  sucesso: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
  alerta: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  critico: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
  info: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200",
};

export function Badge({
  tom = "neutro",
  children,
  className,
  pontinho = false,
}: {
  tom?: TomBadge;
  children: ReactNode;
  className?: string;
  pontinho?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        TONS[tom],
        className,
      )}
    >
      {pontinho && <span className="size-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}

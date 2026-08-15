"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/utils";

type Variante = "primario" | "secundario" | "contorno" | "fantasma" | "perigo" | "sucesso";
type Tamanho = "sm" | "md" | "lg" | "icone";

const VARIANTES: Record<Variante, string> = {
  primario:
    "bg-cacau-700 text-white hover:bg-cacau-800 active:bg-cacau-900 disabled:bg-cacau-300",
  secundario:
    "bg-dourado-500 text-cacau-950 hover:bg-dourado-400 active:bg-dourado-600 disabled:bg-dourado-200",
  contorno:
    "border border-areia-300 bg-[var(--superficie)] text-[var(--texto)] hover:bg-areia-100 dark:border-areia-700 dark:hover:bg-areia-800",
  fantasma: "text-[var(--texto)] hover:bg-areia-200/70 dark:hover:bg-areia-800",
  perigo: "bg-red-700 text-white hover:bg-red-800 active:bg-red-900 disabled:bg-red-300",
  sucesso:
    "bg-emerald-700 text-white hover:bg-emerald-800 active:bg-emerald-900 disabled:bg-emerald-300",
};

const TAMANHOS: Record<Tamanho, string> = {
  sm: "h-9 px-3 text-sm gap-1.5",
  md: "h-11 px-4 text-sm gap-2",
  lg: "h-13 px-6 text-base gap-2",
  icone: "h-11 w-11 justify-center",
};

const BASE =
  "inline-flex items-center rounded-lg font-medium transition-colors select-none " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dourado-500 " +
  "disabled:cursor-not-allowed disabled:opacity-70";

interface BotaoBase {
  variante?: Variante;
  tamanho?: Tamanho;
  carregando?: boolean;
  larguraTotal?: boolean;
  children?: ReactNode;
}

export function Botao({
  variante = "primario",
  tamanho = "md",
  carregando = false,
  larguraTotal = false,
  className,
  disabled,
  children,
  ...props
}: BotaoBase & ComponentProps<"button">) {
  return (
    <button
      {...props}
      disabled={disabled || carregando}
      className={cn(
        BASE,
        VARIANTES[variante],
        TAMANHOS[tamanho],
        larguraTotal && "w-full justify-center",
        className,
      )}
    >
      {carregando && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export function BotaoLink({
  variante = "primario",
  tamanho = "md",
  larguraTotal = false,
  className,
  children,
  ...props
}: BotaoBase & ComponentProps<typeof Link>) {
  return (
    <Link
      {...props}
      className={cn(
        BASE,
        VARIANTES[variante],
        TAMANHOS[tamanho],
        larguraTotal && "w-full justify-center",
        className,
      )}
    >
      {children}
    </Link>
  );
}

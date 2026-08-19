import Image from "next/image";

import { cn } from "@/lib/utils";

/**
 * Logotipo do sistema.
 *
 * Se existir `public/logo.png` (ou .svg — veja `LOGO_ARQUIVO`), ele é usado.
 * Caso contrário, aparece o símbolo genérico definido abaixo.
 *
 * O arquivo do logotipo NÃO vem no repositório de propósito: identidade visual
 * de franquia pertence à franqueadora e é o franqueado quem tem o material
 * oficial e a autorização de uso. Coloque o arquivo em `public/` e rode
 * `npm run icones` para gerar os ícones do app a partir dele.
 */

/** Caminho do logotipo dentro de `public/`. Vazio usa o símbolo genérico. */
export const LOGO_ARQUIVO = process.env.NEXT_PUBLIC_LOGO ?? "";

/** Símbolo de reserva: grão de cacau genérico, criado para este projeto. */
export function SimboloGenerico({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("size-8", className)}
      aria-hidden
    >
      <rect width="40" height="40" rx="10" className="fill-cacau-700" />
      <path
        d="M20 8c6.2 2.6 9.6 7 9.6 12.2C29.6 26 25.4 31 20 32.6 14.6 31 10.4 26 10.4 20.2 10.4 15 13.8 10.6 20 8Z"
        className="fill-dourado-400"
      />
      <path
        d="M20 10.6v19.8"
        className="stroke-cacau-700"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M20 15.4c-2 .9-3.3 2.2-3.9 3.9M20 21.2c-2 .9-3.3 2.2-3.9 3.9M20 15.4c2 .9 3.3 2.2 3.9 3.9M20 21.2c2 .9 3.3 2.2 3.9 3.9"
        className="stroke-cacau-700"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Simbolo({ className }: { className?: string }) {
  if (!LOGO_ARQUIVO) return <SimboloGenerico className={className} />;

  return (
    <Image
      src={LOGO_ARQUIVO}
      alt=""
      width={64}
      height={64}
      priority
      className={cn("size-8 object-contain", className)}
    />
  );
}

export function Marca({
  className,
  nome = "Estoque Cacau",
  subtitulo,
  /** Quando o logotipo já traz o nome escrito, o texto ao lado vira repetição. */
  somenteSimbolo = Boolean(LOGO_ARQUIVO) && process.env.NEXT_PUBLIC_LOGO_COM_NOME === "sim",
}: {
  className?: string;
  nome?: string;
  subtitulo?: string;
  somenteSimbolo?: boolean;
}) {
  if (somenteSimbolo) {
    return (
      <div className={cn("flex items-center", className)}>
        <Simbolo className="h-10 w-auto" />
        <span className="sr-only">{nome}</span>
      </div>
    );
  }

  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <Simbolo />
      <div className="min-w-0 leading-tight">
        <p className="truncate font-semibold">{nome}</p>
        {subtitulo && <p className="truncate text-xs texto-suave">{subtitulo}</p>}
      </div>
    </div>
  );
}

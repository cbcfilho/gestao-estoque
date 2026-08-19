import Image from "next/image";

import { cn } from "@/lib/utils";

/**
 * Logotipo do sistema.
 *
 * Se existir um arquivo em `public/` apontado por `NEXT_PUBLIC_LOGO`, ele é
 * usado; caso contrário aparece o símbolo genérico definido abaixo.
 *
 * O arquivo do logotipo não vem no repositório de propósito — veja a seção 3.9
 * do README. Depois de trocá-lo, rode `npm run icones`.
 */

/** Caminho do logotipo dentro de `public/`. Vazio usa o símbolo genérico. */
export const LOGO_ARQUIVO = process.env.NEXT_PUBLIC_LOGO ?? "";

/**
 * Quando o logotipo já traz o nome do sistema escrito, o texto ao lado vira
 * repetição. Não é o caso quando o logotipo é a assinatura de quem construiu e
 * o sistema tem nome próprio — aí os dois convivem.
 */
const LOGO_TEM_O_NOME = process.env.NEXT_PUBLIC_LOGO_COM_NOME === "sim";

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

/**
 * O logotipo em si.
 *
 * A altura é fixa e a largura é livre: logotipo horizontal (marca + nome ao
 * lado) não cabe num quadrado sem virar uma tarja ilegível. Quem controla o
 * espaço é a altura.
 */
export function Simbolo({ className, altura = "h-8" }: { className?: string; altura?: string }) {
  if (!LOGO_ARQUIVO) return <SimboloGenerico className={className} />;

  return (
    <Image
      src={LOGO_ARQUIVO}
      alt=""
      width={480}
      height={160}
      priority
      className={cn("w-auto object-contain", altura, className)}
    />
  );
}

export function Marca({
  className,
  nome = "Estoque Cacau",
  subtitulo,
  /** Telas de entrada mostram o logotipo maior; o menu, compacto. */
  destaque = false,
}: {
  className?: string;
  nome?: string;
  subtitulo?: string;
  destaque?: boolean;
}) {
  // Logotipo horizontal ocupa a linha inteira: o nome vai embaixo, não ao lado.
  if (LOGO_ARQUIVO) {
    return (
      <div className={cn("flex flex-col items-center gap-1.5", className)}>
        <Simbolo altura={destaque ? "h-14" : "h-8"} />

        {LOGO_TEM_O_NOME ? (
          <span className="sr-only">{nome}</span>
        ) : (
          <div className="text-center leading-tight">
            <p className={cn("truncate font-semibold", destaque ? "text-base" : "text-sm")}>
              {nome}
            </p>
            {subtitulo && <p className="truncate text-xs texto-suave">{subtitulo}</p>}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <SimboloGenerico className={destaque ? "size-11" : undefined} />
      <div className="min-w-0 leading-tight">
        <p className="truncate font-semibold">{nome}</p>
        {subtitulo && <p className="truncate text-xs texto-suave">{subtitulo}</p>}
      </div>
    </div>
  );
}

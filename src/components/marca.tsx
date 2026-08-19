import Image from "next/image";

import { cn } from "@/lib/utils";

/**
 * Identidade nas telas.
 *
 * Duas coisas diferentes convivem aqui:
 *
 *   - a **marca de quem construiu** (o símbolo e o nome da consultoria), que
 *     assina o trabalho e aparece nas telas de entrada;
 *   - o **nome do sistema**, que é o que o operador de loja reconhece no dia a
 *     dia e aparece no menu.
 *
 * O nome da marca vai em HTML, não embutido numa imagem: fica nítido em
 * qualquer tamanho, acompanha o tema claro/escuro e não pesa no carregamento.
 * A imagem entra só para o símbolo, que aí sim precisa ser desenho.
 *
 * Os arquivos ficam fora do repositório por padrão — veja a seção 3.9 do README.
 */

/** Símbolo compacto da marca (só o desenho, sem texto). */
const ICONE = process.env.NEXT_PUBLIC_LOGO_ICONE ?? "";

/** Nome da marca, escrito em HTML nas telas de entrada. */
const MARCA_NOME = process.env.NEXT_PUBLIC_MARCA_NOME ?? "";
const MARCA_SUBTITULO = process.env.NEXT_PUBLIC_MARCA_SUBTITULO ?? "";

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

/** O símbolo da marca, em tamanho controlado pela altura. */
export function Simbolo({ className }: { className?: string }) {
  if (!ICONE) return <SimboloGenerico className={className} />;

  return (
    <Image
      src={ICONE}
      alt=""
      width={128}
      height={128}
      priority
      className={cn("size-8 object-contain", className)}
    />
  );
}

/**
 * Assinatura da marca: símbolo sobre o nome, centralizado.
 * Usada nas telas de entrada, onde há espaço e o objetivo é apresentar-se.
 */
export function MarcaDestaque({ className }: { className?: string }) {
  if (!MARCA_NOME) {
    return (
      <div className={cn("flex flex-col items-center gap-2", className)}>
        <Simbolo className="size-14" />
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col items-center gap-2.5", className)}>
      <Simbolo className="size-16" />

      <div className="text-center leading-tight">
        <p className="text-2xl font-bold tracking-[0.14em] text-[var(--marca-forte)]">
          {MARCA_NOME}
        </p>
        {MARCA_SUBTITULO && (
          <p className="mt-0.5 text-xs tracking-wide text-[var(--marca-suave)]">
            {MARCA_SUBTITULO}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Marca compacta: símbolo ao lado do nome do sistema.
 * Usada no menu e no topo do celular, onde quem lê é o operador de loja.
 */
export function Marca({
  className,
  nome = "Estoque Cacau",
  subtitulo,
}: {
  className?: string;
  nome?: string;
  subtitulo?: string;
}) {
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

import { cn } from "@/lib/utils";

/**
 * Marca do sistema — símbolo genérico de grão de cacau.
 * Não reproduz a identidade oficial da franquia: quando você tiver o logo
 * definitivo, troque este componente ou aponte `identidade.logo_url` nas
 * configurações do sistema.
 */
export function Simbolo({ className }: { className?: string }) {
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

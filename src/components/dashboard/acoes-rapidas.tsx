import {
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpFromLine,
  ClipboardCheck,
  Coffee,
} from "lucide-react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";

import { PERMISSOES } from "@/lib/permissoes";

const ACOES: { rotulo: string; href: string; icone: LucideIcon; permissao: string }[] = [
  {
    rotulo: "Entrada",
    href: "/estoque/entrada",
    icone: ArrowDownToLine,
    permissao: PERMISSOES.estoqueEntrada,
  },
  {
    rotulo: "Saída",
    href: "/estoque/saida",
    icone: ArrowUpFromLine,
    permissao: PERMISSOES.estoqueSaida,
  },
  {
    rotulo: "Transferir",
    href: "/transferencias/nova",
    icone: ArrowLeftRight,
    permissao: PERMISSOES.transferenciasSolicitar,
  },
  {
    rotulo: "Inventário",
    href: "/inventario",
    icone: ClipboardCheck,
    permissao: PERMISSOES.inventarioContar,
  },
  {
    rotulo: "Cafeteria",
    href: "/cafeteria",
    icone: Coffee,
    permissao: PERMISSOES.cafeteriaConsumo,
  },
];

/** Atalhos grandes o bastante para uso com uma mão, no balcão. */
export function AcoesRapidas({ permissoes }: { permissoes: string[] }) {
  const visiveis = ACOES.filter((a) => permissoes.includes(a.permissao));

  if (visiveis.length === 0) return null;

  return (
    <nav aria-label="Ações rápidas">
      <ul className="scroll-discreto -mx-3 flex gap-2 overflow-x-auto px-3 sm:mx-0 sm:px-0">
        {visiveis.map((acao) => {
          const Icone = acao.icone;
          return (
            <li key={acao.href} className="shrink-0">
              <Link
                href={acao.href}
                className="flex min-w-24 flex-col items-center gap-1.5 rounded-xl border border-[var(--borda)] bg-[var(--superficie)] px-4 py-3 text-sm font-medium transition-colors hover:border-cacau-300 hover:bg-cacau-50 dark:hover:border-cacau-700 dark:hover:bg-cacau-900/30"
              >
                <Icone className="size-5 text-cacau-700 dark:text-cacau-300" />
                {acao.rotulo}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

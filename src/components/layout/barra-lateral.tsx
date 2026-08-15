"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { ICONES_NAVEGACAO } from "@/components/layout/icones-navegacao";
import { Marca } from "@/components/marca";
import type { ItemNavegacao } from "@/lib/navegacao";
import { cn } from "@/lib/utils";

function ativo(pathname: string, href: string) {
  if (href === "/painel") return pathname === "/painel";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function BarraLateral({
  itens,
  nomeSistema,
}: {
  itens: ItemNavegacao[];
  nomeSistema: string;
}) {
  const pathname = usePathname();

  return (
    <aside className="nao-imprimir sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-[var(--borda)] bg-[var(--superficie)] lg:flex">
      <div className="border-b border-[var(--borda)] px-4 py-4">
        <Link href="/painel" className="block">
          <Marca nome={nomeSistema} subtitulo="Gestão Multi-Filial" />
        </Link>
      </div>

      <nav className="scroll-discreto flex-1 overflow-y-auto p-3">
        <ul className="flex flex-col gap-0.5">
          {itens.map((item) => {
            const estaAtivo = ativo(pathname, item.href);
            const Icone = ICONES_NAVEGACAO[item.icone];

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={estaAtivo ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    estaAtivo
                      ? "bg-cacau-700 text-white"
                      : "text-[var(--texto)] hover:bg-areia-100 dark:hover:bg-areia-800",
                  )}
                >
                  <Icone className="size-4.5 shrink-0" />
                  {item.rotulo}
                </Link>

                {estaAtivo && item.subitens && item.subitens.length > 1 && (
                  <ul className="mt-0.5 mb-1 ml-4 flex flex-col gap-0.5 border-l border-[var(--borda)] pl-3">
                    {item.subitens.map((sub) => (
                      <li key={sub.href}>
                        <Link
                          href={sub.href}
                          className={cn(
                            "block rounded-md px-2.5 py-1.5 text-sm transition-colors",
                            pathname === sub.href
                              ? "bg-areia-200 font-medium dark:bg-areia-700"
                              : "texto-suave hover:bg-areia-100 dark:hover:bg-areia-800",
                          )}
                        >
                          {sub.rotulo}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}

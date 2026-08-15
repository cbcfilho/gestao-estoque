"use client";

import { Menu } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { ICONES_NAVEGACAO } from "@/components/layout/icones-navegacao";
import { Modal } from "@/components/ui/modal";
import type { ItemNavegacao } from "@/lib/navegacao";
import { cn } from "@/lib/utils";

function ativo(pathname: string, href: string) {
  if (href === "/painel") return pathname === "/painel";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Barra fixa no rodapé do celular. Mantém quatro destinos e um "Mais" que
 * abre o menu completo — o operador de loja alcança tudo com o polegar.
 */
export function NavegacaoInferior({
  principais,
  todos,
}: {
  principais: ItemNavegacao[];
  todos: ItemNavegacao[];
}) {
  const pathname = usePathname();
  const [menuAberto, setMenuAberto] = useState(false);

  return (
    <>
      <nav
        className="nao-imprimir fixed inset-x-0 bottom-0 z-40 border-t border-[var(--borda)] bg-[var(--superficie)] lg:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <ul className="grid grid-cols-5">
          {principais.map((item) => {
            const estaAtivo = ativo(pathname, item.href);
            const Icone = ICONES_NAVEGACAO[item.icone];
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={estaAtivo ? "page" : undefined}
                  className={cn(
                    "flex flex-col items-center gap-0.5 px-1 py-2 text-[11px] font-medium transition-colors",
                    estaAtivo ? "text-cacau-700 dark:text-cacau-300" : "texto-suave",
                  )}
                >
                  <Icone className="size-5.5" />
                  <span className="truncate">{item.rotulo}</span>
                </Link>
              </li>
            );
          })}

          <li>
            <button
              type="button"
              onClick={() => setMenuAberto(true)}
              className="flex w-full flex-col items-center gap-0.5 px-1 py-2 text-[11px] font-medium texto-suave"
            >
              <Menu className="size-5.5" />
              Mais
            </button>
          </li>
        </ul>
      </nav>

      <Modal
        aberto={menuAberto}
        aoFechar={() => setMenuAberto(false)}
        titulo="Menu"
        descricao="Todas as áreas disponíveis para o seu perfil."
      >
        <ul className="flex flex-col gap-1">
          {todos.map((item) => {
            const Icone = ICONES_NAVEGACAO[item.icone];
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setMenuAberto(false)}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-3 font-medium transition-colors",
                    ativo(pathname, item.href)
                      ? "bg-cacau-700 text-white"
                      : "hover:bg-areia-100 dark:hover:bg-areia-800",
                  )}
                >
                  <Icone className="size-5 shrink-0" />
                  {item.rotulo}
                </Link>
              </li>
            );
          })}
        </ul>
      </Modal>
    </>
  );
}

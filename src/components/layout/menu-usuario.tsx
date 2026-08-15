"use client";

import { LogOut, Moon, Sun, User } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { sair } from "@/actions/auth";
import { useTemaEscuro } from "@/lib/hooks";
import { cn } from "@/lib/utils";

export function MenuUsuario({
  nome,
  email,
  perfil,
}: {
  nome: string;
  email: string;
  perfil: string;
}) {
  const [aberto, setAberto] = useState(false);
  const escuro = useTemaEscuro();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;

    function aoClicarFora(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false);
    }
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === "Escape") setAberto(false);
    }

    document.addEventListener("mousedown", aoClicarFora);
    document.addEventListener("keydown", aoTeclar);
    return () => {
      document.removeEventListener("mousedown", aoClicarFora);
      document.removeEventListener("keydown", aoTeclar);
    };
  }, [aberto]);

  function alternarTema() {
    // A classe no <html> é a fonte da verdade; useTemaEscuro observa a mudança.
    const novo = !escuro;
    document.documentElement.classList.toggle("dark", novo);
    localStorage.setItem("tema", novo ? "escuro" : "claro");
  }

  const iniciais = nome
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={aberto}
        className="grid size-9 place-items-center rounded-full bg-cacau-700 text-sm font-semibold text-white transition-opacity hover:opacity-90"
      >
        {iniciais || <User className="size-4" />}
      </button>

      <div
        role="menu"
        className={cn(
          "absolute right-0 z-50 mt-2 w-60 origin-top-right rounded-xl border border-[var(--borda)] bg-[var(--superficie)] p-1.5 shadow-lg transition",
          aberto ? "visible scale-100 opacity-100" : "invisible scale-95 opacity-0",
        )}
      >
        <div className="border-b border-[var(--borda)] px-3 py-2.5">
          <p className="truncate font-medium">{nome}</p>
          <p className="truncate text-sm texto-suave">{email}</p>
          <p className="mt-1 text-xs texto-suave">{perfil}</p>
        </div>

        <Link
          href="/perfil"
          role="menuitem"
          onClick={() => setAberto(false)}
          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium hover:bg-areia-100 dark:hover:bg-areia-800"
        >
          <User className="size-4" />
          Meu perfil e segurança
        </Link>

        <button
          type="button"
          role="menuitem"
          onClick={alternarTema}
          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium hover:bg-areia-100 dark:hover:bg-areia-800"
        >
          {escuro ? <Sun className="size-4" /> : <Moon className="size-4" />}
          {escuro ? "Tema claro" : "Tema escuro"}
        </button>

        <form action={sair}>
          <button
            type="submit"
            role="menuitem"
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
          >
            <LogOut className="size-4" />
            Sair
          </button>
        </form>
      </div>
    </div>
  );
}

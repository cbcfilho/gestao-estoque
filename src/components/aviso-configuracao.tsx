"use client";

import { TriangleAlert } from "lucide-react";

/**
 * Avisa quando as variáveis públicas não chegaram ao navegador.
 *
 * `NEXT_PUBLIC_*` é substituída pelo valor real durante o build e vai embutida
 * no JavaScript. Se a variável não existir no momento do build, o lugar dela
 * fica vazio — e aí a busca de produtos, a leitura de código de barras e o sino
 * de notificações quebram, mas só quando alguém tenta usá-las, com um erro
 * críptico. Esta checagem transforma essa falha silenciosa em um aviso na tela
 * de login, antes de qualquer pessoa depender do sistema.
 */
export function AvisoConfiguracao() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const faltando = [
    !url && "NEXT_PUBLIC_SUPABASE_URL",
    !chave && "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  ].filter(Boolean) as string[];

  if (faltando.length === 0) return null;

  return (
    <div className="mb-4 flex gap-2.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100">
      <TriangleAlert className="mt-0.5 size-4 shrink-0" />
      <div>
        <p className="font-medium">Sistema mal configurado</p>
        <p className="mt-0.5">
          Não chegaram ao navegador: {faltando.join(", ")}. O login pode até funcionar, mas a
          busca de produtos e a leitura de código de barras vão falhar. Cadastre as variáveis
          nas configurações do projeto e publique de novo.
        </p>
      </div>
    </div>
  );
}

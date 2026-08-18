"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Cliente Supabase para componentes que rodam no navegador.
 * Usa a chave pública (anon) — toda a autorização real está nas policies RLS.
 */
export function criarClienteNavegador() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Sem isso o erro apareceria só lá na frente, como "Failed to construct URL",
  // sem indicar que a causa é uma variável ausente no momento do build.
  if (!url || !chave) {
    throw new Error(
      "Configuração ausente: NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY " +
        "precisam estar definidas no momento do build. Cadastre-as nas variáveis de " +
        "ambiente do projeto e publique novamente.",
    );
  }

  return createBrowserClient(url, chave);
}

let clienteSingleton: ReturnType<typeof criarClienteNavegador> | null = null;

/** Reaproveita a mesma instância entre renders para não perder a sessão em memória. */
export function supabaseNavegador() {
  clienteSingleton ??= criarClienteNavegador();
  return clienteSingleton;
}

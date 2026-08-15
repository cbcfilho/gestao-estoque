"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Cliente Supabase para componentes que rodam no navegador.
 * Usa a chave pública (anon) — toda a autorização real está nas policies RLS.
 */
export function criarClienteNavegador() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

let clienteSingleton: ReturnType<typeof criarClienteNavegador> | null = null;

/** Reaproveita a mesma instância entre renders para não perder a sessão em memória. */
export function supabaseNavegador() {
  clienteSingleton ??= criarClienteNavegador();
  return clienteSingleton;
}

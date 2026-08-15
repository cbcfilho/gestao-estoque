import { cookies } from "next/headers";

import { resolverFilialAtiva } from "@/lib/auth";
import type { Filial, UsuarioSessao } from "@/types/database";

export const COOKIE_FILIAL = "filial_ativa";

/**
 * Filial em uso na navegação. Guardada em cookie para que os Server
 * Components leiam o mesmo contexto sem precisar de query string em toda rota.
 * A escolha nunca amplia acesso: `resolverFilialAtiva` só aceita filiais que
 * já estão na sessão, e a RLS valida de novo no banco.
 */
export async function obterFilialAtiva(sessao: UsuarioSessao): Promise<Filial | null> {
  const cookieStore = await cookies();
  const salva = cookieStore.get(COOKIE_FILIAL)?.value;
  return resolverFilialAtiva(sessao, salva);
}

/**
 * Filiais consideradas nas consultas: a ativa, ou todas quando o usuário tem
 * escopo global e escolheu "Todas as filiais".
 */
export async function escopoDeFiliais(sessao: UsuarioSessao): Promise<{
  filialAtiva: Filial | null;
  todas: boolean;
  ids: string[];
}> {
  const cookieStore = await cookies();
  const salva = cookieStore.get(COOKIE_FILIAL)?.value;

  const podeVerTodas = sessao.perfil.escopo === "global";
  const todas = podeVerTodas && salva === "todas";

  if (todas) {
    return { filialAtiva: null, todas: true, ids: sessao.filiais.map((f) => f.id) };
  }

  const filialAtiva = resolverFilialAtiva(sessao, salva);
  return {
    filialAtiva,
    todas: false,
    ids: filialAtiva ? [filialAtiva.id] : [],
  };
}

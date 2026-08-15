import { cache } from "react";
import { redirect } from "next/navigation";

import { supabaseServidor } from "@/lib/supabase/server";
import type { ChavePermissao } from "@/lib/permissoes";
import type { Filial, Perfil, Usuario, UsuarioSessao } from "@/types/database";

/**
 * Carrega o usuário logado com perfil, permissões e filiais acessíveis.
 * Memoizado por requisição — chame à vontade dentro da mesma render.
 */
export const obterSessao = cache(async (): Promise<UsuarioSessao | null> => {
  const supabase = await supabaseServidor();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: usuario, error } = await supabase
    .from("usuarios")
    .select("*, perfil:perfis(*)")
    .eq("id", user.id)
    .single<Usuario & { perfil: Perfil }>();

  if (error || !usuario || !usuario.ativo) return null;

  const [{ data: permissoes }, { data: filiais }] = await Promise.all([
    supabase
      .from("perfil_permissoes")
      .select("permissao_chave")
      .eq("perfil_id", usuario.perfil_id),
    // A RLS de `filiais` já restringe ao escopo do usuário: se o perfil é
    // global vêm todas, senão só as vinculadas.
    supabase.from("filiais").select("*").eq("ativo", true).order("nome"),
  ]);

  return {
    ...usuario,
    permissoes: (permissoes ?? []).map((p) => p.permissao_chave as string),
    filiais: (filiais ?? []) as Filial[],
  };
});

/**
 * Verifica se falta o segundo fator.
 *
 * `nextLevel === "aal2"` significa que a conta tem 2FA ativo; se o nível atual
 * ainda é aal1, o usuário entrou com a senha mas não confirmou o código.
 * A leitura é local (decodifica o JWT), sem ida ao servidor.
 */
export const exigeSegundoFator = cache(async (): Promise<boolean> => {
  const supabase = await supabaseServidor();
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

  if (error || !data) return false;
  return data.nextLevel === "aal2" && data.currentLevel !== "aal2";
});

/** Redireciona para o login quando não há sessão válida. */
export async function exigirSessao(): Promise<UsuarioSessao> {
  const sessao = await obterSessao();
  if (!sessao) redirect("/login");

  if (await exigeSegundoFator()) redirect("/verificar-2fa");

  return sessao;
}

export function temPermissao(sessao: UsuarioSessao | null, chave: ChavePermissao): boolean {
  return !!sessao?.permissoes.includes(chave);
}

export function temAlgumaPermissao(
  sessao: UsuarioSessao | null,
  chaves: ChavePermissao[],
): boolean {
  return chaves.some((chave) => temPermissao(sessao, chave));
}

/**
 * Garante sessão + permissão. Use no topo de páginas e Server Actions.
 * O banco também valida (RLS e RPCs); esta checagem é a primeira barreira,
 * para dar erro claro e não renderizar telas que o usuário não pode usar.
 */
export async function exigirPermissao(chave: ChavePermissao): Promise<UsuarioSessao> {
  const sessao = await exigirSessao();
  if (!temPermissao(sessao, chave)) {
    redirect("/sem-permissao");
  }
  return sessao;
}

/** Versão para Server Actions: lança em vez de redirecionar. */
export async function exigirPermissaoAction(chave: ChavePermissao): Promise<UsuarioSessao> {
  const sessao = await obterSessao();
  if (!sessao) throw new Error("Sessão expirada. Faça login novamente.");
  if (!sessao.permissoes.includes(chave)) {
    throw new Error("Você não tem permissão para executar esta ação.");
  }
  return sessao;
}

export function podeAcessarFilial(sessao: UsuarioSessao | null, filialId: string): boolean {
  if (!sessao) return false;
  if (sessao.perfil.escopo === "global") return true;
  return sessao.filiais.some((f) => f.id === filialId);
}

/** Filial ativa: a informada, senão a padrão do usuário, senão a primeira. */
export function resolverFilialAtiva(
  sessao: UsuarioSessao,
  filialIdSolicitada?: string | null,
): Filial | null {
  if (filialIdSolicitada) {
    const encontrada = sessao.filiais.find((f) => f.id === filialIdSolicitada);
    if (encontrada) return encontrada;
  }
  if (sessao.filial_padrao_id) {
    const padrao = sessao.filiais.find((f) => f.id === sessao.filial_padrao_id);
    if (padrao) return padrao;
  }
  return sessao.filiais[0] ?? null;
}

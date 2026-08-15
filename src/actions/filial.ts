"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

import { exigirSessao } from "@/lib/auth";
import { COOKIE_FILIAL } from "@/lib/filial";

/** Troca a filial em uso. Só aceita filiais às quais o usuário tem acesso. */
export async function definirFilialAtiva(filialId: string) {
  const sessao = await exigirSessao();

  const valida =
    (filialId === "todas" && sessao.perfil.escopo === "global") ||
    sessao.filiais.some((f) => f.id === filialId);

  if (!valida) {
    throw new Error("Você não tem acesso a esta filial.");
  }

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_FILIAL, filialId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  revalidatePath("/", "layout");
}

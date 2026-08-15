"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";

import { supabaseServidor } from "@/lib/supabase/server";
import { mensagemErro } from "@/lib/utils";

export type EstadoFormulario = { erro?: string; sucesso?: string } | null;

export async function entrar(
  _estado: EstadoFormulario,
  dados: FormData,
): Promise<EstadoFormulario> {
  const email = String(dados.get("email") ?? "").trim();
  const senha = String(dados.get("senha") ?? "");
  const destino = String(dados.get("redirecionar") ?? "/painel");

  if (!email || !senha) {
    return { erro: "Informe o e-mail e a senha." };
  }

  const supabase = await supabaseServidor();
  const { error } = await supabase.auth.signInWithPassword({ email, password: senha });

  if (error) {
    // Mensagem genérica de propósito: não revela se o e-mail existe.
    if (error.message.toLowerCase().includes("invalid")) {
      return { erro: "E-mail ou senha incorretos." };
    }
    if (error.message.toLowerCase().includes("email not confirmed")) {
      return { erro: "Este e-mail ainda não foi confirmado. Verifique sua caixa de entrada." };
    }
    return { erro: mensagemErro(error) };
  }

  // Registra o último acesso — usado na tela de usuários.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    await supabase
      .from("usuarios")
      .update({ ultimo_acesso: new Date().toISOString() })
      .eq("id", user.id);
  }

  revalidatePath("/", "layout");
  redirect(destino.startsWith("/") ? destino : "/painel");
}

export async function sair() {
  const supabase = await supabaseServidor();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}

export async function solicitarRecuperacao(
  _estado: EstadoFormulario,
  dados: FormData,
): Promise<EstadoFormulario> {
  const email = String(dados.get("email") ?? "").trim();
  if (!email) return { erro: "Informe o e-mail." };

  const cabecalhos = await headers();
  const origem =
    process.env.NEXT_PUBLIC_SITE_URL ??
    `${cabecalhos.get("x-forwarded-proto") ?? "http"}://${cabecalhos.get("host")}`;

  const supabase = await supabaseServidor();
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origem}/auth/callback?proximo=/redefinir-senha`,
  });

  // Resposta idêntica mesmo se o e-mail não existir, para não vazar cadastros.
  return {
    sucesso:
      "Se este e-mail estiver cadastrado, você receberá um link para redefinir a senha em instantes.",
  };
}

export async function redefinirSenha(
  _estado: EstadoFormulario,
  dados: FormData,
): Promise<EstadoFormulario> {
  const senha = String(dados.get("senha") ?? "");
  const confirmacao = String(dados.get("confirmacao") ?? "");

  if (senha.length < 8) {
    return { erro: "A senha precisa ter pelo menos 8 caracteres." };
  }
  if (senha !== confirmacao) {
    return { erro: "As senhas não conferem." };
  }

  const supabase = await supabaseServidor();
  const { error } = await supabase.auth.updateUser({ password: senha });

  if (error) return { erro: mensagemErro(error) };

  revalidatePath("/", "layout");
  redirect("/painel");
}

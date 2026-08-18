"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { origemDoSite } from "@/lib/site";
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

  // O último acesso não é registrado aqui: um gatilho no banco (migration 0011)
  // espelha auth.users.last_sign_in_at para usuarios.ultimo_acesso. Assim vale
  // para qualquer forma de entrar — senha, link de convite, recuperação — e não
  // só para este formulário.
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

  const origem = await origemDoSite();

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

"use server";

import { revalidatePath } from "next/cache";

import type { Resultado } from "@/actions/estoque";
import { obterSessao } from "@/lib/auth";
import { supabaseServidor } from "@/lib/supabase/server";
import { mensagemErro } from "@/lib/utils";

export interface FatorMfa {
  id: string;
  nome: string;
  status: string;
  criado_em: string;
}

export async function listarFatores(): Promise<Resultado<FatorMfa[]>> {
  try {
    const supabase = await supabaseServidor();
    const { data, error } = await supabase.auth.mfa.listFactors();

    if (error) return { ok: false, erro: mensagemErro(error) };

    return {
      ok: true,
      dados: (data.totp ?? []).map((f) => ({
        id: f.id,
        nome: f.friendly_name ?? "Aplicativo autenticador",
        status: f.status,
        criado_em: f.created_at,
      })),
    };
  } catch (erro) {
    return { ok: false, erro: mensagemErro(erro) };
  }
}

/** Passo 1: cria o fator e devolve o QR Code para o app autenticador. */
export async function iniciarCadastro2fa(
  nome: string,
): Promise<Resultado<{ fatorId: string; qrCode: string; segredo: string }>> {
  try {
    const sessao = await obterSessao();
    if (!sessao) return { ok: false, erro: "Sessão expirada." };

    const supabase = await supabaseServidor();

    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: nome || `Autenticador de ${sessao.nome}`,
    });

    if (error) return { ok: false, erro: mensagemErro(error) };

    return {
      ok: true,
      dados: {
        fatorId: data.id,
        qrCode: data.totp.qr_code,
        segredo: data.totp.secret,
      },
    };
  } catch (erro) {
    return { ok: false, erro: mensagemErro(erro) };
  }
}

/** Passo 2: confirma o cadastro com o código de 6 dígitos. */
export async function confirmarCadastro2fa(
  fatorId: string,
  codigo: string,
): Promise<Resultado> {
  try {
    const supabase = await supabaseServidor();

    const { data: desafio, error: erroDesafio } = await supabase.auth.mfa.challenge({
      factorId: fatorId,
    });

    if (erroDesafio) return { ok: false, erro: mensagemErro(erroDesafio) };

    const { error } = await supabase.auth.mfa.verify({
      factorId: fatorId,
      challengeId: desafio.id,
      code: codigo.replace(/\D/g, ""),
    });

    if (error) {
      return {
        ok: false,
        erro: "Código incorreto. Confira o horário do celular e tente o código atual.",
      };
    }

    revalidatePath("/perfil");

    return {
      ok: true,
      dados: undefined,
      mensagem: "Verificação em duas etapas ativada.",
    };
  } catch (erro) {
    return { ok: false, erro: mensagemErro(erro) };
  }
}

/** Verificação no login, quando a conta já tem 2FA ativo. */
export async function verificar2fa(codigo: string): Promise<Resultado> {
  try {
    const supabase = await supabaseServidor();

    const { data: fatores, error: erroFatores } = await supabase.auth.mfa.listFactors();
    if (erroFatores) return { ok: false, erro: mensagemErro(erroFatores) };

    const fator = (fatores.totp ?? []).find((f) => f.status === "verified");
    if (!fator) return { ok: false, erro: "Nenhum aplicativo autenticador cadastrado." };

    const { data: desafio, error: erroDesafio } = await supabase.auth.mfa.challenge({
      factorId: fator.id,
    });
    if (erroDesafio) return { ok: false, erro: mensagemErro(erroDesafio) };

    const { error } = await supabase.auth.mfa.verify({
      factorId: fator.id,
      challengeId: desafio.id,
      code: codigo.replace(/\D/g, ""),
    });

    if (error) return { ok: false, erro: "Código incorreto ou expirado." };

    revalidatePath("/", "layout");

    return { ok: true, dados: undefined };
  } catch (erro) {
    return { ok: false, erro: mensagemErro(erro) };
  }
}

export async function removerFator2fa(fatorId: string): Promise<Resultado> {
  try {
    const supabase = await supabaseServidor();
    const { error } = await supabase.auth.mfa.unenroll({ factorId: fatorId });

    if (error) return { ok: false, erro: mensagemErro(error) };

    revalidatePath("/perfil");

    return { ok: true, dados: undefined, mensagem: "Verificação em duas etapas desativada." };
  } catch (erro) {
    return { ok: false, erro: mensagemErro(erro) };
  }
}

/* -------------------------------------------------------------------------- */
/* Notificações push                                                           */
/* -------------------------------------------------------------------------- */

export async function salvarInscricaoPush(inscricao: {
  endpoint: string;
  p256dh: string;
  auth: string;
}): Promise<Resultado> {
  try {
    const sessao = await obterSessao();
    if (!sessao) return { ok: false, erro: "Sessão expirada." };

    const supabase = await supabaseServidor();

    const { error } = await supabase.from("push_subscriptions").upsert(
      {
        usuario_id: sessao.id,
        endpoint: inscricao.endpoint,
        p256dh: inscricao.p256dh,
        auth: inscricao.auth,
      },
      { onConflict: "endpoint" },
    );

    if (error) return { ok: false, erro: mensagemErro(error) };

    return { ok: true, dados: undefined, mensagem: "Notificações ativadas neste aparelho." };
  } catch (erro) {
    return { ok: false, erro: mensagemErro(erro) };
  }
}

export async function removerInscricaoPush(endpoint: string): Promise<Resultado> {
  try {
    const supabase = await supabaseServidor();
    const { error } = await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);

    if (error) return { ok: false, erro: mensagemErro(error) };

    return { ok: true, dados: undefined, mensagem: "Notificações desativadas neste aparelho." };
  } catch (erro) {
    return { ok: false, erro: mensagemErro(erro) };
  }
}

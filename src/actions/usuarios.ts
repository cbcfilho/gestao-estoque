"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";

import type { Resultado } from "@/actions/estoque";
import { exigirPermissaoAction } from "@/lib/auth";
import { PERMISSOES } from "@/lib/permissoes";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServidor } from "@/lib/supabase/server";
import { mensagemErro } from "@/lib/utils";

const esquemaConvite = z.object({
  nome: z.string().trim().min(2, "Informe o nome do colaborador."),
  email: z.email("E-mail inválido."),
  perfil_chave: z.string().trim().min(1, "Escolha o perfil de acesso."),
  filiais: z.array(z.string().uuid()).default([]),
});

/**
 * Convida um colaborador por e-mail.
 *
 * Usa a service role porque criar usuário no Auth é operação administrativa —
 * por isso a permissão é conferida aqui, na primeira linha, antes de qualquer
 * chamada com a chave privilegiada.
 */
export async function convidarUsuario(entrada: unknown): Promise<Resultado<string>> {
  try {
    const sessao = await exigirPermissaoAction(PERMISSOES.usuariosGerenciar);

    const dados = esquemaConvite.parse(entrada);

    // Um gerente não pode conceder acesso a filial que ele mesmo não tem.
    if (sessao.perfil.escopo !== "global") {
      const permitidas = new Set(sessao.filiais.map((f) => f.id));
      const invasao = dados.filiais.filter((f) => !permitidas.has(f));
      if (invasao.length > 0) {
        return { ok: false, erro: "Você só pode vincular usuários às suas próprias filiais." };
      }
    }

    const supabase = await supabaseServidor();

    const { data: perfil } = await supabase
      .from("perfis")
      .select("id, escopo")
      .eq("chave", dados.perfil_chave)
      .maybeSingle();

    if (!perfil) return { ok: false, erro: "Perfil de acesso não encontrado." };

    // Só quem tem escopo global pode criar outro usuário de escopo global.
    if (perfil.escopo === "global" && sessao.perfil.escopo !== "global") {
      return { ok: false, erro: "Você não pode criar usuários com acesso a todas as filiais." };
    }

    const cabecalhos = await headers();
    const origem =
      process.env.NEXT_PUBLIC_SITE_URL ??
      `${cabecalhos.get("x-forwarded-proto") ?? "http"}://${cabecalhos.get("host")}`;

    const admin = supabaseAdmin();

    const { data: convite, error } = await admin.auth.admin.inviteUserByEmail(dados.email, {
      data: { nome: dados.nome, perfil: dados.perfil_chave },
      redirectTo: `${origem}/auth/callback?proximo=/redefinir-senha`,
    });

    if (error) {
      if (error.message.toLowerCase().includes("already been registered")) {
        return { ok: false, erro: "Já existe um usuário com este e-mail." };
      }
      return { ok: false, erro: mensagemErro(error) };
    }

    const usuarioId = convite.user.id;

    // O trigger já criou a linha em `usuarios`; aqui garantimos nome e perfil.
    await admin
      .from("usuarios")
      .update({ nome: dados.nome, perfil_id: perfil.id })
      .eq("id", usuarioId);

    if (dados.filiais.length > 0) {
      await admin.from("usuario_filiais").upsert(
        dados.filiais.map((filialId) => ({ usuario_id: usuarioId, filial_id: filialId })),
        { onConflict: "usuario_id,filial_id", ignoreDuplicates: true },
      );
    }

    revalidatePath("/configuracoes/usuarios");

    return {
      ok: true,
      dados: usuarioId,
      mensagem: `Convite enviado para ${dados.email}.`,
    };
  } catch (erro) {
    if (erro instanceof z.ZodError) {
      return { ok: false, erro: erro.issues[0]?.message ?? "Dados inválidos." };
    }
    return { ok: false, erro: mensagemErro(erro) };
  }
}

const esquemaAtualizacao = z.object({
  id: z.string().uuid(),
  nome: z.string().trim().min(2, "Informe o nome."),
  perfil_id: z.string().uuid("Escolha o perfil de acesso."),
  filial_padrao_id: z.string().uuid().optional().or(z.literal("")),
  ativo: z.coerce.boolean(),
  filiais: z.array(z.string().uuid()).default([]),
});

export async function atualizarUsuario(entrada: unknown): Promise<Resultado> {
  try {
    const sessao = await exigirPermissaoAction(PERMISSOES.usuariosGerenciar);
    const dados = esquemaAtualizacao.parse(entrada);

    if (dados.id === sessao.id && !dados.ativo) {
      return { ok: false, erro: "Você não pode desativar o seu próprio usuário." };
    }

    const supabase = await supabaseServidor();

    const { error } = await supabase
      .from("usuarios")
      .update({
        nome: dados.nome,
        perfil_id: dados.perfil_id,
        filial_padrao_id: dados.filial_padrao_id || null,
        ativo: dados.ativo,
      })
      .eq("id", dados.id);

    if (error) return { ok: false, erro: mensagemErro(error) };

    const { data: atuais } = await supabase
      .from("usuario_filiais")
      .select("filial_id")
      .eq("usuario_id", dados.id);

    const antigas = (atuais ?? []).map((v) => v.filial_id as string);
    const remover = antigas.filter((f) => !dados.filiais.includes(f));
    const adicionar = dados.filiais.filter((f) => !antigas.includes(f));

    if (remover.length > 0) {
      await supabase
        .from("usuario_filiais")
        .delete()
        .eq("usuario_id", dados.id)
        .in("filial_id", remover);
    }

    if (adicionar.length > 0) {
      await supabase
        .from("usuario_filiais")
        .insert(adicionar.map((filialId) => ({ usuario_id: dados.id, filial_id: filialId })));
    }

    revalidatePath("/configuracoes/usuarios");

    return { ok: true, dados: undefined, mensagem: "Usuário atualizado." };
  } catch (erro) {
    if (erro instanceof z.ZodError) {
      return { ok: false, erro: erro.issues[0]?.message ?? "Dados inválidos." };
    }
    return { ok: false, erro: mensagemErro(erro) };
  }
}

export async function reenviarConvite(email: string): Promise<Resultado> {
  try {
    await exigirPermissaoAction(PERMISSOES.usuariosGerenciar);

    const cabecalhos = await headers();
    const origem =
      process.env.NEXT_PUBLIC_SITE_URL ??
      `${cabecalhos.get("x-forwarded-proto") ?? "http"}://${cabecalhos.get("host")}`;

    const supabase = await supabaseServidor();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${origem}/auth/callback?proximo=/redefinir-senha`,
    });

    if (error) return { ok: false, erro: mensagemErro(error) };

    return {
      ok: true,
      dados: undefined,
      mensagem: `Link de acesso reenviado para ${email}.`,
    };
  } catch (erro) {
    return { ok: false, erro: mensagemErro(erro) };
  }
}

/* -------------------------------------------------------------------------- */
/* Perfis e permissões                                                         */
/* -------------------------------------------------------------------------- */

const esquemaPerfil = z.object({
  id: z.string().uuid().optional().or(z.literal("")),
  chave: z
    .string()
    .trim()
    .min(2)
    .regex(/^[a-z0-9_]+$/, "Use apenas letras minúsculas, números e underline."),
  nome: z.string().trim().min(2, "Informe o nome do perfil."),
  descricao: z.string().trim().max(300).optional().or(z.literal("")),
  escopo: z.enum(["global", "filial"]),
  permissoes: z.array(z.string()).default([]),
});

export async function salvarPerfil(entrada: unknown): Promise<Resultado<string>> {
  try {
    const sessao = await exigirPermissaoAction(PERMISSOES.perfisGerenciar);
    const dados = esquemaPerfil.parse(entrada);

    // Ninguém pode criar um perfil mais poderoso do que o próprio.
    const excedentes = dados.permissoes.filter((p) => !sessao.permissoes.includes(p));
    if (excedentes.length > 0) {
      return {
        ok: false,
        erro: "Você não pode conceder permissões que o seu próprio perfil não tem.",
      };
    }

    const supabase = await supabaseServidor();
    let perfilId = dados.id || "";

    const registro = {
      chave: dados.chave,
      nome: dados.nome,
      descricao: dados.descricao || null,
      escopo: dados.escopo,
    };

    if (perfilId) {
      const { error } = await supabase.from("perfis").update(registro).eq("id", perfilId);
      if (error) return { ok: false, erro: mensagemErro(error) };
    } else {
      const { data, error } = await supabase.from("perfis").insert(registro).select("id").single();
      if (error) return { ok: false, erro: mensagemErro(error) };
      perfilId = data.id as string;
    }

    await supabase.from("perfil_permissoes").delete().eq("perfil_id", perfilId);

    if (dados.permissoes.length > 0) {
      const { error } = await supabase.from("perfil_permissoes").insert(
        dados.permissoes.map((chave) => ({ perfil_id: perfilId, permissao_chave: chave })),
      );
      if (error) return { ok: false, erro: mensagemErro(error) };
    }

    revalidatePath("/configuracoes/perfis");
    revalidatePath("/", "layout");

    return { ok: true, dados: perfilId, mensagem: "Perfil salvo." };
  } catch (erro) {
    if (erro instanceof z.ZodError) {
      return { ok: false, erro: erro.issues[0]?.message ?? "Dados inválidos." };
    }
    return { ok: false, erro: mensagemErro(erro) };
  }
}

export async function excluirPerfil(id: string): Promise<Resultado> {
  try {
    await exigirPermissaoAction(PERMISSOES.perfisGerenciar);

    const supabase = await supabaseServidor();

    const { data: perfil } = await supabase
      .from("perfis")
      .select("sistema")
      .eq("id", id)
      .maybeSingle();

    if (perfil?.sistema) {
      return {
        ok: false,
        erro: "Perfis padrão do sistema não podem ser excluídos — só ter as permissões ajustadas.",
      };
    }

    const { count } = await supabase
      .from("usuarios")
      .select("id", { count: "exact", head: true })
      .eq("perfil_id", id);

    if ((count ?? 0) > 0) {
      return {
        ok: false,
        erro: `Existem ${count} usuários com este perfil. Mova-os para outro perfil antes de excluir.`,
      };
    }

    const { error } = await supabase.from("perfis").delete().eq("id", id);
    if (error) return { ok: false, erro: mensagemErro(error) };

    revalidatePath("/configuracoes/perfis");

    return { ok: true, dados: undefined, mensagem: "Perfil excluído." };
  } catch (erro) {
    return { ok: false, erro: mensagemErro(erro) };
  }
}

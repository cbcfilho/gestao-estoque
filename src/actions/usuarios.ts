"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { Resultado } from "@/actions/estoque";
import { exigirPermissaoAction } from "@/lib/auth";
import { PERMISSOES } from "@/lib/permissoes";
import { origemDoSite } from "@/lib/site";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServidor } from "@/lib/supabase/server";
import { mensagemErro } from "@/lib/utils";

const esquemaConvite = z.object({
  nome: z.string().trim().min(2, "Informe o nome do colaborador."),
  email: z.email("E-mail inválido."),
  perfil_chave: z.string().trim().min(1, "Escolha o perfil de acesso."),
  filiais: z.array(z.string().uuid()).default([]),
});

export interface ResultadoConvite {
  usuarioId: string;
  /** Link de definição de senha, para o gestor enviar por conta própria. */
  link: string;
  /** Falso quando o e-mail não pôde ser enviado (limite do Supabase, SMTP ausente). */
  emailEnviado: boolean;
  motivoEmail?: string;
}

/**
 * Cria o acesso de um colaborador.
 *
 * O envio de e-mail é o elo mais frágil dessa operação: o serviço compartilhado
 * do Supabase libera poucas mensagens por hora e, sem SMTP próprio, o convite
 * simplesmente não chega. Por isso o e-mail é tratado como um extra, não como
 * requisito: o usuário é criado de qualquer forma e a função sempre devolve um
 * link de definição de senha, que o gestor pode repassar por WhatsApp.
 *
 * Usa a service role porque criar usuário no Auth é operação administrativa —
 * por isso a permissão é conferida na primeira linha, antes de qualquer chamada
 * com a chave privilegiada.
 */
export async function convidarUsuario(entrada: unknown): Promise<Resultado<ResultadoConvite>> {
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

    const origem = await origemDoSite();

    const admin = supabaseAdmin();
    const metadados = { nome: dados.nome, perfil: dados.perfil_chave };

    // 1) Tenta o convite por e-mail, que é o caminho mais confortável.
    let usuarioId: string | null = null;
    let emailEnviado = false;
    let motivoEmail: string | undefined;

    const convite = await admin.auth.admin.inviteUserByEmail(dados.email, {
      data: metadados,
      redirectTo: `${origem}/auth/callback?proximo=/redefinir-senha`,
    });

    if (!convite.error) {
      usuarioId = convite.data.user.id;
      emailEnviado = true;
    } else {
      const mensagem = String(convite.error.message ?? "").toLowerCase();

      if (mensagem.includes("already been registered") || mensagem.includes("already exists")) {
        return { ok: false, erro: "Já existe um usuário com este e-mail." };
      }

      motivoEmail = mensagem.includes("rate limit")
        ? "O Supabase atingiu o limite de e-mails por hora."
        : "O Supabase não conseguiu enviar o e-mail (SMTP não configurado).";

      // 2) O e-mail falhou, mas o acesso não pode ficar refém disso: cria o
      //    usuário direto, já com o e-mail confirmado.
      const criacao = await admin.auth.admin.createUser({
        email: dados.email,
        email_confirm: true,
        user_metadata: metadados,
      });

      if (criacao.error) {
        const m = criacao.error.message.toLowerCase();
        if (m.includes("already been registered") || m.includes("already exists")) {
          return { ok: false, erro: "Já existe um usuário com este e-mail." };
        }
        return { ok: false, erro: mensagemErro(criacao.error) };
      }

      usuarioId = criacao.data.user.id;
    }

    // O trigger já criou a linha em `usuarios`; aqui garantimos nome e perfil.
    await admin
      .from("usuarios")
      .update({ nome: dados.nome, perfil_id: perfil.id })
      .eq("id", usuarioId);

    if (dados.filiais.length > 0) {
      await admin.from("usuario_filiais").upsert(
        dados.filiais.map((filialId) => ({ usuario_id: usuarioId!, filial_id: filialId })),
        { onConflict: "usuario_id,filial_id", ignoreDuplicates: true },
      );
    }

    // 3) Gera o link de definição de senha sempre — serve tanto para o gestor
    //    repassar agora quanto para reenviar depois.
    const link = await gerarLinkAcesso(dados.email, origem);

    revalidatePath("/configuracoes/usuarios");

    return {
      ok: true,
      dados: { usuarioId: usuarioId!, link, emailEnviado, motivoEmail },
      mensagem: emailEnviado
        ? `Convite enviado para ${dados.email}.`
        : `Acesso criado para ${dados.email}. Envie o link abaixo para a pessoa.`,
    };
  } catch (erro) {
    if (erro instanceof z.ZodError) {
      return { ok: false, erro: erro.issues[0]?.message ?? "Dados inválidos." };
    }
    return { ok: false, erro: mensagemErro(erro) };
  }
}

/**
 * Monta um link de definição de senha apontando para o próprio sistema.
 *
 * Não usamos o `action_link` que o Supabase devolve: ele entrega a sessão no
 * fragmento da URL (#access_token), que nunca chega ao servidor. Com o
 * token_hash, a rota /auth/callback troca pela sessão via verifyOtp — o mesmo
 * caminho dos e-mails oficiais.
 */
async function gerarLinkAcesso(email: string, origem: string): Promise<string> {
  const admin = supabaseAdmin();

  const { data, error } = await admin.auth.admin.generateLink({
    type: "recovery",
    email,
  });

  if (error || !data.properties?.hashed_token) {
    throw new Error("Não foi possível gerar o link de acesso.");
  }

  const params = new URLSearchParams({
    token_hash: data.properties.hashed_token,
    type: "recovery",
    proximo: "/redefinir-senha",
  });

  return `${origem}/auth/callback?${params.toString()}`;
}

/** Gera um novo link de acesso para quem não recebeu (ou perdeu) o convite. */
export async function gerarLinkParaUsuario(email: string): Promise<Resultado<string>> {
  try {
    await exigirPermissaoAction(PERMISSOES.usuariosGerenciar);

    const origem = await origemDoSite();

    return { ok: true, dados: await gerarLinkAcesso(email, origem) };
  } catch (erro) {
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

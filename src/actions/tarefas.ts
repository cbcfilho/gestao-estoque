"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { Resultado } from "@/actions/estoque";
import { exigirPermissaoAction, obterSessao } from "@/lib/auth";
import { PERMISSOES } from "@/lib/permissoes";
import { supabaseServidor } from "@/lib/supabase/server";
import { mensagemErro } from "@/lib/utils";

const statusTarefa = z.enum(["a_fazer", "em_andamento", "atrasado", "concluido", "cancelado"]);
const prioridades = z.enum(["baixa", "media", "alta", "urgente"]);
const categorias = z.enum([
  "inventario",
  "ponto",
  "estoque_minimo",
  "vencimento",
  "reposicao",
  "transferencia",
  "outro",
]);

const esquemaTarefa = z.object({
  id: z.string().uuid().optional().or(z.literal("")),
  titulo: z.string().trim().min(3, "Descreva a tarefa em pelo menos 3 caracteres."),
  descricao: z.string().trim().max(2000).optional().or(z.literal("")),
  categoria: categorias.default("outro"),
  filial_id: z.string().uuid().optional().or(z.literal("")),
  responsavel_id: z.string().uuid().optional().or(z.literal("")),
  prioridade: prioridades.default("media"),
  prazo: z.string().optional().or(z.literal("")),
  status: statusTarefa.default("a_fazer"),
});

export async function salvarTarefa(entrada: unknown): Promise<Resultado<string>> {
  try {
    const sessao = await exigirPermissaoAction(PERMISSOES.tarefasCriar);
    const dados = esquemaTarefa.parse(entrada);

    const supabase = await supabaseServidor();

    const registro = {
      titulo: dados.titulo,
      descricao: dados.descricao || null,
      categoria: dados.categoria,
      filial_id: dados.filial_id || null,
      responsavel_id: dados.responsavel_id || null,
      prioridade: dados.prioridade,
      prazo: dados.prazo || null,
      status: dados.status,
    };

    let tarefaId = dados.id || "";

    if (tarefaId) {
      const { error } = await supabase.from("tarefas").update(registro).eq("id", tarefaId);
      if (error) return { ok: false, erro: mensagemErro(error) };
    } else {
      const { data, error } = await supabase
        .from("tarefas")
        .insert({ ...registro, tipo: "manual", criado_por: sessao.id })
        .select("id")
        .single();

      if (error) return { ok: false, erro: mensagemErro(error) };
      tarefaId = data.id as string;
    }

    revalidatePath("/atividades");
    revalidatePath("/painel");

    return { ok: true, dados: tarefaId, mensagem: "Tarefa salva." };
  } catch (erro) {
    if (erro instanceof z.ZodError) {
      return { ok: false, erro: erro.issues[0]?.message ?? "Dados inválidos." };
    }
    return { ok: false, erro: mensagemErro(erro) };
  }
}

/** Mover o card entre colunas do kanban. */
export async function moverTarefa(
  id: string,
  status: z.infer<typeof statusTarefa>,
): Promise<Resultado> {
  try {
    const sessao = await obterSessao();
    if (!sessao) return { ok: false, erro: "Sessão expirada." };

    const supabase = await supabaseServidor();

    // A RLS já limita quem pode mover: responsável pelo card ou quem tem
    // tarefas.gerenciar na filial.
    const { error } = await supabase.from("tarefas").update({ status }).eq("id", id);

    if (error) return { ok: false, erro: mensagemErro(error) };

    revalidatePath("/atividades");
    revalidatePath("/painel");

    return { ok: true, dados: undefined };
  } catch (erro) {
    return { ok: false, erro: mensagemErro(erro) };
  }
}

export async function excluirTarefa(id: string): Promise<Resultado> {
  try {
    await exigirPermissaoAction(PERMISSOES.tarefasGerenciar);

    const supabase = await supabaseServidor();
    const { error } = await supabase.from("tarefas").delete().eq("id", id).eq("tipo", "manual");

    if (error) return { ok: false, erro: mensagemErro(error) };

    revalidatePath("/atividades");

    return { ok: true, dados: undefined, mensagem: "Tarefa excluída." };
  } catch (erro) {
    return { ok: false, erro: mensagemErro(erro) };
  }
}

export async function comentarTarefa(tarefaId: string, texto: string): Promise<Resultado> {
  try {
    const sessao = await obterSessao();
    if (!sessao) return { ok: false, erro: "Sessão expirada." };

    if (!texto.trim()) return { ok: false, erro: "Escreva o comentário." };

    const supabase = await supabaseServidor();
    const { error } = await supabase.from("tarefa_comentarios").insert({
      tarefa_id: tarefaId,
      usuario_id: sessao.id,
      texto: texto.trim(),
    });

    if (error) return { ok: false, erro: mensagemErro(error) };

    revalidatePath("/atividades");

    return { ok: true, dados: undefined };
  } catch (erro) {
    return { ok: false, erro: mensagemErro(erro) };
  }
}

export async function anexarNaTarefa(
  tarefaId: string,
  nome: string,
  url: string,
  tamanho?: number,
): Promise<Resultado> {
  try {
    const sessao = await obterSessao();
    if (!sessao) return { ok: false, erro: "Sessão expirada." };

    const supabase = await supabaseServidor();
    const { error } = await supabase.from("tarefa_anexos").insert({
      tarefa_id: tarefaId,
      usuario_id: sessao.id,
      nome,
      url,
      tamanho: tamanho ?? null,
    });

    if (error) return { ok: false, erro: mensagemErro(error) };

    revalidatePath("/atividades");

    return { ok: true, dados: undefined, mensagem: "Anexo adicionado." };
  } catch (erro) {
    return { ok: false, erro: mensagemErro(erro) };
  }
}

export async function carregarDetalheTarefa(id: string): Promise<
  Resultado<{
    comentarios: { id: string; texto: string; criado_em: string; autor: string | null }[];
    anexos: { id: string; nome: string; url: string; criado_em: string }[];
  }>
> {
  try {
    const supabase = await supabaseServidor();

    const [{ data: comentarios }, { data: anexos }] = await Promise.all([
      supabase
        .from("tarefa_comentarios")
        .select("id, texto, criado_em, usuario:usuarios(nome)")
        .eq("tarefa_id", id)
        .order("criado_em"),
      supabase
        .from("tarefa_anexos")
        .select("id, nome, url, criado_em")
        .eq("tarefa_id", id)
        .order("criado_em"),
    ]);

    return {
      ok: true,
      dados: {
        comentarios: (comentarios ?? []).map((c) => ({
          id: c.id as string,
          texto: c.texto as string,
          criado_em: c.criado_em as string,
          // O join volta como array no tipo inferido, mas é 1-para-1 na prática.
          autor: (c.usuario as unknown as { nome: string } | null)?.nome ?? null,
        })),
        anexos: (anexos ?? []) as { id: string; nome: string; url: string; criado_em: string }[],
      },
    };
  } catch (erro) {
    return { ok: false, erro: mensagemErro(erro) };
  }
}

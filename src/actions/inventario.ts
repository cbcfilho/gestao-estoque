"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { Resultado } from "@/actions/estoque";
import { exigirPermissaoAction } from "@/lib/auth";
import { PERMISSOES } from "@/lib/permissoes";
import { supabaseServidor } from "@/lib/supabase/server";
import { mensagemErro } from "@/lib/utils";
import type { ItemContagem, TipoLocal } from "@/types/database";

const locais = z.enum(["deposito", "prateleira", "cafeteria"]);

const esquemaAbertura = z.object({
  filial_id: z.string().uuid("Selecione a filial."),
  tipo: z.enum(["geral", "parcial"]).default("geral"),
  locais: z.array(locais).min(1, "Escolha ao menos um local para contar."),
  categorias_ids: z.array(z.string().uuid()).default([]),
  competencia: z.string().optional().or(z.literal("")),
  descricao: z.string().trim().max(300).optional().or(z.literal("")),
});

export async function abrirInventario(entrada: unknown): Promise<Resultado<string>> {
  try {
    await exigirPermissaoAction(PERMISSOES.inventarioAbrir);

    const dados = esquemaAbertura.parse(entrada);
    const supabase = await supabaseServidor();

    const { data, error } = await supabase.rpc("fn_abrir_inventario", {
      p_filial_id: dados.filial_id,
      p_tipo: dados.tipo,
      p_locais: dados.locais,
      p_categorias_ids: dados.categorias_ids.length > 0 ? dados.categorias_ids : null,
      p_competencia: dados.competencia || null,
      p_descricao: dados.descricao || null,
    });

    if (error) return { ok: false, erro: mensagemErro(error) };

    revalidatePath("/inventario");

    return {
      ok: true,
      dados: data as string,
      mensagem: "Inventário aberto. A contagem já pode começar.",
    };
  } catch (erro) {
    if (erro instanceof z.ZodError) {
      return { ok: false, erro: erro.issues[0]?.message ?? "Dados inválidos." };
    }
    return { ok: false, erro: mensagemErro(erro) };
  }
}

/**
 * Lista de contagem. Vem da RPC justamente para NÃO trazer a quantidade do
 * sistema — é isso que mantém a contagem cega.
 */
export async function listarItensContagem(
  inventarioId: string,
  local?: TipoLocal,
  busca?: string,
  apenasPendentes = false,
): Promise<Resultado<ItemContagem[]>> {
  try {
    const supabase = await supabaseServidor();

    const { data, error } = await supabase.rpc("fn_inventario_itens_para_contagem", {
      p_inventario_id: inventarioId,
      p_local: local ?? null,
      p_busca: busca || null,
      p_apenas_pendentes: apenasPendentes,
    });

    if (error) return { ok: false, erro: mensagemErro(error) };

    return { ok: true, dados: (data ?? []) as ItemContagem[] };
  } catch (erro) {
    return { ok: false, erro: mensagemErro(erro) };
  }
}

const esquemaContagem = z.object({
  inventario_id: z.string().uuid(),
  produto_id: z.string().uuid(),
  local: locais,
  quantidade: z.coerce.number().min(0, "A quantidade não pode ser negativa."),
  lote: z.string().trim().max(60).optional().or(z.literal("")),
  data_validade: z.string().optional().or(z.literal("")),
  observacao: z.string().trim().max(300).optional().or(z.literal("")),
  somar: z.boolean().default(false),
});

export async function lancarContagem(entrada: unknown): Promise<Resultado<string>> {
  try {
    await exigirPermissaoAction(PERMISSOES.inventarioContar);

    const dados = esquemaContagem.parse(entrada);
    const supabase = await supabaseServidor();

    const { data, error } = await supabase.rpc("fn_lancar_contagem", {
      p_inventario_id: dados.inventario_id,
      p_produto_id: dados.produto_id,
      p_local: dados.local,
      p_quantidade: dados.quantidade,
      p_lote: dados.lote || null,
      p_data_validade: dados.data_validade || null,
      p_observacao: dados.observacao || null,
      p_somar: dados.somar,
    });

    if (error) return { ok: false, erro: mensagemErro(error) };

    return { ok: true, dados: data as string };
  } catch (erro) {
    if (erro instanceof z.ZodError) {
      return { ok: false, erro: erro.issues[0]?.message ?? "Dados inválidos." };
    }
    return { ok: false, erro: mensagemErro(erro) };
  }
}

/** Leitura por código de barras durante a contagem. */
export async function lancarContagemPorEan(
  inventarioId: string,
  ean: string,
  local: TipoLocal,
  quantidade = 1,
  somar = true,
): Promise<
  Resultado<{
    ok: boolean;
    erro?: string;
    mensagem?: string;
    produto_nome?: string;
    unidade?: string;
    quantidade_contada?: number;
  }>
> {
  try {
    await exigirPermissaoAction(PERMISSOES.inventarioContar);

    const supabase = await supabaseServidor();

    const { data, error } = await supabase.rpc("fn_lancar_contagem_por_ean", {
      p_inventario_id: inventarioId,
      p_ean: ean,
      p_local: local,
      p_quantidade: quantidade,
      p_lote: null,
      p_data_validade: null,
      p_somar: somar,
    });

    if (error) return { ok: false, erro: mensagemErro(error) };

    return { ok: true, dados: data as { ok: boolean } };
  } catch (erro) {
    return { ok: false, erro: mensagemErro(erro) };
  }
}

/**
 * Desfaz a contagem de um item.
 *
 * Se o item só existia por causa da contagem (produto achado na prateleira sem
 * saldo no sistema), ele é removido da lista; caso contrário volta para
 * "não contado", para ser conferido de novo.
 */
export async function desfazerContagem(
  itemId: string,
): Promise<Resultado<{ acao: "removido" | "contagem_desfeita" }>> {
  try {
    await exigirPermissaoAction(PERMISSOES.inventarioContar);

    const supabase = await supabaseServidor();
    const { data, error } = await supabase.rpc("fn_desfazer_contagem", {
      p_item_id: itemId,
    });

    if (error) return { ok: false, erro: mensagemErro(error) };

    const retorno = data as { acao: "removido" | "contagem_desfeita" };

    return {
      ok: true,
      dados: retorno,
      mensagem:
        retorno.acao === "removido"
          ? "Item removido da contagem."
          : "Contagem desfeita — o item voltou para a lista de pendentes.",
    };
  } catch (erro) {
    return { ok: false, erro: mensagemErro(erro) };
  }
}

/** Exclui definitivamente um inventário que ainda não foi aprovado. */
export async function excluirInventario(
  inventarioId: string,
): Promise<Resultado<{ codigo: string; itens_removidos: number }>> {
  try {
    await exigirPermissaoAction(PERMISSOES.inventarioExcluir);

    const supabase = await supabaseServidor();
    const { data, error } = await supabase.rpc("fn_excluir_inventario", {
      p_inventario_id: inventarioId,
    });

    if (error) return { ok: false, erro: mensagemErro(error) };

    const retorno = data as { codigo: string; itens_removidos: number };

    revalidatePath("/inventario");

    return {
      ok: true,
      dados: retorno,
      mensagem: `Inventário ${retorno.codigo} excluído.`,
    };
  } catch (erro) {
    return { ok: false, erro: mensagemErro(erro) };
  }
}

export async function fecharContagem(
  inventarioId: string,
  zerarNaoContados: boolean,
): Promise<Resultado<{ itens_sem_contagem: number }>> {
  try {
    await exigirPermissaoAction(PERMISSOES.inventarioContar);

    const supabase = await supabaseServidor();
    const { data, error } = await supabase.rpc("fn_fechar_contagem", {
      p_inventario_id: inventarioId,
      p_zerar_nao_contados: zerarNaoContados,
    });

    if (error) return { ok: false, erro: mensagemErro(error) };

    revalidatePath("/inventario");
    revalidatePath(`/inventario/${inventarioId}`);

    return {
      ok: true,
      dados: data as { itens_sem_contagem: number },
      mensagem: "Contagem encerrada. O relatório de divergências já está disponível.",
    };
  } catch (erro) {
    return { ok: false, erro: mensagemErro(erro) };
  }
}

export async function reabrirContagem(inventarioId: string): Promise<Resultado> {
  try {
    await exigirPermissaoAction(PERMISSOES.inventarioAbrir);

    const supabase = await supabaseServidor();
    const { error } = await supabase.rpc("fn_reabrir_contagem", {
      p_inventario_id: inventarioId,
    });

    if (error) return { ok: false, erro: mensagemErro(error) };

    revalidatePath(`/inventario/${inventarioId}`);

    return { ok: true, dados: undefined, mensagem: "Contagem reaberta." };
  } catch (erro) {
    return { ok: false, erro: mensagemErro(erro) };
  }
}

export async function aprovarInventario(
  inventarioId: string,
  observacao?: string,
): Promise<Resultado<{ ajustes_aplicados: number; impacto_financeiro: number }>> {
  try {
    await exigirPermissaoAction(PERMISSOES.inventarioAprovar);

    const supabase = await supabaseServidor();
    const { data, error } = await supabase.rpc("fn_aprovar_inventario", {
      p_inventario_id: inventarioId,
      p_observacao: observacao || null,
    });

    if (error) return { ok: false, erro: mensagemErro(error) };

    const retorno = data as { ajustes_aplicados: number; impacto_financeiro: number };

    revalidatePath("/inventario");
    revalidatePath(`/inventario/${inventarioId}`);
    revalidatePath("/estoque");
    revalidatePath("/painel");

    return {
      ok: true,
      dados: retorno,
      mensagem: `Inventário aprovado. ${retorno.ajustes_aplicados} ajustes aplicados no estoque.`,
    };
  } catch (erro) {
    return { ok: false, erro: mensagemErro(erro) };
  }
}

export async function cancelarInventario(
  inventarioId: string,
  motivo: string,
): Promise<Resultado> {
  try {
    await exigirPermissaoAction(PERMISSOES.inventarioCancelar);

    if (!motivo?.trim()) return { ok: false, erro: "Informe o motivo do cancelamento." };

    const supabase = await supabaseServidor();
    const { error } = await supabase.rpc("fn_cancelar_inventario", {
      p_inventario_id: inventarioId,
      p_motivo: motivo.trim(),
    });

    if (error) return { ok: false, erro: mensagemErro(error) };

    revalidatePath("/inventario");

    return { ok: true, dados: undefined, mensagem: "Inventário cancelado." };
  } catch (erro) {
    return { ok: false, erro: mensagemErro(erro) };
  }
}

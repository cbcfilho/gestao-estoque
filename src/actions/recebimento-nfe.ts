"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { Resultado } from "@/actions/estoque";
import { exigirPermissaoAction } from "@/lib/auth";
import { PERMISSOES } from "@/lib/permissoes";
import { supabaseServidor } from "@/lib/supabase/server";
import { eanValido, mensagemErro } from "@/lib/utils";
import type { StatusRecebimentoNfe, UnidadeMedida } from "@/types/database";

const locais = z.enum(["deposito", "prateleira", "cafeteria"]);
const unidades = z.enum(["un", "cx", "pct", "kg", "g", "l", "ml"]);

const esquemaItemNfe = z.object({
  numeroItem: z.number().int().positive(),
  codigoProdutoNota: z.string(),
  eanNota: z.string().nullable(),
  descricaoNota: z.string(),
  unidadeNota: z.string(),
  quantidadeNota: z.coerce.number().positive(),
  valorUnitarioNota: z.coerce.number().min(0),
  valorTotalNota: z.coerce.number().min(0),
  loteSugerido: z.string().nullable(),
  dataFabricacaoSugerida: z.string().nullable(),
  dataValidadeSugerida: z.string().nullable(),
});

const esquemaNfe = z.object({
  chaveAcesso: z.string().length(44, "Chave de acesso inválida."),
  numeroNota: z.string(),
  serie: z.string(),
  dataEmissao: z.string().optional().or(z.literal("")),
  emitenteCnpj: z.string(),
  emitenteNome: z.string(),
  valorTotalNota: z.coerce.number().min(0),
  itens: z.array(esquemaItemNfe).min(1, "A nota não tem itens para receber."),
  xmlConteudo: z.string(),
});

const esquemaIniciar = z.object({
  filialId: z.string().uuid("Selecione a filial."),
  localDestino: locais,
  nfe: esquemaNfe,
});

export interface RecebimentoNfeIniciado {
  id: string;
  /** true quando a chave já estava em conferência: retomou o rascunho existente. */
  retomado: boolean;
}

/**
 * Inicia a conferência a partir do XML já interpretado no cliente (src/lib/nfe.ts).
 * Se a chave já está em conferência, o banco devolve o id existente (retomada
 * de rascunho) em vez de duplicar itens — `retomado` avisa a tela disso, para
 * não retomar em silêncio.
 */
export async function iniciarRecebimentoNfe(
  entrada: unknown,
): Promise<Resultado<RecebimentoNfeIniciado>> {
  try {
    await exigirPermissaoAction(PERMISSOES.estoqueReceberNfe);

    const dados = esquemaIniciar.parse(entrada);
    const supabase = await supabaseServidor();

    const { data, error } = await supabase.rpc("fn_iniciar_recebimento_nfe", {
      p_filial_id: dados.filialId,
      p_local_destino: dados.localDestino,
      p_chave_acesso: dados.nfe.chaveAcesso,
      p_numero_nota: dados.nfe.numeroNota || null,
      p_serie: dados.nfe.serie || null,
      p_data_emissao: dados.nfe.dataEmissao || null,
      p_emitente_cnpj: dados.nfe.emitenteCnpj || null,
      p_emitente_nome: dados.nfe.emitenteNome || null,
      p_valor_total_nota: dados.nfe.valorTotalNota,
      p_xml_conteudo: dados.nfe.xmlConteudo,
      p_itens: dados.nfe.itens,
    });

    if (error) return { ok: false, erro: mensagemErro(error) };

    revalidatePath("/estoque/entrada/nfe");

    return { ok: true, dados: data as RecebimentoNfeIniciado, mensagem: "Conferência iniciada." };
  } catch (erro) {
    if (erro instanceof z.ZodError) {
      return { ok: false, erro: erro.issues[0]?.message ?? "Dados inválidos." };
    }
    return { ok: false, erro: mensagemErro(erro) };
  }
}

const esquemaAtualizarItem = z.object({
  itemId: z.string().uuid(),
  produtoId: z.string().uuid().optional().or(z.literal("")),
  lote: z.string().trim().max(60).optional().or(z.literal("")),
  dataValidade: z.string().optional().or(z.literal("")),
  quantidadeRecebida: z.coerce.number().min(0, "A quantidade recebida não pode ser negativa."),
  observacao: z.string().trim().max(500).optional().or(z.literal("")),
});

/** Reescreve lote/validade/quantidade/observação do item e marca como conferido. */
export async function atualizarItemRecebimentoNfe(entrada: unknown): Promise<Resultado<void>> {
  try {
    await exigirPermissaoAction(PERMISSOES.estoqueReceberNfe);

    const dados = esquemaAtualizarItem.parse(entrada);
    const supabase = await supabaseServidor();

    const { error } = await supabase.rpc("fn_atualizar_item_recebimento_nfe", {
      p_item_id: dados.itemId,
      p_produto_id: dados.produtoId || null,
      p_lote: dados.lote || null,
      p_data_validade: dados.dataValidade || null,
      p_quantidade_recebida: dados.quantidadeRecebida,
      p_observacao: dados.observacao || null,
    });

    if (error) return { ok: false, erro: mensagemErro(error) };

    return { ok: true, dados: undefined };
  } catch (erro) {
    if (erro instanceof z.ZodError) {
      return { ok: false, erro: erro.issues[0]?.message ?? "Dados inválidos." };
    }
    return { ok: false, erro: mensagemErro(erro) };
  }
}

const esquemaCadastrarProduto = z.object({
  itemId: z.string().uuid(),
  nome: z.string().trim().min(2, "Informe o nome do produto."),
  ean: z
    .string()
    .trim()
    .optional()
    .or(z.literal(""))
    .refine((v) => !v || eanValido(v), "Código de barras inválido (dígito verificador não confere)."),
  sku: z.string().trim().max(40).optional().or(z.literal("")),
  categoriaId: z.string().uuid().optional().or(z.literal("")),
  fornecedorId: z.string().uuid().optional().or(z.literal("")),
  unidade: unidades.default("un"),
  valorCusto: z.coerce.number().min(0).optional(),
  valorVenda: z.coerce.number().min(0).default(0),
  estoqueMinimo: z.coerce.number().min(0).default(0),
  estoqueMaximo: z.coerce.number().min(0).optional().nullable(),
  controlaValidade: z.coerce.boolean().default(true),
  insumoCafeteria: z.coerce.boolean().default(false),
});

export interface ProdutoCadastradoNfe {
  produtoId: string;
  nome: string;
  unidade: UnidadeMedida;
  controlaValidade: boolean;
}

/**
 * Cadastra, na hora da conferência, o produto que a nota trouxe e o catálogo
 * ainda não tem — já com SKU e EAN vindos da nota. Não exige produtos.gerenciar:
 * quem tem estoque.receber_nfe basta (checado no banco, SECURITY DEFINER).
 */
export async function cadastrarProdutoRecebimentoNfe(
  entrada: unknown,
): Promise<Resultado<ProdutoCadastradoNfe>> {
  try {
    await exigirPermissaoAction(PERMISSOES.estoqueReceberNfe);

    const dados = esquemaCadastrarProduto.parse(entrada);
    const supabase = await supabaseServidor();

    const { data, error } = await supabase.rpc("fn_cadastrar_produto_recebimento_nfe", {
      p_item_id: dados.itemId,
      p_nome: dados.nome,
      p_ean: dados.ean || null,
      p_sku: dados.sku || null,
      p_categoria_id: dados.categoriaId || null,
      p_fornecedor_id: dados.fornecedorId || null,
      p_unidade: dados.unidade,
      p_valor_custo: dados.valorCusto ?? null,
      p_valor_venda: dados.valorVenda,
      p_estoque_minimo: dados.estoqueMinimo,
      p_estoque_maximo: dados.estoqueMaximo || null,
      p_controla_validade: dados.controlaValidade,
      p_insumo_cafeteria: dados.insumoCafeteria,
    });

    if (error) return { ok: false, erro: mensagemErro(error) };

    return {
      ok: true,
      dados: {
        produtoId: data as string,
        nome: dados.nome,
        unidade: dados.unidade,
        controlaValidade: dados.controlaValidade,
      },
      mensagem: "Produto cadastrado.",
    };
  } catch (erro) {
    if (erro instanceof z.ZodError) {
      return { ok: false, erro: erro.issues[0]?.message ?? "Dados inválidos." };
    }
    return { ok: false, erro: mensagemErro(erro) };
  }
}

export interface ResumoConfirmacaoNfe {
  recebimento_id: string;
  itens_creditados: number;
}

/** Credita o estoque item a item e fecha o recebimento. Tudo ou nada. */
export async function confirmarRecebimentoNfe(
  recebimentoId: string,
): Promise<Resultado<ResumoConfirmacaoNfe>> {
  try {
    await exigirPermissaoAction(PERMISSOES.estoqueReceberNfe);

    const supabase = await supabaseServidor();
    const { data, error } = await supabase.rpc("fn_confirmar_recebimento_nfe", {
      p_recebimento_id: recebimentoId,
    });

    if (error) return { ok: false, erro: mensagemErro(error) };

    revalidatePath("/estoque");
    revalidatePath("/estoque/entrada/nfe");
    revalidatePath(`/estoque/entrada/nfe/${recebimentoId}`);
    revalidatePath("/painel");

    return { ok: true, dados: data as ResumoConfirmacaoNfe, mensagem: "Recebimento confirmado." };
  } catch (erro) {
    return { ok: false, erro: mensagemErro(erro) };
  }
}

/** Só cancela enquanto em conferência. Nunca desfaz um recebimento concluído. */
export async function cancelarRecebimentoNfe(
  recebimentoId: string,
  motivo?: string,
): Promise<Resultado<void>> {
  try {
    await exigirPermissaoAction(PERMISSOES.estoqueReceberNfe);

    const supabase = await supabaseServidor();
    const { error } = await supabase.rpc("fn_cancelar_recebimento_nfe", {
      p_recebimento_id: recebimentoId,
      p_motivo: motivo || null,
    });

    if (error) return { ok: false, erro: mensagemErro(error) };

    revalidatePath("/estoque/entrada/nfe");
    revalidatePath(`/estoque/entrada/nfe/${recebimentoId}`);

    return { ok: true, dados: undefined, mensagem: "Recebimento cancelado." };
  } catch (erro) {
    return { ok: false, erro: mensagemErro(erro) };
  }
}

export interface RecebimentoNfeResumo {
  id: string;
  numero_nota: string | null;
  serie: string | null;
  emitente_nome: string | null;
  valor_total_nota: number | null;
  status: StatusRecebimentoNfe;
  iniciado_em: string;
  confirmado_em: string | null;
}

/** Histórico de recebimentos da filial — "em conferência" e "concluídos recentemente". */
export async function listarRecebimentosNfe(
  filialId: string,
): Promise<Resultado<RecebimentoNfeResumo[]>> {
  try {
    const supabase = await supabaseServidor();

    const { data, error } = await supabase
      .from("recebimentos_nfe")
      .select("id, numero_nota, serie, emitente_nome, valor_total_nota, status, iniciado_em, confirmado_em")
      .eq("filial_id", filialId)
      .order("iniciado_em", { ascending: false })
      .limit(30);

    if (error) return { ok: false, erro: mensagemErro(error) };

    return { ok: true, dados: (data ?? []) as RecebimentoNfeResumo[] };
  } catch (erro) {
    return { ok: false, erro: mensagemErro(erro) };
  }
}

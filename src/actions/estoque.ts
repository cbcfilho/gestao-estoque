"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { exigirPermissaoAction } from "@/lib/auth";
import { PERMISSOES } from "@/lib/permissoes";
import { supabaseServidor } from "@/lib/supabase/server";
import { mensagemErro } from "@/lib/utils";

export type Resultado<T = void> =
  | { ok: true; dados: T; mensagem?: string }
  | { ok: false; erro: string };

const locais = z.enum(["deposito", "prateleira", "cafeteria"]);

const motivosEntrada = z.enum([
  "compra_fornecedor",
  "recebimento_transferencia",
  "devolucao_cliente",
  "ajuste_positivo",
]);

const motivosSaida = z.enum([
  "venda",
  "perda",
  "quebra",
  "vencimento",
  "consumo_interno",
  "degustacao",
  "brinde",
  "ajuste_negativo",
]);

const esquemaEntrada = z.object({
  produto_id: z.string().uuid("Selecione um produto."),
  filial_id: z.string().uuid("Selecione a filial."),
  local: locais,
  quantidade: z.coerce.number().positive("A quantidade deve ser maior que zero."),
  custo_unitario: z.coerce.number().min(0).optional(),
  lote: z.string().trim().max(60).optional().or(z.literal("")),
  data_validade: z.string().optional().or(z.literal("")),
  motivo: motivosEntrada.default("compra_fornecedor"),
  observacao: z.string().trim().max(500).optional().or(z.literal("")),
  anexo_url: z.string().optional().or(z.literal("")),
});

export async function registrarEntrada(entrada: unknown): Promise<Resultado<string>> {
  try {
    await exigirPermissaoAction(PERMISSOES.estoqueEntrada);

    const dados = esquemaEntrada.parse(entrada);
    const supabase = await supabaseServidor();

    const { data, error } = await supabase.rpc("fn_registrar_entrada", {
      p_produto_id: dados.produto_id,
      p_filial_id: dados.filial_id,
      p_local: dados.local,
      p_quantidade: dados.quantidade,
      p_custo_unitario: dados.custo_unitario ?? null,
      p_lote: dados.lote || null,
      p_data_validade: dados.data_validade || null,
      p_motivo: dados.motivo,
      p_observacao: dados.observacao || null,
      p_anexo_url: dados.anexo_url || null,
    });

    if (error) return { ok: false, erro: mensagemErro(error) };

    revalidatePath("/estoque");
    revalidatePath("/painel");

    return { ok: true, dados: data as string, mensagem: "Entrada registrada." };
  } catch (erro) {
    if (erro instanceof z.ZodError) {
      return { ok: false, erro: erro.issues[0]?.message ?? "Dados inválidos." };
    }
    return { ok: false, erro: mensagemErro(erro) };
  }
}

const esquemaSaida = z.object({
  produto_id: z.string().uuid("Selecione um produto."),
  filial_id: z.string().uuid("Selecione a filial."),
  local: locais,
  quantidade: z.coerce.number().positive("A quantidade deve ser maior que zero."),
  motivo: motivosSaida.default("venda"),
  lote_id: z.string().uuid().optional().or(z.literal("")),
  observacao: z.string().trim().max(500).optional().or(z.literal("")),
});

export async function registrarSaida(entrada: unknown): Promise<Resultado<unknown>> {
  try {
    const dados = esquemaSaida.parse(entrada);

    // Consumo de insumo da cafeteria tem permissão própria — o banco valida do
    // mesmo jeito, isto aqui só evita renderizar um erro feio para o barista.
    const permissao =
      dados.local === "cafeteria" && dados.motivo === "consumo_interno"
        ? PERMISSOES.cafeteriaConsumo
        : PERMISSOES.estoqueSaida;

    await exigirPermissaoAction(permissao);

    const supabase = await supabaseServidor();

    const { error } = await supabase.rpc("fn_registrar_saida", {
      p_produto_id: dados.produto_id,
      p_filial_id: dados.filial_id,
      p_local: dados.local,
      p_quantidade: dados.quantidade,
      p_motivo: dados.motivo,
      p_lote_id: dados.lote_id || null,
      p_observacao: dados.observacao || null,
    });

    if (error) return { ok: false, erro: mensagemErro(error) };

    revalidatePath("/estoque");
    revalidatePath("/painel");

    return { ok: true, dados, mensagem: "Saída registrada." };
  } catch (erro) {
    if (erro instanceof z.ZodError) {
      return { ok: false, erro: erro.issues[0]?.message ?? "Dados inválidos." };
    }
    return { ok: false, erro: mensagemErro(erro) };
  }
}

const esquemaAjuste = z.object({
  produto_id: z.string().uuid("Selecione um produto."),
  filial_id: z.string().uuid("Selecione a filial."),
  local: locais,
  quantidade: z.coerce.number().refine((v) => v !== 0, "Informe uma quantidade diferente de zero."),
  observacao: z.string().trim().min(5, "Descreva o motivo do ajuste (mínimo 5 caracteres)."),
  lote: z.string().trim().max(60).optional().or(z.literal("")),
  data_validade: z.string().optional().or(z.literal("")),
  lote_id: z.string().uuid().optional().or(z.literal("")),
});

export async function ajustarEstoque(entrada: unknown): Promise<Resultado<unknown>> {
  try {
    await exigirPermissaoAction(PERMISSOES.estoqueAjustar);

    const dados = esquemaAjuste.parse(entrada);
    const supabase = await supabaseServidor();

    const { error } = await supabase.rpc("fn_ajustar_estoque", {
      p_produto_id: dados.produto_id,
      p_filial_id: dados.filial_id,
      p_local: dados.local,
      p_quantidade: dados.quantidade,
      p_observacao: dados.observacao,
      p_lote: dados.lote || null,
      p_data_validade: dados.data_validade || null,
      p_lote_id: dados.lote_id || null,
    });

    if (error) return { ok: false, erro: mensagemErro(error) };

    revalidatePath("/estoque");
    revalidatePath("/painel");

    return { ok: true, dados, mensagem: "Ajuste registrado." };
  } catch (erro) {
    if (erro instanceof z.ZodError) {
      return { ok: false, erro: erro.issues[0]?.message ?? "Dados inválidos." };
    }
    return { ok: false, erro: mensagemErro(erro) };
  }
}

/** Lotes disponíveis de um produto num local — usado para escolher lote na saída. */
export async function listarLotesDisponiveis(
  produtoId: string,
  filialId: string,
  local: string,
): Promise<Resultado<
  { id: string; lote: string; data_validade: string | null; quantidade: number }[]
>> {
  try {
    const supabase = await supabaseServidor();

    const { data, error } = await supabase
      .from("lotes_estoque")
      .select("id, lote, data_validade, quantidade")
      .eq("produto_id", produtoId)
      .eq("filial_id", filialId)
      .eq("local", local)
      .gt("quantidade", 0)
      .order("data_validade", { ascending: true, nullsFirst: false });

    if (error) return { ok: false, erro: mensagemErro(error) };

    return { ok: true, dados: data ?? [] };
  } catch (erro) {
    return { ok: false, erro: mensagemErro(erro) };
  }
}

/* -------------------------------------------------------------------------- */
/* Importação de movimentação vinda do sistema legado                          */
/* -------------------------------------------------------------------------- */

export interface LinhaMovimento {
  tipo: "entrada" | "saida";
  ean?: string | null;
  nome?: string | null;
  local: string;
  quantidade: number;
  data?: string | null;
  documento?: string | null;
  motivo?: string | null;
  custo_unitario?: number | null;
  lote?: string | null;
  data_validade?: string | null;
  observacao?: string | null;
}

export interface ResultadoImportacaoMovimento {
  importacao_id: string;
  aplicadas: number;
  ignoradas: number;
  erros: { linha: number; item: string; erro: string }[];
}

/**
 * Importa a movimentação do dia.
 *
 * O `hash` é a impressão digital do arquivo, calculada no navegador. É a
 * primeira trava contra reimportação: o banco recusa um arquivo já processado.
 * A segunda trava é por linha, dentro da função do banco.
 */
export async function importarMovimentos(
  filialId: string,
  arquivo: string,
  hash: string,
  linhas: LinhaMovimento[],
): Promise<Resultado<ResultadoImportacaoMovimento>> {
  try {
    await exigirPermissaoAction(PERMISSOES.estoqueImportar);

    if (linhas.length === 0) {
      return { ok: false, erro: "A planilha não tem nenhuma linha para importar." };
    }

    const supabase = await supabaseServidor();

    const { data, error } = await supabase.rpc("fn_importar_movimentos", {
      p_filial_id: filialId,
      p_arquivo: arquivo,
      p_hash: hash,
      p_itens: linhas,
    });

    if (error) return { ok: false, erro: mensagemErro(error) };

    const retorno = data as ResultadoImportacaoMovimento;

    revalidatePath("/estoque");
    revalidatePath("/estoque/movimentacoes");
    revalidatePath("/painel");

    return {
      ok: true,
      dados: retorno,
      mensagem:
        `${retorno.aplicadas} movimentações aplicadas` +
        (retorno.ignoradas > 0 ? `, ${retorno.ignoradas} já existiam` : "") +
        (retorno.erros.length > 0 ? `, ${retorno.erros.length} com erro` : "") +
        ".",
    };
  } catch (erro) {
    return { ok: false, erro: mensagemErro(erro) };
  }
}

/** Histórico de importações da filial, para conferência. */
export async function listarImportacoes(filialId: string): Promise<
  Resultado<
    {
      id: string;
      arquivo_nome: string;
      total_linhas: number;
      total_aplicadas: number;
      total_ignoradas: number;
      total_erros: number;
      criado_em: string;
      usuario: { nome: string } | null;
    }[]
  >
> {
  try {
    const supabase = await supabaseServidor();

    const { data, error } = await supabase
      .from("importacoes_movimento")
      .select(
        "id, arquivo_nome, total_linhas, total_aplicadas, total_ignoradas, total_erros, criado_em, usuario:usuarios(nome)",
      )
      .eq("filial_id", filialId)
      .order("criado_em", { ascending: false })
      .limit(20);

    if (error) return { ok: false, erro: mensagemErro(error) };

    return { ok: true, dados: (data ?? []) as never };
  } catch (erro) {
    return { ok: false, erro: mensagemErro(erro) };
  }
}

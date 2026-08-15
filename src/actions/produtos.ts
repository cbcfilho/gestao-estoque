"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { Resultado } from "@/actions/estoque";
import { exigirPermissaoAction } from "@/lib/auth";
import { PERMISSOES } from "@/lib/permissoes";
import { supabaseServidor } from "@/lib/supabase/server";
import { eanValido, mensagemErro } from "@/lib/utils";

const unidades = z.enum(["un", "cx", "pct", "kg", "g", "l", "ml"]);

const esquemaProduto = z.object({
  id: z.string().uuid().optional().or(z.literal("")),
  nome: z.string().trim().min(2, "Informe o nome do produto."),
  ean: z
    .string()
    .trim()
    .optional()
    .or(z.literal(""))
    .refine((v) => !v || eanValido(v), "Código de barras inválido (dígito verificador não confere)."),
  sku: z.string().trim().max(40).optional().or(z.literal("")),
  categoria_id: z.string().uuid().optional().or(z.literal("")),
  fornecedor_id: z.string().uuid().optional().or(z.literal("")),
  unidade: unidades.default("un"),
  valor_custo: z.coerce.number().min(0, "O custo não pode ser negativo."),
  valor_venda: z.coerce.number().min(0, "O preço de venda não pode ser negativo."),
  estoque_minimo: z.coerce.number().min(0),
  estoque_maximo: z.coerce.number().min(0).optional().nullable(),
  controla_validade: z.coerce.boolean().default(true),
  insumo_cafeteria: z.coerce.boolean().default(false),
  foto_url: z.string().optional().or(z.literal("")),
  ativo: z.coerce.boolean().default(true),
  filiais: z.array(z.string().uuid()).default([]),
});

export async function salvarProduto(entrada: unknown): Promise<Resultado<string>> {
  try {
    await exigirPermissaoAction(PERMISSOES.produtosGerenciar);

    const dados = esquemaProduto.parse(entrada);
    const supabase = await supabaseServidor();

    if (
      dados.estoque_maximo != null &&
      dados.estoque_maximo > 0 &&
      dados.estoque_maximo < dados.estoque_minimo
    ) {
      return { ok: false, erro: "O estoque máximo não pode ser menor que o mínimo." };
    }

    const registro = {
      nome: dados.nome,
      ean: dados.ean || null,
      sku: dados.sku || null,
      categoria_id: dados.categoria_id || null,
      fornecedor_id: dados.fornecedor_id || null,
      unidade: dados.unidade,
      valor_custo: dados.valor_custo,
      valor_venda: dados.valor_venda,
      estoque_minimo: dados.estoque_minimo,
      estoque_maximo: dados.estoque_maximo || null,
      controla_validade: dados.controla_validade,
      insumo_cafeteria: dados.insumo_cafeteria,
      foto_url: dados.foto_url || null,
      ativo: dados.ativo,
    };

    let produtoId = dados.id || "";

    if (produtoId) {
      const { error } = await supabase.from("produtos").update(registro).eq("id", produtoId);
      if (error) return { ok: false, erro: mensagemErro(error) };
    } else {
      const { data, error } = await supabase
        .from("produtos")
        .insert(registro)
        .select("id")
        .single();
      if (error) return { ok: false, erro: mensagemErro(error) };
      produtoId = data.id as string;
    }

    // Reescreve os vínculos com filiais preservando os limites já configurados.
    const { data: atuais } = await supabase
      .from("produto_filiais")
      .select("filial_id, estoque_minimo, estoque_maximo")
      .eq("produto_id", produtoId);

    const antigos = new Map(
      (atuais ?? []).map((v) => [
        v.filial_id as string,
        { minimo: v.estoque_minimo as number | null, maximo: v.estoque_maximo as number | null },
      ]),
    );

    const remover = [...antigos.keys()].filter((id) => !dados.filiais.includes(id));
    if (remover.length > 0) {
      await supabase
        .from("produto_filiais")
        .delete()
        .eq("produto_id", produtoId)
        .in("filial_id", remover);
    }

    if (dados.filiais.length > 0) {
      const { error } = await supabase.from("produto_filiais").upsert(
        dados.filiais.map((filialId) => ({
          produto_id: produtoId,
          filial_id: filialId,
          estoque_minimo: antigos.get(filialId)?.minimo ?? null,
          estoque_maximo: antigos.get(filialId)?.maximo ?? null,
          ativo: true,
        })),
        { onConflict: "produto_id,filial_id" },
      );
      if (error) return { ok: false, erro: mensagemErro(error) };
    }

    revalidatePath("/produtos");
    revalidatePath(`/produtos/${produtoId}`);

    return { ok: true, dados: produtoId, mensagem: "Produto salvo." };
  } catch (erro) {
    if (erro instanceof z.ZodError) {
      return { ok: false, erro: erro.issues[0]?.message ?? "Dados inválidos." };
    }
    return { ok: false, erro: mensagemErro(erro) };
  }
}

export async function alternarAtivoProduto(id: string, ativo: boolean): Promise<Resultado> {
  try {
    await exigirPermissaoAction(PERMISSOES.produtosGerenciar);

    const supabase = await supabaseServidor();
    const { error } = await supabase.from("produtos").update({ ativo }).eq("id", id);

    if (error) return { ok: false, erro: mensagemErro(error) };

    revalidatePath("/produtos");
    revalidatePath(`/produtos/${id}`);

    return {
      ok: true,
      dados: undefined,
      mensagem: ativo ? "Produto reativado." : "Produto desativado.",
    };
  } catch (erro) {
    return { ok: false, erro: mensagemErro(erro) };
  }
}

/* -------------------------------------------------------------------------- */
/* Importação em massa                                                         */
/* -------------------------------------------------------------------------- */

export interface LinhaImportacao {
  nome: string;
  ean?: string | null;
  sku?: string | null;
  categoria?: string | null;
  fornecedor?: string | null;
  unidade?: string | null;
  valor_custo?: number | null;
  valor_venda?: number | null;
  estoque_minimo?: number | null;
  estoque_maximo?: number | null;
  controla_validade?: boolean | null;
  insumo_cafeteria?: boolean | null;
}

export interface ResultadoImportacao {
  criados: number;
  atualizados: number;
  erros: { linha: number; nome: string; erro: string }[];
}

/**
 * Importa o catálogo a partir da planilha.
 *
 * Chave de deduplicação: EAN quando existir, senão o nome. Rodar a mesma
 * planilha duas vezes atualiza, não duplica.
 */
export async function importarProdutos(
  linhas: LinhaImportacao[],
  filiaisPadrao: string[],
): Promise<Resultado<ResultadoImportacao>> {
  try {
    await exigirPermissaoAction(PERMISSOES.produtosImportar);

    const supabase = await supabaseServidor();
    const resultado: ResultadoImportacao = { criados: 0, atualizados: 0, erros: [] };

    // Resolve categorias e fornecedores por nome, criando os que faltarem.
    const [{ data: categorias }, { data: fornecedores }] = await Promise.all([
      supabase.from("categorias").select("id, nome"),
      supabase.from("fornecedores").select("id, nome"),
    ]);

    const mapaCategorias = new Map(
      (categorias ?? []).map((c) => [(c.nome as string).toLowerCase(), c.id as string]),
    );
    const mapaFornecedores = new Map(
      (fornecedores ?? []).map((f) => [(f.nome as string).toLowerCase(), f.id as string]),
    );

    for (const [indice, linha] of linhas.entries()) {
      const numeroLinha = indice + 2; // +1 do cabeçalho, +1 porque planilha começa em 1

      try {
        if (!linha.nome?.trim()) {
          resultado.erros.push({ linha: numeroLinha, nome: "", erro: "Nome vazio." });
          continue;
        }

        if (linha.ean && !eanValido(linha.ean)) {
          resultado.erros.push({
            linha: numeroLinha,
            nome: linha.nome,
            erro: `Código de barras inválido: ${linha.ean}`,
          });
          continue;
        }

        let categoriaId: string | null = null;
        if (linha.categoria?.trim()) {
          const chave = linha.categoria.trim().toLowerCase();
          categoriaId = mapaCategorias.get(chave) ?? null;
          if (!categoriaId) {
            const { data } = await supabase
              .from("categorias")
              .insert({ nome: linha.categoria.trim() })
              .select("id")
              .single();
            if (data) {
              categoriaId = data.id as string;
              mapaCategorias.set(chave, categoriaId);
            }
          }
        }

        let fornecedorId: string | null = null;
        if (linha.fornecedor?.trim()) {
          const chave = linha.fornecedor.trim().toLowerCase();
          fornecedorId = mapaFornecedores.get(chave) ?? null;
          if (!fornecedorId) {
            const { data } = await supabase
              .from("fornecedores")
              .insert({ nome: linha.fornecedor.trim() })
              .select("id")
              .single();
            if (data) {
              fornecedorId = data.id as string;
              mapaFornecedores.set(chave, fornecedorId);
            }
          }
        }

        const registro = {
          nome: linha.nome.trim(),
          ean: linha.ean?.trim() || null,
          sku: linha.sku?.trim() || null,
          categoria_id: categoriaId,
          fornecedor_id: fornecedorId,
          unidade: (linha.unidade?.trim().toLowerCase() || "un") as string,
          valor_custo: linha.valor_custo ?? 0,
          valor_venda: linha.valor_venda ?? 0,
          estoque_minimo: linha.estoque_minimo ?? 0,
          estoque_maximo: linha.estoque_maximo || null,
          controla_validade: linha.controla_validade ?? true,
          insumo_cafeteria: linha.insumo_cafeteria ?? false,
          ativo: true,
        };

        // Procura o existente pelo EAN; sem EAN, cai para o nome exato.
        const consulta = supabase.from("produtos").select("id").limit(1);
        const { data: existente } = linha.ean
          ? await consulta.eq("ean", linha.ean.trim()).maybeSingle()
          : await consulta.ilike("nome", linha.nome.trim()).maybeSingle();

        let produtoId: string;

        if (existente?.id) {
          produtoId = existente.id as string;
          const { error } = await supabase.from("produtos").update(registro).eq("id", produtoId);
          if (error) throw error;
          resultado.atualizados += 1;
        } else {
          const { data, error } = await supabase
            .from("produtos")
            .insert(registro)
            .select("id")
            .single();
          if (error) throw error;
          produtoId = data.id as string;
          resultado.criados += 1;
        }

        if (filiaisPadrao.length > 0) {
          await supabase.from("produto_filiais").upsert(
            filiaisPadrao.map((filialId) => ({
              produto_id: produtoId,
              filial_id: filialId,
              ativo: true,
            })),
            { onConflict: "produto_id,filial_id", ignoreDuplicates: true },
          );
        }
      } catch (erro) {
        resultado.erros.push({
          linha: numeroLinha,
          nome: linha.nome ?? "",
          erro: mensagemErro(erro),
        });
      }
    }

    revalidatePath("/produtos");

    return {
      ok: true,
      dados: resultado,
      mensagem: `${resultado.criados} criados, ${resultado.atualizados} atualizados.`,
    };
  } catch (erro) {
    return { ok: false, erro: mensagemErro(erro) };
  }
}

export interface LinhaPosicaoInicial {
  ean?: string | null;
  nome?: string | null;
  local: string;
  quantidade: number;
  custo_unitario?: number | null;
  lote?: string | null;
  data_validade?: string | null;
}

/** Carga da posição inicial de estoque de uma filial (implantação). */
export async function importarPosicaoInicial(
  filialId: string,
  linhas: LinhaPosicaoInicial[],
): Promise<Resultado<{ importados: number; erros: { item: unknown; erro: string }[] }>> {
  try {
    await exigirPermissaoAction(PERMISSOES.produtosImportar);

    const supabase = await supabaseServidor();
    const naoEncontrados: { item: unknown; erro: string }[] = [];
    const itens: Record<string, unknown>[] = [];

    for (const linha of linhas) {
      const consulta = supabase.from("produtos").select("id").eq("ativo", true).limit(1);
      const { data: produto } = linha.ean
        ? await consulta.eq("ean", linha.ean.trim()).maybeSingle()
        : await consulta.ilike("nome", (linha.nome ?? "").trim()).maybeSingle();

      if (!produto?.id) {
        naoEncontrados.push({
          item: linha,
          erro: `Produto não encontrado (${linha.ean ?? linha.nome ?? "sem identificação"}).`,
        });
        continue;
      }

      itens.push({
        produto_id: produto.id,
        local: linha.local,
        quantidade: linha.quantidade,
        custo_unitario: linha.custo_unitario ?? null,
        lote: linha.lote ?? null,
        data_validade: linha.data_validade ?? null,
      });
    }

    if (itens.length === 0) {
      return {
        ok: true,
        dados: { importados: 0, erros: naoEncontrados },
        mensagem: "Nenhum item pôde ser importado.",
      };
    }

    const { data, error } = await supabase.rpc("fn_importar_posicao_inicial", {
      p_filial_id: filialId,
      p_itens: itens,
    });

    if (error) return { ok: false, erro: mensagemErro(error) };

    const retorno = data as { importados: number; erros: unknown[] };

    revalidatePath("/estoque");

    return {
      ok: true,
      dados: {
        importados: retorno.importados,
        erros: [
          ...naoEncontrados,
          ...(retorno.erros as { item: unknown; erro: string }[]),
        ],
      },
      mensagem: `${retorno.importados} lançamentos importados.`,
    };
  } catch (erro) {
    return { ok: false, erro: mensagemErro(erro) };
  }
}

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { Resultado } from "@/actions/estoque";
import { exigirPermissaoAction } from "@/lib/auth";
import { PERMISSOES } from "@/lib/permissoes";
import { supabaseServidor } from "@/lib/supabase/server";
import { mensagemErro } from "@/lib/utils";

const esquemaConfiguracoes = z.object({
  identidade: z.object({
    nome_sistema: z.string().trim().min(2).max(40),
    subtitulo: z.string().trim().max(60),
  }),
  transferencia_exige_aprovacao: z.object({
    entre_filiais: z.boolean(),
    entre_locais: z.boolean(),
  }),
  ponto_modo: z.enum(["lembrete", "registro"]),
  inventario_agendamento: z.object({
    ativo: z.boolean(),
    dia_abertura: z.coerce.number().int().min(1).max(28),
    dias_para_concluir: z.coerce.number().int().min(1).max(28),
  }),
  alertas_vencimento: z.object({
    gerar_tarefa_em: z.coerce.number().int().min(1).max(180),
  }),
});

export async function salvarConfiguracoes(entrada: unknown): Promise<Resultado> {
  try {
    await exigirPermissaoAction(PERMISSOES.configuracoesGerenciar);

    const dados = esquemaConfiguracoes.parse(entrada);
    const supabase = await supabaseServidor();

    // Preserva as chaves que a tela não edita (cores, logo, faixas de alerta).
    const { data: atuais } = await supabase
      .from("configuracoes")
      .select("chave, valor")
      .in("chave", ["identidade", "alertas_vencimento"]);

    const mapa = new Map((atuais ?? []).map((c) => [c.chave as string, c.valor as object]));

    const atualizacoes = [
      {
        chave: "identidade",
        valor: { ...(mapa.get("identidade") ?? {}), ...dados.identidade },
      },
      { chave: "transferencia_exige_aprovacao", valor: dados.transferencia_exige_aprovacao },
      { chave: "ponto_modo", valor: dados.ponto_modo },
      { chave: "inventario_agendamento", valor: dados.inventario_agendamento },
      {
        chave: "alertas_vencimento",
        valor: { ...(mapa.get("alertas_vencimento") ?? {}), ...dados.alertas_vencimento },
      },
    ];

    for (const item of atualizacoes) {
      const { error } = await supabase
        .from("configuracoes")
        .update({ valor: item.valor, atualizado_em: new Date().toISOString() })
        .eq("chave", item.chave);

      if (error) return { ok: false, erro: mensagemErro(error) };
    }

    revalidatePath("/", "layout");

    return { ok: true, dados: undefined, mensagem: "Configurações salvas." };
  } catch (erro) {
    if (erro instanceof z.ZodError) {
      return { ok: false, erro: erro.issues[0]?.message ?? "Dados inválidos." };
    }
    return { ok: false, erro: mensagemErro(erro) };
  }
}

/* -------------------------------------------------------------------------- */
/* Filiais                                                                     */
/* -------------------------------------------------------------------------- */

const esquemaFilial = z.object({
  id: z.string().uuid().optional().or(z.literal("")),
  codigo: z.string().trim().min(1, "Informe o código da filial.").max(10),
  nome: z.string().trim().min(2, "Informe o nome da filial."),
  endereco: z.string().trim().max(200).optional().or(z.literal("")),
  cidade: z.string().trim().max(80).optional().or(z.literal("")),
  uf: z.string().trim().length(2).optional().or(z.literal("")),
  telefone: z.string().trim().max(30).optional().or(z.literal("")),
  possui_cafeteria: z.boolean(),
  ativo: z.boolean(),
});

export async function salvarFilial(entrada: unknown): Promise<Resultado<string>> {
  try {
    await exigirPermissaoAction(PERMISSOES.filiaisGerenciar);

    const dados = esquemaFilial.parse(entrada);
    const supabase = await supabaseServidor();

    const registro = {
      codigo: dados.codigo.toUpperCase(),
      nome: dados.nome,
      endereco: dados.endereco || null,
      cidade: dados.cidade || null,
      uf: dados.uf ? dados.uf.toUpperCase() : null,
      telefone: dados.telefone || null,
      possui_cafeteria: dados.possui_cafeteria,
      ativo: dados.ativo,
    };

    if (dados.id) {
      const { error } = await supabase.from("filiais").update(registro).eq("id", dados.id);
      if (error) return { ok: false, erro: mensagemErro(error) };

      revalidatePath("/configuracoes/filiais");
      revalidatePath("/", "layout");
      return { ok: true, dados: dados.id, mensagem: "Filial atualizada." };
    }

    const { data, error } = await supabase.from("filiais").insert(registro).select("id").single();
    if (error) return { ok: false, erro: mensagemErro(error) };

    revalidatePath("/configuracoes/filiais");
    revalidatePath("/", "layout");

    return { ok: true, dados: data.id as string, mensagem: "Filial cadastrada." };
  } catch (erro) {
    if (erro instanceof z.ZodError) {
      return { ok: false, erro: erro.issues[0]?.message ?? "Dados inválidos." };
    }
    return { ok: false, erro: mensagemErro(erro) };
  }
}

/* -------------------------------------------------------------------------- */
/* Categorias e fornecedores                                                   */
/* -------------------------------------------------------------------------- */

export async function salvarCategoria(
  id: string | null,
  nome: string,
  descricao?: string,
): Promise<Resultado> {
  try {
    await exigirPermissaoAction(PERMISSOES.produtosGerenciar);

    if (!nome.trim()) return { ok: false, erro: "Informe o nome da categoria." };

    const supabase = await supabaseServidor();
    const registro = { nome: nome.trim(), descricao: descricao?.trim() || null };

    const { error } = id
      ? await supabase.from("categorias").update(registro).eq("id", id)
      : await supabase.from("categorias").insert(registro);

    if (error) return { ok: false, erro: mensagemErro(error) };

    revalidatePath("/configuracoes/cadastros");
    revalidatePath("/produtos");

    return { ok: true, dados: undefined, mensagem: "Categoria salva." };
  } catch (erro) {
    return { ok: false, erro: mensagemErro(erro) };
  }
}

export async function salvarFornecedor(
  id: string | null,
  dados: { nome: string; cnpj?: string; contato?: string; email?: string; telefone?: string },
): Promise<Resultado> {
  try {
    await exigirPermissaoAction(PERMISSOES.produtosGerenciar);

    if (!dados.nome.trim()) return { ok: false, erro: "Informe o nome do fornecedor." };

    const supabase = await supabaseServidor();
    const registro = {
      nome: dados.nome.trim(),
      cnpj: dados.cnpj?.trim() || null,
      contato: dados.contato?.trim() || null,
      email: dados.email?.trim() || null,
      telefone: dados.telefone?.trim() || null,
    };

    const { error } = id
      ? await supabase.from("fornecedores").update(registro).eq("id", id)
      : await supabase.from("fornecedores").insert(registro);

    if (error) return { ok: false, erro: mensagemErro(error) };

    revalidatePath("/configuracoes/cadastros");

    return { ok: true, dados: undefined, mensagem: "Fornecedor salvo." };
  } catch (erro) {
    return { ok: false, erro: mensagemErro(erro) };
  }
}

export async function alternarAtivoCadastro(
  tabela: "categorias" | "fornecedores",
  id: string,
  ativo: boolean,
): Promise<Resultado> {
  try {
    await exigirPermissaoAction(PERMISSOES.produtosGerenciar);

    const supabase = await supabaseServidor();
    const { error } = await supabase.from(tabela).update({ ativo }).eq("id", id);

    if (error) return { ok: false, erro: mensagemErro(error) };

    revalidatePath("/configuracoes/cadastros");

    return { ok: true, dados: undefined, mensagem: ativo ? "Reativado." : "Desativado." };
  } catch (erro) {
    return { ok: false, erro: mensagemErro(erro) };
  }
}

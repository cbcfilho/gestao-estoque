"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { Resultado } from "@/actions/estoque";
import { exigirPermissaoAction } from "@/lib/auth";
import { PERMISSOES } from "@/lib/permissoes";
import { supabaseServidor } from "@/lib/supabase/server";
import { mensagemErro } from "@/lib/utils";

const locais = z.enum(["deposito", "prateleira", "cafeteria"]);

const esquemaCriacao = z.object({
  filial_origem_id: z.string().uuid("Selecione a filial de origem."),
  local_origem: locais,
  filial_destino_id: z.string().uuid("Selecione a filial de destino."),
  local_destino: locais,
  observacao: z.string().trim().max(500).optional().or(z.literal("")),
  itens: z
    .array(
      z.object({
        produto_id: z.string().uuid(),
        quantidade: z.coerce.number().positive(),
        lote_id: z.string().uuid().optional().or(z.literal("")),
      }),
    )
    .min(1, "Adicione ao menos um item à transferência."),
  /** Mesma filial: já envia e recebe de uma vez. */
  direta: z.boolean().default(false),
});

export async function criarTransferencia(entrada: unknown): Promise<Resultado<string>> {
  try {
    await exigirPermissaoAction(PERMISSOES.transferenciasSolicitar);

    const dados = esquemaCriacao.parse(entrada);
    const supabase = await supabaseServidor();

    const itens = dados.itens.map((item) => ({
      produto_id: item.produto_id,
      quantidade: item.quantidade,
      lote_id: item.lote_id || null,
    }));

    if (dados.direta && dados.filial_origem_id === dados.filial_destino_id) {
      const { data, error } = await supabase.rpc("fn_transferencia_direta", {
        p_filial_id: dados.filial_origem_id,
        p_local_origem: dados.local_origem,
        p_local_destino: dados.local_destino,
        p_itens: itens,
        p_observacao: dados.observacao || null,
      });

      if (error) return { ok: false, erro: mensagemErro(error) };

      revalidatePath("/transferencias");
      revalidatePath("/estoque");

      return { ok: true, dados: data as string, mensagem: "Transferência interna concluída." };
    }

    const { data, error } = await supabase.rpc("fn_criar_transferencia", {
      p_filial_origem_id: dados.filial_origem_id,
      p_local_origem: dados.local_origem,
      p_filial_destino_id: dados.filial_destino_id,
      p_local_destino: dados.local_destino,
      p_itens: itens,
      p_observacao: dados.observacao || null,
    });

    if (error) return { ok: false, erro: mensagemErro(error) };

    revalidatePath("/transferencias");

    return { ok: true, dados: data as string, mensagem: "Transferência solicitada." };
  } catch (erro) {
    if (erro instanceof z.ZodError) {
      return { ok: false, erro: erro.issues[0]?.message ?? "Dados inválidos." };
    }
    return { ok: false, erro: mensagemErro(erro) };
  }
}

export async function enviarTransferencia(
  id: string,
  itensEnviados?: { item_id: string; quantidade: number }[],
): Promise<Resultado> {
  try {
    await exigirPermissaoAction(PERMISSOES.transferenciasEnviar);

    const supabase = await supabaseServidor();
    const { error } = await supabase.rpc("fn_enviar_transferencia", {
      p_transferencia_id: id,
      p_itens_enviados: itensEnviados ?? null,
    });

    if (error) return { ok: false, erro: mensagemErro(error) };

    revalidatePath("/transferencias");
    revalidatePath(`/transferencias/${id}`);
    revalidatePath("/estoque");

    return {
      ok: true,
      dados: undefined,
      mensagem: "Transferência enviada. O saldo saiu da origem e aguarda confirmação no destino.",
    };
  } catch (erro) {
    return { ok: false, erro: mensagemErro(erro) };
  }
}

export async function receberTransferencia(
  id: string,
  itensRecebidos?: { item_id: string; quantidade: number }[],
  observacao?: string,
): Promise<Resultado<{ perdas: number }>> {
  try {
    await exigirPermissaoAction(PERMISSOES.transferenciasReceber);

    const supabase = await supabaseServidor();
    const { data, error } = await supabase.rpc("fn_receber_transferencia", {
      p_transferencia_id: id,
      p_itens_recebidos: itensRecebidos ?? null,
      p_observacao: observacao || null,
    });

    if (error) return { ok: false, erro: mensagemErro(error) };

    const retorno = data as { perdas_em_transito: unknown[] };
    const perdas = retorno.perdas_em_transito?.length ?? 0;

    revalidatePath("/transferencias");
    revalidatePath(`/transferencias/${id}`);
    revalidatePath("/estoque");

    return {
      ok: true,
      dados: { perdas },
      mensagem:
        perdas > 0
          ? `Recebimento confirmado. ${perdas} item(ns) com diferença registrada como perda em trânsito.`
          : "Recebimento confirmado e saldo creditado no destino.",
    };
  } catch (erro) {
    return { ok: false, erro: mensagemErro(erro) };
  }
}

export async function cancelarTransferencia(id: string, motivo: string): Promise<Resultado> {
  try {
    await exigirPermissaoAction(PERMISSOES.transferenciasCancelar);

    if (!motivo?.trim()) {
      return { ok: false, erro: "Informe o motivo do cancelamento." };
    }

    const supabase = await supabaseServidor();
    const { error } = await supabase.rpc("fn_cancelar_transferencia", {
      p_transferencia_id: id,
      p_motivo: motivo.trim(),
    });

    if (error) return { ok: false, erro: mensagemErro(error) };

    revalidatePath("/transferencias");
    revalidatePath(`/transferencias/${id}`);
    revalidatePath("/estoque");

    return { ok: true, dados: undefined, mensagem: "Transferência cancelada." };
  } catch (erro) {
    return { ok: false, erro: mensagemErro(erro) };
  }
}

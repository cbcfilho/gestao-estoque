"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { Resultado } from "@/actions/estoque";
import { exigirPermissaoAction } from "@/lib/auth";
import { obterConfiguracoes } from "@/lib/configuracoes";
import { PERMISSOES } from "@/lib/permissoes";
import { supabaseServidor } from "@/lib/supabase/server";
import { mensagemErro } from "@/lib/utils";

const esquema = z.object({
  filial_id: z.string().uuid(),
  tipo: z.enum(["entrada", "saida_intervalo", "volta_intervalo", "saida"]),
  observacao: z.string().trim().max(200).optional().or(z.literal("")),
});

/**
 * Marca o ponto do próprio usuário.
 * O horário é do servidor de propósito: relógio de celular é facilmente ajustável.
 */
export async function registrarPonto(entrada: unknown): Promise<Resultado<string>> {
  try {
    const sessao = await exigirPermissaoAction(PERMISSOES.pontoRegistrar);
    const dados = esquema.parse(entrada);

    const config = await obterConfiguracoes();
    if (config.ponto_modo !== "registro") {
      return {
        ok: false,
        erro: "O registro de horário está desligado. Ative em Configurações → Controle de ponto.",
      };
    }

    const supabase = await supabaseServidor();

    const { data, error } = await supabase
      .from("registros_ponto")
      .insert({
        usuario_id: sessao.id,
        filial_id: dados.filial_id,
        tipo: dados.tipo,
        observacao: dados.observacao || null,
      })
      .select("id")
      .single();

    if (error) return { ok: false, erro: mensagemErro(error) };

    revalidatePath("/ponto");

    return { ok: true, dados: data.id as string, mensagem: "Ponto registrado." };
  } catch (erro) {
    if (erro instanceof z.ZodError) {
      return { ok: false, erro: erro.issues[0]?.message ?? "Dados inválidos." };
    }
    return { ok: false, erro: mensagemErro(erro) };
  }
}

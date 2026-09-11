"use server";

import { z } from "zod";

import { exigirPermissaoAction } from "@/lib/auth";
import { PERMISSOES } from "@/lib/permissoes";
import {
  LIMITE_EXPORTACAO,
  ORIGENS,
  type RetornoRelatorio,
  normalizarRetorno,
  parametrosRpc,
} from "@/lib/relatorio-movimentacoes";
import { supabaseServidor } from "@/lib/supabase/server";
import { mensagemErro } from "@/lib/utils";

import type { Resultado } from "./estoque";

const esquema = z.object({
  de: z.string().min(1),
  ate: z.string().min(1),
  tipo: z.enum(["entrada", "saida", "transferencia", "ajuste"]).or(z.literal("")),
  filial: z.string().uuid().or(z.literal("")),
  local: z.enum(["deposito", "prateleira", "cafeteria"]).or(z.literal("")),
  busca: z.string().trim().max(120),
  origem: z.enum(ORIGENS),
  semEstornos: z.boolean(),
  filialEscopo: z.string().uuid().nullable(),
});

/**
 * Conjunto filtrado inteiro, para a exportação.
 *
 * A tela pagina de 50 em 50; o arquivo precisa de tudo. É a mesma RPC da
 * listagem, com o limite aberto — o filtro não é reescrito aqui, senão o Excel
 * e a tela divergiriam com o tempo.
 */
export async function listarMovimentacoesParaExportar(
  entrada: unknown,
): Promise<Resultado<RetornoRelatorio & { truncado: boolean }>> {
  try {
    await exigirPermissaoAction(PERMISSOES.estoqueVisualizar);

    const dados = esquema.parse(entrada);
    const supabase = await supabaseServidor();

    const { data, error } = await supabase.rpc(
      "fn_relatorio_movimentacoes",
      parametrosRpc(
        { ...dados, pagina: 1 },
        dados.filialEscopo,
        LIMITE_EXPORTACAO,
        0,
      ),
    );

    if (error) return { ok: false, erro: mensagemErro(error) };

    const retorno = normalizarRetorno(data);

    return {
      ok: true,
      dados: { ...retorno, truncado: retorno.total > LIMITE_EXPORTACAO },
    };
  } catch (erro) {
    return { ok: false, erro: mensagemErro(erro) };
  }
}

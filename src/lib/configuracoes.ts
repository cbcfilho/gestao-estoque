import { cache } from "react";

import { supabaseServidor } from "@/lib/supabase/server";

export interface Identidade {
  nome_sistema: string;
  subtitulo: string;
  cor_primaria: string;
  cor_secundaria: string;
  logo_url: string | null;
}

export interface ConfiguracoesSistema {
  identidade: Identidade;
  transferencia_exige_aprovacao: { entre_filiais: boolean; entre_locais: boolean };
  ponto_modo: "lembrete" | "registro";
  inventario_agendamento: { ativo: boolean; dia_abertura: number; dias_para_concluir: number };
  alertas_vencimento: { faixas_dias: number[]; gerar_tarefa_em: number };
  custo_metodo: string;
}

const PADRAO: ConfiguracoesSistema = {
  identidade: {
    nome_sistema: "Estoque Cacau",
    subtitulo: "Gestão Multi-Filial",
    cor_primaria: "#5B2C20",
    cor_secundaria: "#C9A227",
    logo_url: null,
  },
  transferencia_exige_aprovacao: { entre_filiais: false, entre_locais: false },
  ponto_modo: "lembrete",
  inventario_agendamento: { ativo: true, dia_abertura: 1, dias_para_concluir: 5 },
  alertas_vencimento: { faixas_dias: [7, 15, 30], gerar_tarefa_em: 15 },
  custo_metodo: "medio_ponderado",
};

/** Configurações do sistema, com fallback para os padrões se algo faltar. */
export const obterConfiguracoes = cache(async (): Promise<ConfiguracoesSistema> => {
  const supabase = await supabaseServidor();
  const { data } = await supabase.from("configuracoes").select("chave, valor");

  if (!data) return PADRAO;

  const mapa = new Map(data.map((c) => [c.chave as string, c.valor]));

  return {
    identidade: { ...PADRAO.identidade, ...(mapa.get("identidade") as object | undefined) },
    transferencia_exige_aprovacao: {
      ...PADRAO.transferencia_exige_aprovacao,
      ...(mapa.get("transferencia_exige_aprovacao") as object | undefined),
    },
    ponto_modo: (mapa.get("ponto_modo") as ConfiguracoesSistema["ponto_modo"]) ?? PADRAO.ponto_modo,
    inventario_agendamento: {
      ...PADRAO.inventario_agendamento,
      ...(mapa.get("inventario_agendamento") as object | undefined),
    },
    alertas_vencimento: {
      ...PADRAO.alertas_vencimento,
      ...(mapa.get("alertas_vencimento") as object | undefined),
    },
    custo_metodo: (mapa.get("custo_metodo") as string) ?? PADRAO.custo_metodo,
  };
});

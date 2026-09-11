import type { TipoLocal, TipoMovimentacao, VwMovimentacao } from "@/types/database";

/**
 * Filtros do relatório de movimentações.
 *
 * O filtro em si mora na função `fn_relatorio_movimentacoes` (migration 0023):
 * aqui só se lê a query string e se monta os parâmetros da RPC. Tela e
 * exportação passam pelo mesmo caminho, então não há como o Excel divergir do
 * que está na tela.
 */

export const ORIGENS = ["todas", "importadas", "manuais"] as const;
export type OrigemRelatorio = (typeof ORIGENS)[number];

export const LABEL_ORIGEM: Record<OrigemRelatorio, string> = {
  todas: "Todas as origens",
  importadas: "Só importadas",
  manuais: "Só lançadas na mão",
};

export interface FiltrosRelatorio {
  de: string;
  ate: string;
  tipo: TipoMovimentacao | "";
  filial: string;
  local: TipoLocal | "";
  busca: string;
  origem: OrigemRelatorio;
  semEstornos: boolean;
  pagina: number;
}

export const POR_PAGINA = 50;

/** Teto da exportação. Acima disso o arquivo vira um problema, não uma ajuda. */
export const LIMITE_EXPORTACAO = 10_000;

/** O PDF é para leitura; lista longa demais trava o navegador e ninguém lê. */
export const LIMITE_PDF = 1_000;

const TIPOS: TipoMovimentacao[] = ["entrada", "saida", "transferencia", "ajuste"];
const LOCAIS: TipoLocal[] = ["deposito", "prateleira", "cafeteria"];

function diasAtras(dias: number) {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  return d.toISOString().slice(0, 10);
}

function hoje() {
  return new Date().toISOString().slice(0, 10);
}

/** Lê a query string, com padrão de 30 dias. Valor estranho vira o padrão. */
export function filtrosDaUrl(params: Record<string, string | undefined>): FiltrosRelatorio {
  const tipo = params.tipo ?? "";
  const local = params.local ?? "";
  const origem = params.origem ?? "";

  return {
    de: params.de || diasAtras(30),
    ate: params.ate || hoje(),
    tipo: TIPOS.includes(tipo as TipoMovimentacao) ? (tipo as TipoMovimentacao) : "",
    filial: params.filial ?? "",
    local: LOCAIS.includes(local as TipoLocal) ? (local as TipoLocal) : "",
    busca: params.busca?.trim() ?? "",
    origem: ORIGENS.includes(origem as OrigemRelatorio) ? (origem as OrigemRelatorio) : "todas",
    semEstornos: params.semEstornos === "1",
    pagina: Math.max(1, Number(params.pagina ?? 1) || 1),
  };
}

/**
 * Parâmetros da RPC. `filialEscopo` é a filial ativa na navegação — entra
 * quando o usuário não escolheu uma filial no próprio relatório. A RLS já
 * limita ao que a pessoa pode ver; isto é só o recorte de leitura.
 */
export function parametrosRpc(
  filtros: FiltrosRelatorio,
  filialEscopo: string | null,
  limite: number,
  offset: number,
) {
  return {
    p_de: filtros.de,
    p_ate: filtros.ate,
    p_tipo: filtros.tipo || null,
    p_filial_id: filtros.filial || filialEscopo || null,
    p_local: filtros.local || null,
    p_busca: filtros.busca || null,
    p_origem: filtros.origem,
    p_sem_estornos: filtros.semEstornos,
    p_limite: limite,
    p_offset: offset,
  };
}

export interface RetornoRelatorio {
  total: number;
  totais: { quantidade: number; custo: number; venda: number };
  linhas: VwMovimentacao[];
}

/** A RPC devolve números como string em jsonb; normaliza para uso na tela. */
export function normalizarRetorno(dados: unknown): RetornoRelatorio {
  const bruto = (dados ?? {}) as {
    total?: number | string;
    totais?: { quantidade?: number | string; custo?: number | string; venda?: number | string };
    linhas?: VwMovimentacao[];
  };

  return {
    total: Number(bruto.total ?? 0),
    totais: {
      quantidade: Number(bruto.totais?.quantidade ?? 0),
      custo: Number(bruto.totais?.custo ?? 0),
      venda: Number(bruto.totais?.venda ?? 0),
    },
    linhas: bruto.linhas ?? [],
  };
}

/** Filial e local de uma linha: transferência tem as duas pontas. */
export function trajetoFilial(m: VwMovimentacao) {
  if (m.filial_origem_nome && m.filial_destino_nome) {
    return `${m.filial_origem_nome} → ${m.filial_destino_nome}`;
  }
  return m.filial_destino_nome ?? m.filial_origem_nome ?? "—";
}

export function trajetoLocal(m: VwMovimentacao, rotulo: Record<TipoLocal, string>) {
  if (m.local_origem && m.local_destino) {
    return `${rotulo[m.local_origem]} → ${rotulo[m.local_destino]}`;
  }
  const unico = m.local_destino ?? m.local_origem;
  return unico ? rotulo[unico] : "—";
}

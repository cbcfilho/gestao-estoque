import type {
  CategoriaTarefa,
  MotivoMovimentacao,
  PrioridadeTarefa,
  StatusInventario,
  StatusTarefa,
  StatusTransferencia,
  TipoLocal,
  TipoMovimentacao,
  UnidadeMedida,
} from "@/types/database";

const MOEDA = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const NUMERO = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });
const INTEIRO = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const PERCENTUAL = new Intl.NumberFormat("pt-BR", {
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

export function moeda(valor: number | null | undefined) {
  return MOEDA.format(valor ?? 0);
}

/** Versão curta para cartões de KPI: R$ 1,2 mil / R$ 3,4 mi. */
export function moedaCurta(valor: number | null | undefined) {
  const v = valor ?? 0;
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `R$ ${NUMERO.format(Number((v / 1_000_000).toFixed(1)))} mi`;
  if (abs >= 10_000) return `R$ ${INTEIRO.format(Math.round(v / 1000))} mil`;
  return MOEDA.format(v);
}

export function numero(valor: number | null | undefined) {
  return NUMERO.format(valor ?? 0);
}

export function inteiro(valor: number | null | undefined) {
  return INTEIRO.format(valor ?? 0);
}

export function percentual(valor: number | null | undefined, jaEmCem = true) {
  if (valor === null || valor === undefined) return "—";
  return PERCENTUAL.format(jaEmCem ? valor / 100 : valor);
}

export function quantidade(valor: number | null | undefined, unidade?: UnidadeMedida) {
  return `${NUMERO.format(valor ?? 0)}${unidade ? ` ${LABEL_UNIDADE[unidade]}` : ""}`;
}

/* -------------------------------------------------------------------------- */
/* Datas                                                                       */
/* -------------------------------------------------------------------------- */

function paraData(valor: string | Date | null | undefined): Date | null {
  if (!valor) return null;
  if (valor instanceof Date) return valor;
  // Datas puras (YYYY-MM-DD) precisam ser lidas como local, não UTC,
  // senão a validade aparece um dia antes para quem está no Brasil.
  if (/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
    const [a, m, d] = valor.split("-").map(Number);
    return new Date(a, m - 1, d);
  }
  const dt = new Date(valor);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

export function data(valor: string | Date | null | undefined) {
  const dt = paraData(valor);
  return dt ? dt.toLocaleDateString("pt-BR") : "—";
}

export function dataHora(valor: string | Date | null | undefined) {
  const dt = paraData(valor);
  return dt
    ? dt.toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";
}

export function mesAno(valor: string | Date | null | undefined) {
  const dt = paraData(valor);
  return dt
    ? dt.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }).replace(".", "")
    : "—";
}

/** "hoje", "em 3 dias", "há 2 dias" */
export function tempoRelativo(valor: string | Date | null | undefined) {
  const dt = paraData(valor);
  if (!dt) return "—";

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const alvo = new Date(dt);
  alvo.setHours(0, 0, 0, 0);

  const dias = Math.round((alvo.getTime() - hoje.getTime()) / 86_400_000);

  if (dias === 0) return "hoje";
  if (dias === 1) return "amanhã";
  if (dias === -1) return "ontem";
  if (dias > 0) return `em ${dias} dias`;
  return `há ${Math.abs(dias)} dias`;
}

/** Formato aceito por <input type="date">. */
export function paraInputDate(valor: string | Date | null | undefined) {
  const dt = paraData(valor);
  if (!dt) return "";
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${dt.getFullYear()}-${mm}-${dd}`;
}

export function hojeISO() {
  return paraInputDate(new Date());
}

/* -------------------------------------------------------------------------- */
/* Rótulos                                                                     */
/* -------------------------------------------------------------------------- */

export const LABEL_UNIDADE: Record<UnidadeMedida, string> = {
  un: "un",
  cx: "cx",
  pct: "pct",
  kg: "kg",
  g: "g",
  l: "L",
  ml: "mL",
};

export const LABEL_LOCAL: Record<TipoLocal, string> = {
  deposito: "Depósito",
  prateleira: "Prateleira/Loja",
  cafeteria: "Cafeteria",
};

export const LABEL_LOCAL_CURTO: Record<TipoLocal, string> = {
  deposito: "Depósito",
  prateleira: "Loja",
  cafeteria: "Cafeteria",
};

export const LABEL_TIPO_MOV: Record<TipoMovimentacao, string> = {
  entrada: "Entrada",
  saida: "Saída",
  transferencia: "Transferência",
  ajuste: "Ajuste",
};

export const LABEL_MOTIVO: Record<MotivoMovimentacao, string> = {
  compra_fornecedor: "Compra de fornecedor",
  recebimento_transferencia: "Recebimento de transferência",
  ajuste_positivo: "Ajuste positivo",
  devolucao_cliente: "Devolução de cliente",
  venda: "Venda",
  perda: "Perda",
  quebra: "Quebra",
  vencimento: "Vencimento",
  consumo_interno: "Consumo interno (cafeteria)",
  degustacao: "Degustação",
  brinde: "Brinde",
  ajuste_negativo: "Ajuste negativo",
  envio_transferencia: "Envio de transferência",
  ajuste_inventario: "Ajuste de inventário",
};

export const MOTIVOS_ENTRADA: MotivoMovimentacao[] = [
  "compra_fornecedor",
  "recebimento_transferencia",
  "devolucao_cliente",
  "ajuste_positivo",
];

export const MOTIVOS_SAIDA: MotivoMovimentacao[] = [
  "venda",
  "perda",
  "quebra",
  "vencimento",
  "consumo_interno",
  "degustacao",
  "brinde",
  "ajuste_negativo",
];

export const LABEL_STATUS_TRANSFERENCIA: Record<StatusTransferencia, string> = {
  solicitada: "Solicitada",
  em_transito: "Em trânsito",
  recebida: "Recebida",
  cancelada: "Cancelada",
};

export const LABEL_STATUS_INVENTARIO: Record<StatusInventario, string> = {
  aberto: "Aberto",
  em_contagem: "Em contagem",
  aguardando_aprovacao: "Aguardando aprovação",
  aprovado: "Aprovado",
  cancelado: "Cancelado",
};

export const LABEL_STATUS_TAREFA: Record<StatusTarefa, string> = {
  a_fazer: "A fazer",
  em_andamento: "Em andamento",
  atrasado: "Atrasado",
  concluido: "Concluído",
  cancelado: "Cancelado",
};

export const LABEL_PRIORIDADE: Record<PrioridadeTarefa, string> = {
  baixa: "Baixa",
  media: "Média",
  alta: "Alta",
  urgente: "Urgente",
};

export const LABEL_CATEGORIA_TAREFA: Record<CategoriaTarefa, string> = {
  inventario: "Inventário",
  ponto: "Ponto",
  estoque_minimo: "Estoque mínimo",
  vencimento: "Vencimento",
  reposicao: "Reposição",
  transferencia: "Transferência",
  outro: "Outro",
};

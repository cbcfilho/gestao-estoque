"use client";

/**
 * Leitura de XML de NF-e no navegador (DOMParser).
 *
 * Diferença deliberada em relação a planilha.ts: NF-e é documento fiscal
 * rígido, não planilha digitada por humano — erro de estrutura aborta o
 * parse do arquivo inteiro, sem lista de "problemas" linha a linha.
 */

import type { UnidadeMedida } from "@/types/database";

export interface NfeItemParseado {
  numeroItem: number;
  codigoProdutoNota: string;
  eanNota: string | null;
  descricaoNota: string;
  unidadeNota: string;
  quantidadeNota: number;
  valorUnitarioNota: number;
  valorTotalNota: number;
  loteSugerido: string | null;
  dataFabricacaoSugerida: string | null;
  dataValidadeSugerida: string | null;
}

export interface NfeParseada {
  chaveAcesso: string;
  numeroNota: string;
  serie: string;
  dataEmissao: string;
  emitenteCnpj: string;
  emitenteNome: string;
  valorTotalNota: number;
  itens: NfeItemParseado[];
  xmlConteudo: string;
}

function primeiroFilho(el: Element | Document, tag: string): Element | null {
  return el.getElementsByTagName(tag)[0] ?? null;
}

function texto(el: Element | Document, tag: string): string {
  return primeiroFilho(el, tag)?.textContent?.trim() ?? "";
}

function paraNumero(texto: string): number {
  const n = Number(texto.replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
}

const MAPA_UNIDADE: Record<string, UnidadeMedida> = {
  UN: "un",
  UND: "un",
  PC: "un",
  PCT: "pct",
  CX: "cx",
  KG: "kg",
  GR: "g",
  G: "g",
  LT: "l",
  L: "l",
  ML: "ml",
};

/** Melhor esforço: uCom é texto livre do emitente, sem tabela fiscal fixa. */
export function mapearUnidadeNfe(uCom: string): UnidadeMedida {
  return MAPA_UNIDADE[uCom.trim().toUpperCase()] ?? "un";
}

export async function lerXmlNfe(arquivo: File): Promise<NfeParseada> {
  const xmlConteudo = await arquivo.text();

  const doc = new DOMParser().parseFromString(xmlConteudo, "application/xml");
  if (doc.getElementsByTagName("parsererror").length > 0) {
    throw new Error("Arquivo XML inválido ou corrompido.");
  }

  const infNFe = primeiroFilho(doc, "infNFe");
  if (!infNFe) {
    throw new Error("Este arquivo não parece ser uma NF-e.");
  }

  // Chave de acesso: preferir protNFe/infProt/chNFe (XML "processado", o mais
  // comum vindo de portal de fornecedor); senão extrair do atributo Id de
  // infNFe (prefixo "NFe" + 44 dígitos).
  let chaveAcesso = texto(doc, "chNFe");
  if (!chaveAcesso) {
    const id = infNFe.getAttribute("Id") ?? "";
    chaveAcesso = id.replace(/^NFe/i, "").trim();
  }
  if (!/^\d{44}$/.test(chaveAcesso)) {
    throw new Error("Não foi possível localizar a chave de acesso (44 dígitos) na nota.");
  }

  const ide = primeiroFilho(infNFe, "ide");
  const emit = primeiroFilho(infNFe, "emit");
  if (!ide || !emit) {
    throw new Error("Estrutura da NF-e incompleta: faltam os blocos <ide> ou <emit>.");
  }

  const numeroNota = texto(ide, "nNF");
  const serie = texto(ide, "serie");
  // Layout 4.00 usa dhEmi; layout 3.10, ainda emitido por sistemas
  // desatualizados, usa dEmi.
  const dataEmissaoBruta = texto(ide, "dhEmi") || texto(ide, "dEmi");
  const dataEmissao = dataEmissaoBruta ? new Date(dataEmissaoBruta).toISOString() : "";

  const emitenteCnpj = texto(emit, "CNPJ");
  const emitenteNome = texto(emit, "xNome");

  const total = primeiroFilho(infNFe, "total");
  const icmsTot = total ? primeiroFilho(total, "ICMSTot") : null;
  const valorTotalNota = icmsTot ? paraNumero(texto(icmsTot, "vNF")) : 0;

  const dets = Array.from(infNFe.getElementsByTagName("det"));
  if (dets.length === 0) {
    throw new Error("A nota não tem nenhum item (bloco <det>).");
  }

  const itens: NfeItemParseado[] = dets.map((det, indice) => {
    const prod = primeiroFilho(det, "prod");
    if (!prod) {
      throw new Error(`Item ${indice + 1}: bloco <prod> ausente.`);
    }

    const quantidadeNota = paraNumero(texto(prod, "qCom"));
    const valorUnitarioNota = paraNumero(texto(prod, "vUnCom"));

    if (!Number.isFinite(quantidadeNota) || !Number.isFinite(valorUnitarioNota)) {
      throw new Error(`Item ${indice + 1}: quantidade ou valor unitário inválido.`);
    }

    const eanBruto = (texto(prod, "cEAN") || texto(prod, "cEANTrib")).trim();
    const eanNota = eanBruto && eanBruto.toUpperCase() !== "SEM GTIN" ? eanBruto : null;

    const rastro = primeiroFilho(det, "rastro");

    return {
      numeroItem: indice + 1,
      codigoProdutoNota: texto(prod, "cProd"),
      eanNota,
      descricaoNota: texto(prod, "xProd"),
      unidadeNota: texto(prod, "uCom"),
      quantidadeNota,
      valorUnitarioNota,
      valorTotalNota: paraNumero(texto(prod, "vProd")) || quantidadeNota * valorUnitarioNota,
      loteSugerido: rastro ? texto(rastro, "nLote") || null : null,
      dataFabricacaoSugerida: rastro ? texto(rastro, "dFab") || null : null,
      dataValidadeSugerida: rastro ? texto(rastro, "dVal") || null : null,
    };
  });

  return {
    chaveAcesso,
    numeroNota,
    serie,
    dataEmissao,
    emitenteCnpj,
    emitenteNome,
    valorTotalNota,
    itens,
    xmlConteudo,
  };
}

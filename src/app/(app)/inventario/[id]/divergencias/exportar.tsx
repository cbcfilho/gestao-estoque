"use client";

import { FileSpreadsheet, FileText } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Botao } from "@/components/ui/botao";
import {
  LABEL_LOCAL_CURTO,
  LABEL_STATUS_INVENTARIO,
  data as formatarData,
  moeda,
  numero,
  percentual,
} from "@/lib/formato";
import { gerarPdf } from "@/lib/pdf";
import { gerarExcel } from "@/lib/planilha";
import { mensagemErro } from "@/lib/utils";
import type { VwInventarioDivergencia, VwInventarioResumo } from "@/types/database";

const COLUNAS = [
  "Produto",
  "EAN",
  "Local",
  "Lote",
  "Validade",
  "Sistema",
  "Contado",
  "Diferença",
  "Impacto (R$)",
  "Situação",
];

const LABEL_SITUACAO: Record<string, string> = {
  ok: "Confere",
  falta: "Falta",
  sobra: "Sobra",
  nao_contado: "Não contado",
};

export function ExportarDivergencias({
  resumo,
  itens,
}: {
  resumo: VwInventarioResumo;
  itens: VwInventarioDivergencia[];
}) {
  const [ocupado, setOcupado] = useState(false);

  const linhas = itens.map((i) => [
    i.produto_nome,
    i.ean ?? "",
    LABEL_LOCAL_CURTO[i.local],
    i.lote,
    i.data_validade ? formatarData(i.data_validade) : "",
    numero(i.quantidade_sistema),
    i.quantidade_contada === null ? "" : numero(i.quantidade_contada),
    numero(i.divergencia_quantidade),
    Number(i.divergencia_valor).toFixed(2),
    LABEL_SITUACAO[i.situacao] ?? i.situacao,
  ]);

  const resumoLinhas = [
    { rotulo: "Acuracidade", valor: percentual(resumo.acuracidade_percentual) },
    { rotulo: "Itens contados", valor: `${resumo.itens_contados} de ${resumo.itens_total}` },
    { rotulo: "Divergentes", valor: numero(resumo.itens_divergentes) },
    { rotulo: "Impacto líquido", valor: moeda(resumo.divergencia_liquida) },
    { rotulo: "Faltas", valor: moeda(resumo.valor_falta) },
    { rotulo: "Sobras", valor: moeda(resumo.valor_sobra) },
  ];

  async function exportar(formato: "excel" | "pdf") {
    setOcupado(true);
    try {
      const nome = `inventario-${resumo.codigo}`;

      if (formato === "excel") {
        await gerarExcel(nome, [
          { nome: "Divergências", colunas: COLUNAS, linhas },
          {
            nome: "Resumo",
            colunas: ["Indicador", "Valor"],
            linhas: [
              ["Inventário", resumo.codigo],
              ["Filial", resumo.filial_nome],
              ["Situação", LABEL_STATUS_INVENTARIO[resumo.status]],
              ["Aberto em", formatarData(resumo.aberto_em)],
              ["Fechado em", resumo.fechado_em ? formatarData(resumo.fechado_em) : "—"],
              ["Aprovado em", resumo.aprovado_em ? formatarData(resumo.aprovado_em) : "—"],
              ...resumoLinhas.map((r) => [r.rotulo, r.valor]),
            ],
          },
        ]);
      } else {
        await gerarPdf({
          nomeArquivo: nome,
          titulo: `Inventário ${resumo.codigo}`,
          subtitulo: `${resumo.filial_nome} · ${LABEL_STATUS_INVENTARIO[resumo.status]}`,
          resumo: resumoLinhas,
          secoes: [
            {
              titulo: "Divergências apuradas",
              colunas: COLUNAS,
              linhas,
              colunasNumericas: [5, 6, 7, 8],
            },
          ],
          paisagem: true,
        });
      }

      toast.success("Relatório gerado.");
    } catch (erro) {
      toast.error(mensagemErro(erro));
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="flex gap-2">
      <Botao
        variante="contorno"
        tamanho="sm"
        onClick={() => void exportar("excel")}
        disabled={ocupado}
      >
        <FileSpreadsheet className="size-4" />
        Excel
      </Botao>
      <Botao
        variante="contorno"
        tamanho="sm"
        onClick={() => void exportar("pdf")}
        disabled={ocupado}
      >
        <FileText className="size-4" />
        PDF
      </Botao>
    </div>
  );
}

"use client";

import { FileSpreadsheet, FileText } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { listarMovimentacoesParaExportar } from "@/actions/relatorios";
import { Botao } from "@/components/ui/botao";
import {
  LABEL_LOCAL,
  LABEL_MOTIVO,
  LABEL_TIPO_MOV,
  data as formatarData,
  hora,
  moeda,
  numero,
} from "@/lib/formato";
import { gerarPdf } from "@/lib/pdf";
import { gerarExcel } from "@/lib/planilha";
import {
  type FiltrosRelatorio,
  LABEL_ORIGEM,
  LIMITE_PDF,
  trajetoFilial,
  trajetoLocal,
} from "@/lib/relatorio-movimentacoes";
import { mensagemErro } from "@/lib/utils";

export function ExportarMovimentacoes({
  filtros,
  filialEscopo,
  contexto,
}: {
  filtros: FiltrosRelatorio;
  filialEscopo: string | null;
  contexto: string;
}) {
  const [ocupado, setOcupado] = useState(false);

  async function exportar(formato: "excel" | "pdf") {
    setOcupado(true);
    try {
      const r = await listarMovimentacoesParaExportar({
        de: filtros.de,
        ate: filtros.ate,
        tipo: filtros.tipo,
        filial: filtros.filial,
        local: filtros.local,
        busca: filtros.busca,
        origem: filtros.origem,
        semEstornos: filtros.semEstornos,
        filialEscopo,
      });

      if (!r.ok) {
        toast.error(r.erro);
        return;
      }

      const { linhas, totais, total, truncado } = r.dados;

      if (linhas.length === 0) {
        toast.error("Nenhuma movimentação no filtro atual.");
        return;
      }

      const nome = `movimentacoes-${filtros.de}-a-${filtros.ate}`;
      const periodo = `${formatarData(filtros.de)} a ${formatarData(filtros.ate)}`;

      // O arquivo vai ser aberto meses depois, fora de contexto: os filtros
      // usados precisam viajar junto.
      const filtrosAplicados: [string, string][] = [
        ["Período", periodo],
        ["Contexto", contexto],
        ["Tipo", filtros.tipo ? LABEL_TIPO_MOV[filtros.tipo] : "Todos"],
        ["Local", filtros.local ? LABEL_LOCAL[filtros.local] : "Todos"],
        ["Origem", LABEL_ORIGEM[filtros.origem]],
        ["Estornos", filtros.semEstornos ? "Ocultos" : "Incluídos"],
        ["Busca", filtros.busca || "—"],
        ["Lançamentos", String(total)],
      ];

      if (formato === "excel") {
        await gerarExcel(nome, [
          {
            nome: "Movimentações",
            colunas: [
              "Tipo",
              "Motivo",
              "Data",
              "Hora",
              "EAN",
              "SKU",
              "Produto",
              "Filial",
              "Local",
              "Quantidade",
              "Custo unitário",
              "Valor de custo",
              "Valor de venda",
              "Usuário",
              "Origem",
            ],
            // Número vai como número, não como texto: o contador precisa somar.
            linhas: linhas.map((m) => [
              LABEL_TIPO_MOV[m.tipo],
              LABEL_MOTIVO[m.motivo],
              formatarData(m.data_hora),
              hora(m.data_hora),
              m.ean ?? "",
              m.sku ?? "",
              m.produto_nome,
              trajetoFilial(m),
              trajetoLocal(m, LABEL_LOCAL),
              Number(m.quantidade),
              Number(m.custo_unitario),
              Number(m.valor_total),
              Number(m.valor_venda_total),
              m.usuario_nome ?? "",
              m.importacao_arquivo ?? "Lançamento manual",
            ]),
          },
          {
            nome: "Filtros",
            colunas: ["Filtro", "Valor"],
            linhas: filtrosAplicados.map(([r, v]) => [r, v]),
          },
        ]);
      } else {
        const paraPdf = linhas.slice(0, LIMITE_PDF);

        await gerarPdf({
          nomeArquivo: nome,
          titulo: "Relatório de Movimentações",
          subtitulo: `${contexto} · ${periodo}`,
          paisagem: true,
          resumo: [
            { rotulo: "Lançamentos", valor: numero(total) },
            { rotulo: "Quantidade", valor: numero(totais.quantidade) },
            { rotulo: "Valor de custo", valor: moeda(totais.custo) },
            { rotulo: "Valor de venda", valor: moeda(totais.venda) },
            { rotulo: "Origem", valor: LABEL_ORIGEM[filtros.origem] },
            { rotulo: "Estornos", valor: filtros.semEstornos ? "Ocultos" : "Incluídos" },
          ],
          secoes: [
            {
              titulo:
                paraPdf.length < linhas.length
                  ? `Movimentações — primeiras ${LIMITE_PDF} de ${numero(total)}`
                  : "Movimentações",
              colunas: [
                "Tipo",
                "Data",
                "Hora",
                "Produto",
                "Filial",
                "Local",
                "Qtd.",
                "Custo",
                "Venda",
                "Usuário",
              ],
              linhas: paraPdf.map((m) => [
                LABEL_TIPO_MOV[m.tipo],
                formatarData(m.data_hora),
                hora(m.data_hora),
                m.produto_nome,
                trajetoFilial(m),
                trajetoLocal(m, LABEL_LOCAL),
                numero(m.quantidade),
                moeda(m.valor_total),
                moeda(m.valor_venda_total),
                m.usuario_nome ?? "—",
              ]),
              colunasNumericas: [6, 7, 8],
            },
          ],
        });
      }

      if (truncado) {
        toast.warning(
          `O filtro tem ${numero(total)} lançamentos e o arquivo saiu com os primeiros ${numero(linhas.length)}. Estreite o período para levar tudo.`,
        );
      } else if (formato === "pdf" && linhas.length > LIMITE_PDF) {
        toast.warning(
          `O PDF saiu com as primeiras ${numero(LIMITE_PDF)} linhas. Para a lista completa, use o Excel.`,
        );
      } else {
        toast.success("Relatório gerado.");
      }
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

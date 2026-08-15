"use client";

import { FileSpreadsheet, FileText } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Botao } from "@/components/ui/botao";
import { data as formatarData, moeda, numero, percentual } from "@/lib/formato";
import { gerarPdf } from "@/lib/pdf";
import { gerarExcel } from "@/lib/planilha";
import { mensagemErro } from "@/lib/utils";
import type {
  LinhaAcuracidade,
  LinhaCurvaAbc,
  LinhaGiroEstoque,
  ResumoDashboard,
  VwValorEstoqueFilial,
} from "@/types/database";

export function ExportarRelatorios({
  periodo,
  contexto,
  resumo,
  abc,
  giro,
  porFilial,
  acuracidade,
}: {
  periodo: { de: string; ate: string };
  contexto: string;
  resumo: ResumoDashboard | null;
  abc: LinhaCurvaAbc[];
  giro: LinhaGiroEstoque[];
  porFilial: VwValorEstoqueFilial[];
  acuracidade: LinhaAcuracidade[];
}) {
  const [ocupado, setOcupado] = useState(false);

  const indicadores = [
    { rotulo: "Valor em estoque", valor: moeda(resumo?.valor_estoque) },
    { rotulo: "Venda potencial", valor: moeda(resumo?.valor_venda_potencial) },
    { rotulo: "Produtos com saldo", valor: numero(resumo?.skus_ativos) },
    { rotulo: "Abaixo do mínimo", valor: numero(resumo?.itens_abaixo_minimo) },
    { rotulo: "A vencer em 30 dias", valor: moeda(resumo?.valor_vencendo_30) },
    { rotulo: "Já vencido", valor: moeda(resumo?.valor_vencido) },
    { rotulo: "Movimentações (30d)", valor: numero(resumo?.movimentacoes_30d) },
    { rotulo: "Tarefas atrasadas", valor: numero(resumo?.tarefas_atrasadas) },
  ];

  const abasExcel = [
    {
      nome: "Indicadores",
      colunas: ["Indicador", "Valor"],
      linhas: indicadores.map((i) => [i.rotulo, i.valor]),
    },
    {
      nome: "Estoque por filial",
      colunas: ["Filial", "Depósito", "Prateleira", "Cafeteria", "Total custo", "Venda", "SKUs"],
      linhas: porFilial.map((f) => [
        f.filial_nome,
        Number(f.valor_deposito),
        Number(f.valor_prateleira),
        Number(f.valor_cafeteria),
        Number(f.valor_custo_total),
        Number(f.valor_venda_total),
        f.skus_com_saldo,
      ]),
    },
    {
      nome: "Curva ABC",
      colunas: ["Produto", "EAN", "Classe", "Valor saída", "Qtd. saída", "Participação %", "Acumulado %"],
      linhas: abc.map((l) => [
        l.produto_nome,
        l.ean ?? "",
        l.classe,
        Number(l.valor_saida),
        Number(l.quantidade_saida),
        Number(l.participacao),
        Number(l.participacao_acumulada),
      ]),
    },
    {
      nome: "Giro",
      colunas: ["Produto", "EAN", "Saída no período", "Saldo atual", "Giro", "Cobertura (dias)"],
      linhas: giro.map((l) => [
        l.produto_nome,
        l.ean ?? "",
        Number(l.quantidade_saida),
        Number(l.estoque_medio),
        l.giro === null ? "" : Number(l.giro),
        l.dias_de_cobertura === null ? "" : Number(l.dias_de_cobertura),
      ]),
    },
    {
      nome: "Acuracidade",
      colunas: ["Filial", "Inventários", "Acuracidade média %", "Divergência acumulada"],
      linhas: acuracidade.map((a) => [
        a.filial_nome,
        a.inventarios,
        a.acuracidade_media === null ? "" : Number(a.acuracidade_media),
        Number(a.divergencia_valor_total),
      ]),
    },
  ];

  async function exportar(formato: "excel" | "pdf") {
    setOcupado(true);
    try {
      const nome = `relatorio-estoque-${periodo.de}-a-${periodo.ate}`;

      if (formato === "excel") {
        await gerarExcel(nome, abasExcel);
      } else {
        await gerarPdf({
          nomeArquivo: nome,
          titulo: "Relatório de Estoque",
          subtitulo: `${contexto} · ${formatarData(periodo.de)} a ${formatarData(periodo.ate)}`,
          resumo: indicadores,
          paisagem: true,
          secoes: [
            {
              titulo: "Estoque por filial",
              colunas: ["Filial", "Depósito", "Prateleira", "Cafeteria", "Total", "SKUs"],
              linhas: porFilial.map((f) => [
                f.filial_nome,
                moeda(f.valor_deposito),
                moeda(f.valor_prateleira),
                f.possui_cafeteria ? moeda(f.valor_cafeteria) : "—",
                moeda(f.valor_custo_total),
                numero(f.skus_com_saldo),
              ]),
              colunasNumericas: [1, 2, 3, 4, 5],
            },
            {
              titulo: "Curva ABC — 30 maiores",
              colunas: ["Produto", "Classe", "Valor de saída", "Participação", "Acumulado"],
              linhas: abc
                .slice(0, 30)
                .map((l) => [
                  l.produto_nome,
                  l.classe,
                  moeda(l.valor_saida),
                  percentual(l.participacao),
                  percentual(l.participacao_acumulada),
                ]),
              colunasNumericas: [2, 3, 4],
            },
            {
              titulo: "Giro e cobertura — 30 maiores saídas",
              colunas: ["Produto", "Saída", "Saldo", "Giro", "Cobertura"],
              linhas: giro
                .slice(0, 30)
                .map((l) => [
                  l.produto_nome,
                  numero(l.quantidade_saida),
                  numero(l.estoque_medio),
                  l.giro === null ? "—" : numero(l.giro),
                  l.dias_de_cobertura === null ? "—" : `${numero(l.dias_de_cobertura)} d`,
                ]),
              colunasNumericas: [1, 2, 3, 4],
            },
            {
              titulo: "Acuracidade de inventário",
              colunas: ["Filial", "Inventários", "Acuracidade", "Divergência acumulada"],
              linhas: acuracidade.map((a) => [
                a.filial_nome,
                String(a.inventarios),
                percentual(a.acuracidade_media),
                moeda(a.divergencia_valor_total),
              ]),
              colunasNumericas: [1, 2, 3],
            },
          ],
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

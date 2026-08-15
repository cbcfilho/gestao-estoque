"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { DicaGrafico, MolduraGrafico } from "./grafico-base";
import { usePaleta } from "./tema-graficos";
import { mesAno, moeda, moedaCurta } from "@/lib/formato";
import type { LinhaEvolucaoMensal } from "@/types/database";

export function GraficoEvolucao({ dados }: { dados: LinhaEvolucaoMensal[] }) {
  const { series, chrome } = usePaleta();

  const pontos = dados.map((linha) => ({
    mes: mesAno(linha.mes),
    entradas: Number(linha.entradas_valor),
    saidas: Number(linha.saidas_valor),
  }));

  const temMovimento = pontos.some((p) => p.entradas > 0 || p.saidas > 0);

  return (
    <MolduraGrafico
      legenda={[
        { rotulo: "Entradas", cor: series.primaria },
        { rotulo: "Saídas", cor: series.secundaria },
      ]}
      colunas={["Mês", "Entradas", "Saídas"]}
      linhas={
        temMovimento
          ? pontos.map((p) => [p.mes, moeda(p.entradas), moeda(p.saidas)])
          : []
      }
      vazio="Nenhuma entrada ou saída registrada nos últimos meses."
    >
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={pontos} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barGap={2}>
          <CartesianGrid
            vertical={false}
            stroke={chrome.grade}
            strokeDasharray="0"
          />
          <XAxis
            dataKey="mes"
            tickLine={false}
            axisLine={{ stroke: chrome.eixo }}
            tick={{ fill: chrome.tintaSuave, fontSize: 12 }}
            dy={4}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={62}
            tick={{ fill: chrome.tintaSuave, fontSize: 12 }}
            tickFormatter={(v: number) => moedaCurta(v)}
          />
          <Tooltip
            cursor={{ fill: chrome.grade, opacity: 0.5 }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              return (
                <DicaGrafico
                  titulo={String(label)}
                  itens={[
                    {
                      rotulo: "Entradas",
                      valor: moeda(Number(payload[0]?.value ?? 0)),
                      cor: series.primaria,
                    },
                    {
                      rotulo: "Saídas",
                      valor: moeda(Number(payload[1]?.value ?? 0)),
                      cor: series.secundaria,
                    },
                  ]}
                />
              );
            }}
          />
          {/* Cantos arredondados só na ponta do dado; base ancorada no eixo. */}
          <Bar dataKey="entradas" fill={series.primaria} radius={[4, 4, 0, 0]} maxBarSize={28} />
          <Bar dataKey="saidas" fill={series.secundaria} radius={[4, 4, 0, 0]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </MolduraGrafico>
  );
}

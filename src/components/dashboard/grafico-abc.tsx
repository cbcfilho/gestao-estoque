"use client";

import {
  Bar,
  BarChart,
  Cell,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { DicaGrafico, MolduraGrafico } from "./grafico-base";
import { usePaleta } from "./tema-graficos";
import { moeda, moedaCurta, numero, percentual } from "@/lib/formato";
import type { LinhaCurvaAbc } from "@/types/database";

/**
 * Curva ABC: A concentra até 80% do valor de saída, B até 95%, C o restante.
 *
 * A classe é ordinal (A vale mais que B, que vale mais que C), então a cor é
 * uma rampa de um só tom — a ordem se lê na própria cor. A classe também
 * aparece escrita na tabela e no tooltip, para não depender só da cor.
 */
export function GraficoAbc({ dados }: { dados: LinhaCurvaAbc[] }) {
  const { rampa, chrome } = usePaleta();

  const CLASSE_COR: Record<string, string> = {
    A: rampa[2],
    B: rampa[1],
    C: rampa[0],
  };

  const top = dados.slice(0, 15).map((linha) => ({
    nome: linha.produto_nome.length > 22
      ? `${linha.produto_nome.slice(0, 21)}…`
      : linha.produto_nome,
    nomeCompleto: linha.produto_nome,
    valor: Number(linha.valor_saida),
    classe: linha.classe,
    participacao: Number(linha.participacao),
    acumulada: Number(linha.participacao_acumulada),
  }));

  const resumo = { A: 0, B: 0, C: 0 };
  for (const l of dados) resumo[l.classe] += 1;

  return (
    <MolduraGrafico
      legenda={[
        { rotulo: `Classe A — ${resumo.A} itens`, cor: CLASSE_COR.A },
        { rotulo: `Classe B — ${resumo.B} itens`, cor: CLASSE_COR.B },
        { rotulo: `Classe C — ${resumo.C} itens`, cor: CLASSE_COR.C },
      ]}
      colunas={["Produto", "Classe", "Valor de saída", "Participação", "Acumulado"]}
      linhas={dados.map((l) => [
        l.produto_nome,
        l.classe,
        moeda(l.valor_saida),
        percentual(l.participacao),
        percentual(l.participacao_acumulada),
      ])}
      vazio="Ainda não há saídas suficientes no período para montar a curva ABC."
    >
      <ResponsiveContainer width="100%" height={Math.max(280, top.length * 26)}>
        <BarChart
          data={top}
          layout="vertical"
          margin={{ top: 4, right: 16, bottom: 4, left: 0 }}
        >
          <CartesianGrid horizontal={false} stroke={chrome.grade} />
          <XAxis
            type="number"
            tickLine={false}
            axisLine={{ stroke: chrome.eixo }}
            tick={{ fill: chrome.tintaSuave, fontSize: 12 }}
            tickFormatter={(v: number) => moedaCurta(v)}
          />
          <YAxis
            type="category"
            dataKey="nome"
            width={150}
            tickLine={false}
            axisLine={false}
            tick={{ fill: chrome.tintaSuave, fontSize: 12 }}
          />
          <Tooltip
            cursor={{ fill: chrome.grade, opacity: 0.5 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as (typeof top)[number];
              return (
                <DicaGrafico
                  titulo={p.nomeCompleto}
                  itens={[
                    { rotulo: "Classe", valor: p.classe, cor: CLASSE_COR[p.classe] },
                    { rotulo: "Valor de saída", valor: moeda(p.valor) },
                    { rotulo: "Participação", valor: percentual(p.participacao) },
                    { rotulo: "Acumulado", valor: percentual(p.acumulada) },
                  ]}
                />
              );
            }}
          />
          <Bar dataKey="valor" radius={[0, 4, 4, 0]} maxBarSize={18}>
            {top.map((p, i) => (
              <Cell key={i} fill={CLASSE_COR[p.classe]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </MolduraGrafico>
  );
}

/** Ranking de acuracidade de inventário por filial. */
export function GraficoAcuracidade({
  dados,
}: {
  dados: {
    filial_nome: string;
    acuracidade_media: number | null;
    inventarios: number;
    divergencia_valor_total: number;
  }[];
}) {
  const { series, chrome, status } = usePaleta();

  const pontos = dados.map((d) => ({
    nome: d.filial_nome,
    acuracidade: Number(d.acuracidade_media ?? 0),
    inventarios: d.inventarios,
    divergencia: Number(d.divergencia_valor_total),
  }));

  return (
    <MolduraGrafico
      colunas={["Filial", "Acuracidade média", "Inventários", "Divergência acumulada"]}
      linhas={dados.map((d) => [
        d.filial_nome,
        percentual(d.acuracidade_media),
        String(d.inventarios),
        moeda(d.divergencia_valor_total),
      ])}
      vazio="Nenhum inventário aprovado no período — o ranking aparece depois da primeira aprovação."
    >
      <ResponsiveContainer width="100%" height={Math.max(220, pontos.length * 46)}>
        <BarChart data={pontos} layout="vertical" margin={{ top: 4, right: 40, bottom: 4, left: 0 }}>
          <CartesianGrid horizontal={false} stroke={chrome.grade} />
          <XAxis
            type="number"
            domain={[0, 100]}
            tickLine={false}
            axisLine={{ stroke: chrome.eixo }}
            tick={{ fill: chrome.tintaSuave, fontSize: 12 }}
            tickFormatter={(v: number) => `${v}%`}
          />
          <YAxis
            type="category"
            dataKey="nome"
            width={120}
            tickLine={false}
            axisLine={false}
            tick={{ fill: chrome.tintaSuave, fontSize: 12 }}
          />
          <Tooltip
            cursor={{ fill: chrome.grade, opacity: 0.5 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as (typeof pontos)[number];
              return (
                <DicaGrafico
                  titulo={p.nome}
                  itens={[
                    { rotulo: "Acuracidade média", valor: `${numero(p.acuracidade)}%` },
                    { rotulo: "Inventários aprovados", valor: String(p.inventarios) },
                    { rotulo: "Divergência acumulada", valor: moeda(p.divergencia) },
                  ]}
                />
              );
            }}
          />
          <Bar dataKey="acuracidade" radius={[0, 4, 4, 0]} maxBarSize={22}>
            {pontos.map((p, i) => (
              <Cell
                key={i}
                // Aqui a cor significa "bom / atenção / ruim", então usa a
                // escala de status — nunca a de séries.
                fill={
                  p.acuracidade >= 95
                    ? status.bom
                    : p.acuracidade >= 85
                      ? status.atencao
                      : p.acuracidade > 0
                        ? status.critico
                        : series.primaria
                }
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </MolduraGrafico>
  );
}

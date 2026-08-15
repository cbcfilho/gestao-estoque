"use client";

import { useTemaEscuro } from "@/lib/hooks";

/**
 * Paleta dos gráficos.
 *
 * As cores de série NÃO são as cores da marca de propósito: marrom e dourado
 * ficam perto demais um do outro e não passam nos testes de daltonismo. A marca
 * vive na casca do sistema (menu, botões, cabeçalhos); os gráficos usam uma
 * paleta validada para leitura.
 *
 * Validado com o verificador da skill dataviz, nos dois modos, contra as
 * superfícies reais do app (#ffffff e #2A2724):
 *   - 2 séries: ΔE mínimo 24.7 (protanopia) / 33.6 (visão normal) — passa tudo;
 *   - rampa ordinal ABC: lightness monótona, contraste da ponta clara 2.11:1.
 */

export const SERIES_CLARO = {
  primaria: "#2a78d6",
  secundaria: "#eb6834",
} as const;

export const SERIES_ESCURO = {
  primaria: "#3987e5",
  secundaria: "#d95926",
} as const;

/** Rampa ordinal (uma cor, do claro ao escuro) para a curva ABC. */
export const RAMPA_CLARO = ["#86b6ef", "#3987e5", "#1c5cab"] as const;
export const RAMPA_ESCURO = ["#b7d3f6", "#6da7ec", "#256abf"] as const;

export const CHROME_CLARO = {
  superficie: "#ffffff",
  tinta: "#22201C",
  tintaSuave: "#6B6357",
  grade: "#E8E4DD",
  eixo: "#D6D0C5",
} as const;

export const CHROME_ESCURO = {
  superficie: "#2A2724",
  tinta: "#F4F2EE",
  tintaSuave: "#B0A897",
  grade: "#3A352F",
  eixo: "#443E38",
} as const;

/** Cores de status — reservadas, nunca reaproveitadas como "série 3". */
export const STATUS = {
  bom: "#0ca30c",
  atencao: "#fab219",
  serio: "#ec835a",
  critico: "#d03b3b",
} as const;

export function usePaleta() {
  const escuro = useTemaEscuro();

  return {
    escuro,
    series: escuro ? SERIES_ESCURO : SERIES_CLARO,
    rampa: escuro ? RAMPA_ESCURO : RAMPA_CLARO,
    chrome: escuro ? CHROME_ESCURO : CHROME_CLARO,
    status: STATUS,
  };
}

"use client";

import { useState } from "react";

import type { LoteDisponivel } from "@/components/estoque/use-lotes";
import { Campo, Selecao } from "@/components/ui/campo";
import { data as formatarData, numero } from "@/lib/formato";

/** Valor reservado da lista para abrir o campo de digitação livre. */
const MANUAL = "__manual__";

/** Compara código de lote ignorando caixa e espaço nas pontas. */
function mesmoLote(a: string, b: string) {
  return a.trim().toLocaleLowerCase("pt-BR") === b.trim().toLocaleLowerCase("pt-BR");
}

export function rotuloLote(lote: LoteDisponivel) {
  const validade = lote.data_validade
    ? `vence ${formatarData(lote.data_validade)}`
    : "sem validade";
  return `${lote.lote} · ${validade} · ${numero(lote.quantidade)} disponível`;
}

/**
 * Escolha do lote numa operação que TIRA saldo (saída, ajuste negativo, origem
 * da transferência).
 *
 * São dois caminhos para o mesmo destino: a lista, que serve quando há poucos
 * lotes, e a digitação livre, que serve quando a pessoa já tem o código na mão
 * (na etiqueta, na nota) e não quer procurar. O que sai daqui é sempre o id de
 * um lote que existe naquele local — não dá para tirar saldo de um lote que não
 * está lá. Por isso o texto digitado é resolvido contra a lista, e quando não
 * bate o componente avisa em vez de cair no automático em silêncio.
 */
export function SeletorLote({
  lotes,
  carregando,
  valor,
  aoMudar,
  id = "lote",
  rotulo = "Lote",
  ajuda = "Sem escolher, o sistema baixa primeiro o lote que vence antes.",
}: {
  lotes: LoteDisponivel[];
  carregando: boolean;
  valor: string;
  aoMudar: (loteId: string, naoEncontrado: boolean) => void;
  id?: string;
  rotulo?: string;
  ajuda?: React.ReactNode;
}) {
  const [manual, setManual] = useState(false);
  const [texto, setTexto] = useState("");

  if (carregando) {
    return (
      <Selecao id={id} rotulo={rotulo} value="" disabled ajuda="Buscando os lotes deste local...">
        <option value="">Carregando...</option>
      </Selecao>
    );
  }

  if (lotes.length === 0) return null;

  function escolherNaLista(escolhido: string) {
    if (escolhido === MANUAL) {
      setManual(true);
      // Enquanto nada foi digitado não há lote inválido — só não há escolha.
      aoMudar("", false);
      return;
    }

    setManual(false);
    setTexto("");
    aoMudar(escolhido, false);
  }

  function digitar(digitado: string) {
    setTexto(digitado);

    if (!digitado.trim()) {
      aoMudar("", false);
      return;
    }

    const achado = lotes.find((l) => mesmoLote(l.lote, digitado));
    aoMudar(achado?.id ?? "", !achado);
  }

  return (
    <div className="flex flex-col gap-4">
      <Selecao
        id={id}
        rotulo={rotulo}
        value={manual ? MANUAL : valor}
        onChange={(e) => escolherNaLista(e.target.value)}
        ajuda={manual ? undefined : ajuda}
      >
        <option value="">Automático (FEFO)</option>
        {lotes.map((l) => (
          <option key={l.id} value={l.id}>
            {rotuloLote(l)}
          </option>
        ))}
        <option value={MANUAL}>Informar o lote manualmente...</option>
      </Selecao>

      {manual && (
        <>
          <Campo
            id={`${id}-manual`}
            rotulo="Código do lote"
            value={texto}
            onChange={(e) => digitar(e.target.value)}
            list={`${id}-opcoes`}
            autoFocus
            autoComplete="off"
            placeholder="Ex.: L-2405"
            erro={
              texto.trim() && !lotes.some((l) => mesmoLote(l.lote, texto))
                ? "Nenhum lote com esse código tem saldo neste local."
                : null
            }
            ajuda="Digite o código da etiqueta. Precisa ser um lote com saldo neste local."
          />
          <datalist id={`${id}-opcoes`}>
            {lotes.map((l) => (
              <option key={l.id} value={l.lote}>
                {rotuloLote(l)}
              </option>
            ))}
          </datalist>
        </>
      )}
    </div>
  );
}

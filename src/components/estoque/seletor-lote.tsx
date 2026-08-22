"use client";

import { useState } from "react";

import type { LoteDisponivel } from "@/components/estoque/use-lotes";
import { Campo, Selecao } from "@/components/ui/campo";
import { Alerta } from "@/components/ui/estados";
import { data as formatarData, numero } from "@/lib/formato";

/** Valor reservado da lista para abrir o campo de digitação livre. */
const MANUAL = "__manual__";

/** Compara código de lote ignorando caixa e espaço nas pontas. */
function mesmoLote(a: string, b: string) {
  return a.trim().toLocaleLowerCase("pt-BR") === b.trim().toLocaleLowerCase("pt-BR");
}

/**
 * Acha o lote a partir do que foi digitado.
 *
 * O mesmo código de lote pode existir com validades diferentes — `lotes_estoque`
 * é chaveado por (produto, filial, local, lote, validade), e `fn_creditar_lote`
 * casa pelos dois. Entrar 10un de "L-100" vencendo em março e 10un de "L-100"
 * vencendo em setembro cria DUAS linhas, com custos próprios. Por isso o código
 * sozinho nem sempre identifica o lote: quando ele se repete, a validade é o
 * desempate, e sem ela a única resposta honesta é pedir.
 */
export function resolverLote(
  lotes: LoteDisponivel[],
  texto: string,
  validade: string,
): { loteId: string; erro: string | null } {
  if (!texto.trim()) return { loteId: "", erro: null };

  const mesmoCodigo = lotes.filter((l) => mesmoLote(l.lote, texto));

  if (mesmoCodigo.length === 0) {
    return { loteId: "", erro: "Nenhum lote com esse código tem saldo neste local." };
  }

  const candidatos = validade
    ? mesmoCodigo.filter((l) => (l.data_validade ?? "") === validade)
    : mesmoCodigo;

  if (candidatos.length === 0) {
    const disponiveis = mesmoCodigo
      .map((l) => (l.data_validade ? formatarData(l.data_validade) : "sem validade"))
      .join(", ");
    return {
      loteId: "",
      erro: `Esse código existe aqui, mas com outra validade (${disponiveis}).`,
    };
  }

  if (candidatos.length > 1) {
    const disponiveis = candidatos
      .map((l) => (l.data_validade ? formatarData(l.data_validade) : "sem validade"))
      .join(", ");
    return {
      loteId: "",
      erro: `Há mais de um lote com esse código. Informe a validade para escolher: ${disponiveis}.`,
    };
  }

  return { loteId: candidatos[0].id, erro: null };
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
  const [validade, setValidade] = useState("");

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
    setValidade("");
    aoMudar(escolhido, false);
  }

  function digitar(digitado: string) {
    setTexto(digitado);
    const r = resolverLote(lotes, digitado, validade);
    aoMudar(r.loteId, Boolean(r.erro));
  }

  function mudarValidade(nova: string) {
    setValidade(nova);
    const r = resolverLote(lotes, texto, nova);
    aoMudar(r.loteId, Boolean(r.erro));
  }

  // Mesma funcao que os handlers usam: o que a tela mostra e o que foi enviado
  // ao formulario nao podem divergir.
  const resolucao = resolverLote(lotes, texto, validade);
  const escolhido = lotes.find((l) => l.id === resolucao.loteId) ?? null;

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
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo
              id={`${id}-manual`}
              rotulo="Código do lote"
              value={texto}
              onChange={(e) => digitar(e.target.value)}
              list={`${id}-opcoes`}
              autoFocus
              autoComplete="off"
              placeholder="Ex.: L-2405"
              ajuda="Código da etiqueta. Precisa ser um lote com saldo neste local."
            />
            <Campo
              id={`${id}-validade`}
              type="date"
              rotulo="Validade (opcional)"
              value={validade}
              onChange={(e) => mudarValidade(e.target.value)}
              ajuda="Só é necessária quando o mesmo código existe com validades diferentes."
            />
          </div>

          {resolucao.erro ? (
            <Alerta tom="erro">{resolucao.erro}</Alerta>
          ) : (
            escolhido && (
              <Alerta tom="info">
                Lote encontrado: <strong>{rotuloLote(escolhido)}</strong>
              </Alerta>
            )
          )}

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

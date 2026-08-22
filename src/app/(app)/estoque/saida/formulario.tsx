"use client";

import { ArrowUpFromLine } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { registrarSaida } from "@/actions/estoque";
import { SeletorFilialLocal } from "@/components/estoque/seletor-filial-local";
import { SeletorLote } from "@/components/estoque/seletor-lote";
import { useLotesDisponiveis } from "@/components/estoque/use-lotes";
import { BuscaProduto, type ProdutoEncontrado } from "@/components/produtos/busca-produto";
import { Botao } from "@/components/ui/botao";
import { Area, Campo, Selecao } from "@/components/ui/campo";
import { Cartao, CartaoConteudo } from "@/components/ui/cartao";
import { Alerta } from "@/components/ui/estados";
import type { FilialComLocais } from "@/lib/filiais";
import { LABEL_MOTIVO, LABEL_UNIDADE, MOTIVOS_SAIDA, numero } from "@/lib/formato";
import type { MotivoMovimentacao, TipoLocal } from "@/types/database";

export function FormularioSaida({
  filiais,
  filialInicialId,
  motivoInicial,
}: {
  filiais: FilialComLocais[];
  filialInicialId: string;
  motivoInicial: MotivoMovimentacao;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();

  const [produto, setProduto] = useState<ProdutoEncontrado | null>(null);
  const [filialId, setFilialId] = useState(filialInicialId);
  const [local, setLocal] = useState<TipoLocal>(
    (filiais.find((f) => f.id === filialInicialId)?.locais[0] ?? "deposito") as TipoLocal,
  );
  const [quantidade, setQuantidade] = useState("");
  const [motivo, setMotivo] = useState<MotivoMovimentacao>(motivoInicial);
  const [loteEscolhido, setLoteEscolhido] = useState("");
  const [loteNaoEncontrado, setLoteNaoEncontrado] = useState(false);
  const [observacao, setObservacao] = useState("");

  const {
    lotes,
    carregando: carregandoLotes,
    saldo,
    chave: chaveLotes,
  } = useLotesDisponiveis(produto?.id, filialId, local);

  // Se o lote escolhido não pertence mais à lista atual, volta ao automático.
  const loteId = lotes.some((l) => l.id === loteEscolhido) ? loteEscolhido : "";

  // Escolhido um lote, o teto passa a ser o saldo daquele lote, não o do local.
  const disponivel = loteId
    ? Number(lotes.find((l) => l.id === loteId)?.quantidade ?? 0)
    : saldo;
  const saldoInsuficiente = Number(quantidade || 0) > disponivel;

  function enviar(e: React.FormEvent) {
    e.preventDefault();

    if (!produto) {
      toast.error("Selecione o produto.");
      return;
    }

    if (loteNaoEncontrado) {
      toast.error("O lote informado não tem saldo neste local.");
      return;
    }

    iniciar(async () => {
      const resultado = await registrarSaida({
        produto_id: produto.id,
        filial_id: filialId,
        local,
        quantidade,
        motivo,
        lote_id: loteId,
        observacao,
      });

      if (!resultado.ok) {
        toast.error(resultado.erro);
        return;
      }

      toast.success(
        `Saída de ${quantidade} ${LABEL_UNIDADE[produto.unidade]} de ${produto.nome} registrada.`,
      );
      setProduto(null);
      setQuantidade("");
      setObservacao("");
      setLoteEscolhido("");
      setLoteNaoEncontrado(false);
      router.refresh();
    });
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-4">
      <Cartao>
        <CartaoConteudo className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Produto</span>
            <BuscaProduto
              aoSelecionar={setProduto}
              selecionado={produto}
              aoLimpar={() => setProduto(null)}
              autoFocus
            />
          </div>

          <SeletorFilialLocal
            filiais={filiais}
            filialId={filialId}
            local={local}
            aoMudarFilial={setFilialId}
            aoMudarLocal={setLocal}
            rotuloLocal="Local de origem"
          />

          {produto && !carregandoLotes && (
            <Alerta tom={saldo > 0 ? "info" : "alerta"}>
              Saldo disponível neste local:{" "}
              <strong className="tabular">
                {numero(saldo)} {LABEL_UNIDADE[produto.unidade]}
              </strong>
              {lotes.length > 1 && ` em ${lotes.length} lotes`}
            </Alerta>
          )}

          <Campo
            id="quantidade"
            type="number"
            inputMode="decimal"
            step="0.001"
            min="0.001"
            rotulo={`Quantidade${produto ? ` (${LABEL_UNIDADE[produto.unidade]})` : ""}`}
            value={quantidade}
            onChange={(e) => setQuantidade(e.target.value)}
            erro={saldoInsuficiente ? "Quantidade maior que o saldo disponível." : null}
            obrigatorio
          />

          <Selecao
            id="motivo"
            rotulo="Motivo da saída"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value as MotivoMovimentacao)}
          >
            {MOTIVOS_SAIDA.map((m) => (
              <option key={m} value={m}>
                {LABEL_MOTIVO[m]}
              </option>
            ))}
          </Selecao>

          {produto && (
            <SeletorLote
              key={chaveLotes}
              lotes={lotes}
              carregando={carregandoLotes}
              valor={loteId}
              aoMudar={(id, naoEncontrado) => {
                setLoteEscolhido(id);
                setLoteNaoEncontrado(naoEncontrado);
              }}
            />
          )}

          <Area
            id="observacao"
            rotulo="Observação (opcional)"
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            placeholder={
              motivo === "perda" || motivo === "quebra"
                ? "Descreva o que aconteceu — isso alimenta o relatório de perdas."
                : "Ex.: pedido do cliente João"
            }
          />
        </CartaoConteudo>
      </Cartao>

      <div className="flex justify-end">
        <Botao
          type="submit"
          carregando={pendente}
          tamanho="lg"
          disabled={saldoInsuficiente || loteNaoEncontrado}
        >
          {!pendente && <ArrowUpFromLine className="size-4" />}
          Registrar saída
        </Botao>
      </div>
    </form>
  );
}

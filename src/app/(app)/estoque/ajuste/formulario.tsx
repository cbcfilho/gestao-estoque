"use client";

import { Minus, Plus, SlidersHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { ajustarEstoque } from "@/actions/estoque";
import { SeletorFilialLocal } from "@/components/estoque/seletor-filial-local";
import { useLotesDisponiveis } from "@/components/estoque/use-lotes";
import { BuscaProduto, type ProdutoEncontrado } from "@/components/produtos/busca-produto";
import { Botao } from "@/components/ui/botao";
import { Area, Campo, Selecao } from "@/components/ui/campo";
import { Cartao, CartaoConteudo } from "@/components/ui/cartao";
import { Alerta } from "@/components/ui/estados";
import type { FilialComLocais } from "@/lib/filiais";
import { LABEL_UNIDADE, data as formatarData, numero } from "@/lib/formato";
import { cn } from "@/lib/utils";
import type { TipoLocal } from "@/types/database";

export function FormularioAjuste({
  filiais,
  filialInicialId,
}: {
  filiais: FilialComLocais[];
  filialInicialId: string;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();

  const [produto, setProduto] = useState<ProdutoEncontrado | null>(null);
  const [filialId, setFilialId] = useState(filialInicialId);
  const [local, setLocal] = useState<TipoLocal>(
    (filiais.find((f) => f.id === filialInicialId)?.locais[0] ?? "deposito") as TipoLocal,
  );
  const [sentido, setSentido] = useState<"positivo" | "negativo">("negativo");
  const [quantidade, setQuantidade] = useState("");
  const [observacao, setObservacao] = useState("");
  const [lote, setLote] = useState("");
  const [validade, setValidade] = useState("");
  const [loteEscolhido, setLoteEscolhido] = useState("");

  const { lotes, saldo } = useLotesDisponiveis(produto?.id, filialId, local);

  // Se o lote escolhido saiu da lista atual, volta ao automático (FEFO).
  const loteId = lotes.some((l) => l.id === loteEscolhido) ? loteEscolhido : "";

  function enviar(e: React.FormEvent) {
    e.preventDefault();

    if (!produto) {
      toast.error("Selecione o produto.");
      return;
    }

    const valor = Number(quantidade);
    if (!valor || valor <= 0) {
      toast.error("Informe a quantidade a ajustar.");
      return;
    }

    iniciar(async () => {
      const resultado = await ajustarEstoque({
        produto_id: produto.id,
        filial_id: filialId,
        local,
        quantidade: sentido === "positivo" ? valor : -valor,
        observacao,
        lote,
        data_validade: validade,
        lote_id: loteId,
      });

      if (!resultado.ok) {
        toast.error(resultado.erro);
        return;
      }

      toast.success("Ajuste registrado no histórico e na auditoria.");
      setProduto(null);
      setQuantidade("");
      setObservacao("");
      setLote("");
      setValidade("");
      setLoteEscolhido("");
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
          />

          {produto && (
            <Alerta tom="info">
              Saldo atual neste local:{" "}
              <strong className="tabular">
                {numero(saldo)} {LABEL_UNIDADE[produto.unidade]}
              </strong>
            </Alerta>
          )}

          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1.5 text-sm font-medium">Sentido do ajuste</legend>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  { valor: "negativo", rotulo: "Reduzir saldo", icone: Minus },
                  { valor: "positivo", rotulo: "Aumentar saldo", icone: Plus },
                ] as const
              ).map((opcao) => {
                const Icone = opcao.icone;
                const ativo = sentido === opcao.valor;
                return (
                  <button
                    key={opcao.valor}
                    type="button"
                    onClick={() => setSentido(opcao.valor)}
                    aria-pressed={ativo}
                    className={cn(
                      "flex items-center justify-center gap-2 rounded-lg border px-3 py-3 font-medium transition-colors",
                      ativo
                        ? opcao.valor === "negativo"
                          ? "border-red-600 bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-200"
                          : "border-emerald-600 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
                        : "border-[var(--borda)] hover:bg-areia-100 dark:hover:bg-areia-800",
                    )}
                  >
                    <Icone className="size-4" />
                    {opcao.rotulo}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <Campo
            id="quantidade"
            type="number"
            inputMode="decimal"
            step="0.001"
            min="0.001"
            rotulo={`Quantidade a ${sentido === "positivo" ? "acrescentar" : "reduzir"}${produto ? ` (${LABEL_UNIDADE[produto.unidade]})` : ""}`}
            value={quantidade}
            onChange={(e) => setQuantidade(e.target.value)}
            obrigatorio
          />

          {sentido === "positivo" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo
                id="lote"
                rotulo="Lote"
                value={lote}
                onChange={(e) => setLote(e.target.value)}
                ajuda="Vazio agrupa no lote único."
              />
              <Campo
                id="validade"
                type="date"
                rotulo="Validade"
                value={validade}
                onChange={(e) => setValidade(e.target.value)}
              />
            </div>
          ) : (
            lotes.length > 1 && (
              <Selecao
                id="loteId"
                rotulo="Lote a reduzir"
                value={loteId}
                onChange={(e) => setLoteEscolhido(e.target.value)}
                ajuda="Sem escolher, reduz primeiro o lote que vence antes."
              >
                <option value="">Automático (FEFO)</option>
                {lotes.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.lote}
                    {l.data_validade ? ` · vence ${formatarData(l.data_validade)}` : ""}
                    {` · ${numero(l.quantidade)} disponível`}
                  </option>
                ))}
              </Selecao>
            )
          )}

          <Area
            id="observacao"
            rotulo="Justificativa"
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            placeholder="Ex.: correção de digitação na entrada da NF 12345"
            obrigatorio
            ajuda="Fica registrada no log de auditoria junto com o seu nome."
          />
        </CartaoConteudo>
      </Cartao>

      <div className="flex justify-end">
        <Botao type="submit" carregando={pendente} tamanho="lg" variante="secundario">
          {!pendente && <SlidersHorizontal className="size-4" />}
          Registrar ajuste
        </Botao>
      </div>
    </form>
  );
}

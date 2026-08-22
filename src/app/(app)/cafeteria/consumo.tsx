"use client";

import { ArrowLeftRight, Coffee } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { registrarSaida } from "@/actions/estoque";
import { SeletorLote } from "@/components/estoque/seletor-lote";
import { useLotesDisponiveis } from "@/components/estoque/use-lotes";
import { BuscaProduto, type ProdutoEncontrado } from "@/components/produtos/busca-produto";
import { Botao } from "@/components/ui/botao";
import { Area, Campo } from "@/components/ui/campo";
import { Cartao, CartaoCabecalho, CartaoConteudo } from "@/components/ui/cartao";
import { LABEL_UNIDADE, numero } from "@/lib/formato";

export function ConsumoCafeteria({
  filialId,
  filialNome,
}: {
  filialId: string;
  filialNome: string;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [produto, setProduto] = useState<ProdutoEncontrado | null>(null);
  const [quantidade, setQuantidade] = useState("");
  const [observacao, setObservacao] = useState("");
  const [loteEscolhido, setLoteEscolhido] = useState("");
  const [loteNaoEncontrado, setLoteNaoEncontrado] = useState(false);

  // O insumo sai sempre do estoque da própria cafeteria.
  const {
    lotes,
    carregando: carregandoLotes,
    saldo,
    chave: chaveLotes,
  } = useLotesDisponiveis(produto?.id, filialId, "cafeteria");

  // Se o lote escolhido saiu da lista atual, volta ao automático (FEFO).
  const loteId = lotes.some((l) => l.id === loteEscolhido) ? loteEscolhido : "";

  // Escolhido um lote, o teto passa a ser o saldo dele, não o da cafeteria.
  const disponivel = loteId
    ? Number(lotes.find((l) => l.id === loteId)?.quantidade ?? 0)
    : saldo;
  const saldoInsuficiente = Number(quantidade || 0) > disponivel;

  function registrar(e: React.FormEvent) {
    e.preventDefault();

    if (!produto) {
      toast.error("Selecione o insumo.");
      return;
    }

    if (loteNaoEncontrado) {
      toast.error("O lote informado não tem saldo na cafeteria.");
      return;
    }

    iniciar(async () => {
      const r = await registrarSaida({
        produto_id: produto.id,
        filial_id: filialId,
        local: "cafeteria",
        quantidade,
        motivo: "consumo_interno",
        lote_id: loteId,
        observacao,
      });

      if (!r.ok) {
        toast.error(r.erro);
        return;
      }

      toast.success(
        `Consumo de ${quantidade} ${LABEL_UNIDADE[produto.unidade]} de ${produto.nome} registrado.`,
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
    <Cartao>
      <CartaoCabecalho
        titulo="Registrar consumo"
        descricao={`Baixa direta do estoque da cafeteria de ${filialNome}.`}
        acao={
          <Link
            href="/transferencias/nova"
            className="flex items-center gap-1.5 text-sm font-medium text-cacau-700 hover:underline dark:text-cacau-300"
          >
            <ArrowLeftRight className="size-3.5" />
            Pedir do depósito
          </Link>
        }
      />
      <CartaoConteudo>
        <form onSubmit={registrar} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Insumo</span>
            <BuscaProduto
              aoSelecionar={setProduto}
              selecionado={produto}
              aoLimpar={() => setProduto(null)}
              placeholder="Buscar insumo (leite, café, copos…)"
              filtrarInsumosCafeteria
            />
          </div>

          <Campo
            id="quantidade"
            type="number"
            inputMode="decimal"
            step="0.001"
            min="0.001"
            rotulo={`Quantidade consumida${produto ? ` (${LABEL_UNIDADE[produto.unidade]})` : ""}`}
            value={quantidade}
            onChange={(e) => setQuantidade(e.target.value)}
            erro={
              saldoInsuficiente
                ? `Quantidade maior que o disponível (${numero(disponivel)}).`
                : null
            }
            obrigatorio
          />

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
              ajuda="Sem escolher, consome primeiro o lote que vence antes."
            />
          )}

          <Area
            id="observacao"
            rotulo="Observação (opcional)"
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            rows={2}
            placeholder="Ex.: perda por leite azedo"
          />

          <Botao
            type="submit"
            carregando={pendente}
            disabled={!produto || saldoInsuficiente || loteNaoEncontrado}
            tamanho="lg"
          >
            {!pendente && <Coffee className="size-4" />}
            Registrar consumo
          </Botao>
        </form>
      </CartaoConteudo>
    </Cartao>
  );
}

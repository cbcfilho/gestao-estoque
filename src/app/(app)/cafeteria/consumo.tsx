"use client";

import { ArrowLeftRight, Coffee } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { registrarSaida } from "@/actions/estoque";
import { BuscaProduto, type ProdutoEncontrado } from "@/components/produtos/busca-produto";
import { Botao } from "@/components/ui/botao";
import { Area, Campo } from "@/components/ui/campo";
import { Cartao, CartaoCabecalho, CartaoConteudo } from "@/components/ui/cartao";
import { LABEL_UNIDADE } from "@/lib/formato";

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

  function registrar(e: React.FormEvent) {
    e.preventDefault();

    if (!produto) {
      toast.error("Selecione o insumo.");
      return;
    }

    iniciar(async () => {
      const r = await registrarSaida({
        produto_id: produto.id,
        filial_id: filialId,
        local: "cafeteria",
        quantidade,
        motivo: "consumo_interno",
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
            obrigatorio
          />

          <Area
            id="observacao"
            rotulo="Observação (opcional)"
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            rows={2}
            placeholder="Ex.: perda por leite azedo"
          />

          <Botao type="submit" carregando={pendente} disabled={!produto} tamanho="lg">
            {!pendente && <Coffee className="size-4" />}
            Registrar consumo
          </Botao>
        </form>
      </CartaoConteudo>
    </Cartao>
  );
}

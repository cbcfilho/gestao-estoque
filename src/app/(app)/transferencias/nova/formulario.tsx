"use client";

import { ArrowRight, Plus, Send, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { criarTransferencia } from "@/actions/transferencias";
import { SeletorFilialLocal } from "@/components/estoque/seletor-filial-local";
import { SeletorLote } from "@/components/estoque/seletor-lote";
import { useLotesDisponiveis } from "@/components/estoque/use-lotes";
import { BuscaProduto, type ProdutoEncontrado } from "@/components/produtos/busca-produto";
import { Botao } from "@/components/ui/botao";
import { Area, Campo, Checkbox } from "@/components/ui/campo";
import { Cartao, CartaoCabecalho, CartaoConteudo } from "@/components/ui/cartao";
import { Alerta } from "@/components/ui/estados";
import { Tabela, TabelaContainer, Td, Th, Tr } from "@/components/ui/tabela";
import type { FilialComLocais } from "@/lib/filiais";
import { LABEL_LOCAL, LABEL_UNIDADE, data as formatarData, numero } from "@/lib/formato";
import type { TipoLocal } from "@/types/database";

interface ItemTransferencia {
  chave: string;
  produto: ProdutoEncontrado;
  quantidade: number;
  loteId: string;
  loteRotulo: string;
}

export function FormularioTransferencia({
  filiais,
  filialInicialId,
  podeEnviar,
  podeReceber,
  exigeAprovacao,
  podeAprovar,
}: {
  filiais: FilialComLocais[];
  filialInicialId: string;
  podeEnviar: boolean;
  podeReceber: boolean;
  exigeAprovacao: { entre_filiais: boolean; entre_locais: boolean };
  podeAprovar: boolean;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();

  const inicial = filiais.find((f) => f.id === filialInicialId);

  const [filialOrigem, setFilialOrigem] = useState(filialInicialId);
  const [localOrigem, setLocalOrigem] = useState<TipoLocal>(
    (inicial?.locais[0] ?? "deposito") as TipoLocal,
  );
  const [filialDestino, setFilialDestino] = useState(filialInicialId);
  const [localDestino, setLocalDestino] = useState<TipoLocal>(
    (inicial?.locais[1] ?? inicial?.locais[0] ?? "prateleira") as TipoLocal,
  );

  const [observacao, setObservacao] = useState("");
  const [itens, setItens] = useState<ItemTransferencia[]>([]);
  const [direta, setDireta] = useState(true);

  // Item em edição
  const [produto, setProduto] = useState<ProdutoEncontrado | null>(null);
  const [quantidade, setQuantidade] = useState("");
  const [loteEscolhido, setLoteEscolhido] = useState("");
  const [loteNaoEncontrado, setLoteNaoEncontrado] = useState(false);

  const {
    lotes,
    carregando: carregandoLotes,
    saldo: saldoProduto,
    chave: chaveLotes,
  } = useLotesDisponiveis(produto?.id, filialOrigem, localOrigem);

  // Se o lote escolhido saiu da lista atual, volta ao automático (FEFO).
  const loteId = lotes.some((l) => l.id === loteEscolhido) ? loteEscolhido : "";

  const mesmaFilial = filialOrigem === filialDestino;
  const mesmoLocal = mesmaFilial && localOrigem === localDestino;

  const precisaAprovacao = mesmaFilial
    ? exigeAprovacao.entre_locais
    : exigeAprovacao.entre_filiais;

  function adicionarItem() {
    if (!produto) {
      toast.error("Selecione o produto.");
      return;
    }

    const qtd = Number(quantidade);
    if (!qtd || qtd <= 0) {
      toast.error("Informe a quantidade.");
      return;
    }

    if (loteNaoEncontrado) {
      toast.error("O lote informado não tem saldo neste local.");
      return;
    }

    const jaAdicionado = itens
      .filter((i) => i.produto.id === produto.id && i.loteId === loteId)
      .reduce((t, i) => t + i.quantidade, 0);

    const disponivel = loteId
      ? Number(lotes.find((l) => l.id === loteId)?.quantidade ?? 0)
      : saldoProduto;

    if (jaAdicionado + qtd > disponivel) {
      toast.error(
        `Saldo insuficiente: disponível ${numero(disponivel)}, já na lista ${numero(jaAdicionado)}.`,
      );
      return;
    }

    const lote = lotes.find((l) => l.id === loteId);

    setItens((atual) => [
      ...atual,
      {
        chave: crypto.randomUUID(),
        produto,
        quantidade: qtd,
        loteId,
        loteRotulo: lote
          ? `${lote.lote}${lote.data_validade ? ` · ${formatarData(lote.data_validade)}` : ""}`
          : "Automático (FEFO)",
      },
    ]);

    setProduto(null);
    setQuantidade("");
    setLoteEscolhido("");
    setLoteNaoEncontrado(false);
  }

  function enviar() {
    if (itens.length === 0) {
      toast.error("Adicione ao menos um item.");
      return;
    }
    if (mesmoLocal) {
      toast.error("Origem e destino não podem ser o mesmo local da mesma filial.");
      return;
    }

    iniciar(async () => {
      const r = await criarTransferencia({
        filial_origem_id: filialOrigem,
        local_origem: localOrigem,
        filial_destino_id: filialDestino,
        local_destino: localDestino,
        observacao,
        itens: itens.map((i) => ({
          produto_id: i.produto.id,
          quantidade: i.quantidade,
          lote_id: i.loteId,
        })),
        direta: mesmaFilial && direta && podeEnviar && podeReceber,
      });

      if (!r.ok) {
        toast.error(r.erro);
        return;
      }

      toast.success(r.mensagem);
      router.push(`/transferencias/${r.dados}`);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <Cartao>
        <CartaoCabecalho titulo="Origem" />
        <CartaoConteudo>
          <SeletorFilialLocal
            filiais={filiais}
            filialId={filialOrigem}
            local={localOrigem}
            aoMudarFilial={setFilialOrigem}
            aoMudarLocal={setLocalOrigem}
            rotuloFilial="Filial de origem"
            rotuloLocal="Local de origem"
          />
        </CartaoConteudo>
      </Cartao>

      <div className="flex justify-center">
        <span className="grid size-9 place-items-center rounded-full bg-cacau-100 text-cacau-700 dark:bg-cacau-900/40 dark:text-cacau-300">
          <ArrowRight className="size-4 rotate-90" />
        </span>
      </div>

      <Cartao>
        <CartaoCabecalho titulo="Destino" />
        <CartaoConteudo className="flex flex-col gap-4">
          <SeletorFilialLocal
            filiais={filiais}
            filialId={filialDestino}
            local={localDestino}
            aoMudarFilial={setFilialDestino}
            aoMudarLocal={setLocalDestino}
            rotuloFilial="Filial de destino"
            rotuloLocal="Local de destino"
          />

          {mesmoLocal && (
            <Alerta tom="erro">
              Origem e destino são o mesmo local. Escolha um local diferente.
            </Alerta>
          )}

          {mesmaFilial && !mesmoLocal && podeEnviar && podeReceber && (
            <Checkbox
              id="direta"
              rotulo="Concluir agora (envio e recebimento juntos)"
              ajuda="Para movimentação interna, como levar do depósito para a prateleira, não faz sentido esperar confirmação."
              checked={direta}
              onChange={(e) => setDireta(e.target.checked)}
            />
          )}

          {precisaAprovacao && !podeAprovar && (
            <Alerta tom="alerta" titulo="Esta transferência precisa de aprovação">
              A configuração do sistema exige que um gestor aprove antes do envio. Você pode
              solicitar; o envio ficará com quem tem a permissão de aprovar.
            </Alerta>
          )}
        </CartaoConteudo>
      </Cartao>

      <Cartao>
        <CartaoCabecalho titulo="Itens" descricao="Adicione produto por produto." />
        <CartaoConteudo className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Produto</span>
            <BuscaProduto
              aoSelecionar={setProduto}
              selecionado={produto}
              aoLimpar={() => setProduto(null)}
            />
          </div>

          {produto && (
            <Alerta tom={saldoProduto > 0 ? "info" : "alerta"}>
              Saldo em {LABEL_LOCAL[localOrigem]}:{" "}
              <strong className="tabular">
                {numero(saldoProduto)} {LABEL_UNIDADE[produto.unidade]}
              </strong>
            </Alerta>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Campo
              id="quantidade"
              type="number"
              inputMode="decimal"
              step="0.001"
              min="0.001"
              rotulo="Quantidade"
              value={quantidade}
              onChange={(e) => setQuantidade(e.target.value)}
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
                ajuda="O lote escolhido é o mesmo que entra no destino."
              />
            )}
          </div>

          <Botao
            type="button"
            variante="contorno"
            onClick={adicionarItem}
            disabled={!produto || loteNaoEncontrado}
          >
            <Plus className="size-4" />
            Adicionar à transferência
          </Botao>
        </CartaoConteudo>

        {itens.length > 0 && (
          <TabelaContainer>
            <Tabela>
              <thead>
                <tr>
                  <Th>Produto</Th>
                  <Th>Lote</Th>
                  <Th alinhar="direita">Quantidade</Th>
                  <Th alinhar="direita">Remover</Th>
                </tr>
              </thead>
              <tbody>
                {itens.map((item) => (
                  <Tr key={item.chave}>
                    <Td className="font-medium">{item.produto.nome}</Td>
                    <Td className="text-sm">{item.loteRotulo}</Td>
                    <Td alinhar="direita">
                      {numero(item.quantidade)} {LABEL_UNIDADE[item.produto.unidade]}
                    </Td>
                    <Td alinhar="direita">
                      <Botao
                        variante="fantasma"
                        tamanho="sm"
                        onClick={() =>
                          setItens((atual) => atual.filter((i) => i.chave !== item.chave))
                        }
                        aria-label={`Remover ${item.produto.nome}`}
                      >
                        <Trash2 className="size-4" />
                      </Botao>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Tabela>
          </TabelaContainer>
        )}
      </Cartao>

      <Cartao>
        <CartaoConteudo>
          <Area
            id="observacao"
            rotulo="Observação (opcional)"
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            placeholder="Ex.: reposição para o fim de semana"
          />
        </CartaoConteudo>
      </Cartao>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Botao type="button" variante="contorno" onClick={() => router.back()} disabled={pendente}>
          Cancelar
        </Botao>
        <Botao
          type="button"
          onClick={enviar}
          carregando={pendente}
          tamanho="lg"
          disabled={itens.length === 0 || mesmoLocal}
        >
          {!pendente && <Send className="size-4" />}
          {mesmaFilial && direta && podeEnviar && podeReceber
            ? "Concluir transferência"
            : "Solicitar transferência"}
        </Botao>
      </div>
    </div>
  );
}

"use client";

import { PackageCheck, Send, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  cancelarTransferencia,
  enviarTransferencia,
  receberTransferencia,
} from "@/actions/transferencias";
import { Botao } from "@/components/ui/botao";
import { Area, Campo } from "@/components/ui/campo";
import { Cartao, CartaoCabecalho, CartaoConteudo } from "@/components/ui/cartao";
import { Alerta } from "@/components/ui/estados";
import { Modal } from "@/components/ui/modal";
import { LABEL_UNIDADE, numero } from "@/lib/formato";
import type { StatusTransferencia, UnidadeMedida } from "@/types/database";

interface ItemAcao {
  id: string;
  nome: string;
  unidade: UnidadeMedida;
  solicitada: number;
  enviada: number | null;
}

export function AcoesTransferencia({
  transferencia,
  itens,
  naOrigem,
  noDestino,
  podeEnviar,
  podeReceber,
  podeCancelar,
}: {
  transferencia: { id: string; codigo: string; status: StatusTransferencia };
  itens: ItemAcao[];
  naOrigem: boolean;
  noDestino: boolean;
  podeEnviar: boolean;
  podeReceber: boolean;
  podeCancelar: boolean;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [modalEnvio, setModalEnvio] = useState(false);
  const [modalRecebimento, setModalRecebimento] = useState(false);
  const [modalCancelamento, setModalCancelamento] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [observacao, setObservacao] = useState("");

  const [quantidades, setQuantidades] = useState<Record<string, string>>(() =>
    Object.fromEntries(itens.map((i) => [i.id, String(i.enviada ?? i.solicitada)])),
  );

  const mostraEnvio = transferencia.status === "solicitada" && naOrigem && podeEnviar;
  const mostraRecebimento = transferencia.status === "em_transito" && noDestino && podeReceber;
  const mostraCancelamento =
    ["solicitada", "em_transito"].includes(transferencia.status) && naOrigem && podeCancelar;

  if (!mostraEnvio && !mostraRecebimento && !mostraCancelamento) {
    if (transferencia.status === "em_transito" && !noDestino) {
      return (
        <Alerta tom="info">
          Aguardando confirmação de recebimento pela filial de destino.
        </Alerta>
      );
    }
    return null;
  }

  function confirmar(acao: "enviar" | "receber") {
    iniciar(async () => {
      const lista = itens.map((i) => ({
        item_id: i.id,
        quantidade: Number(quantidades[i.id] ?? 0),
      }));

      const r =
        acao === "enviar"
          ? await enviarTransferencia(transferencia.id, lista)
          : await receberTransferencia(transferencia.id, lista, observacao);

      if (!r.ok) {
        toast.error(r.erro);
        return;
      }

      toast.success(r.mensagem);
      setModalEnvio(false);
      setModalRecebimento(false);
      router.refresh();
    });
  }

  return (
    <>
      <Cartao>
        <CartaoCabecalho
          titulo="Próximo passo"
          descricao={
            mostraEnvio
              ? "Confirme o que realmente vai sair da origem."
              : mostraRecebimento
                ? "Confira a mercadoria recebida antes de confirmar — a diferença vira perda em trânsito."
                : "Ações disponíveis para esta transferência."
          }
        />
        <CartaoConteudo className="flex flex-wrap gap-2">
          {mostraEnvio && (
            <Botao onClick={() => setModalEnvio(true)}>
              <Send className="size-4" />
              Confirmar envio
            </Botao>
          )}
          {mostraRecebimento && (
            <Botao variante="sucesso" onClick={() => setModalRecebimento(true)}>
              <PackageCheck className="size-4" />
              Confirmar recebimento
            </Botao>
          )}
          {mostraCancelamento && (
            <Botao variante="contorno" onClick={() => setModalCancelamento(true)}>
              <XCircle className="size-4" />
              Cancelar
            </Botao>
          )}
        </CartaoConteudo>
      </Cartao>

      <Modal
        aberto={modalEnvio}
        aoFechar={() => setModalEnvio(false)}
        titulo="Confirmar envio"
        descricao="Ajuste a quantidade se algum item for enviado parcialmente. O saldo sai da origem agora."
        rodape={
          <>
            <Botao variante="contorno" onClick={() => setModalEnvio(false)} disabled={pendente}>
              Voltar
            </Botao>
            <Botao onClick={() => confirmar("enviar")} carregando={pendente}>
              Confirmar envio
            </Botao>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {itens.map((item) => (
            <Campo
              key={item.id}
              id={`envio-${item.id}`}
              type="number"
              inputMode="decimal"
              step="0.001"
              min="0"
              max={item.solicitada}
              rotulo={item.nome}
              ajuda={`Solicitado: ${numero(item.solicitada)} ${LABEL_UNIDADE[item.unidade]}`}
              value={quantidades[item.id] ?? ""}
              onChange={(e) =>
                setQuantidades((atual) => ({ ...atual, [item.id]: e.target.value }))
              }
            />
          ))}
        </div>
      </Modal>

      <Modal
        aberto={modalRecebimento}
        aoFechar={() => setModalRecebimento(false)}
        titulo="Confirmar recebimento"
        descricao="Informe o que chegou de fato. Diferença para menos é registrada como perda em trânsito."
        rodape={
          <>
            <Botao
              variante="contorno"
              onClick={() => setModalRecebimento(false)}
              disabled={pendente}
            >
              Voltar
            </Botao>
            <Botao variante="sucesso" onClick={() => confirmar("receber")} carregando={pendente}>
              Confirmar recebimento
            </Botao>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {itens.map((item) => (
            <Campo
              key={item.id}
              id={`receb-${item.id}`}
              type="number"
              inputMode="decimal"
              step="0.001"
              min="0"
              max={item.enviada ?? item.solicitada}
              rotulo={item.nome}
              ajuda={`Enviado: ${numero(item.enviada ?? item.solicitada)} ${LABEL_UNIDADE[item.unidade]}`}
              value={quantidades[item.id] ?? ""}
              onChange={(e) =>
                setQuantidades((atual) => ({ ...atual, [item.id]: e.target.value }))
              }
            />
          ))}

          <Area
            id="obs-recebimento"
            rotulo="Observação (opcional)"
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            placeholder="Ex.: 2 caixas chegaram amassadas"
          />
        </div>
      </Modal>

      <Modal
        aberto={modalCancelamento}
        aoFechar={() => setModalCancelamento(false)}
        titulo={`Cancelar ${transferencia.codigo}`}
        descricao={
          transferencia.status === "em_transito"
            ? "O saldo já enviado volta para a filial de origem."
            : "A solicitação será encerrada sem movimentar estoque."
        }
        tamanho="sm"
        rodape={
          <>
            <Botao
              variante="contorno"
              onClick={() => setModalCancelamento(false)}
              disabled={pendente}
            >
              Voltar
            </Botao>
            <Botao
              variante="perigo"
              carregando={pendente}
              onClick={() =>
                iniciar(async () => {
                  const r = await cancelarTransferencia(transferencia.id, motivo);
                  if (!r.ok) {
                    toast.error(r.erro);
                    return;
                  }
                  toast.success(r.mensagem);
                  setModalCancelamento(false);
                  router.refresh();
                })
              }
            >
              Cancelar transferência
            </Botao>
          </>
        }
      >
        <Area
          id="motivo"
          rotulo="Motivo do cancelamento"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          obrigatorio
          autoFocus
        />
      </Modal>
    </>
  );
}

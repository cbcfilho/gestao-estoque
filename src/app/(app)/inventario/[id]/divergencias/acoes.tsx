"use client";

import { CheckCircle2, RotateCcw, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { aprovarInventario, cancelarInventario, reabrirContagem } from "@/actions/inventario";
import { Botao } from "@/components/ui/botao";
import { Area } from "@/components/ui/campo";
import { Cartao, CartaoCabecalho, CartaoConteudo } from "@/components/ui/cartao";
import { Alerta } from "@/components/ui/estados";
import { Modal } from "@/components/ui/modal";
import { moeda } from "@/lib/formato";

export function AcoesInventario({
  inventarioId,
  codigo,
  divergentes,
  impacto,
  podeAprovar,
  podeReabrir,
  podeCancelar,
}: {
  inventarioId: string;
  codigo: string;
  divergentes: number;
  impacto: number;
  podeAprovar: boolean;
  podeReabrir: boolean;
  podeCancelar: boolean;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [modalAprovar, setModalAprovar] = useState(false);
  const [modalCancelar, setModalCancelar] = useState(false);
  const [observacao, setObservacao] = useState("");
  const [motivo, setMotivo] = useState("");

  if (!podeAprovar && !podeReabrir && !podeCancelar) {
    return (
      <Alerta tom="info">
        Este inventário aguarda a aprovação de um gestor para que os ajustes sejam aplicados ao
        estoque.
      </Alerta>
    );
  }

  return (
    <>
      <Cartao className="border-amber-300 dark:border-amber-900">
        <CartaoCabecalho
          titulo="Aguardando aprovação"
          descricao="Ao aprovar, o sistema aplica a diferença apurada ao saldo e registra tudo no histórico."
        />
        <CartaoConteudo className="flex flex-wrap gap-2">
          {podeAprovar && (
            <Botao variante="sucesso" onClick={() => setModalAprovar(true)}>
              <CheckCircle2 className="size-4" />
              Aprovar e ajustar estoque
            </Botao>
          )}
          {podeReabrir && (
            <Botao
              variante="contorno"
              carregando={pendente}
              onClick={() =>
                iniciar(async () => {
                  const r = await reabrirContagem(inventarioId);
                  if (!r.ok) {
                    toast.error(r.erro);
                    return;
                  }
                  toast.success(r.mensagem);
                  router.push(`/inventario/${inventarioId}`);
                  router.refresh();
                })
              }
            >
              <RotateCcw className="size-4" />
              Reabrir contagem
            </Botao>
          )}
          {podeCancelar && (
            <Botao variante="contorno" onClick={() => setModalCancelar(true)}>
              <XCircle className="size-4" />
              Cancelar inventário
            </Botao>
          )}
        </CartaoConteudo>
      </Cartao>

      <Modal
        aberto={modalAprovar}
        aoFechar={() => setModalAprovar(false)}
        titulo={`Aprovar ${codigo}`}
        descricao="Esta ação altera o saldo de estoque e não pode ser desfeita."
        tamanho="sm"
        rodape={
          <>
            <Botao variante="contorno" onClick={() => setModalAprovar(false)} disabled={pendente}>
              Voltar
            </Botao>
            <Botao
              variante="sucesso"
              carregando={pendente}
              onClick={() =>
                iniciar(async () => {
                  const r = await aprovarInventario(inventarioId, observacao);
                  if (!r.ok) {
                    toast.error(r.erro);
                    return;
                  }
                  toast.success(r.mensagem);
                  setModalAprovar(false);
                  router.refresh();
                })
              }
            >
              Aprovar e ajustar
            </Botao>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Alerta tom={impacto < 0 ? "alerta" : "info"}>
            <strong>{divergentes}</strong> itens serão ajustados, com impacto de{" "}
            <strong>{moeda(impacto)}</strong> no valor do estoque.
          </Alerta>

          <p className="text-sm texto-suave">
            O ajuste aplicado é a <strong>diferença apurada</strong>, não o valor absoluto contado.
            Movimentações lançadas entre a contagem e a aprovação continuam valendo.
          </p>

          <Area
            id="observacao"
            rotulo="Observação (opcional)"
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            placeholder="Ex.: divergências concentradas na linha de Páscoa"
          />
        </div>
      </Modal>

      <Modal
        aberto={modalCancelar}
        aoFechar={() => setModalCancelar(false)}
        titulo={`Cancelar ${codigo}`}
        descricao="A contagem é descartada e nenhum ajuste é aplicado ao estoque."
        tamanho="sm"
        rodape={
          <>
            <Botao variante="contorno" onClick={() => setModalCancelar(false)} disabled={pendente}>
              Voltar
            </Botao>
            <Botao
              variante="perigo"
              carregando={pendente}
              onClick={() =>
                iniciar(async () => {
                  const r = await cancelarInventario(inventarioId, motivo);
                  if (!r.ok) {
                    toast.error(r.erro);
                    return;
                  }
                  toast.success(r.mensagem);
                  router.push("/inventario");
                  router.refresh();
                })
              }
            >
              Cancelar inventário
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

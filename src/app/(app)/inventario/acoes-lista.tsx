"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { excluirInventario } from "@/actions/inventario";
import { Botao } from "@/components/ui/botao";
import { Alerta } from "@/components/ui/estados";
import { Modal } from "@/components/ui/modal";
import type { StatusInventario } from "@/types/database";

/**
 * Exclusão de um inventário na listagem.
 *
 * Só aparece para quem tem `inventario.excluir` e para inventários que ainda
 * não foram aprovados — os aprovados geraram ajustes de estoque e precisam
 * continuar rastreáveis. O banco recusa de qualquer forma; esconder o botão
 * evita oferecer uma ação que sempre falharia.
 */
export function ExcluirInventario({
  inventarioId,
  codigo,
  status,
  itens,
}: {
  inventarioId: string;
  codigo: string;
  status: StatusInventario;
  itens: number;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [pendente, iniciar] = useTransition();

  if (status === "aprovado") return null;

  return (
    <>
      <Botao
        variante="fantasma"
        tamanho="sm"
        onClick={() => setAberto(true)}
        title={`Excluir ${codigo}`}
        aria-label={`Excluir inventário ${codigo}`}
      >
        <Trash2 className="size-4" />
      </Botao>

      <Modal
        aberto={aberto}
        aoFechar={() => setAberto(false)}
        titulo={`Excluir ${codigo}`}
        descricao="A contagem é apagada e não há como recuperar."
        tamanho="sm"
        rodape={
          <>
            <Botao variante="contorno" onClick={() => setAberto(false)} disabled={pendente}>
              Voltar
            </Botao>
            <Botao
              variante="perigo"
              carregando={pendente}
              onClick={() =>
                iniciar(async () => {
                  const r = await excluirInventario(inventarioId);
                  if (!r.ok) {
                    toast.error(r.erro);
                    return;
                  }
                  toast.success(r.mensagem);
                  setAberto(false);
                  router.refresh();
                })
              }
            >
              Excluir definitivamente
            </Botao>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <p className="text-sm">
            {itens > 0
              ? `Este inventário tem ${itens} itens, com as contagens já lançadas.`
              : "Este inventário ainda não tem itens contados."}
          </p>

          <Alerta tom="info">
            Nenhum saldo de estoque é alterado: este inventário não chegou a ser aprovado.
            A exclusão fica registrada no log de auditoria.
          </Alerta>

          {status !== "cancelado" && (
            <Alerta tom="alerta">
              Se a ideia é apenas encerrar sem aplicar as diferenças, prefira{" "}
              <strong>cancelar</strong> — assim o histórico da tentativa fica preservado.
            </Alerta>
          )}
        </div>
      </Modal>
    </>
  );
}
